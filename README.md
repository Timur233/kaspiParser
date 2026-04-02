# kaspiParser

В проекте в порядок приведены два основных сценария:

- `parser-for-you`
- `parser-width-saller-cabinet`

Старые legacy-скрипты удалены, чтобы в проекте не оставалось дублирующей и устаревшей логики.

## Запуск

```bash
npm run doctor
npm run parser:for-you
npm run parser:seller-cabinet
```

Запуск с видимым окном браузера:

```bash
npm run parser:for-you:headed
npm run parser:seller-cabinet:headed
```

Интерфейс статистики:

```bash
npm run stats:ui
```

После этого открой [http://localhost:3080](http://localhost:3080)

На Windows можно запускать и через:

- `parser.bat`
- `parser_cabinet.bat`
- `parser_seller_cabinet.bat`

На macOS достаточно запускать те же `npm`-скрипты из Terminal.

## Где менять настройки

Основные настройки лежат в `parser.config.local.js`:

- `pricing.undercut.mode` - режим отступа от конкурента
- `pricing.undercut.fixed.amount` - фиксированная сумма отступа
- `statistics.storageDir` - где лежит база `statistics.sqlite` и служебные данные статистики
- `statistics.ui.port` - порт локального интерфейса статистики
- учётки Kaspi
- Telegram-уведомления
- `parsers.forYou`
- `parsers.sellerCabinet.skuFilter`
- общие продавцы в `kaspi.ownSellers`
- при необходимости путь к Chrome в `chrome.binaryPath`

Если нужен шаблон для нового окружения, есть `parser.config.example.js`.

Примеры настройки отступа от конкурента:

```js
pricing: {
  undercut: {
    mode: 'fixed',
    fixed: {
      amount: 50,
    },
  },
}
```

```js
pricing: {
  undercut: {
    mode: 'dynamic',
  },
}
```

## macOS

Для Mac проект теперь подготовлен:

- `chromedriver` вручную обновлять не нужно, Selenium Manager подберёт его сам
- временные файлы Chrome живут в `.runtime/chrome`
- кэш Selenium Manager живёт в `.runtime/selenium`
- перед запуском можно проверить окружение через `npm run doctor`

Что нужно для запуска:

```bash
node -v
google-chrome --version
```

Если `google-chrome` не находится, но Chrome установлен, можно явно указать бинарник:

```bash
export CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run parser:for-you
```

Либо записать тот же путь в `parser.config.local.js`:

```js
module.exports = {
  chrome: {
    binaryPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  },
};
```

## Windows

Для Windows логика та же:

- запускай `npm run doctor` перед первым стартом
- затем `npm run parser:for-you` или `npm run parser:seller-cabinet`
- если Chrome стоит в нестандартном месте, укажи `chrome.binaryPath` в `parser.config.local.js`

## Временные файлы

Chrome теперь запускается с профилем внутри `.runtime/chrome`, а после завершения сессии эта папка удаляется автоматически. Это уменьшает мусор в системных temp-директориях, особенно на Windows.

Начиная с обновления `selenium-webdriver`, драйвер Chrome больше не нужно обновлять вручную. Selenium Manager сам подбирает подходящий драйвер и хранит кэш в `.runtime/selenium`.

## Статистика

Статистика прогонов отделена от логики парсинга:

- `src/storage/` отвечает за сохранение прогонов в SQLite
- `src/ui/` отвечает за локальный просмотр статистики
- парсеры только отдают события в трекер прогона

Каждый завершённый прогон сохраняется в один файл базы `data/statistics/statistics.sqlite`.
Если в `data/statistics/runs/` остались старые JSON-прогоны, они будут автоматически импортированы в SQLite при первом обращении к статистике.
