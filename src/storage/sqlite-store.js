const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureDir, listJson } = require('./file-document-store');

const connections = new Map();

function getBaseDir(config) {
  return path.resolve(process.cwd(), config.statistics.storageDir);
}

function getDatabasePath(config) {
  return path.join(getBaseDir(config), 'statistics.sqlite');
}

function getLegacyRunsDir(config) {
  return path.join(getBaseDir(config), 'runs');
}

function createSummary(runDocument) {
  return {
    totalProducts: Number(runDocument.summary?.totalProducts ?? 0),
    processedProducts: Number(runDocument.summary?.processedProducts ?? 0),
    remoteUpdated: Number(runDocument.summary?.remoteUpdated ?? 0),
    cabinetUpdated: Number(runDocument.summary?.cabinetUpdated ?? 0),
    minPriceHits: Number(runDocument.summary?.minPriceHits ?? 0),
    ownSellerFirst: Number(runDocument.summary?.ownSellerFirst ?? 0),
    problemPages: Number(runDocument.summary?.problemPages ?? runDocument.problemPages?.length ?? 0),
    missingOwnSellers: Number(runDocument.summary?.missingOwnSellers ?? runDocument.missingOwnSellers?.length ?? 0),
  };
}

function mapRunRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    parserName: row.parser_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    stopReason: row.stop_reason,
    undercut: row.undercut,
    summary: {
      totalProducts: row.total_products,
      processedProducts: row.processed_products,
      remoteUpdated: row.remote_updated,
      cabinetUpdated: row.cabinet_updated,
      minPriceHits: row.min_price_hits,
      ownSellerFirst: row.own_seller_first,
      problemPages: row.problem_pages,
      missingOwnSellers: row.missing_own_sellers,
    },
  };
}

function upsertRunStatement(database) {
  return database.prepare(`
    INSERT INTO runs (
      id,
      parser_name,
      status,
      started_at,
      finished_at,
      stop_reason,
      undercut,
      total_products,
      processed_products,
      remote_updated,
      cabinet_updated,
      min_price_hits,
      own_seller_first,
      problem_pages,
      missing_own_sellers,
      data_json
    ) VALUES (
      @id,
      @parser_name,
      @status,
      @started_at,
      @finished_at,
      @stop_reason,
      @undercut,
      @total_products,
      @processed_products,
      @remote_updated,
      @cabinet_updated,
      @min_price_hits,
      @own_seller_first,
      @problem_pages,
      @missing_own_sellers,
      @data_json
    )
    ON CONFLICT(id) DO UPDATE SET
      parser_name = excluded.parser_name,
      status = excluded.status,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      stop_reason = excluded.stop_reason,
      undercut = excluded.undercut,
      total_products = excluded.total_products,
      processed_products = excluded.processed_products,
      remote_updated = excluded.remote_updated,
      cabinet_updated = excluded.cabinet_updated,
      min_price_hits = excluded.min_price_hits,
      own_seller_first = excluded.own_seller_first,
      problem_pages = excluded.problem_pages,
      missing_own_sellers = excluded.missing_own_sellers,
      data_json = excluded.data_json
  `);
}

function serializeRun(runDocument) {
  const summary = createSummary(runDocument);

  return {
    id: runDocument.id,
    parser_name: runDocument.parserName,
    status: runDocument.status,
    started_at: runDocument.startedAt,
    finished_at: runDocument.finishedAt || null,
    stop_reason: runDocument.stopReason || '',
    undercut: runDocument.undercut || '',
    total_products: summary.totalProducts,
    processed_products: summary.processedProducts,
    remote_updated: summary.remoteUpdated,
    cabinet_updated: summary.cabinetUpdated,
    min_price_hits: summary.minPriceHits,
    own_seller_first: summary.ownSellerFirst,
    problem_pages: summary.problemPages,
    missing_own_sellers: summary.missingOwnSellers,
    data_json: JSON.stringify({
      ...runDocument,
      summary,
    }),
  };
}

async function migrateLegacyJson(config, database) {
  const migrated = database.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_json_migrated');

  if (migrated?.value === '1') {
    return;
  }

  const legacyRunsDir = getLegacyRunsDir(config);

  if (!fs.existsSync(legacyRunsDir)) {
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_json_migrated', '1');
    return;
  }

  const legacyRuns = await listJson(legacyRunsDir);
  const upsertRun = upsertRunStatement(database);
  const migrate = database.transaction((items) => {
    for (const item of items) {
      upsertRun.run(serializeRun(item.data));
    }

    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_json_migrated', '1');
  });

  migrate(legacyRuns);
}

async function openDatabase(config) {
  const databasePath = getDatabasePath(config);

  if (connections.has(databasePath)) {
    return connections.get(databasePath);
  }

  await ensureDir(path.dirname(databasePath));

  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      parser_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      stop_reason TEXT,
      undercut TEXT,
      total_products INTEGER NOT NULL DEFAULT 0,
      processed_products INTEGER NOT NULL DEFAULT 0,
      remote_updated INTEGER NOT NULL DEFAULT 0,
      cabinet_updated INTEGER NOT NULL DEFAULT 0,
      min_price_hits INTEGER NOT NULL DEFAULT 0,
      own_seller_first INTEGER NOT NULL DEFAULT 0,
      problem_pages INTEGER NOT NULL DEFAULT 0,
      missing_own_sellers INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
  `);

  await migrateLegacyJson(config, database);
  connections.set(databasePath, database);
  return database;
}

async function saveRunDocument(config, runDocument) {
  const database = await openDatabase(config);
  upsertRunStatement(database).run(serializeRun(runDocument));
}

async function getRunDocument(config, runId) {
  const database = await openDatabase(config);
  const row = database.prepare('SELECT data_json FROM runs WHERE id = ?').get(runId);

  if (!row) {
    return null;
  }

  return JSON.parse(row.data_json);
}

async function listRunPage(config, options = {}) {
  const database = await openDatabase(config);
  const page = Math.max(Number(options.page) || 1, 1);
  const pageSize = Math.max(Number(options.pageSize) || 20, 1);
  const total = database.prepare('SELECT COUNT(*) AS count FROM runs').get().count;
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const rows = database
    .prepare(`
      SELECT
        id,
        parser_name,
        status,
        started_at,
        finished_at,
        stop_reason,
        undercut,
        total_products,
        processed_products,
        remote_updated,
        cabinet_updated,
        min_price_hits,
        own_seller_first,
        problem_pages,
        missing_own_sellers
      FROM runs
      ORDER BY started_at DESC
      LIMIT ?
      OFFSET ?
    `)
    .all(pageSize, offset);

  return {
    items: rows.map(mapRunRow),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

async function listRunsByDays(config, options = {}) {
  const database = await openDatabase(config);
  const days = Math.max(Number(options.days) || 7, 1);
  const limit = Math.max(Number(options.limit) || 500, 1);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = database
    .prepare(`
      SELECT
        data_json
      FROM runs
      WHERE started_at >= ?
      ORDER BY started_at DESC
      LIMIT ?
    `)
    .all(cutoff, limit);

  return rows.map((row) => JSON.parse(row.data_json));
}

module.exports = {
  getDatabasePath,
  getRunDocument,
  listRunPage,
  listRunsByDays,
  openDatabase,
  saveRunDocument,
};
