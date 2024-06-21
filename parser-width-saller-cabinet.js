const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const config = {
    kaspiUser: 'beard.095@mail.ru',
    kaspiPass: 'Bestway@sia23',
    isKaspiUpdate: true,
    cabinetWindow: null,
    marketWindow: null,
    myMarckets: ['Power Steel', 'Intexmania-kz', 'Aquaintex-asia-kz'],
    screen: {
        width: 1920,
        height: 1080
    }
};

(async function parser() {
    //.addArguments(["--no-sandbox"]).headless()
    //.addArguments(["--no-sandbox", "--incognito"])
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(
            new Options()
                .addArguments([
                    "--no-sandbox", 
                    "--disable-extensions", 
                    "--disable-infobars", 
                    "--disable-plugins-discovery", 
                    "--disable-popup-blocking", 
                    "--disable-save-password-bubble", 
                    "--disable-translate"
                ])
                .setUserPreferences({
                    'profile.managed_default_content_settings.images': 2,
                    'profile.managed_default_content_settings.stylesheets': 2,
                })
                .headless()
                .windowSize(config.screen)
            )
            .build();
    let products = await getProductList();
    let filter = ['#56709', '#56709_1', '#56709_2', '26784', '26784_1', '26784_2', '#28003', '#28003_1', '#28003_2',
    '#5614X', '#5614X_1', '#28274', '#28274_1', '#28274_2', '#28274_3', '#56416', '#56416_1', '#56416_2', '#56416_3', '#56416_4',
    '#56416_5', '#56416_6', '#56416_7', '#26648', '#28005', '#28005_1', '#28005_2', '#26646', '#26646_1', 
    '#28210', '#28210_1', '#28210_2', '#28210_3', '#28210_4', '#56403', '#56403_1', '#56403_2', '#56403_3', 
    ]
    let parserLog = '';
    let disableProductsLog = '';

    try {    
        await driver.switchTo().newWindow('tab');
        await driver
                .navigate()
                .to('https://kaspi.kz/shop/p/bestway-58486-100738217/?c=750000000&at=1');

        const windows = await driver.getAllWindowHandles();
        config.cabinetWindow = windows[0];
        config.marketWindow = windows[1];

        // CHECK BOT
        let selectCity = await driver.wait(
            until.elementLocated(By.css('a[data-city-id="750000000"]')), 
            10000
        );

        selectCity = await selectCity.getAttribute('textContent')

        if (selectCity != '') {
            const optimalPrices = [];

            await driver.findElement(By.css('a[data-city-id="750000000"]')).click();
            for (let item in products) {

                if (!filter.includes(products[item].sku)) continue;

                let sallerTable = null;

                await driver.navigate().to(products[item].link);

                sallerTable = await getSallerTable(driver);

                if (sallerTable !== null) {
                    const product_item = await getOptimalPrice(
                        products[item].id, 
                        products[item].sku, 
                        parseInt(products[item].minPrice), 
                        parseInt(products[item].maxPrice), 
                        Array.from(sallerTable)
                    );

                    if (!config.myMarckets.includes(product_item.sallerName)) {
                        await priceHelper(
                            product_item.id, 
                            product_item.sku, 
                            product_item.minPrice, 
                            product_item.optimalPrice, 
                            product_item.sallerName
                        );
                    }

                    optimalPrices.push(product_item);
                }

            }

            /* Auth in Kaspi */
            await driver.switchTo().window(config.cabinetWindow);
            await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
            await authKaspi(driver); 

            try {
                await driver.wait(until.elementLocated(By.css('.timeOut_err')), 4000);
            } catch {}

            for (let item in optimalPrices) {
                if (!config.myMarckets.includes(optimalPrices[item].sallerName.trim())) {
                    try {
                        await driver.wait(until.elementLocated(By.css('.timeOut_err')), 1500);
                    } catch {}

                    await driver.navigate().to('https://kaspi.kz/mc/#/products/ACTIVE/1');
                    await findProduct(
                        driver,
                        optimalPrices[item].sku, 
                    );
                    await changePriceInSallerCabinet(driver, optimalPrices[item].optimalPrice);// + 10000);
                }
            }

            await sendNotification('Лог обхода по прайсу + Личный кабинет\n', '\n' + parserLog);
            await sendNotification('Товары достигшие мин. цены: \n', '\n' + disableProductsLog);
        } else {

            await sendNotification('Начало обхода', 'Джастин у нас проблемы с защитой от ботов');

        }

    }
    catch (e) {
        console.log(e)
        driver.quit();
    }
    finally{
        driver.quit();
    }

    async function authKaspi(driver) {
        await driver.wait(until.elementLocated(By.css('.tabs')), 10000);

        const parent = await driver.findElement(By.css('.tabs > ul > li:not(.is-active) > a'));

        await parent.click();

        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 500);
        } catch {}

        const emailInput = await driver.findElement(By.css('input#user_email_field'));
        const loginButton = await driver.findElement(By.css('#continue_button'));

        await emailInput.sendKeys(config.kaspiUser);
        await loginButton.click();

        const passInput = await driver.findElement(By.css('input#password_field'));
        await passInput.sendKeys(config.kaspiPass);

        await loginButton.click();
    }

    async function openProductsPage(driver) {
        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 4000);
        } catch {}

        await driver.wait(until.elementLocated(By.css('a[href="#/products/ACTIVE/1"]')), 10000);
        const pageLink = await driver.findElement(By.css('a[href="#/products/ACTIVE/1"]'));

        await pageLink.click();
    }

    async function findProduct(driver, productSku) {

        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 3000);
        } catch {}

        const searchInput = await driver.findElement(By.css('.search input[type="search"]'));
        const searchButton = await driver.findElement(By.css('.search button[type="button"]'));
        let productRows = null;

        await searchInput.clear();
        await searchInput.sendKeys(productSku);
        await searchButton.click();

        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 4000);
        } catch {}

        productRows = await driver.findElements(By.css('.table-wrapper table.table tbody tr'));
        
        for (let i = 0; i < productRows.length; i++) {
            const row = productRows[i];

            const subTitle = await row.findElement(By.css('.media-content p.subtitle')).getAttribute('innerHTML');
            const rowSku = subTitle.split('<br>')[1]?.trim();

            
            if (productSku === rowSku) {
                const moreButton = await row.findElement(By.css('td:last-child .dropdown-trigger'));

                moreButton.click();

                const productLink = await row.findElement(By.css('td:last-child .dropdown-content > a:first-child'));
        
                await productLink.click();

                break;
            }
        }
    }

    async function changePriceInSallerCabinet(driver, productPrice) {
        try {
            try {
                await driver.wait(until.elementLocated(By.css('.timeOut_err')), 3500);
            } catch {}

            const priceInput = await driver.findElement(By.css('.table-wrapper tr.is-subheading > th:nth-child(2) input[inputmode="numeric"]'));
            try {
                await driver.wait(until.elementLocated(By.css('.timeOut_err')), 100);
            } catch {}
            const saveButton = await driver.findElement(By.css('.block button.is-primary'));

            await priceInput.clear();
            await priceInput.sendKeys(productPrice);
            await saveButton.click();
        } catch(e) {console.log(e)}
    }

    async function priceHelper(id, sku, minPrice, sallerPrice, saller) {
        if (!config.myMarckets.includes('saller')) {
            let price = sallerPrice;// + 10000;
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

    async function calculateDiscount(price) {
        if (price < 10000) {
            return 11;
        } else if (price > 1000000) {
            return 150;
        } else {
            const discount = 11 + (price - 10000) * (150 - 11) / (1000000 - 10000);
            
            return Math.round(Math.max(11, Math.min(150, discount)));
        }
    }

    async function getOptimalPrice(id, sku, productMinPrice, maxPrice, sallerTable) {

        let optimalPrice = productMinPrice;
        const minPrice = productMinPrice - await calculateDiscount(Number(productMinPrice));
        let sallerName = sallerTable[0].saller;
        let sallerPrice = sallerTable[0].price;

        parserLog += sku.replaceAll('#', '') + ':  ' + sallerName + '\n';

        if (productMinPrice > sallerPrice) {
            disableProductsLog += sku.replaceAll('#', '') + ' - Минимальная цена ' + sallerPrice.toLocaleString() + 'тг.\n';
        }

        // if (config.myMarckets.includes(sallerName)) {
        //     return {
        //         id,
        //         sku,
        //         minPrice,
        //         sallerPrice,
        //         sallerName,
        //         sallerPrice
        //     }
        // }

        for (let offer of sallerTable) {
            if (minPrice < offer.price && !config.myMarckets.includes(offer.saller)
                ) {
                    optimalPrice = offer.price - await calculateDiscount(Number(offer.price));
                    sallerName = offer.saller;
                    sallerPrice = offer.price;

                    break;
            } 
        };

        console.log('sku', sku);
        console.log('optimal', optimalPrice);
        console.log('saller', sallerPrice);

        if (maxPrice > 0 && optimalPrice > maxPrice) optimalPrice = maxPrice;

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

    function splitText(text) {
        const maxLength = 2000;
        const words = text.split(' ');
        let result = [];
        let currentLine = '';
      
        words.forEach(word => {
          if ((currentLine + ' ' + word).length < maxLength) {
            currentLine += ' ' + word;
          } else {
            result.push(currentLine.trim());
            currentLine = word;
          }
        });
      
        if (currentLine) {
          result.push(currentLine.trim());
        }
      
        return result;
      }
    
    async function sendNotification(step, mess) {
        const parts = splitText(mess);

        parts.forEach(async (part, index) => {
            await sendTelegramMessage(step, `${index + 1}/${parts.length}\n${part}`);
        });
    }

    async function sendTelegramMessage(step, mess) {
        let token = '575889929:AAHx0Um6lHbpu52dgnP0Mpwf-4qGnno_HKQ'
        let chat_id = '-558302682'
        let date = new Date()
        let message = 'Дата: ' + date + '\n\nЭтап: ' + step + '\nСообщение: ' + mess
        let url = 'https://api.telegram.org/bot' + token + '/sendMessage?chat_id=' + chat_id + '&parse_mode=HTML' + '&text=' + message
    
        const sendMessToTelegram = await fetch(encodeURI(url));
    }
})();