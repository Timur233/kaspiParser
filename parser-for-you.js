const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const config = {
    kaspiUser: 'mtv1806.kz@mail.ru',
    kaspiPass: 'T@tyana20',
    isKaspiUpdate: true,
    cabinetWindow: null,
    marketWindow: null,
    myMarckets: ['Intexmania-kz'],
    screen: {
        width: 1920,
        height: 1080
    }
};

(async function parser() {
    //.addArguments(["--no-sandbox"]).headless()
    //.addArguments(["--no-sandbox", "--incognito"])
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new Options().addArguments(["--no-sandbox"]).windowSize(config.screen)).build();
    let products = await getProductList();
    let parserLog = '';
    let disableProductsLog = '';

    try {
        await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
        await authKaspi(driver);
        
        await driver.switchTo().newWindow('tab');
        await driver
                .navigate()
                .to('https://kaspi.kz/shop/p/bestway-58486-100738217/?c=750000000&at=1');

        const windows = await driver.getAllWindowHandles();
        config.cabinetWindow = windows[0];
        config.marketWindow = windows[1];

        // CHECK BOT
        let selectCity =  await driver.wait(
            until.elementLocated(By.css('a[data-city-id="750000000"]')), 
            10000
        );

        selectCity = await selectCity.getAttribute('textContent')

        if (selectCity != '') {
            const optimalPrices = [];

            await driver.findElement(By.css('a[data-city-id="750000000"]')).click();
            for (let item in products) {

                let sallerTable = null;

                await driver.navigate().to(products[item].link);

                sallerTable = await getSallerTable(driver);

                optimalPrices.push(await getOptimalPrice(
                    products[item].id, 
                    products[item].sku, 
                    parseInt(products[item].minPrice), 
                    Array.from(sallerTable)
                ));

                async function fn () {
                    try {
                        await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 5000);

                        let price = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody tr:first-child .sellers-table__price-cell-text')), 5000);
                        let saller = await driver.wait(until.elementLocated(By.css('td.sellers-table__cell a')), 5000)
                        
                        price = await price.getAttribute('textContent')
                        price = price.replace(/\s/g, '').replace('₸', '')
                        saller = await saller.getAttribute('textContent')

                        parserLog = parserLog + products[item].sku.replaceAll('#', '') + ':  ' + saller + ' - ' + price + 'тг.\n'

                        await priceHelper(
                            products[item].id, 
                            products[item].sku, 
                            parseInt(products[item].minPrice), 
                            parseInt(price), 
                            saller
                        );

                        await changePriceInSallerCabinet(
                            driver,
                            products[item].sku,
                            parseInt(products[item].minPrice), 
                            parseInt(price),
                            saller
                        );

                    } catch (e) {
                        try {
                            await driver.navigate().refresh();

                            await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 15000);

                            let price = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody tr:first-child .sellers-table__price-cell-text')), 15000);
                            let saller = await driver.wait(until.elementLocated(By.css('td.sellers-table__cell a')), 15000)
                            
                            price = await price.getAttribute('textContent')
                            price = price.replace(/\s/g, '').replace('₸', '')
                            saller = await saller.getAttribute('textContent')

                            parserLog = parserLog + products[item].sku.replaceAll('#', '') + ':  ' + saller + ' - ' + price + 'тг.\n'

                            await priceHelper(
                                products[item].id, 
                                products[item].sku, 
                                parseInt(products[item].minPrice), 
                                parseInt(price), 
                                saller
                            );

                            await changePriceInSallerCabinet(
                                driver,
                                products[item].sku,
                                parseInt(products[item].minPrice), 
                                parseInt(price),
                                saller
                            );
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }

            }

            await driver.switchTo().window(config.cabinetWindow);

            for (let item of optimalPrices) {
                
                if (!config.myMarckets.includes(item.sallerName)) {
                    await priceHelper(
                        item.id, 
                        item.sku, 
                        item.minPrice, 
                        item.optimalPrice, 
                        item.sallerName
                    );
    
                    await changePriceInSallerCabinet(
                        driver,
                        item.sku,
                        item.minPrice, 
                        item.optimalPrice,
                        item.sallerName
                    );
                }

            }

            await sendNotification('Лог обхода по прайсу\n', '\n' + parserLog);
            await sendNotification('Товары достигшие мин. цены: \n', '\n' + disableProductsLog);
        } else {

            await sendNotification('Начало обхода', 'Джастин у нас проблемы с защитой от ботов');

        }

    }
    finally{
        driver.quit();
    }

    async function changePriceInSallerCabinet(driver, productSku, productMinPrice, productPrice, saller) {
        if (config.isKaspiUpdate && (saller != 'Intexmania-kz' && saller != 'Aquaintex-asia-kz')) {

            // await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
            // await authKaspi(driver); 

            let offersPageReady = false;

            while (!offersPageReady) {
                try {
                    const offersTab = await driver.wait(until.elementLocated(By.css('.main-nav__el-link[href="#/offers"]')), 3000);

                    await offersTab.click();
                    offersPageReady = true;
                } catch {
                    await driver.navigate().refresh();
                }
            }

            try {
                let search = null;

                await driver.wait(until.elementLocated(By.css('input[placeholder="Артикул/Товар"]')), 5000);
                search = await driver.findElement(By.css('input[placeholder="Артикул/Товар"]'));

                if (!await search.isEnabled()) {
                    config.isKaspiUpdate = false;
                } else {

                    await search.clear();
                    await search.sendKeys(productSku);

                    await driver.wait(until.elementLocated(By.css('.offer-managment__table-wrapper tbody tr:first-child'), 5000));
                
                    const tr = driver.findElement(By.css('.offer-managment__table-wrapper tbody tr:first-child'));
                    const sku = await driver.wait(until.elementLocated(By.css('.offer-managment__product-cell-meta-text:last-child'), 5000));

                    if (await sku.getText() === productSku) {
                        const link = await driver.findElement(By.css('.icon._medium._edit'));

                        await link.click();

                        //////
                        const input = await driver.wait(until.elementLocated(By.css('#price-city-750000000')), 3000);
                        const button = await driver.findElement(By.css('.form__row._controls>.button:first-child'));

                        await input.clear();
                        await input.sendKeys(productPrice);

                        await button.click();
                    }
                }
            } catch (e) {
                console.log(e);
                // config.isKaspiUpdate = true;
            } 

        } 
    }

    async function authKaspi(driver) {
        await driver.wait(until.elementLocated(By.css('main.container')), 10000);
        const parent = await driver.findElement(By.css('main.container>#loginForm'));

        const emailInput = await parent.findElement(By.css('input#email'));
        const passInput = await parent.findElement(By.css('input#password'));
        const loginButton = await parent.findElement(By.css('button.button'));

        await emailInput.sendKeys(config.kaspiUser);
        await passInput.sendKeys(config.kaspiPass);
        await loginButton.click();
    }

    async function priceHelper(id, sku, minPrice, sallerPrice, saller) {
        if (!config.myMarckets.includes('saller')) {
            let price = sallerPrice
                let url = "https://bestway-asia.kz/integration/api/set_new_kaspi_price.php?id=" + id + '&price=' + price
    
                try {
                    const setPrice = await fetch(url);

                    if (await setPrice.ok) {
                        return true;
                    } else {
                        await sendNotification('Установка новой цены', 'API Bestway Asia недоступен');
                        return false;
                    }
                } catch (error) {
                    await sendNotification('Установка новой цены', 'Ошибка отправки запроса');
                    return false;
                } finally {
                    // const windows = await driver.getAllWindowHandles();

                    // await driver.switchTo().window(windows[0])
                }
            /*
            if (sallerPrice > minPrice) {
    
                let price = sallerPrice
                let url = "https://bestway-asia.kz/integration/api/set_new_kaspi_price.php?id=" + id + '&price=' + price
    
                try {
                    const setPrice = await fetch(url);

                    if (await setPrice.ok) {
                        return true;
                    } else {
                        await sendNotification('Установка новой цены', 'API Bestway Asia недоступен');
                        return false;
                    }
                } catch (error) {
                    await sendNotification('Установка новой цены', 'Ошибка отправки запроса');
                    return false;
                } finally {
                    // const windows = await driver.getAllWindowHandles();

                    // await driver.switchTo().window(windows[0])
                }
    
            } else {
    
                disableProductsLog = disableProductsLog + sku.replaceAll('#', '') + ' - Минимальная цена\n';
                console.log('helper', 'min price');
                return false;
    
            }
            */
        }
        
        return false;
    }

    async function getOptimalPrice(id, sku, minPrice, sallerTable) {

        let optimalPrice = minPrice;
        let sallerName = sallerTable[0].saller;
        let sallerPrice = sallerTable[0].price;

        for (let offer of sallerTable) {
            if ((minPrice - 10) < offer.price && !config.myMarckets.includes(offer.saller)) {
                optimalPrice = offer.price - 10;
                sallerName = offer.saller;
                sallerPrice = offer.price;

                break;
            } 
        };

        return {
            id,
            sku,
            minPrice,
            optimalPrice,
            sallerName,
            sallerPrice
        }
        
    }

    async function getSallerTable(driver) {

        const tableObject = [];
        let tbody = null;
        let trs = null;

        try {
            tbody = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 5000);
            trs = await tbody.findElements(By.css('tr'));
        } catch {
            await driver.navigate().refresh();

            tbody = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 5000);
            trs = await tbody.findElements(By.css('tr'));
        }

        for (let tr of trs) {
            const price = tr.findElement(By.css('.sellers-table__price-cell-text'));
            const saller = tr.findElement(By.css('td.sellers-table__cell a'));
            const priceText = await price.getAttribute('textContent');

            tableObject.push({
                saller: await saller.getAttribute('textContent'),
                price:  parseInt(priceText
                    .replace(/\s/g, '')
                    .replace('₸', ''))
            });
        }

        return tableObject;

    }
    
    async function getProductList() {

        const url = "https://bestway-asia.kz/integration/parser_connect.php"
        try {
            const products = await fetch(url)
            const json = await products.json()
            if (await products.ok) {
                return json
            } else {
                sendNotification('Получение списка товаров с Bestway-Asia', 'Невозможно получить список товаров \nОшибка: ' + products.status + '\nURL Link: ' + url)
                return false
            }
        } catch (error) {
            sendNotification('Получение списка товаров с Bestway-Asia', 'Ошибка запроса к bestway-asia.kz. \nОшибка: ' + error + '\nURL Link: ' + url)
        }

    }
    
    async function sendNotification(step, mess) {
    
        let token = '575889929:AAHx0Um6lHbpu52dgnP0Mpwf-4qGnno_HKQ'
        let chat_id = '-558302682'
        let date = new Date()
        let message = 'Дата: ' + date + '\n\nЭтап: ' + step + '\nСообщение: ' + mess
        let url = 'https://api.telegram.org/bot' + token + '/sendMessage?chat_id=' + chat_id + '&parse_mode=HTML' + '&text=' + message
    
        const sendMessToTelegram = await fetch(encodeURI(url));
    
    }

})();