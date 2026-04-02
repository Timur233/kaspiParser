const fs = require('fs');
const path = require('path');

// Базовая конфигурация проекта.
// Любое поле здесь можно переопределить в parser.config.local.js.
const defaultConfig = {
  chrome: {
    // Явный путь к браузеру.
    // Обычно не нужен: Selenium Manager сам находит Chrome.
    // Полезно, если на macOS или Windows Chrome установлен нестандартно.
    binaryPath: process.env.CHROME_BINARY || '',

    // true: запуск без видимого окна браузера.
    // false: удобно для локальной отладки, когда нужно видеть действия Selenium.
    headless: true,

    // Размер окна браузера, в котором работает парсер.
    // Некоторые элементы на Kaspi зависят от адаптивной верстки,
    // поэтому лучше держать фиксированный desktop-size.
    screen: {
      width: 1920,
      height: 1080,
    },

    // Все временные профили Chrome складываются сюда.
    // Это помогает не засорять системный temp, особенно на Windows.
    tempRoot: '.runtime/chrome',

    // Если true, временный профиль удаляется после завершения парсера.
    // Если false, можно сохранить профиль для разборов и диагностики.
    cleanupTempDir: true,

    // Набор аргументов для более стабильного и "лёгкого" запуска Chrome.
    // Здесь собраны флаги, которые уменьшают визуальный шум, кэш и лишние процессы.
    args: [
      '--no-sandbox',
      '--disable-extensions',
      '--disable-infobars',
      '--disable-plugins-discovery',
      '--disable-popup-blocking',
      '--disable-save-password-bubble',
      '--disable-translate',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--aggressive-cache-discard',
      '--media-cache-size=0',
      '--disk-cache-size=0',
    ],

    // Отключаем загрузку тяжёлых ресурсов, чтобы парсер работал быстрее.
    // При необходимости можно убрать это ограничение.
    prefs: {
      'profile.managed_default_content_settings.images': 2,
      'profile.managed_default_content_settings.stylesheets': 2,
    },
  },
  kaspi: {
    // Город, для которого открывается витрина Kaspi.
    // Сейчас используется Алматы / cityId 750000000.
    cityId: '750000000',

    // Тестовая карточка, через которую мы проверяем, что Kaspi открылся корректно
    // и можно выбрать нужный город перед основным проходом по товарам.
    probeProductUrl: 'https://kaspi.kz/shop/p/bestway-58486-100738217/?c=750000000&at=1',

    // Список "наших" продавцов.
    // Если в выдаче первым идёт кто-то из этого списка, парсер не пытается
    // реагировать как на чужого конкурента.
    ownSellers: ['Intexmania-kz', 'Aquaintex-asia-kz', 'BESTWAY ASIA'],
  },
  pricing: {
    undercut: {
      // Режим отступа от конкурента.
      // Общая идея такая:
      // парсер находит оффер конкурента и затем считает,
      // на сколько тенге нужно поставить нашу цену ниже.
      //
      // dynamic:
      // отступ зависит от цены товара и считается по формуле.
      //
      // fixed:
      // всегда используется одна и та же сумма.
      //
      // random-range:
      // сумма каждый раз выбирается случайно в указанном диапазоне.
      mode: 'fixed',

      dynamic: {
        // Настройки только для режима dynamic.
        // Для дешёвых товаров используется min, для дорогих max,
        // между ними шаг считается линейно.
        min: 11,
        max: 150,
        fromPrice: 10000,
        toPrice: 1000000,
      },

      fixed: {
        // Настройки только для режима fixed.
        // amount = фиксированная сумма отступа от конкурента.
        amount: 50,
      },

      randomRange: {
        // Настройки только для режима random-range.
        // На каждом расчёте берётся случайное число от min до max включительно.
        min: 30,
        max: 70,
      },
    },
  },
  api: {
    // Источник списка товаров, которые нужно обработать.
    productListUrl: 'https://bestway-asia.kz/integration/parser_connect.php',

    // API, в которое отправляется новая цена после расчёта.
    setPriceUrl: 'https://bestway-asia.kz/integration/api/set_new_kaspi_price.php',
  },
  notifications: {
    // Telegram можно не заполнять: тогда уведомления просто не будут отправляться.
    telegramToken: '',
    telegramChatId: '',

    // Ограничения для Telegram, чтобы сообщения не превращались в длинную простыню.
    telegram: {
      // Сколько строк с товарами максимум показывать в одном уведомлении.
      maxDetailLines: 12,

      // Список Telegram-упоминаний для аварийных уведомлений.
      // Используется, когда парсер упал или Kaspi не дал нормально стартовать.
      // Примеры: ['@admin1', '@admin2']
      adminMentions: [],
    },
  },
  statistics: {
    // Базовая папка статистики.
    // Внутри неё будет лежать один файл SQLite `statistics.sqlite`.
    // Старые JSON-документы из `runs/` используются только для разовой миграции истории.
    storageDir: 'data/statistics',
    ui: {
      // Порт маленького веб-интерфейса для просмотра прогонов.
      port: 3080,
    },
  },
  accounts: {
    forYou: {
      // Логин/пароль для сценария parser-for-you.
      user: '',
      pass: '',
    },
    sellerCabinet: {
      // Логин/пароль для сценария parser-width-saller-cabinet.
      user: '',
      pass: '',
    },
  },
  parsers: {
    forYou: {
      // Отдельная настройка headless именно для parser-for-you.
      headless: true,

      // Если false, парсер только считает цены, но не отправляет их в API.
      updateRemotePrice: true,
    },
    sellerCabinet: {
      // Отдельная настройка headless именно для parser-width-saller-cabinet.
      headless: true,

      // Если false, сценарий не будет отправлять цену во внешнее API.
      updateRemotePrice: true,

      // Если false, сценарий не будет заходить в личный кабинет и менять цену там.
      updateCabinetPrice: true,

      // Если список пустой, обрабатываются все товары.
      // Если список заполнен, будут обработаны только указанные SKU.
      skuFilter: [],
    },
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBooleanEnv(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function mergeDeep(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) {
    return extra === undefined ? base : extra;
  }

  if (!isPlainObject(base) || !isPlainObject(extra)) {
    return extra === undefined ? base : extra;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    result[key] = key in base ? mergeDeep(base[key], value) : value;
  }

  return result;
}

function loadConfig() {
  const rootDir = path.resolve(__dirname, '..');
  const localConfigPath = path.join(rootDir, 'parser.config.local.js');
  const exampleConfigPath = path.join(rootDir, 'parser.config.example.js');

  let fileConfig = {};

  if (fs.existsSync(localConfigPath)) {
    // Основной рабочий конфиг конкретной машины.
    fileConfig = require(localConfigPath);
  } else if (fs.existsSync(exampleConfigPath)) {
    // Фолбэк для первого запуска или новой машины.
    fileConfig = require(exampleConfigPath);
  }

  const mergedConfig = mergeDeep(defaultConfig, fileConfig);
  const forYouHeadless = parseBooleanEnv(process.env.PARSER_FOR_YOU_HEADLESS);
  const sellerCabinetHeadless = parseBooleanEnv(process.env.PARSER_SELLER_CABINET_HEADLESS);

  if (forYouHeadless !== undefined) {
    mergedConfig.parsers.forYou.headless = forYouHeadless;
  }

  if (sellerCabinetHeadless !== undefined) {
    mergedConfig.parsers.sellerCabinet.headless = sellerCabinetHeadless;
  }

  return mergedConfig;
}

module.exports = {
  loadConfig,
};
