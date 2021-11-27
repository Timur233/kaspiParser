const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');

const screen = {
    width: 1920,
    height: 1080
};

const config = {
    kaspiUser: 'dostar.mebel@mail.ru',
    kaspiPass: 'Korlan7@',
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
            "--no-sandbox"
        ]).windowSize(screen)).build();

    try {

        await driver.navigate().to('https://kaspi.kz/merchantcabinet/');
        await authKaspi(driver);
        await openProductsPage(driver);

        const lastPage = await calcPageCounts(driver);
        let page = 1;
        
        for (page; page <= lastPage; page++) {
            console.log(page, await getProductsLinks(driver));
            
            if (lastPage !== page) {
                await clickNextPage(driver);
            }
        }

    }
    finally{
        driver.quit();
    }

})();

async function authKaspi(driver) {

    await driver.wait(until.elementLocated(By.css('main.container')), 10000);
    const parent = await driver.findElement(By.css('main.container>div:last-child'));

    const emailInput = await parent.findElement(By.css('input#email'));
    const passInput = await parent.findElement(By.css('input#password'));
    const loginButton = await parent.findElement(By.css('button.button'));

    await emailInput.sendKeys(config.kaspiUser);
    await passInput.sendKeys(config.kaspiPass);
    await loginButton.click();

}

async function openProductsPage(driver) {

    const offersLink = await driver.wait(until.elementLocated(By.css('[href="#/offers"]')), 10000);
    await offersLink.click();

    const statusFilter = await driver.findElement(By.css(".ks-gwt-panel>._nested.panel>.grid__col:nth-child(3) select.form__col"));
    await statusFilter.click();

    const statusFilterOpt = await driver.wait(
        until.elementLocated(
            By.css(".ks-gwt-panel>._nested.panel>.grid__col:nth-child(3) select.form__col option:nth-child(5)")
        )
    , 1000);
    await statusFilterOpt.click();

}

async function calcPageCounts(driver) {

    await driver.wait(until.elementLocated(By.css(".offer-managment__product-cell-link")), 10000);

    const paginationLabel = await driver.findElement(By.css(".ks-gwt-pagination .gwt-HTML")); //.ks-gwt-pagination .gwt-HTML
    const paginationLabelText = await paginationLabel.getText();
    const paginationLabelArr = paginationLabelText.split(' ');
    const countProducts = paginationLabelArr.pop();
    const countPages = Math.ceil(countProducts / 10);

    return countPages;

}

async function getProductsLinks(driver) {
    
    await driver.wait(until.elementLocated(By.css(".offer-managment__product-cell-link")), 10000);
    const productLinksItems = await driver.findElements(By.css('.offer-managment__product-cell-link'));
    const productSkuItems = await driver.findElements(By.css('div[title="Артикул в системе продавца"]'));
    
    const productLinks = [];
    
    for (let i in productLinksItems) {
        const productSku = await productSkuItems[i].getText();
        const productLink = await productLinksItems[i].getAttribute('href');

        productLinks.push({ [productSku]: productLink })
    }

    return productLinks;
}

async function clickNextPage(driver) {
    const nextButton = driver.findElement(By.css('img.gwt-Image[aria-label="Next page"]'));

    await nextButton.click();
}