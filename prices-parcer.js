const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');

const config = {
    merchantName: 'Dostarmebel',
    page: 1,
    offset: 3,
}
    
const screen = {
    width: 1920,
    height: 1080
};

(async function parser() {

    /**
     * Параметры отключения интерфейса Chrome:
     *      .addArguments(["--no-sandbox"]).headless()
     * Параметр режима инкогнито:
     *      .addArguments(["--no-sandbox", "--incognito"])
     */
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(new Options().addArguments([
            "--no-sandbox", "--log-level=3"
        ])
        .windowSize(screen)).build();

    try {

        await driver.navigate().to(`https://kaspi.kz/shop/info/merchant/${config.merchantName}/reviews-tab/`);
        await driver.findElement(By.css('a[data-city-id="750000000"]')).click();

        for (let page = config.page; page <= config.offset; page++) {
            await driver.navigate().to(`https://kaspi.kz/shop/c/categories/?q=%3AallMerchants%3A${config.merchantName}&at=1&page=${page}`);

            
        }

        

        const allCatsLink = await driver.wait(
            until.elementLocated(
                By.css('img.item-card__image')
            ), 10000
        );

        const productsCountS = await allCatsLink.getText();
        const productsCountN = productsCountS.replace('(', '').replace(')', '');
        const pagesCount = Math.ceil(productsCountN / 12);

        console.log(pagesCount);

        // result = { 
        //     status: CONST.HTTPSTATUSES.SUCCESS.OK.code, 
        //     msg: CONST.HTTPSTATUSES.SUCCESS.OK.name 
        // };

    }
    catch (e) {
        console.log('catch ', e);
        mainController.telegram({
            body:{
                action: "sendMessage",
                message: "Ошибка при парсинге товаров личного кабинета (parser): " + e
            }
        });
        await driver.quit();
    }
    finally{
        await driver.quit();

        // return result;
    }

})()

//await parser();