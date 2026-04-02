const { loadConfig } = require('./src/config');
const { createChromeSession } = require('./src/browser');
const { createRunTracker } = require('./src/storage/run-tracker');
const {
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
} = require('./src/kaspi');

(async function parserForYou() {
  const config = loadConfig();
  const parserConfig = config.parsers.forYou;
  const logs = createLogs();
  const stopController = createStopController('for-you');
  const failedLinks = new Set();
  let products = [];
  let runState = 'completed';
  const runTracker = await createRunTracker(config, { parserName: 'parser-for-you' });

  // Создаём изолированную сессию Chrome с автоматической очисткой временных файлов.
  const { driver, cleanup, sessionDir } = await createChromeSession('parser-for-you', {
    ...config.chrome,
    headless: parserConfig.headless,
  });

  try {
    products = await getProductList(config);
    runTracker.setTotalProducts(products.length);
    logInfo('for-you', `Получено товаров: ${products.length}. Режим отступа: ${describeUndercut(config)}.`);
    const marketReady = await openMarketWithSelectedCity(driver, config);

    if (!marketReady) {
      logWarn('for-you', 'Kaspi не дал автоматически выбрать город. Возможно, сработала защита.');
      await sendNotification(config, {
        title: 'Проблема с доступом к Kaspi',
        parserName: 'parser-for-you',
        stats: `Товаров в очереди: ${products.length}`,
        alert: true,
        message: 'Похоже, Kaspi показал защиту от ботов.',
      });
      return;
    }

    // В этом сценарии мы только мониторим витрину и отправляем цену во внешнее API.
    for (const [index, product] of products.entries()) {
      if (stopController.isStopRequested()) {
        runState = 'stopped';
        break;
      }

      if (failedLinks.has(product.link)) {
        logWarn('for-you', `${product.sku}: ссылка уже помечена как проблемная, повторно не открываю.`);
        continue;
      }

      logInfo('for-you', `Обработка ${index + 1}/${products.length}: ${product.sku}`);
      try {
        await driver.navigate().to(product.link);
      } catch (error) {
        failedLinks.add(product.link);
        rememberFailedProduct(logs, product, `Не удалось открыть страницу: ${error.message}`);
        runTracker.recordProblemPage({
          sku: product.sku,
          link: product.link,
          reason: `Не удалось открыть страницу: ${error.message}`,
        });
        logWarn('for-you', `${product.sku}: страница не открылась.`);
        continue;
      }

      const sellerTable = await getSellerTable(driver);
      if (!sellerTable) {
        failedLinks.add(product.link);
        rememberFailedProduct(logs, product, 'Не удалось получить таблицу продавцов');
        runTracker.recordProblemPage({
          sku: product.sku,
          link: product.link,
          reason: 'Не удалось получить таблицу продавцов',
        });
        logWarn('for-you', `Не удалось получить таблицу продавцов для ${product.sku}.`);
        continue;
      }

      const missingOwnSellers = rememberMissingOwnSellers(config, logs, product, sellerTable);
      if (missingOwnSellers.length > 0) {
        runTracker.recordMissingOwnSellers({
          sku: product.sku,
          link: product.link,
          missingOwnSellers,
        });
        logWarn('for-you', `${product.sku}: не все наши магазины в карточке: ${missingOwnSellers.join(', ')}`);
      }

      const optimalPrice = getOptimalPrice(config, logs, product, sellerTable);
      const remoteUpdated =
        !config.kaspi.ownSellers.includes(optimalPrice.sallerName) && parserConfig.updateRemotePrice;
      logInfo(
        'for-you',
        `${product.sku}: конкурент ${optimalPrice.sallerName}, цена ${formatPrice(optimalPrice.sallerPrice)}, наша ${formatPrice(optimalPrice.optimalPrice)}`
      );
      if (remoteUpdated) {
        await setRemotePrice(config, optimalPrice.id, optimalPrice.optimalPrice);
        logInfo('for-you', `${product.sku}: цена отправлена во внешнее API.`);
      }

      if (Number(product.minPrice) > optimalPrice.firstSellerPrice) {
        runTracker.recordMinPriceHit();
      }

      if (config.kaspi.ownSellers.includes(optimalPrice.firstSellerName)) {
        runTracker.recordOwnSellerFirst();
      }

      runTracker.recordProductResult({
        sku: product.sku,
        link: product.link,
        competitor: optimalPrice.firstSellerName,
        competitorPrice: optimalPrice.firstSellerPrice,
        targetCompetitor: optimalPrice.sallerName,
        targetCompetitorPrice: optimalPrice.sallerPrice,
        ourPrice: optimalPrice.optimalPrice,
        remoteUpdated,
        cabinetUpdated: false,
        ownSellerFirst: config.kaspi.ownSellers.includes(optimalPrice.firstSellerName),
      });
    }
  } catch (error) {
    runState = 'failed';
    console.error('parser-for-you failed:', error);
    await sendNotification(
      config,
      {
        title: 'Ошибка parser-for-you',
        parserName: 'parser-for-you',
        alert: true,
        message: `${error.message}\nВременная папка: ${sessionDir}`,
      }
    );
    process.exitCode = 1;
  } finally {
    if (stopController.isStopRequested() && runState !== 'failed') {
      runState = 'stopped';
    }

    await runTracker
      .finish(runState, {
        stopReason: stopController.getReason(),
      })
      .catch(() => {});

    await sendNotification(config, {
      title:
        runState === 'stopped'
          ? 'Обход витрины остановлен'
          : 'Обход витрины завершён',
      parserName: 'parser-for-you',
      stats: `Всего в очереди: ${products.length}, мы первые: ${runTracker.document.summary.ownSellerFirst}, упёрлись в минимум: ${logs.disableProductsLog.length}, проблемных страниц: ${logs.failedProductsLog.length}${runState === 'stopped' ? `, причина: ${stopController.getReason()}` : ''}`,
      fullDetails: true,
      message: logs.parserLog.length > 0 ? logs.parserLog.join('\n') : 'Лог обхода пуст.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Товары у минимальной цены',
      parserName: 'parser-for-you',
      stats: `Количество: ${logs.disableProductsLog.length}`,
      message:
        logs.disableProductsLog.length > 0
          ? logs.disableProductsLog.join('\n')
          : 'Во время обхода товары у минимальной цены не найдены.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Проблемные страницы',
      parserName: 'parser-for-you',
      stats: `Количество: ${logs.failedProductsLog.length}`,
      message:
        logs.failedProductsLog.length > 0
          ? logs.failedProductsLog.join('\n')
          : 'Во время обхода проблемных страниц не было.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Карточки без части наших магазинов',
      parserName: 'parser-for-you',
      stats: `Количество: ${logs.missingOwnSellersLog.length}`,
      message:
        logs.missingOwnSellersLog.length > 0
          ? logs.missingOwnSellersLog.join('\n')
          : 'Во всех карточках присутствовали все наши магазины.',
    }).catch(() => {});

    // Даже при ошибке стараемся закрыть браузер и убрать временный профиль.
    await driver.quit().catch(() => {});
    await cleanup().catch(() => {});
    stopController.cleanup();
  }
})();
