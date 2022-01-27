const {Builder, By, Key, until} = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const fetch = require('node-fetch');

const screen = {
    width: 1920,
    height: 1080
};

const config = {
    kaspiUser: 'yiavrik@mail.ru',
    kaspiPass: '123456QWEasd#',
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

        await driver.navigate().to('https://marketing.kaspi.kz/sign-in');
        await authKaspi(driver);
        await collectSalesItems(driver);
        // await openProductsPage(driver);

        // const lastPage = await calcPageCounts(driver);
        // let page = 1;

        // console.log(lastPage);
        
        // for (page; page <= lastPage; page++) {
        //     console.log(page, await getProductsLinks(driver));
            
        //     if (lastPage !== page) {
        //         await clickNextPage(driver);
        //     }
        // }

    }
    finally{
        //driver.quit();
    }

})();

async function authKaspi(driver) {

    await driver.wait(until.elementLocated(By.css('#email')), 10000);
    const parent = await driver.findElement(By.css('.sign-in'));

    const emailInput = await parent.findElement(By.css('input#email'));
    const passInput = await parent.findElement(By.css('input#password'));
    const loginButton = await parent.findElement(By.css('button.sign-in__btn'));

    await emailInput.sendKeys(config.kaspiUser);
    await passInput.sendKeys(config.kaspiPass);
    await loginButton.click();

}

async function getPromotionCategories(driver) {
    await driver.wait(until.elementLocated(By.css('div.root-category')), 10000);
    
    const modal = await driver.findElement(By.css('.base-modal-desktop'));
    const modalBody = await driver.findElement(By.css('.base-modal-desktop__body'));
    const categories = await modalBody.findElements(By.css('ul.list'));
    let closeButton =  await modal.findElement(By.css('.base-modal-desktop__close'));
    const promotionCats = [];

    for (i in categories) {
        const categoryName = await categories[i].findElement(By.css('div.root-category>span'));
        const categorySublist = await categories[i].findElements(By.css('ul.sub-list>li.sub-category'));
        const promotionCategory = {};
        const promotionSubcategories = [];

        for (i in categorySublist) {
            promotionSubcategories.push(
                {
                    title: await categorySublist[i].findElement(By.css('span:first-child')),
                    percent: await categorySublist[i].findElement(By.css('span:last-child')),
                }
            );
        }

        promotionCategory.name = await categoryName.getText();
        promotionCategory.subCategories = promotionSubcategories;

        promotionCats.push(promotionCategory);        
    }

    console.log(await closeButton.getAttribute('class'));
    await closeButton.click();

    return promotionCats;
}

async function collectSalesItems(driver) {
    await driver.wait(until.elementLocated(By.css('.promotions')), 10000);
    const parent = await driver.findElement(By.css('.promotions'));
    const items = await parent.findElements(By.css('.container>.promotion'));
    const promotions = [];

    for (let i in items) {
        const promotion = {};
        let modal = null;
        let advantages = null;

        await items[i].click();

        await driver.wait(until.elementLocated(By.css('.advantages')), 10000);
        
        modal = await driver.findElement(By.css('.base-modal-desktop'));
        advantages = await modal.findElements(By.css('.advantage'));

        promotion.i = i;
        promotion.promotionName = await modal.findElement(By.css('.promotion-description__title')).getText();
        promotion.promotionDates = await advantages[0].getText();
        promotion.promotionType = await advantages[1].getText();

        await advantages[2].click();
        promotion.categories = await getPromotionCategories(driver);

        promotions.push(promotion);

        console.log(promotion);
    }
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
    const paginationLabelArr = paginationLabelText.split(' из ');
    const countProducts = paginationLabelArr.pop();
    const countPages = Math.ceil(countProducts.replace(' ', '') / 10);

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