const crypto = require('crypto');
const { describeUndercut } = require('../kaspi');
const { saveRun } = require('./run-history.repository');

function createRunId(parserName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = crypto.randomBytes(3).toString('hex');

  return `${parserName}-${timestamp}-${suffix}`;
}

function buildSummary(document) {
  const processedProducts = document.productResults.length;
  const remoteUpdated = document.productResults.filter((item) => item.remoteUpdated).length;
  const cabinetUpdated = document.productResults.filter((item) => item.cabinetUpdated).length;
  const ownSellerFirst = document.productResults.filter((item) => item.ownSellerFirst).length;

  return {
    totalProducts: document.summary.totalProducts,
    processedProducts,
    remoteUpdated,
    cabinetUpdated,
    minPriceHits: document.summary.minPriceHits,
    ownSellerFirst,
    problemPages: document.problemPages.length,
    missingOwnSellers: document.missingOwnSellers.length,
  };
}

async function createRunTracker(config, options) {
  const document = {
    id: createRunId(options.parserName),
    parserName: options.parserName,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stopReason: '',
    undercut: describeUndercut(config),
    summary: {
      totalProducts: 0,
      processedProducts: 0,
      remoteUpdated: 0,
      cabinetUpdated: 0,
      minPriceHits: 0,
      ownSellerFirst: 0,
    },
    productResults: [],
    problemPages: [],
    missingOwnSellers: [],
  };
  let persistQueue = Promise.resolve();

  function schedulePersist() {
    persistQueue = persistQueue
      .catch(() => {})
      .then(() =>
        saveRun(config, {
          ...document,
          summary: {
            ...document.summary,
            ...buildSummary(document),
          },
        })
      );

    return persistQueue;
  }

  function setTotalProducts(totalProducts) {
    document.summary.totalProducts = Number(totalProducts) || 0;
    void schedulePersist();
  }

  function recordProductResult(result) {
    const existingIndex = document.productResults.findIndex((item) => item.sku === result.sku);

    if (existingIndex >= 0) {
      document.productResults[existingIndex] = {
        ...document.productResults[existingIndex],
        ...result,
      };
      void schedulePersist();
      return;
    }

    document.productResults.push(result);
    document.summary.processedProducts = document.productResults.length;
    void schedulePersist();
  }

  function recordMinPriceHit() {
    document.summary.minPriceHits += 1;
    void schedulePersist();
  }

  function recordOwnSellerFirst() {
    document.summary.ownSellerFirst += 1;
    void schedulePersist();
  }

  function recordProblemPage(problemPage) {
    document.problemPages.push(problemPage);
    void schedulePersist();
  }

  function recordMissingOwnSellers(item) {
    document.missingOwnSellers.push(item);
    void schedulePersist();
  }

  async function finish(status, extra = {}) {
    await persistQueue.catch(() => {});
    document.status = status;
    document.finishedAt = new Date().toISOString();
    document.stopReason = extra.stopReason || '';
    document.summary = {
      ...document.summary,
      ...buildSummary(document),
    };

    await saveRun(config, document);
  }

  await schedulePersist();

  return {
    document,
    finish,
    recordMinPriceHit,
    recordMissingOwnSellers,
    recordOwnSellerFirst,
    recordProblemPage,
    recordProductResult,
    setTotalProducts,
  };
}

module.exports = {
  createRunTracker,
};
