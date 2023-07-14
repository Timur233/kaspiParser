const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const config = {
    kaspiUsers: [
        {
            user: 'intexmania@mail.ru',
            pass: 'Bestway@asia23',
        },
        {
            user: 'beard.095@mail.ru',
            pass: 'Bestway@sia23',
        },
        {
            user: 'seveneleven2022@mail.ru',
            pass: 'T@tyana20',
        },
    ],
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
                // .headless()
                .windowSize(config.screen)
            )
            .build();
    let products = await getProductList();
    let parserLog = '';
    let disableProductsLog = '';

    try {
        for (let user in config.kaspiUsers) {
            /* Auth in Kaspi */
            await driver.navigate().to('https://kaspi.kz/merchantcabinet/login');
            await authKaspi(driver, config.kaspiUsers[user]); 

            try {
                await driver.wait(until.elementLocated(By.css('.timeOut_err')), 4000);
            } catch {}

            for (let item in products) {
                try {
                    await driver.wait(until.elementLocated(By.css('.timeOut_err')), 1500);
                } catch {}

                await driver.navigate().to('https://kaspi.kz/mc/#/products/ACTIVE/1');
                await findProduct(
                    driver,
                    products[item].sku, 
                );
                await changePriceInSallerCabinet(driver, products[item].price);
            }

            await sendNotification('Лог обхода по прайсу + ЛК\n', '\n' + parserLog);
            await sendNotification('Товары достигшие мин. цены: \n', '\n' + disableProductsLog);
        }  
    }
    catch(e) {
        console.log(e);
        driver.quit();
    }
    finally{
        driver.quit();
    }

    async function authKaspi(driver, user) {
        await driver.wait(until.elementLocated(By.css('.tabs')), 10000);
        const parent = await driver.findElement(By.css('.tabs > ul > li:not(.is-active) > a'));

        await parent.click();

        const emailInput = await driver.findElement(By.css('input#user_email'));
        const loginButton = await driver.findElement(By.css('.login button.button'));

        await emailInput.sendKeys(user.user);
        await loginButton.click();

        const passInput = await driver.findElement(By.css('[type="password"]'));
        await passInput.sendKeys(user.pass);

        await loginButton.click();
    }

    async function findProduct(driver, productSku) {

        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 5000);
        } catch {}

        const searchInput = await driver.findElement(By.css('.search input[type="search"]'));
        const searchButton = await driver.findElement(By.css('.search button[type="button"]'));
        let productRows = null;

        await searchInput.clear();
        await searchInput.sendKeys(productSku);
        await searchButton.click();

        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 5000);
        } catch {}

        productRows = await driver.findElements(By.css('.table-wrapper table.table tbody tr'));
        
        for (let i = 0; i < productRows.length; i++) {
            const row = productRows[i];

            const subTitle = await row.findElement(By.css('.media-content p.subtitle')).getAttribute('innerHTML');
            const rowSku = subTitle.split('<br>')[1]?.trim();
      
            if (productSku === rowSku) {
                const productLink = await row.findElement(By.css('td:last-child div.mr-2'));
        
                await productLink.click();

                break;
            }
        }
    }

    async function changePriceInSallerCabinet(driver, productPrice) {
        try {
            await driver.wait(until.elementLocated(By.css('.timeOut_err')), 5000);
        } catch {}

        const priceInput = await driver.findElement(By.css('.table-wrapper table.table thead tr.is-subheading div.th-wrap input.input'));
        const saveButton = await driver.findElement(By.css('.tab-item .block button.is-primary'));

        await priceInput.clear();
        await priceInput.sendKeys(productPrice);
        await saveButton.click();
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