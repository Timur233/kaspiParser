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
const ExcelJS = require('exceljs');
let fs = require('fs');
const screen = {
    width: 1920,
    height: 1080
};

(async function parser() {

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tires Trade');

    await setExcelColumns();    

    //.addArguments(["--no-sandbox"]).headless()
    //.addArguments(["--no-sandbox", "--incognito"])
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(new Options().addArguments(["--no-sandbox"]).windowSize(screen)).build();

    try {

        await driver.navigate().to('https://kaspi.kz/shop/search/?text=%D1%88%D0%B8%D0%BD%D1%8B:category:Tires:allMerchants:TyresTrade');
        await driver.findElement(By.css('a[data-city-id="750000000"]')).click();

        for (let page = 1; page <= 84; page++) {

            await driver.navigate().to('https://kaspi.kz/shop/search/?text=%D1%88%D0%B8%D0%BD%D1%8B:category:Tires:allMerchants:TyresTrade&page='+page);
            var tyres = await driver.findElements(By.css('.item-card__name-link'));

            let links = await mapLinksObj (tyres)
            let data = {}

            for (let i in links) {
                await openTab(driver, links[i])
            }
        
        }

    }
    finally{
        driver.quit();
    }

    await workbook.xlsx.writeFile('files/tyres.xlsx')

    async function mapLinksObj (tyres) {
        try {
            
            let links = []

            for (let tyre in tyres) {
                links.push(await tyres[tyre].getAttribute('href'))
            }

            return links
            
        } 
        catch {
            console.log('Error');
        }
    }

    async function openTab (driver, link) {
        
        const originalWindow = await driver.getWindowHandle();

        try {
            await driver.switchTo().newWindow('tab');
            await driver.navigate().to(link);
            await collectDataForProduct(driver, link);
        } 
        catch (e) {
            console.log(e);
        }
        finally {
            await driver.close();
            await driver.switchTo().window(originalWindow);
        }

    }

    async function collectDataForProduct(driver, link) {
        
        let name = await driver.findElement(By.css('.item__heading'));
        let price = await getSallerPrice(driver);
        let width = await collectProductFields(driver, 'Ширина профиля');
        let height = await collectProductFields(driver, 'Высота профиля');
        let dia = await collectProductFields(driver, 'Высота профиля');
        let season = await collectProductFields(driver, 'Сезонность');
        let thorns = await collectProductFields(driver, 'Шипы');
        // let code = await driver.findElement(By.css('.item__sku')).getText();

        let data = {
            name: await name.getText(), 
            width: width,
            height: height,
            dia: dia,
            season: season,
            thorns: thorns,
            saller: 'Tyres Trade',
            price: price,
            link: link,
            //code: await code.replace("Код товара:", "")
        }

        addExcelLine(data)

    }

    async function collectProductFields (driver, pattern) {

        let spec = await driver.findElement(By.css(".item-content__tab[data-tab='specifications']")).click();
        let fields = await driver.findElements(By.css(".specifications-list__spec"));
        
        for (let i in fields) {
            let label = await fields[i].findElement(By.css(".specifications-list__spec-term-text"));
            if (await label.getText() == pattern) {
                return await fields[i].findElement(By.css(".specifications-list__spec-definition")).getText();
            }
        }

        let sallers = await driver.findElement(By.css(".item-content__tab[data-tab='sellers']")).click();

    }

    async function getSallerPrice(driver) {
        
        try {

            let sallers = await driver.findElement(By.css(".item-content__tab[data-tab='sellers']")).click();

            let collection = await collectPriceForSaller();
            if (collection) {
                return await collection;
            }

            let paginations = await driver.findElements(By.css('.pagination>li:not(:first-child):not(:last-child):not(._active)'));

                for (var i in paginations) {
                    console.log(await paginations[i].getText()); 
                    await paginations[i].click();
                    //let encodedString = await driver.takeScreenshot();
                    //await fs.writeFileSync('./image.png', encodedString, 'base64');
                    let collection = await driver.wait(() => collectPriceForSaller(), 10000);
                    if (collection !== false) {
                        return await collection;
                    } 

                }


        }

        catch {
            
        }

        async function collectPriceForSaller() {
            let sallers = await driver.findElements(By.css('.sellers-table__self>tbody>tr'))
            for (i in sallers) {
                let saller = await sallers[i].findElement(By.css('td:first-child>a')).getText();
                if (saller == 'Tyres Trade') {
                    let price = await sallers[i].findElement(By.css('.sellers-table__price-cell-text:not(._installments-price)')).getText();
                    return price;
                }
            } 
            return false;
        }

        async function collectPrice(driver) {
            
            let sallers = await driver.findElements(By.css('.sellers-table__self>tbody>tr>td:first-child>a'));
            let i = 0;
            for (i in sallers) {
                if (await sallers[i].getText() == 'Tyres Trade') {
                    try {
                        let price = await driver.findElement(By.css('.sellers-table__self>tbody>tr:nth-child(' + ((i*1) + 1) + ')>td:nth-child(4)>.sellers-table__price-cell-text'));
                        return await price.getText();
                    } catch (e) {
                        console.log(e);
                    }
                    
                } 

            }

            return false;

        }

    }

    async function addExcelLine(data) {
        worksheet.insertRow(2, {
            name: data.name, 
            width: data.width,
            height: data.height,
            dia: data.dia,
            season: data.season,
            thorns: data.thorns,
            saller: data.saller,
            price: data.price,
            link: data.link,
        });
    }

    async function setExcelColumns(columns) {

        let colums = [
            { header: 'Название', key: 'name', width: 40 },
            { header: 'Ширина', key: 'width', width: 10 },
            { header: 'Высота', key: 'height', width: 10 },
            { header: 'Диаметр', key: 'dia', width: 10 },
            { header: 'Сезонность', key: 'season', width: 15 },
            { header: 'Шипы', key: 'thorns', width: 10 },
            { header: 'Продавец', key: 'saller', width: 15 },
            { header: 'Цена', key: 'price', width: 15 },
            { header: 'Ссылка', key: 'link', width: 30 },
            //{ header: 'Код товара', key: 'code', width: 10 },
        ];
        worksheet.columns = colums;

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
                    await sendNotification('Установка новой цены', 'API Bestway Asia недоступен')
                    return false
                }
            } catch (error) {
                await sendNotification('Установка новой цены', 'Ошибка отправки запроса')
                return false
            }

        } else {

            //sendNotification('Установка новой цены', 'Товар №' + id + ' достиг минимальной цены')
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

//async function 