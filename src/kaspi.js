const fetch = require('node-fetch');
const { By, until } = require('selenium-webdriver');

function formatTime() {
  return new Date().toLocaleString('ru-RU');
}

function logInfo(scope, message) {
  console.log(`[${formatTime()}] [${scope}] ${message}`);
}

function logWarn(scope, message) {
  console.warn(`[${formatTime()}] [${scope}] ${message}`);
}

function createLogs() {
  // Отдельно храним обычный лог обхода и список товаров, которые уткнулись в минимум.
  return {
    parserLog: [],
    disableProductsLog: [],
    failedProductsLog: [],
    missingOwnSellersLog: [],
  };
}

function normalizeSku(sku) {
  return String(sku || '').replaceAll('#', '');
}

function normalizePrice(rawValue) {
  return Number.parseInt(
    String(rawValue)
      .replace(/\s/g, '')
      .replace('₸', ''),
    10
  );
}

function createStopController(scope) {
  let stopRequested = false;
  let reason = '';
  const handleSignal = (signal) => {
    if (stopRequested) {
      return;
    }

    stopRequested = true;
    reason = signal;
    logWarn(scope, `Получен сигнал ${signal}. Завершаю текущий шаг и отправлю накопленный лог.`);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return {
    isStopRequested() {
      return stopRequested;
    },
    getReason() {
      return reason;
    },
    cleanup() {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
    },
  };
}

function formatPrice(price) {
  return `${Number(price).toLocaleString('ru-RU')} тг`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function getProductList(config) {
  const response = await fetch(config.api.productListUrl);

  if (!response.ok) {
    throw new Error(`Не удалось получить товары: ${response.status}`);
  }

  return response.json();
}

function getUndercutAmount(config, price) {
  const rules = config.pricing.undercut;

  if (rules.mode === 'fixed') {
    return Math.max(0, Number(rules.fixed.amount) || 0);
  }

  if (rules.mode === 'random-range') {
    const min = Math.max(0, Number(rules.randomRange.min) || 0);
    const max = Math.max(min, Number(rules.randomRange.max) || min);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const dynamicRules = rules.dynamic;

  if (price < dynamicRules.fromPrice) {
    return dynamicRules.min;
  }

  if (price > dynamicRules.toPrice) {
    return dynamicRules.max;
  }

  const discount =
    dynamicRules.min +
    ((price - dynamicRules.fromPrice) * (dynamicRules.max - dynamicRules.min)) /
      (dynamicRules.toPrice - dynamicRules.fromPrice);

  return Math.round(Math.max(dynamicRules.min, Math.min(dynamicRules.max, discount)));
}

async function getSellerTable(driver) {
  let tbody;

  try {
    tbody = await driver.wait(
      until.elementLocated(By.css('.seller-table__inner table tbody')),
      5000
    );
  } catch {
    try {
      await driver.navigate().refresh();
      tbody = await driver.wait(
        until.elementLocated(By.css('.seller-table__inner table tbody')),
        5000
      );
    } catch {
      return null;
    }
  }

  const rows = await tbody.findElements(By.css('tr'));
  const sellers = [];

  // Преобразуем HTML-таблицу продавцов в нормальный массив объектов.
  for (const row of rows) {
    const priceElement = row.findElement(By.css('.sellers-table__price-cell-text'));
    const sellerElement = row.findElement(By.css('td.sellers-table__cell a'));

    sellers.push({
      saller: await sellerElement.getAttribute('textContent'),
      price: normalizePrice(await priceElement.getAttribute('textContent')),
    });
  }

  return sellers;
}

function getOptimalPrice(config, logs, product, sellerTable) {
  let optimalPrice = Number(product.minPrice);
  const productUndercut = getUndercutAmount(config, Number(product.minPrice));
  const minPrice = Number(product.minPrice) - productUndercut;
  const firstSellerName = sellerTable[0].saller;
  const firstSellerPrice = sellerTable[0].price;
  let sallerName = sellerTable[0].saller;
  let sallerPrice = sellerTable[0].price;

  logs.parserLog.push(`${normalizeSku(product.sku)}: ${firstSellerName}`);

  if (Number(product.minPrice) > firstSellerPrice) {
    logs.disableProductsLog.push(
      `${normalizeSku(product.sku)} - Минимальная цена ${firstSellerPrice.toLocaleString('ru-RU')}тг.`
    );
  }

  // Берём первого подходящего "чужого" продавца и считаем цену чуть ниже его оффера.
  for (const offer of sellerTable) {
    if (minPrice < offer.price && !config.kaspi.ownSellers.includes(offer.saller)) {
      optimalPrice = offer.price - getUndercutAmount(config, Number(offer.price));
      sallerName = offer.saller;
      sallerPrice = offer.price;
      break;
    }
  }

  if (Number(product.maxPrice) > 0 && optimalPrice > Number(product.maxPrice)) {
    optimalPrice = Number(product.maxPrice);
  }

  return {
    id: product.id,
    sku: product.sku,
    link: product.link,
    minPrice,
    optimalPrice,
    firstSellerName,
    firstSellerPrice,
    sallerName,
    sallerPrice,
  };
}

function describeUndercut(config) {
  const rules = config.pricing.undercut;

  if (rules.mode === 'fixed') {
    return `fixed: ${rules.fixed.amount} тг`;
  }

  if (rules.mode === 'random-range') {
    return `random-range: ${rules.randomRange.min}-${rules.randomRange.max} тг`;
  }

  return `dynamic: ${rules.dynamic.min}-${rules.dynamic.max} тг`;
}

function rememberFailedProduct(logs, product, reason) {
  logs.failedProductsLog.push(
    `${normalizeSku(product.sku)} - ${reason}${product.link ? ` - ${product.link}` : ''}`
  );
}

function rememberMissingOwnSellers(config, logs, product, sellerTable) {
  const sellerNames = new Set(sellerTable.map((item) => String(item.saller || '').trim()));
  const missingOwnSellers = config.kaspi.ownSellers.filter(
    (sellerName) => !sellerNames.has(String(sellerName).trim())
  );

  if (missingOwnSellers.length === 0) {
    return [];
  }

  logs.missingOwnSellersLog.push(
    `${normalizeSku(product.sku)} - не хватает магазинов: ${missingOwnSellers.join(', ')}`
  );

  return missingOwnSellers;
}

async function setRemotePrice(config, id, price) {
  const url = new URL(config.api.setPriceUrl);

  url.searchParams.set('id', String(id));
  url.searchParams.set('price', String(price));

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`API обновления цены недоступен: ${response.status}`);
  }
}

function splitText(text, maxLength = 2000) {
  const words = String(text).split(' ');
  const result = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length < maxLength) {
      currentLine += ` ${word}`;
    } else {
      result.push(currentLine.trim());
      currentLine = word;
    }
  }

  if (currentLine) {
    result.push(currentLine.trim());
  }

  return result;
}

function splitNotificationLines(lines, maxLength = 2000) {
  const parts = [];
  let currentPart = '';

  for (const line of lines) {
    const nextPart = currentPart ? `${currentPart}\n${line}` : line;

    if (nextPart.length <= maxLength) {
      currentPart = nextPart;
      continue;
    }

    if (currentPart) {
      parts.push(currentPart);
    }

    if (line.length <= maxLength) {
      currentPart = line;
      continue;
    }

    const lineChunks = splitText(line, maxLength);
    parts.push(...lineChunks.slice(0, -1));
    currentPart = lineChunks[lineChunks.length - 1] || '';
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  return parts;
}

function buildCompactDetailLines(message, maxLines) {
  const lines = String(message || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  const hiddenCount = lines.length - visibleLines.length;

  visibleLines.push(`И ещё ${hiddenCount} поз. без деталей.`);
  return visibleLines;
}

function getAdminMentions(config) {
  return (config.notifications.telegram?.adminMentions || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildTelegramParts(context) {
  const maxDetailLines = context.maxDetailLines || 12;
  const headerLines = [
    `<b>${escapeHtml(context.title)}</b>`,
    `Сценарий: <code>${escapeHtml(context.parserName)}</code>`,
    `Время: ${escapeHtml(formatTime())}`,
  ];

  if (context.stats) {
    headerLines.push(`Статистика: ${escapeHtml(context.stats)}`);
  }

  if (context.undercutDescription) {
    headerLines.push(`Отступ: ${escapeHtml(context.undercutDescription)}`);
  }

  if (context.alertMentions?.length > 0) {
    headerLines.push(`Внимание: ${context.alertMentions.map((item) => escapeHtml(item)).join(' ')}`);
  }

  const rawDetailLines = context.message
    ? context.fullDetails
      ? String(context.message)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : buildCompactDetailLines(context.message, maxDetailLines)
    : [];

  const detailLines = rawDetailLines.map((line) => escapeHtml(line));

  const lines = [...headerLines, '', ...detailLines];
  return splitNotificationLines(lines);
}

async function sendNotification(config, context) {
  const token = config.notifications.telegramToken;
  const chatId = config.notifications.telegramChatId;

  // Уведомления опциональны: если токен или чат не заданы, просто молча пропускаем.
  if (!token || !chatId) {
    return;
  }

  const parts = buildTelegramParts({
    ...context,
    fullDetails: Boolean(context.fullDetails),
    maxDetailLines: config.notifications.telegram?.maxDetailLines || 12,
    alertMentions: context.alert ? getAdminMentions(config) : [],
    undercutDescription: describeUndercut(config),
  });

  for (const [index, part] of parts.entries()) {
    await sendTelegramMessage(
      token,
      chatId,
      parts.length > 1 ? `${part}\n\nЧасть ${index + 1}/${parts.length}` : part
    );
  }
}

async function sendTelegramMessage(token, chatId, message) {
  const url = new URL(`https://api.telegram.org/bot${token}/sendMessage`);

  url.searchParams.set('chat_id', chatId);
  url.searchParams.set('parse_mode', 'HTML');
  url.searchParams.set('text', message);

  await fetch(url.toString());
}

async function openMarketWithSelectedCity(driver, config) {
  // Сначала убеждаемся, что Kaspi открылся и город можно выбрать автоматически.
  await driver.navigate().to(config.kaspi.probeProductUrl);

  const cityLink = await driver.wait(
    until.elementLocated(By.css(`a[data-city-id="${config.kaspi.cityId}"]`)),
    10000
  );

  const text = await cityLink.getAttribute('textContent');

  if (!text) {
    return false;
  }

  await cityLink.click();
  return true;
}

module.exports = {
  createLogs,
  createStopController,
  describeUndercut,
  formatPrice,
  getProductList,
  getSellerTable,
  getOptimalPrice,
  logInfo,
  logWarn,
  openMarketWithSelectedCity,
  rememberFailedProduct,
  rememberMissingOwnSellers,
  sendNotification,
  setRemotePrice,
};
