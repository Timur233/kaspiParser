const { By, until } = require('selenium-webdriver');
const { loadConfig } = require('./src/config');
const { createChromeSession } = require('./src/browser');
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

async function authKaspi(driver, account) {
  // Логин через email/пароль для входа в кабинет продавца.
  await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
  await driver.wait(until.elementLocated(By.css('.tabs')), 10000);

  const byEmailTab = await driver.findElement(By.css('.tabs > ul > li:not(.is-active) > a'));
  await byEmailTab.click();

  try {
    await driver.wait(until.elementLocated(By.css('.timeOut_err')), 500);
  } catch {}

  const emailInput = await driver.findElement(By.css('input#user_email_field'));
  const continueButton = await driver.findElement(By.css('#continue_button'));

  await emailInput.clear();
  await emailInput.sendKeys(account.user);
  await continueButton.click();

  const passwordInput = await driver.findElement(By.css('input#password_field'));
  await passwordInput.sendKeys(account.pass);
  await continueButton.click();
}

async function waitKaspiTimeout(driver, timeout = 1500) {
  try {
    await driver.wait(until.elementLocated(By.css('.timeOut_err')), timeout);
  } catch {}
}

async function findProduct(driver, productSku) {
  // Находим конкретный товар в кабинете по SKU и открываем его карточку.
  await waitKaspiTimeout(driver, 3000);

  const searchInput = await driver.findElement(By.css('.search input[type="search"]'));
  const searchButton = await driver.findElement(By.css('.search button[type="button"]'));

  await searchInput.clear();
  await searchInput.sendKeys(productSku);
  await searchButton.click();

  await waitKaspiTimeout(driver, 4000);

  const productRows = await driver.findElements(By.css('.table-wrapper table.table tbody tr'));

  for (const row of productRows) {
    const subTitle = await row.findElement(By.css('.media-content p.subtitle')).getAttribute('innerHTML');
    const rowSku = subTitle.split('<br>')[1]?.trim();

    if (productSku !== rowSku) {
      continue;
    }

    const moreButton = await row.findElement(By.css('td:last-child .dropdown-trigger'));
    await moreButton.click();

    const productLink = await row.findElement(By.css('td:last-child .dropdown-content > a:first-child'));
    await productLink.click();
    return true;
  }

  return false;
}

async function changePriceInSellerCabinet(driver, productPrice) {
  // Меняем цену прямо в кабинете продавца после расчёта оптимального значения.
  await waitKaspiTimeout(driver, 3500);

  const priceInput = await driver.findElement(
    By.css('.table-wrapper tr.is-subheading > th:nth-child(2) input[inputmode="numeric"]')
  );
  const saveButton = await driver.findElement(By.css('.block button.is-primary'));

  await priceInput.clear();
  await priceInput.sendKeys(productPrice);
  await saveButton.click();
}

(async function parserWithSellerCabinet() {
  const config = loadConfig();
  const parserConfig = config.parsers.sellerCabinet;
  const account = config.accounts.sellerCabinet;
  const logs = createLogs();
  const stopController = createStopController('seller-cabinet');
  const failedLinks = new Set();
  let filteredProducts = [];
  let products = [];
  let runState = 'completed';

  // Этот сценарий сочетает мониторинг витрины и обновление цен в кабинете.
  const { driver, cleanup, sessionDir } = await createChromeSession('parser-width-saller-cabinet', {
    ...config.chrome,
    headless: parserConfig.headless,
  });

  try {
    products = await getProductList(config);
    filteredProducts =
      parserConfig.skuFilter.length > 0
        ? products.filter((product) => parserConfig.skuFilter.includes(product.sku))
        : products;
    logInfo(
      'seller-cabinet',
      `Получено товаров: ${products.length}, в обработке: ${filteredProducts.length}. Режим отступа: ${describeUndercut(config)}.`
    );

    const marketReady = await openMarketWithSelectedCity(driver, config);

    if (!marketReady) {
      logWarn('seller-cabinet', 'Kaspi не дал автоматически выбрать город. Возможно, сработала защита.');
      await sendNotification(config, {
        title: 'Проблема с доступом к Kaspi',
        parserName: 'parser-width-saller-cabinet',
        stats: `Товаров в обработке: ${filteredProducts.length}`,
        message: 'Похоже, Kaspi показал защиту от ботов.',
      });
      return;
    }

    const optimalPrices = [];

    for (const [index, product] of filteredProducts.entries()) {
      if (stopController.isStopRequested()) {
        runState = 'stopped';
        break;
      }

      if (failedLinks.has(product.link)) {
        logWarn('seller-cabinet', `${product.sku}: ссылка уже помечена как проблемная, повторно не открываю.`);
        continue;
      }

      logInfo('seller-cabinet', `Обработка ${index + 1}/${filteredProducts.length}: ${product.sku}`);
      try {
        await driver.navigate().to(product.link);
      } catch (error) {
        failedLinks.add(product.link);
        rememberFailedProduct(logs, product, `Не удалось открыть страницу: ${error.message}`);
        logWarn('seller-cabinet', `${product.sku}: страница не открылась.`);
        continue;
      }

      const sellerTable = await getSellerTable(driver);
      if (!sellerTable) {
        failedLinks.add(product.link);
        rememberFailedProduct(logs, product, 'Не удалось получить таблицу продавцов');
        logWarn('seller-cabinet', `Не удалось получить таблицу продавцов для ${product.sku}.`);
        continue;
      }

      const missingOwnSellers = rememberMissingOwnSellers(config, logs, product, sellerTable);
      if (missingOwnSellers.length > 0) {
        logWarn(
          'seller-cabinet',
          `${product.sku}: не все наши магазины в карточке: ${missingOwnSellers.join(', ')}`
        );
      }

      const optimalPrice = getOptimalPrice(config, logs, product, sellerTable);
      optimalPrices.push(optimalPrice);
      logInfo(
        'seller-cabinet',
        `${product.sku}: конкурент ${optimalPrice.sallerName}, цена ${formatPrice(optimalPrice.sallerPrice)}, наша ${formatPrice(optimalPrice.optimalPrice)}`
      );

      if (!config.kaspi.ownSellers.includes(optimalPrice.sallerName) && parserConfig.updateRemotePrice) {
        await setRemotePrice(config, optimalPrice.id, optimalPrice.optimalPrice);
        logInfo('seller-cabinet', `${product.sku}: цена отправлена во внешнее API.`);
      }
    }

    if (parserConfig.updateCabinetPrice) {
      logInfo('seller-cabinet', 'Начинаю обновление цен в кабинете продавца.');
      await authKaspi(driver, account);
      await waitKaspiTimeout(driver, 4000);

      // После обхода витрины проходим по найденным товарам и обновляем кабинет.
      for (const item of optimalPrices) {
        if (stopController.isStopRequested()) {
          runState = 'stopped';
          break;
        }

        if (config.kaspi.ownSellers.includes(item.sallerName.trim())) {
          continue;
        }

        await driver.navigate().to('https://kaspi.kz/mc/#/products/ACTIVE/1');
        const productOpened = await findProduct(driver, item.sku);

        if (!productOpened) {
          rememberFailedProduct(logs, item, 'Товар не найден в кабинете продавца');
          logWarn('seller-cabinet', `${item.sku}: товар не найден в кабинете продавца.`);
          continue;
        }

        await changePriceInSellerCabinet(driver, item.optimalPrice);
        logInfo('seller-cabinet', `${item.sku}: цена обновлена в кабинете до ${formatPrice(item.optimalPrice)}.`);
      }
    }

  } catch (error) {
    runState = 'failed';
    console.error('parser-width-saller-cabinet failed:', error);
    await sendNotification(
      config,
      {
        title: 'Ошибка parser-width-saller-cabinet',
        parserName: 'parser-width-saller-cabinet',
        message: `${error.message}\nВременная папка: ${sessionDir}`,
      }
    );
    process.exitCode = 1;
  } finally {
    if (stopController.isStopRequested() && runState !== 'failed') {
      runState = 'stopped';
    }

    await sendNotification(config, {
      title:
        runState === 'stopped'
          ? 'Обход витрины и кабинета остановлен'
          : 'Обход витрины и кабинета завершён',
      parserName: 'parser-width-saller-cabinet',
      stats: `Всего в очереди: ${filteredProducts.length}, упёрлись в минимум: ${logs.disableProductsLog.length}, проблемных страниц: ${logs.failedProductsLog.length}${runState === 'stopped' ? `, причина: ${stopController.getReason()}` : ''}`,
      fullDetails: true,
      message: logs.parserLog.length > 0 ? logs.parserLog.join('\n') : 'Лог обхода пуст.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Товары у минимальной цены',
      parserName: 'parser-width-saller-cabinet',
      stats: `Количество: ${logs.disableProductsLog.length}`,
      message:
        logs.disableProductsLog.length > 0
          ? logs.disableProductsLog.join('\n')
          : 'Во время обхода товары у минимальной цены не найдены.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Проблемные страницы',
      parserName: 'parser-width-saller-cabinet',
      stats: `Количество: ${logs.failedProductsLog.length}`,
      message:
        logs.failedProductsLog.length > 0
          ? logs.failedProductsLog.join('\n')
          : 'Во время обхода проблемных страниц не было.',
    }).catch(() => {});
    await sendNotification(config, {
      title: 'Карточки без части наших магазинов',
      parserName: 'parser-width-saller-cabinet',
      stats: `Количество: ${logs.missingOwnSellersLog.length}`,
      message:
        logs.missingOwnSellersLog.length > 0
          ? logs.missingOwnSellersLog.join('\n')
          : 'Во всех карточках присутствовали все наши магазины.',
    }).catch(() => {});

    await driver.quit().catch(() => {});
    await cleanup().catch(() => {});
    stopController.cleanup();
  }
})();
