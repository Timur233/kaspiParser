//Установить NPM и Node желательно установыить NVM что бы контролировать версии
//Установить Chrome
//Становить WebDriver той же версии что и Chrome (Ссылку можно взять на сайте селениума и скачать терминалом wget {ссылка})
//Разместить драйвер в папке bin список папок можно получить так: echo $PATH, Копировать cp {начало} {конец}
//Установить библиотеки для Node внимательние с версиями
//Нужно помнить если парсер столкнется со страницой входа он будет молча стоять

const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');
const screen = {
    width: 1920,
    height: 1080
};

(async function parser() {

    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new Options().addArguments(["--no-sandbox"]).headless().windowSize(screen)).build();
    let products = await getProductList();

    try {
        sendNotification('Начало обхода по прайсу', '200')

        // Navigate to Url
        await driver.get('https://goolge.com/search?q=купить+бассейн+в+алматы');

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

                log = log + item + '. №' + products[item].id + ':  ' + saller + ' - ' + price + 'тг.\n'

                await priceHelper(products[item].id, products[item].minPrice, price, saller)

            }

            sendNotification('Лог обхода по прайсу\n', '\n' + log)
            console.log(log)
        } else {
            sendNotification('Начало обхода', 'Джастин у нас проблемы с защитой от ботов')
        }

    }
    finally{
        driver.quit();
    }

})();

async function priceHelper(id, minPrice, sallerPrice, saller) {
    if (saller != 'Intexmania-kz' && saller != 'Aquaintex-asia-kz') {
        if (sallerPrice > minPrice) {

            let price = sallerPrice - 10
            let url = "https://bestway-asia.kz/integration/api/set_new_kaspi_price.php?id=" + id + '&price=' + price

            try {
                const setPrice = await fetch(url)
                if (await setPrice.ok) {
                    return true
                } else {
                    sendNotification('Установка новой цены', 'API Bestway Asia недоступен')
                    return false
                }
            } catch (error) {
                sendNotification('Установка новой цены', 'Ошибка отправки запроса')
                return false
            }

        } else {

            sendNotification('Установка новой цены', 'Товар №' + id + ' достиг минимальной цены')
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

function sendNotification(step, mess) {

    let token = '575889929:AAHx0Um6lHbpu52dgnP0Mpwf-4qGnno_HKQ'
    let chat_id = '-558302682'
    let date = new Date()
    let message = 'Дата: ' + date + '\n\nЭтап: ' + step + '\nСообщение: ' + mess
    let url = 'https://api.telegram.org/bot' + token + '/sendMessage?chat_id=' + chat_id + '&parse_mode=HTML' + '&text=' + message

    sendMessToTelegram = fetch(encodeURI(url))

}
