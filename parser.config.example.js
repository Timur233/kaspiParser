module.exports = {
  chrome: {
    // Укажи путь к Chrome только если Selenium не находит его автоматически.
    // macOS пример:
    // '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    // Windows пример:
    // 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    binaryPath: '',
  },
  notifications: {
    // Если оставить пустым, уведомления в Telegram отправляться не будут.
    telegramToken: '',
    telegramChatId: '',

    telegram: {
      // Ограничивает размер Telegram-уведомлений.
      // Если товаров больше, чем maxDetailLines, в сообщение попадут только первые строки,
      // а внизу появится "И ещё N позиций".
      maxDetailLines: 12,
    },
  },
  pricing: {
    undercut: {
      // Как работает логика отступа от конкурента:
      //
      // Парсер находит цену подходящего конкурента и затем решает,
      // на сколько тенге поставить нашу цену ниже.
      //
      // Доступные режимы:
      //
      // 'dynamic'
      // Отступ считается автоматически по формуле.
      // Чем дороже товар, тем больше может быть отступ.
      // Это режим, который ближе всего к старой логике проекта.
      //
      // 'fixed'
      // Всегда используется одна и та же сумма отступа.
      // Самый удобный вариант, если хочешь жёстко контролировать поведение.
      //
      // 'random-range'
      // Отступ каждый раз выбирается случайно из диапазона min..max.
      // Подходит, если нужен плавающий шаг вместо фиксированного.
      mode: 'fixed',

      dynamic: {
        // Настройки только для режима 'dynamic'.
        min: 11,
        max: 150,
        fromPrice: 10000,
        toPrice: 1000000,
      },

      fixed: {
        // Настройки только для режима 'fixed'.
        // Пример:
        // amount = 50 -> всегда ставим цену на 50 тг ниже конкурента.
        amount: 50,
      },

      randomRange: {
        // Настройки только для режима 'random-range'.
        // Пример:
        // min = 30, max = 70 -> отступ будет случайным числом от 30 до 70.
        min: 30,
        max: 70,
      },
    },
  },
  accounts: {
    forYou: {
      // Аккаунт для сценария parser-for-you.
      user: 'your-login@example.com',
      pass: 'your-password',
    },
    sellerCabinet: {
      // Аккаунт для сценария parser-width-saller-cabinet.
      user: 'your-login@example.com',
      pass: 'your-password',
    },
  },
  parsers: {
    forYou: {
      // false удобно ставить во время отладки.
      headless: true,

      // false: считать цены, но не отправлять их во внешнее API.
      updateRemotePrice: true,
    },
    sellerCabinet: {
      headless: true,
      updateRemotePrice: true,

      // false: не менять цены в кабинете продавца.
      updateCabinetPrice: true,

      // Пример фильтра по SKU.
      // Оставь пустой массив [], если хочешь обрабатывать все товары.
      skuFilter: ['#56709', '#56709_1'],
    },
  },
};
