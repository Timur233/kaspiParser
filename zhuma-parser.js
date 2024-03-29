const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const config = {
    kaspiUser: 'Seveneleven2022@mail.ru',
    kaspiPass: 'T@tyana20',
    isKaspiUpdate: true,
    myMarckets: ['Power Steel', 'Intexmania-kz'],
    screen: {
        width: 1920,
        height: 1080
    }
};

(async function parser() {
    let products = await getProductList();
    let parserLog = '';
    let disableProductsLog = '';

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(
            new Options()
                .addArguments(["--no-sandbox"])
                .headless()
                .windowSize(config.screen)
            )
            .build();

    try {    
        const optimalPrices = [];

        for (let item in products) {

            optimalPrices.push(await getOptimalPrice(
                products[item].id, 
                products[item].sku, 
                parseInt(products[item].minPrice), 
                parseInt(products[item].price)
            ));

        }

        await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
        await authKaspi(driver); 

        let i = 0;

        for (let item of optimalPrices) {
            i++;
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

                console.log(i);
            }

        }

        await sendNotification('Лог обхода по прайсу\n', '\n' + parserLog);
        await sendNotification('Товары достигшие мин. цены: \n', '\n' + disableProductsLog);

    }
    finally{
        driver.quit();
    }

    async function changePriceInSallerCabinet(driver, productSku, productMinPrice, productPrice, saller) {
        if (config.isKaspiUpdate && !config.myMarckets.includes(saller)) {

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

            let search = null;
            let searchBtn = null;
            let isEnabledButton = false;

            await driver.wait(until.elementLocated(By.css('input[placeholder="Артикул/Товар"]')), 5000);
            search = await driver.findElement(By.css('input[placeholder="Артикул/Товар"]'));
            searchBtn = await driver.findElement(By.css('._nested.panel button.form__col._4-12._medium_5-12._large_4-12.button'));

            isEnabledButton = await search.isEnabled();

            if (!isEnabledButton) {
                config.isKaspiUpdate = false;
            } else {

                let trs = null;
                let sku = null;

                try {
                    await search.clear();
                    await search.sendKeys(productSku);
                    await searchBtn.click();
                } catch (er) {
                    console.log(er);
                    return false;
                }

                try {
                    await driver.wait(until.elementsLocated(By.css('.offer-managment__table-wrapper tbody tr[__gwt_row]')), 3000);
                } catch (error) {
                    return false;
                }

                trs = await driver.findElements(By.css('.offer-managment__table-wrapper tbody tr'));
                for (let tr of trs) {
                    try {
                        sku = await tr.findElement(By.css('.offer-managment__product-cell-meta-text:last-child'));

                        if (await sku.getText() === productSku) {
                            const link = await tr.findElement(By.css('.icon._medium._edit'));

                            await link.click();

                            const input = await driver.wait(until.elementLocated(By.css('#price-city-750000000')), 3000);
                            const button = await driver.findElement(By.css('.form__row._controls>.button:first-child'));

                            await input.clear();
                            await input.sendKeys(productPrice-1);

                            await button.click();

                            break;
                        }
                    } catch {
                        break;
                    } finally{
                        console.log('this code will be executed at all time');
                        return "haha";
                      }
                }
            }

            return null;

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

    async function getOptimalPrice(id, sku, productMinPrice, productPrice) {

        let optimalPrice = productPrice - 5;
        const minPrice = productMinPrice;
        let sallerName = 'Kaspi Жума';

        parserLog += sku.replace('#', '') + ':  ' + sallerName + '\n'; //.replaceAll('#', '')

        if (productMinPrice >= optimalPrice) {
            disableProductsLog += sku.replace('#', '') + ' - Минимальная цена \n';  //.replaceAll('#', '')
            optimalPrice = productMinPrice;
        }

        return {
            id,
            sku,
            minPrice,
            optimalPrice,
            sallerName
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
            try {
                await driver.navigate().refresh();
    
                tbody = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 5000);
                trs = await tbody.findElements(By.css('tr'));
            } catch {
                return null;
            }
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