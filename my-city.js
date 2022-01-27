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

        await driver.navigate().to('https://www.nash-gorod.kz/ALMATY/Firms/ru/2605/STROITELNYE-KOMPANII-TEHNADZOR/1_100');

        var comps = await driver.findElements(By.css('table.RowStyleDefault a.fName'));

        let links = await mapLinksObj (comps)
        let data = {}

        for (let i in links) {
            await openTab(driver, links[i])
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
            await collectDataForCompany(driver, link);
        } 
        catch (e) {
            console.log(e);
        }
        finally {
            await driver.close();
            await driver.switchTo().window(originalWindow);
        }

    }

    async function collectDataForCompany(driver, link) {
        
        let name = await driver.findElement(By.css('.ItemNameUpper>div'));
        await driver.wait(until.elementLocated(By.css('tr#MainContent_lbShowPhones')), 10000);
        let openPhone = await driver.findElement(By.css('tr#MainContent_lbShowPhones'));
        await openPhone.click();

        let openEmail = await driver.findElement(By.css('tr#MainContent_lbShowEMail'));
        await openEmail.click();

        let phones = await driver.findElement(By.css('#PhoneLinks'));

        //#PhoneLinks
        //let price = await getSallerPrice(driver);
        //let width = await collectProductFields(driver, 'Ширина профиля');
        //let height = await collectProductFields(driver, 'Высота профиля');
        //let dia = await collectProductFields(driver, 'Высота профиля');
        //let season = await collectProductFields(driver, 'Сезонность');
        //let thorns = await collectProductFields(driver, 'Шипы');
        //let code = await driver.findElement(By.css('.item__sku')).getText();

        let data = {
            name: await name.getText(), 
            phones: await phones.getText(), 
            //width: width,
            //height: height,
            //dia: dia,
            //season: season,
            //thorns: thorns,
            //saller: 'Tyres Trade',
            //price: price,
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
        console.log(data);
        // worksheet.insertRow(2, {
        //     name: data.name, 
        //     //width: data.width,
        //     //height: data.height,
        //     //dia: data.dia,
        //     //season: data.season,
        //     //thorns: data.thorns,
        //     //saller: data.saller,
        //     //price: data.price,
        //     link: data.link,
        //     code: data.code
        // });
    }

    async function setExcelColumns(columns) {

        let colums = [
            { header: 'Название', key: 'name', width: 40 },
            //{ header: 'Ширина', key: 'width', width: 10 },
            //{ header: 'Высота', key: 'height', width: 10 },
            //{ header: 'Диаметр', key: 'dia', width: 10 },
            //{ header: 'Сезонность', key: 'season', width: 15 },
            //{ header: 'Шипы', key: 'thorns', width: 10 },
            //{ header: 'Продавец', key: 'saller', width: 15 },
            //{ header: 'Цена', key: 'price', width: 15 },
            { header: 'Ссылка', key: 'link', width: 30 },
            { header: 'Код товара', key: 'code', width: 15 },
        ];
        worksheet.columns = colums;

    }

})();