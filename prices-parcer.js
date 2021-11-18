const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');

const config = {
    merchantName: 'Rs6',
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

            console.log(await getPrices(driver));
        }

    }
    catch (e) {
        console.log('catch ', e);
        mainController.telegram({
            body:{
                action: "sendMessage",
                message: "Ошибка при парсинге товаров с сайта Kaspi.kz (parser): " + e
            }
        });
        await driver.quit();
    }
    finally{
        await driver.quit();

        // return result;
    }

})()

async function getPrices(driver) {
    await driver.wait(until.elementLocated(By.css('.item-card')), 10000);
    
    const productCards = await driver.findElements(By.css('.item-card'));
    const productsPrices = [];
    
    for (i in productCards) {
        const link = await productCards[i].findElement(By.css('.item-card__image-wrapper'));
        const price = await productCards[i].findElement(By.css('.item-card__prices-price'));

        productsPrices.push({
            [await linkFormatter(link)]: await priceFormatter(price),
        });
    }

    async function linkFormatter(link) {
        const linkURL = await link.getAttribute('href');
        const id = linkURL.match(/[^\-]*[$\?]/g);
        return id[0].replace('/?', '');
    }

    async function priceFormatter(price) {
        const priceStr = await price.getText();
        
        return priceStr.replace(' ', '').replace('₸', '').trim();
    }

    return productsPrices;

}

//await parser();