const crypto = require('crypto');
const { describeUndercut } = require('../kaspi');
const { saveRun } = require('./run-history.repository');

function createRunId(parserName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = crypto.randomBytes(3).toString('hex');

  return `${parserName}-${timestamp}-${suffix}`;
}

function buildSummary(document) {
  return {
    totalProducts: document.summary.totalProducts,
    processedProducts: document.summary.processedProducts,
    remoteUpdated: document.summary.remoteUpdated,
    cabinetUpdated: document.summary.cabinetUpdated,
    minPriceHits: document.summary.minPriceHits,
    ownSellerFirst: document.summary.ownSellerFirst,
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

  function setTotalProducts(totalProducts) {
    document.summary.totalProducts = Number(totalProducts) || 0;
  }

  function recordProductResult(result) {
    const existingIndex = document.productResults.findIndex((item) => item.sku === result.sku);

    if (existingIndex >= 0) {
      document.productResults[existingIndex] = {
        ...document.productResults[existingIndex],
        ...result,
      };
      return;
    }

    document.productResults.push(result);
    document.summary.processedProducts += 1;

    if (result.remoteUpdated) {
      document.summary.remoteUpdated += 1;
    }

    if (result.cabinetUpdated) {
      document.summary.cabinetUpdated += 1;
    }
  }

  function recordMinPriceHit() {
    document.summary.minPriceHits += 1;
  }

  function recordOwnSellerFirst() {
    document.summary.ownSellerFirst += 1;
  }

  function recordProblemPage(problemPage) {
    document.problemPages.push(problemPage);
  }

  function recordMissingOwnSellers(item) {
    document.missingOwnSellers.push(item);
  }

  async function finish(status, extra = {}) {
    document.status = status;
    document.finishedAt = new Date().toISOString();
    document.stopReason = extra.stopReason || '';
    document.summary = {
      ...document.summary,
      ...buildSummary(document),
    };

    await saveRun(config, document);
  }

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
