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
const screen = {
    width: 1920,
    height: 1080
};

(async function parser() {
    //.addArguments(["--no-sandbox"]).headless()
    //.addArguments(["--no-sandbox", "--incognito"])
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new Options().addArguments(["--no-sandbox"]).windowSize(screen)).build();
    let products = await getProductList();

    try {
        await driver.navigate().to('https://kaspi.kz/shop/p/bestway-58486-100738217/?c=750000000&at=1');

        // CHECK BOT
        let selectCity =  await driver.wait(until.elementLocated(By.css('a[data-city-id="750000000"]')), 10000)
        selectCity = await selectCity.getAttribute('textContent')

        if (selectCity != '') {
            await driver.findElement(By.css('a[data-city-id="750000000"]')).click();

            var log = '';

            for (let item in products) {

                await driver.navigate().to(products[item].link);

                // Enter text "cheese" and perform keyboard action "Enter"
                //await driver.findElement(By.css('a[data-city-id="750000000"]')).click();
                await driver.findElement(By.css('.seller-table__inner table tbody'));
                //let test = await driver.findElement(By.css('h1.item__heading'))
                let price = await driver.wait(until.elementLocated(By.css('.seller-table__inner table tbody tr:first-child .sellers-table__price-cell-text')), 10000);
                let saller = await driver.wait(until.elementLocated(By.css('td.sellers-table__cell a')), 10000)
                price = await price.getAttribute('textContent')
                price = price.replace(/\s/g, '').replace('₸', '')
                saller = await saller.getAttribute('textContent')

                log = log + '. №' + products[item].id + ':  ' + saller + ' - ' + price + 'тг.\n'

                await priceHelper(products[item].id, products[item].name, products[item].minPrice, price, saller)

            }

            await sendNotification('Лог обхода по прайсу\n', '\n' + log)
            console.log(log)
        } else {
            await sendNotification('Начало обхода', 'Джастин у нас проблемы с защитой от ботов')
        }

    }
    finally{
        driver.quit();
    }

})();

async function priceHelper(id, name, minPrice, sallerPrice, saller) {
    if (saller != 'Intexmania-kz' && saller != 'Aquaintex-asia-kz') {
        if (sallerPrice > minPrice) {

            let price = sallerPrice - 10
            let url = "https://bestway-asia.kz/integration/api/set_new_kaspi_price.php?id=" + id + '&price=' + price

            try {
                const setPrice = await fetch(url)
                if (await setPrice.ok) {
                    return true
                } else {
                    await sendNotification('Установка новой цены', 'API Bestway Asia недоступен')
                    return false
                }
            } catch (error) {
                await sendNotification('Установка новой цены', 'Ошибка отправки запроса')
                return false
            }

        } else {

            sendNotification('Установка новой цены', 'Товар:' + name + ' достиг минимальной цены')
            return false

        }
    } else {


        return false

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

    sendMessToTelegram = fetch(encodeURI(url))

}

async function authKaspi(driver) {

    let link = 'https://kaspi.kz/entrance';

    await driver.get(link);

    let phoneInput = driver.findElement(By.css('input#txtLogin'));
    await phoneInput.sendKeys('7714613215');

    let passInput = driver.findElement(By.css('input#txtPassword'));
    await passInput.sendKeys('frXQXrtkx1');

    let loginButton = driver.findElement(By.css('input.entrance__loginButton'));
    await loginButton.click();

    let code = await prompt_code_async();

    console.log(code);

    await code.split('');

    let char1 = driver.findElement(By.css('input#txtOtpChar1'));
    await char1.sendKeys(code[0]);

    let char2 = driver.findElement(By.css('input#txtOtpChar2'));
    await char2.sendKeys(code[1]);

    let char3 = driver.findElement(By.css('input#txtOtpChar3'));
    await char3.sendKeys(code[2]);

    let char4 = driver.findElement(By.css('input#txtOtpChar4'));
    await char4.sendKeys(code[3]);

}


async function prompt_code_async()
{
    prompt.start();

    const {code} = await prompt.get(["code"]);

    return code;
}
