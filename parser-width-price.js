//Установить NPM и Node желательно установыить NVM что бы контролировать версии
//Установить Chrome
//Становить WebDrver той же версии что и Chrome (Ссылку можiно взять на сайте селениума и скачать терминалом wget {ссылка})
//Разместить драйвер в папке bin список папок можно получить так: echo $PATH, Копировать cp {начало} {конец}
//Установить библиотеки для Node внимательние с версиями
//Нужно помнить если парсер столкнется со страницой входа он будет молча стоять

const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const prompt = require("prompt-async");
const config = {
    kaspiUser: 'mtv1806.kz@mail.ru',
    kaspiPass: 'T@tyana20',
    isKaspiUpdate: false
};
const screen = {
    width: 1920,
    height: 1080
};

(async function parser() {
    //.addArguments(["--no-sandbox"]).headless()
    //.addArguments(["--no-sandbox", "--incognito"])
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new Options().addArguments(["--no-sandbox"]).windowSize(screen)).build();
    let products = await getProductList();
    let parserLog = '';
    let disableProductsLog = '';

    try {
        await driver.navigate().to('https://kaspi.kz/merchantcabinet');
        await authKaspi(driver);
        
        await driver.switchTo().newWindow('tab');
        await driver
                .navigate()
                .to('https://kaspi.kz/shop/p/bestway-58486-100738217/?c=750000000&at=1');

        // CHECK BOT
        let selectCity =  await driver.wait(
            until.elementLocated(By.css('a[data-city-id="750000000"]')), 
            10000
        );

        selectCity = await selectCity.getAttribute('textContent')

        if (selectCity != '') {
            await driver.findElement(By.css('a[data-city-id="750000000"]')).click();

            for (let item in products) { //in products

                await driver.navigate().to(products[item].link);
                
                try {
                    driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody')), 50000);

                    let price = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody tr:first-child .sellers-table__price-cell-text')), 50000);
                    let saller = await driver.wait(until.elementLocated(By.css('td.sellers-table__cell a')), 50000)
                    
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
                        parseInt(price)
                    );

                } catch (e) {
                    console.log(e, products[item]);
                }

            }

            await sendNotification('Лог обхода по прайсу\n', '\n' + parserLog);
            await sendNotification('Товары достигшие мин. цены: \n', '\n' + disableProductsLog);
        } else {

            await sendNotification('Начало обхода', 'Джастин у нас проблемы с защитой от ботов');

        }

    }
    finally{
        //driver.quit();
    }

    async function changePriceInSallerCabinet(driver, productSku, productMinPrice, productPrice) {
        if (!config.isKaspiUpdate) {
            const windows = await driver.getAllWindowHandles();

            await driver.switchTo().window(windows[0]);
            await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
            await authKaspi(driver); 
            
            try {
                const offersTab = await driver.wait(until.elementLocated(By.css('.main-nav__el-link[href="#/offers"]')), 3000);

                await offersTab.click();
            } catch {

                try {
                    await driver.navigate().refresh();
                    const offersTab = await driver.wait(until.elementLocated(By.css('.main-nav__el-link[href="#/offers"]')), 3000);

                    await offersTab.click();
                } catch {
                    await driver.navigate().refresh();
                    const offersTab = await driver.wait(until.elementLocated(By.css('.main-nav__el-link[href="#/offers"]')), 5000);

                    await offersTab.click();

                }

            }

            try {
                const search = await driver.findElement(By.css('input[placeholder="Артикул/Товар"]'));

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

                    if (productMinPrice < productPrice) {
                        await input.sendKeys(productPrice - 10);

                        await button.click();
                    }


                }
            } catch (e) {
                console.log(e);
                config.isKaspiUpdate = true;
            }

            await driver.switchTo().window(windows[1]);
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
        if (saller != 'Intexmania-kz' && saller != 'Aquaintex-asia-kz') {
            if (sallerPrice > minPrice) {
    
                let price = sallerPrice - 10
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
                return false;
    
            }
        } else {

            if (sallerPrice < minPrice) {

                await sendNotification('Установка новой цены', sku.replaceAll('#', '') + ' - НИЗКАЯ ЦЕНА');

            }
    
            return false;
    
        }
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