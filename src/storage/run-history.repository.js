const {
  getRunDocument,
  listRunPage,
  listRunsByDays,
  saveRunDocument,
} = require('./sqlite-store');

async function saveRun(config, runDocument) {
  await saveRunDocument(config, runDocument);
}

async function getRunById(config, runId) {
  return getRunDocument(config, runId);
}

async function listRuns(config, options = {}) {
  return listRunPage(config, options);
}

async function listRunsForChart(config, options = {}) {
  return listRunsByDays(config, options);
}

module.exports = {
  getRunById,
  listRuns,
  listRunsForChart,
  saveRun,
};
