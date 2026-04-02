const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { Builder } = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');

function prepareSeleniumManagerEnv() {
  // Храним кэш Selenium рядом с проектом, а не в системных директориях пользователя.
  const seleniumCachePath = path.resolve(process.cwd(), '.runtime/selenium');

  if (!process.env.SE_CACHE_PATH) {
    process.env.SE_CACHE_PATH = seleniumCachePath;
  }

  if (!process.env.SE_AVOID_STATS) {
    process.env.SE_AVOID_STATS = 'true';
  }

  return seleniumCachePath;
}

function sanitizeDriverPath() {
  const delimiter = path.delimiter;
  const currentPath = process.env.PATH || '';
  const parts = currentPath.split(delimiter).filter(Boolean);

  const filteredParts = parts.filter((dirPath) => {
    const driverFileName = process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver';
    return !fsSync.existsSync(path.join(dirPath, driverFileName));
  });

  process.env.PATH = filteredParts.join(delimiter);
}

function createSessionDirName(sessionName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);

  return `${sessionName}-${timestamp}-${suffix}`;
}

async function createChromeSession(sessionName, chromeConfig) {
  const seleniumCachePath = prepareSeleniumManagerEnv();
  // Убираем системный chromedriver из PATH, чтобы Selenium Manager подбирал
  // совместимую версию драйвера под текущий Chrome.
  sanitizeDriverPath();
  const runtimeRoot = path.resolve(process.cwd(), chromeConfig.tempRoot);
  const sessionDir = path.join(runtimeRoot, createSessionDirName(sessionName));

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(seleniumCachePath, { recursive: true });

  const options = new Options();
  for (const arg of chromeConfig.args) {
    options.addArguments(arg);
  }

  // Каждому запуску даём отдельный профиль Chrome, чтобы не копить мусор в системе
  // и не зависеть от текущего пользовательского профиля браузера.
  options
    .addArguments(`--user-data-dir=${sessionDir}`)
    .addArguments(`--data-path=${path.join(sessionDir, 'data-path')}`)
    .addArguments(`--disk-cache-dir=${path.join(sessionDir, 'cache')}`)
    .setUserPreferences(chromeConfig.prefs)
    .windowSize(chromeConfig.screen);

  if (chromeConfig.binaryPath) {
    options.setChromeBinaryPath(path.resolve(chromeConfig.binaryPath));
  }

  if (chromeConfig.headless) {
    options.headless();
  }

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  async function cleanup() {
    if (!chromeConfig.cleanupTempDir) {
      return;
    }

    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  return {
    driver,
    cleanup,
    sessionDir,
    seleniumCachePath,
  };
}

module.exports = {
  createChromeSession,
};
