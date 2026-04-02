function setHeadlessOverride(parserName, isHeadless) {
  if (parserName === 'for-you') {
    process.env.PARSER_FOR_YOU_HEADLESS = String(isHeadless);
    return;
  }

  if (parserName === 'seller-cabinet') {
    process.env.PARSER_SELLER_CABINET_HEADLESS = String(isHeadless);
  }
}

function resolveEntryFile(parserName) {
  if (parserName === 'for-you') {
    return '../parser-for-you.js';
  }

  if (parserName === 'seller-cabinet') {
    return '../parser-width-saller-cabinet.js';
  }

  throw new Error(
    `Неизвестный парсер: ${parserName}. Используй "for-you" или "seller-cabinet".`
  );
}

function main() {
  const parserName = process.argv[2];
  const isHeaded = process.argv.includes('--headed');

  if (!parserName) {
    throw new Error('Не указан парсер для запуска.');
  }

  // Управляем режимом окна через env, чтобы не дублировать код в самих парсерах.
  setHeadlessOverride(parserName, !isHeaded);

  const entryFile = resolveEntryFile(parserName);
  require(entryFile);
}

main();
