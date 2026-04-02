const http = require('http');
const { loadConfig, saveLocalConfig } = require('../config');
const { getRunById, listRuns, listRunsForChart } = require('../storage/run-history.repository');

const PAGE_SIZE = 20;
const DEFAULT_CHART_DAYS = 7;
const ALLOWED_CHART_DAYS = [1, 3, 7, 14, 30];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('ru-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function renderListItem(item) {
  if (typeof item === 'string') {
    return escapeHtml(item);
  }

  if (!item || typeof item !== 'object') {
    return escapeHtml(String(item));
  }

  if (Array.isArray(item.missingOwnSellers)) {
    const sku = item.sku ? `${item.sku} - ` : '';
    const reason = `не хватает магазинов: ${item.missingOwnSellers.join(', ')}`;
    return escapeHtml(`${sku}${reason}`);
  }

  if (item.reason) {
    const sku = item.sku ? `${item.sku} - ` : '';
    const link = item.link ? ` (${item.link})` : '';
    return escapeHtml(`${sku}${item.reason}${link}`);
  }

  if (item.sku || item.link) {
    return escapeHtml([item.sku, item.link].filter(Boolean).join(' - '));
  }

  return escapeHtml(JSON.stringify(item));
}

function renderLayout(title, content) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0c1726;
      --bg-2: #12233a;
      --panel: #13253d;
      --panel-2: #18314f;
      --line: #24486f;
      --text: #e8f1fb;
      --muted: #9db4cf;
      --accent: #5db6ff;
      --accent-2: #2f7dd1;
      --warn: #ffb55c;
      --bad: #ff8e8e;
      --good: #6ed7bf;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--text); }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 32px 20px 60px; }
    h1, h2, h3 { margin: 0 0 14px; font-weight: 600; letter-spacing: -0.02em; }
    h1 { font-size: 30px; }
    h2 { font-size: 22px; }
    h3 { font-size: 16px; }
    .lead { color: var(--muted); margin-bottom: 24px; font-size: 14px; line-height: 1.5; }
    .grid { display: grid; gap: 16px; }
    .cards { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22); }
    .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
    .value { font-size: 24px; margin-top: 8px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: rgba(19,37,61,0.92); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
    th, td { text-align: left; padding: 11px 13px; border-bottom: 1px solid rgba(36,72,111,0.82); vertical-align: top; font-size: 13px; }
    th { background: rgba(23,48,77,0.98); font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); }
    tr:last-child td { border-bottom: 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; background: rgba(110,215,191,0.16); color: var(--good); border: 1px solid rgba(110,215,191,0.24); }
    .pill.failed { background: rgba(255,142,142,0.14); color: var(--bad); border-color: rgba(255,142,142,0.24); }
    .pill.stopped { background: rgba(255,181,92,0.14); color: var(--warn); border-color: rgba(255,181,92,0.24); }
    .pill.no { background: rgba(255,142,142,0.14); color: var(--bad); border-color: rgba(255,142,142,0.24); }
    .pill.yes { background: rgba(110,215,191,0.16); color: var(--good); border-color: rgba(110,215,191,0.24); }
    .section { margin-top: 28px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    ul.compact { margin: 0; padding-left: 18px; color: var(--text); }
    ul.compact li { margin-bottom: 6px; font-size: 13px; line-height: 1.45; }
    code { color: #bce2ff; }
    .chart-card { padding: 20px; }
    .chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .chart-meta { color: var(--muted); font-size: 12px; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 4px; color: var(--muted); font-size: 12px; }
    .legend-item { display: inline-flex; align-items: center; gap: 8px; }
    .legend-line { width: 18px; height: 3px; border-radius: 999px; }
    .empty-chart { color: var(--muted); font-size: 13px; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); background: rgba(24,49,79,0.55); text-decoration: none; font-size: 12px; }
    .chip.active { color: var(--text); border-color: var(--accent); background: rgba(47,125,209,0.18); }
    .pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
    .pagination-info { color: var(--muted); font-size: 12px; }
    .chart-wrap { position: relative; min-height: 320px; }
    canvas { width: 100% !important; height: 320px !important; }
    .nav { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .form-card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
    .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .field label { font-size: 12px; color: var(--muted); }
    .field input, .field select, .field textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: rgba(12, 23, 38, 0.75); color: var(--text); padding: 10px 12px; font: inherit; }
    .field textarea { min-height: 110px; resize: vertical; }
    .field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .field-row input { width: auto; }
    .submit-row { display: flex; gap: 10px; margin-top: 18px; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--accent); background: rgba(47,125,209,0.18); color: var(--text); text-decoration: none; font-size: 13px; cursor: pointer; }
    .button.secondary { border-color: var(--line); background: rgba(24,49,79,0.55); color: var(--muted); }
    .notice { margin-bottom: 18px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(110,215,191,0.28); background: rgba(110,215,191,0.12); color: var(--text); }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a class="chip" href="/">Статистика</a>
      <a class="chip" href="/settings">Настройки</a>
    </div>
    ${content}
  </div>
</body>
</html>`;
}

function renderStatus(status) {
  const className = status === 'failed' ? 'pill failed' : status === 'stopped' ? 'pill stopped' : 'pill';
  return `<span class="${className}">${escapeHtml(status)}</span>`;
}

function renderBooleanPill(value) {
  return value ? '<span class="pill yes">yes</span>' : '<span class="pill no">no</span>';
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function isChecked(value) {
  return value ? 'checked' : '';
}

function isSelected(value, currentValue) {
  return value === currentValue ? 'selected' : '';
}

function normalizeList(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value) {
  return value === 'on' || value === 'true';
}

function buildEditableConfig(config) {
  return {
    kaspi: {
      cityId: config.kaspi.cityId,
      probeProductUrl: config.kaspi.probeProductUrl,
      ownSellers: [...config.kaspi.ownSellers],
    },
    chrome: {
      binaryPath: config.chrome.binaryPath,
    },
    pricing: {
      undercut: {
        mode: config.pricing.undercut.mode,
        fixed: {
          amount: config.pricing.undercut.fixed.amount,
        },
        dynamic: {
          min: config.pricing.undercut.dynamic.min,
          max: config.pricing.undercut.dynamic.max,
          fromPrice: config.pricing.undercut.dynamic.fromPrice,
          toPrice: config.pricing.undercut.dynamic.toPrice,
        },
        randomRange: {
          min: config.pricing.undercut.randomRange.min,
          max: config.pricing.undercut.randomRange.max,
        },
      },
    },
    notifications: {
      telegramToken: config.notifications.telegramToken,
      telegramChatId: config.notifications.telegramChatId,
      telegram: {
        maxDetailLines: config.notifications.telegram.maxDetailLines,
        adminMentions: [...(config.notifications.telegram.adminMentions || [])],
      },
    },
    statistics: {
      storageDir: config.statistics.storageDir,
      ui: {
        port: config.statistics.ui.port,
      },
    },
    accounts: {
      forYou: {
        user: config.accounts.forYou.user,
        pass: config.accounts.forYou.pass,
      },
      sellerCabinet: {
        user: config.accounts.sellerCabinet.user,
        pass: config.accounts.sellerCabinet.pass,
      },
    },
    parsers: {
      forYou: {
        headless: config.parsers.forYou.headless,
        updateRemotePrice: config.parsers.forYou.updateRemotePrice,
      },
      sellerCabinet: {
        headless: config.parsers.sellerCabinet.headless,
        updateRemotePrice: config.parsers.sellerCabinet.updateRemotePrice,
        updateCabinetPrice: config.parsers.sellerCabinet.updateCabinetPrice,
        skuFilter: [...config.parsers.sellerCabinet.skuFilter],
      },
    },
  };
}

function buildConfigFromForm(form) {
  return {
    kaspi: {
      cityId: String(form.cityId || '').trim(),
      probeProductUrl: String(form.probeProductUrl || '').trim(),
      ownSellers: normalizeList(form.ownSellers),
    },
    chrome: {
      binaryPath: String(form.chromeBinaryPath || '').trim(),
    },
    pricing: {
      undercut: {
        mode: String(form.undercutMode || 'fixed'),
        fixed: {
          amount: toNumber(form.fixedAmount, 0),
        },
        dynamic: {
          min: toNumber(form.dynamicMin, 0),
          max: toNumber(form.dynamicMax, 0),
          fromPrice: toNumber(form.dynamicFromPrice, 0),
          toPrice: toNumber(form.dynamicToPrice, 0),
        },
        randomRange: {
          min: toNumber(form.randomMin, 0),
          max: toNumber(form.randomMax, 0),
        },
      },
    },
    notifications: {
      telegramToken: String(form.telegramToken || '').trim(),
      telegramChatId: String(form.telegramChatId || '').trim(),
      telegram: {
        maxDetailLines: toNumber(form.maxDetailLines, 12),
        adminMentions: normalizeList(form.adminMentions),
      },
    },
    statistics: {
      storageDir: String(form.statisticsStorageDir || 'data/statistics').trim(),
      ui: {
        port: toNumber(form.uiPort, 3080),
      },
    },
    accounts: {
      forYou: {
        user: String(form.forYouUser || '').trim(),
        pass: String(form.forYouPass || ''),
      },
      sellerCabinet: {
        user: String(form.sellerCabinetUser || '').trim(),
        pass: String(form.sellerCabinetPass || ''),
      },
    },
    parsers: {
      forYou: {
        headless: toBoolean(form.forYouHeadless),
        updateRemotePrice: toBoolean(form.forYouUpdateRemotePrice),
      },
      sellerCabinet: {
        headless: toBoolean(form.sellerCabinetHeadless),
        updateRemotePrice: toBoolean(form.sellerCabinetUpdateRemotePrice),
        updateCabinetPrice: toBoolean(form.sellerCabinetUpdateCabinetPrice),
        skuFilter: normalizeList(form.sellerCabinetSkuFilter),
      },
    },
  };
}

function renderSettingsPage(config, message = '') {
  const editable = buildEditableConfig(config);

  return `
    <h1>Настройки</h1>
    <p class="lead">Здесь можно редактировать рабочие настройки и секреты. Сохранение записывает файл <code>parser.config.local.js</code>.</p>
    ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
    <form method="post" action="/settings">
      <div class="form-grid">
        <div class="form-card">
          <h3>Kaspi</h3>
          <div class="field">
            <label>City ID</label>
            <input name="cityId" value="${escapeHtml(editable.kaspi.cityId)}" />
          </div>
          <div class="field">
            <label>Probe Product URL</label>
            <input name="probeProductUrl" value="${escapeHtml(editable.kaspi.probeProductUrl)}" />
          </div>
          <div class="field">
            <label>Наши магазины, по одному в строке</label>
            <textarea name="ownSellers">${escapeHtml(editable.kaspi.ownSellers.join('\n'))}</textarea>
          </div>
          <div class="field">
            <label>Путь к Chrome</label>
            <input name="chromeBinaryPath" value="${escapeHtml(editable.chrome.binaryPath)}" />
          </div>
        </div>

        <div class="form-card">
          <h3>Ценообразование</h3>
          <div class="field">
            <label>Режим отступа</label>
            <select name="undercutMode">
              <option value="fixed" ${isSelected('fixed', editable.pricing.undercut.mode)}>fixed</option>
              <option value="dynamic" ${isSelected('dynamic', editable.pricing.undercut.mode)}>dynamic</option>
              <option value="random-range" ${isSelected('random-range', editable.pricing.undercut.mode)}>random-range</option>
            </select>
          </div>
          <div class="field">
            <label>Fixed amount</label>
            <input name="fixedAmount" type="number" value="${escapeHtml(String(editable.pricing.undercut.fixed.amount))}" />
          </div>
          <div class="field">
            <label>Dynamic min / max / fromPrice / toPrice</label>
            <input name="dynamicMin" type="number" value="${escapeHtml(String(editable.pricing.undercut.dynamic.min))}" />
            <input name="dynamicMax" type="number" value="${escapeHtml(String(editable.pricing.undercut.dynamic.max))}" />
            <input name="dynamicFromPrice" type="number" value="${escapeHtml(String(editable.pricing.undercut.dynamic.fromPrice))}" />
            <input name="dynamicToPrice" type="number" value="${escapeHtml(String(editable.pricing.undercut.dynamic.toPrice))}" />
          </div>
          <div class="field">
            <label>Random min / max</label>
            <input name="randomMin" type="number" value="${escapeHtml(String(editable.pricing.undercut.randomRange.min))}" />
            <input name="randomMax" type="number" value="${escapeHtml(String(editable.pricing.undercut.randomRange.max))}" />
          </div>
        </div>

        <div class="form-card">
          <h3>Telegram и алерты</h3>
          <div class="field">
            <label>Telegram Token</label>
            <input name="telegramToken" value="${escapeHtml(editable.notifications.telegramToken)}" />
          </div>
          <div class="field">
            <label>Telegram Chat ID</label>
            <input name="telegramChatId" value="${escapeHtml(editable.notifications.telegramChatId)}" />
          </div>
          <div class="field">
            <label>Админы для алертов, по одному в строке</label>
            <textarea name="adminMentions">${escapeHtml(editable.notifications.telegram.adminMentions.join('\n'))}</textarea>
          </div>
          <div class="field">
            <label>Макс. строк в уведомлении</label>
            <input name="maxDetailLines" type="number" value="${escapeHtml(String(editable.notifications.telegram.maxDetailLines))}" />
          </div>
        </div>

        <div class="form-card">
          <h3>Учётки</h3>
          <div class="field">
            <label>For You: login</label>
            <input name="forYouUser" value="${escapeHtml(editable.accounts.forYou.user)}" />
          </div>
          <div class="field">
            <label>For You: password</label>
            <input name="forYouPass" value="${escapeHtml(editable.accounts.forYou.pass)}" />
          </div>
          <div class="field">
            <label>Seller Cabinet: login</label>
            <input name="sellerCabinetUser" value="${escapeHtml(editable.accounts.sellerCabinet.user)}" />
          </div>
          <div class="field">
            <label>Seller Cabinet: password</label>
            <input name="sellerCabinetPass" value="${escapeHtml(editable.accounts.sellerCabinet.pass)}" />
          </div>
        </div>

        <div class="form-card">
          <h3>Парсер For You</h3>
          <label class="field-row"><input type="checkbox" name="forYouHeadless" ${isChecked(editable.parsers.forYou.headless)} /> Headless</label>
          <label class="field-row"><input type="checkbox" name="forYouUpdateRemotePrice" ${isChecked(editable.parsers.forYou.updateRemotePrice)} /> Отправлять цену во внешнее API</label>
        </div>

        <div class="form-card">
          <h3>Парсер Кабинета</h3>
          <label class="field-row"><input type="checkbox" name="sellerCabinetHeadless" ${isChecked(editable.parsers.sellerCabinet.headless)} /> Headless</label>
          <label class="field-row"><input type="checkbox" name="sellerCabinetUpdateRemotePrice" ${isChecked(editable.parsers.sellerCabinet.updateRemotePrice)} /> Отправлять цену во внешнее API</label>
          <label class="field-row"><input type="checkbox" name="sellerCabinetUpdateCabinetPrice" ${isChecked(editable.parsers.sellerCabinet.updateCabinetPrice)} /> Менять цену в кабинете</label>
          <div class="field">
            <label>SKU filter, по одному в строке</label>
            <textarea name="sellerCabinetSkuFilter">${escapeHtml(editable.parsers.sellerCabinet.skuFilter.join('\n'))}</textarea>
          </div>
        </div>

        <div class="form-card">
          <h3>UI и хранилище</h3>
          <div class="field">
            <label>Папка статистики</label>
            <input name="statisticsStorageDir" value="${escapeHtml(editable.statistics.storageDir)}" />
          </div>
          <div class="field">
            <label>Порт UI</label>
            <input name="uiPort" type="number" value="${escapeHtml(String(editable.statistics.ui.port))}" />
          </div>
        </div>
      </div>
      <div class="submit-row">
        <button class="button" type="submit">Сохранить</button>
        <a class="button secondary" href="/">Назад к статистике</a>
      </div>
    </form>
  `;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('</script>', '<\\/script>');
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeChartDays(value) {
  const days = parsePositiveInt(value, DEFAULT_CHART_DAYS);
  return ALLOWED_CHART_DAYS.includes(days) ? days : DEFAULT_CHART_DAYS;
}

function buildUrl(pathname, params) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getSummaryValue(run, key) {
  return Number(run.summary?.[key] ?? 0);
}

function calculateDashboardMetrics(runs) {
  if (runs.length === 0) {
    return {
      averageOwnSellerFirstRate: 0,
      averageProblemRate: 0,
      averageMissingRate: 0,
      latestStatus: 'нет данных',
    };
  }

  let ownSellerFirstRateSum = 0;
  let problemRateSum = 0;
  let missingRateSum = 0;

  for (const run of runs) {
    const processed = Math.max(getSummaryValue(run, 'processedProducts'), 1);
    const total = Math.max(getSummaryValue(run, 'totalProducts'), 1);

    ownSellerFirstRateSum += (getSummaryValue(run, 'ownSellerFirst') / processed) * 100;
    problemRateSum += (getSummaryValue(run, 'problemPages') / total) * 100;
    missingRateSum += (getSummaryValue(run, 'missingOwnSellers') / total) * 100;
  }

  return {
    averageOwnSellerFirstRate: ownSellerFirstRateSum / runs.length,
    averageProblemRate: problemRateSum / runs.length,
    averageMissingRate: missingRateSum / runs.length,
    latestStatus: runs[0]?.status || 'нет данных',
  };
}

function renderChart(runs, options) {
  const chartRuns = runs.slice().reverse();

  if (chartRuns.length === 0) {
    return '<div class="card chart-card"><h3>Динамика прогонов</h3><p class="empty-chart">Появится после первого сохранённого прогона.</p></div>';
  }

  const chartData = {
    labels: chartRuns.map((run) => formatDateTime(run.startedAt)),
    datasets: [
      {
        label: 'Обработано',
        data: chartRuns.map((run) => getSummaryValue(run, 'processedProducts')),
        borderColor: '#5db6ff',
        backgroundColor: 'rgba(93, 182, 255, 0.18)',
      },
      {
        label: 'Мы первые',
        data: chartRuns.map((run) => getSummaryValue(run, 'ownSellerFirst')),
        borderColor: '#6ed7bf',
        backgroundColor: 'rgba(110, 215, 191, 0.18)',
      },
      {
        label: 'Проблемные страницы',
        data: chartRuns.map((run) => getSummaryValue(run, 'problemPages')),
        borderColor: '#ff8e8e',
        backgroundColor: 'rgba(255, 142, 142, 0.18)',
      },
      {
        label: 'Без наших магазинов',
        data: chartRuns.map((run) => getSummaryValue(run, 'missingOwnSellers')),
        borderColor: '#ffb55c',
        backgroundColor: 'rgba(255, 181, 92, 0.18)',
      },
    ],
    runs: chartRuns.map((run) => ({
      id: run.id,
      status: run.status,
      parserName: run.parserName,
      startedAt: formatDateTime(run.startedAt),
      processedProducts: getSummaryValue(run, 'processedProducts'),
      problemPages: getSummaryValue(run, 'problemPages'),
      missingOwnSellers: getSummaryValue(run, 'missingOwnSellers'),
      ownSellerFirst: getSummaryValue(run, 'ownSellerFirst'),
    })),
  };
  const dayChips = ALLOWED_CHART_DAYS.map((days) => {
    const href = buildUrl('/', { page: 1, days });
    const className = days === options.days ? 'chip active' : 'chip';

    return `<a class="${className}" href="${href}">${days} дн.</a>`;
  }).join('');

  return `
    <div class="card chart-card">
      <div class="chart-head">
        <div>
          <h3>Динамика прогонов</h3>
          <div class="chart-meta">Последние ${options.days} дней, точек: ${chartRuns.length}</div>
        </div>
        <div class="actions">${dayChips}</div>
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-line" style="background:#5db6ff"></span>Обработано</span>
        <span class="legend-item"><span class="legend-line" style="background:#6ed7bf"></span>Мы первые</span>
        <span class="legend-item"><span class="legend-line" style="background:#ff8e8e"></span>Проблемные страницы</span>
        <span class="legend-item"><span class="legend-line" style="background:#ffb55c"></span>Без наших магазинов</span>
      </div>
      <div class="chart-wrap"><canvas id="runs-chart" aria-label="График прогонов"></canvas></div>
      <script>
        (() => {
          const chartPayload = ${safeJson(chartData)};
          const canvas = document.getElementById('runs-chart');
          if (!canvas || typeof Chart === 'undefined') {
            return;
          }

          new Chart(canvas, {
            type: 'line',
            data: {
              labels: chartPayload.labels,
              datasets: chartPayload.datasets.map((dataset) => ({
                ...dataset,
                tension: 0.28,
                fill: false,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
              })),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                mode: 'index',
                intersect: false,
              },
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  backgroundColor: 'rgba(12, 23, 38, 0.95)',
                  titleColor: '#e8f1fb',
                  bodyColor: '#e8f1fb',
                  borderColor: '#24486f',
                  borderWidth: 1,
                  callbacks: {
                    afterBody(items) {
                      const firstItem = items[0];
                      const run = chartPayload.runs[firstItem.dataIndex];

                      return [
                        'Сценарий: ' + run.parserName,
                        'Статус: ' + run.status,
                        'Мы первые: ' + run.ownSellerFirst,
                        'Run ID: ' + run.id,
                      ];
                    },
                  },
                },
              },
              scales: {
                x: {
                  ticks: {
                    color: '#9db4cf',
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 8,
                  },
                  grid: {
                    color: 'rgba(36,72,111,0.25)',
                  },
                },
                y: {
                  beginAtZero: true,
                  ticks: {
                    color: '#9db4cf',
                  },
                  grid: {
                    color: 'rgba(36,72,111,0.45)',
                  },
                },
              },
            },
          });
        })();
      </script>
    </div>
  `;
}

function renderOverviewCards(runs) {
  const metrics = calculateDashboardMetrics(runs);

  return `
    <div class="grid cards">
      <div class="card">
        <div class="label">Среднее Мы Первые</div>
        <div class="value">${escapeHtml(formatPercent(metrics.averageOwnSellerFirstRate))}</div>
      </div>
      <div class="card">
        <div class="label">Средние Проблемные</div>
        <div class="value">${escapeHtml(formatPercent(metrics.averageProblemRate))}</div>
      </div>
      <div class="card">
        <div class="label">Среднее Без Наших</div>
        <div class="value">${escapeHtml(formatPercent(metrics.averageMissingRate))}</div>
      </div>
      <div class="card">
        <div class="label">Последний Статус</div>
        <div class="value">${renderStatus(metrics.latestStatus)}</div>
      </div>
    </div>
  `;
}

function collectPopularCompetitors(runs, ownSellers) {
  const ownSellerSet = new Set((ownSellers || []).map((item) => String(item).trim()));
  const counts = new Map();

  for (const run of runs) {
    for (const item of run.productResults || []) {
      const competitor = String(item.competitor || '').trim();

      if (!competitor || ownSellerSet.has(competitor)) {
        continue;
      }

      counts.set(competitor, (counts.get(competitor) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
}

function renderPopularCompetitors(runs, config, days) {
  const competitors = collectPopularCompetitors(runs, config.kaspi.ownSellers);

  if (competitors.length === 0) {
    return `
      <div class="card">
        <h3>Популярные конкуренты</h3>
        <p class="lead">За последние ${days} дн. данных пока нет.</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <h3>Популярные конкуренты</h3>
      <p class="lead">За последние ${days} дн. по сохранённым прогонам.</p>
      <ul class="compact">
        ${competitors
          .map((item) => `<li>${escapeHtml(item.name)} <span class="pill">${escapeHtml(String(item.count))}</span></li>`)
          .join('')}
      </ul>
    </div>
  `;
}

function renderPagination(pagination, days) {
  const previousPage = pagination.page > 1 ? pagination.page - 1 : null;
  const nextPage = pagination.page < pagination.pageCount ? pagination.page + 1 : null;
  const previousLink = previousPage
    ? `<a class="chip" href="${buildUrl('/', { page: previousPage, days })}">← Назад</a>`
    : '';
  const nextLink = nextPage
    ? `<a class="chip" href="${buildUrl('/', { page: nextPage, days })}">Вперёд →</a>`
    : '';
  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return `
    <div class="pagination">
      <div class="pagination-info">Показаны прогоны ${from}-${to} из ${pagination.total}</div>
      <div class="actions">${previousLink}${nextLink}</div>
    </div>
  `;
}

function renderRunList(runs, chartRuns, options) {
  const rows = runs
    .map(
      (run) => `<tr>
        <td><a href="/runs/${encodeURIComponent(run.id)}" class="mono">${escapeHtml(run.id)}</a></td>
        <td>${escapeHtml(run.parserName)}</td>
        <td>${renderStatus(run.status)}</td>
        <td>${escapeHtml(formatDateTime(run.startedAt))}</td>
        <td>${escapeHtml(formatDateTime(run.finishedAt))}</td>
        <td>${escapeHtml(String(run.summary?.processedProducts ?? 0))}</td>
        <td>${escapeHtml(String(run.summary?.ownSellerFirst ?? 0))}</td>
        <td>${escapeHtml(String(run.summary?.problemPages ?? 0))}</td>
        <td>${escapeHtml(String(run.summary?.missingOwnSellers ?? 0))}</td>
      </tr>`
    )
    .join('');

  return `
    <h1>Статистика прогонов</h1>
    <p class="lead">Локальный просмотрщик прогонов парсера, проблемных страниц и карточек без части наших магазинов.</p>
    ${renderOverviewCards(chartRuns)}
    <div class="section">
      ${renderChart(chartRuns, options)}
    </div>
    <div class="section">
      ${renderPopularCompetitors(chartRuns, options.config, options.days)}
    </div>
    <div class="section">
    <table>
      <thead>
        <tr>
          <th>Run ID</th>
          <th>Сценарий</th>
          <th>Статус</th>
          <th>Старт</th>
          <th>Финиш</th>
          <th>Обработано</th>
          <th>Мы первые</th>
          <th>Проблемные</th>
          <th>Без наших магазинов</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="9">Пока нет сохранённых прогонов.</td></tr>'}</tbody>
    </table>
    ${renderPagination(options.pagination, options.days)}
    </div>
  `;
}

function renderListSection(title, items) {
  const body = items.length
    ? `<ul class="compact">${items.map((item) => `<li>${renderListItem(item)}</li>`).join('')}</ul>`
    : '<p class="lead">Нет данных.</p>';

  return `<div class="card"><h3>${escapeHtml(title)}</h3>${body}</div>`;
}

function renderRunDetails(run) {
  const cards = [
    ['Статус', run.status],
    ['Сценарий', run.parserName],
    ['Отступ', run.undercut],
    ['Всего товаров', run.summary?.totalProducts ?? 0],
    ['Обработано', run.summary?.processedProducts ?? 0],
    ['Мы первые', run.summary?.ownSellerFirst ?? 0],
    ['Проблемные страницы', run.summary?.problemPages ?? 0],
    ['Без наших магазинов', run.summary?.missingOwnSellers ?? 0],
  ]
    .map(
      ([label, value]) => `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`
    )
    .join('');

  const resultRows = (run.productResults || [])
    .slice(0, 200)
    .map(
      (item) => `<tr>
        <td class="mono">${escapeHtml(item.sku || '')}</td>
        <td>${escapeHtml(item.competitor || '')}</td>
        <td>${escapeHtml(String(item.competitorPrice ?? ''))}</td>
        <td>${escapeHtml(item.targetCompetitor || '')}</td>
        <td>${escapeHtml(String(item.targetCompetitorPrice ?? ''))}</td>
        <td>${escapeHtml(String(item.ourPrice ?? ''))}</td>
        <td>${renderBooleanPill(item.ownSellerFirst)}</td>
        <td>${renderBooleanPill(item.remoteUpdated)}</td>
        <td>${renderBooleanPill(item.cabinetUpdated)}</td>
      </tr>`
    )
    .join('');

  return `
    <p><a href="/">← Назад к списку прогонов</a></p>
    <h1>Прогон ${escapeHtml(run.id)}</h1>
    <p class="lead">Старт: ${escapeHtml(formatDateTime(run.startedAt))} | Финиш: ${escapeHtml(formatDateTime(run.finishedAt))} | ${renderStatus(run.status)}</p>
    <div class="grid cards">${cards}</div>
    <div class="section grid cards">
      ${renderListSection('Проблемные страницы', run.problemPages || [])}
      ${renderListSection('Карточки без части наших магазинов', run.missingOwnSellers || [])}
    </div>
    <div class="section">
      <h2>Результаты товаров</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Первый продавец</th>
            <th>Цена первого</th>
            <th>Подстраиваемся под</th>
            <th>Цена ориентира</th>
            <th>Наша цена</th>
            <th>Мы первые</th>
            <th>API</th>
            <th>Кабинет</th>
          </tr>
        </thead>
        <tbody>${resultRows || '<tr><td colspan="9">Нет данных по товарам.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

async function handleRequest(config, request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/') {
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const days = normalizeChartDays(url.searchParams.get('days'));
    const [pagination, chartRuns] = await Promise.all([
      listRuns(config, { page, pageSize: PAGE_SIZE }),
      listRunsForChart(config, { days }),
    ]);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(
      renderLayout(
        'Статистика прогонов',
        renderRunList(pagination.items, chartRuns, {
          config,
          days,
          pagination,
        })
      )
    );
    return;
  }

  if (url.pathname.startsWith('/runs/')) {
    const runId = decodeURIComponent(url.pathname.replace('/runs/', ''));
    const run = await getRunById(config, runId);

    if (!run) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderLayout('Не найдено', '<h1>Прогон не найден</h1><p><a href="/">Вернуться назад</a></p>'));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderLayout(`Прогон ${run.id}`, renderRunDetails(run)));
    return;
  }

  if (url.pathname === '/settings' && request.method === 'GET') {
    const message = url.searchParams.get('saved') === '1' ? 'Настройки сохранены.' : '';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderLayout('Настройки', renderSettingsPage(config, message)));
    return;
  }

  if (url.pathname === '/settings' && request.method === 'POST') {
    const body = await readBody(request);
    const form = Object.fromEntries(new URLSearchParams(body).entries());
    const nextConfig = buildConfigFromForm(form);

    saveLocalConfig(nextConfig);
    response.writeHead(302, { Location: '/settings?saved=1' });
    response.end();
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

async function main() {
  const port = loadConfig().statistics.ui.port;

  const server = http.createServer((request, response) => {
    handleRequest(loadConfig(), request, response).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Ошибка: ${error.message}`);
    });
  });

  server.listen(port, () => {
    console.log(`Statistics UI started at http://localhost:${port}`);
  });
}

main();
