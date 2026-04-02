const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/config');

const MIN_NODE_MAJOR = 18;

function exists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function resolveChromeBinary(config) {
  // Сначала уважаем явно заданный путь, потом проверяем типовые пути ОС.
  if (config.chrome.binaryPath) {
    return {
      source: 'config',
      path: path.resolve(config.chrome.binaryPath),
      exists: exists(path.resolve(config.chrome.binaryPath)),
    };
  }

  if (process.platform === 'darwin') {
    const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return {
      source: 'default-mac',
      path: macChrome,
      exists: exists(macChrome),
    };
  }

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ].filter(Boolean);

    const detected = candidates.find((candidate) => exists(candidate));

    return {
      source: 'default-win',
      path: detected || candidates[0],
      exists: Boolean(detected),
    };
  }

  return {
    source: 'unknown',
    path: '',
    exists: false,
  };
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  const ok = major >= MIN_NODE_MAJOR;

  return {
    ok,
    label: `Node.js ${process.version}`,
    hint: ok ? '' : `Нужен Node.js ${MIN_NODE_MAJOR}+`,
  };
}

function checkConfigFile() {
  const configPath = path.resolve(process.cwd(), 'parser.config.local.js');

  return {
    ok: exists(configPath),
    label: 'parser.config.local.js',
    hint: exists(configPath)
      ? configPath
      : 'Создай файл на основе parser.config.example.js',
  };
}

function checkAccounts(config) {
  const hasForYou = Boolean(config.accounts.forYou.user && config.accounts.forYou.pass);
  const hasSellerCabinet = Boolean(
    config.accounts.sellerCabinet.user && config.accounts.sellerCabinet.pass
  );

  return [
    {
      ok: hasForYou,
      label: 'Аккаунт parser-for-you',
      hint: hasForYou ? '' : 'Заполни accounts.forYou в parser.config.local.js',
    },
    {
      ok: hasSellerCabinet,
      label: 'Аккаунт parser-width-saller-cabinet',
      hint: hasSellerCabinet ? '' : 'Заполни accounts.sellerCabinet в parser.config.local.js',
    },
  ];
}

function checkChrome(config) {
  const chromeBinary = resolveChromeBinary(config);

  return {
    ok: chromeBinary.exists || !config.chrome.binaryPath,
    label: 'Google Chrome',
    hint: chromeBinary.exists
      ? `Найден: ${chromeBinary.path}`
      : config.chrome.binaryPath
        ? `Путь не найден: ${chromeBinary.path}`
        : 'Если Selenium Manager не найдёт браузер сам, укажи chrome.binaryPath',
  };
}

function printResult(result) {
  const prefix = result.ok ? '[OK]' : '[WARN]';
  console.log(`${prefix} ${result.label}`);

  if (result.hint) {
    console.log(`       ${result.hint}`);
  }
}

function main() {
  const config = loadConfig();
  const results = [
    checkNode(),
    checkConfigFile(),
    ...checkAccounts(config),
    checkChrome(config),
  ];

  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Working dir: ${process.cwd()}`);
  console.log('');

  for (const result of results) {
    printResult(result);
  }

  // Ненулевой код выхода помогает использовать doctor в bat/cmd/CI и видеть предупреждения сразу.
  const hasWarnings = results.some((result) => !result.ok);
  process.exitCode = hasWarnings ? 1 : 0;
}

main();
