const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function listJson(dirPath) {
  await ensureDir(dirPath);
  const files = await fs.readdir(dirPath);
  const jsonFiles = files.filter((fileName) => fileName.endsWith('.json'));

  const items = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const filePath = path.join(dirPath, fileName);
      const data = await readJson(filePath);

      return {
        fileName,
        filePath,
        data,
      };
    })
  );

  return items;
}

async function listJsonFiles(dirPath) {
  await ensureDir(dirPath);
  const files = await fs.readdir(dirPath);
  const jsonFiles = files.filter((fileName) => fileName.endsWith('.json'));

  const items = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const filePath = path.join(dirPath, fileName);
      const stats = await fs.stat(filePath);

      return {
        fileName,
        filePath,
        mtimeMs: stats.mtimeMs,
      };
    })
  );

  return items;
}

module.exports = {
  ensureDir,
  listJson,
  listJsonFiles,
  readJson,
  readJsonIfExists,
  writeJson,
};
