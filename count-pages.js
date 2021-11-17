const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');

const config = {
    merchantName: 'Dostarmebel',
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

        await driver.navigate().to(`https://kaspi.kz/shop/c/categories/?q=%3AallMerchants%3A${config.merchantName}&at=1&page=1`);

        const allCatsLink = await driver.wait(
            until.elementLocated(
                By.css('div.filters div.tree__add-link > span.filters__count')
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