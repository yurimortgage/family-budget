/**
 * Семейный бюджет — Telegram-бот на Google Таблице.
 *
 * Как устроено:
 *  • каждый доход: сначала налог (%), потом постоянные фонды
 *    (квартира, машина, еда — пока за месяц не наберётся их сумма),
 *    остаток делится по процентным фондам;
 *  • каждый расход списывается с конкретного фонда;
 *  • деньги во всех фондах копятся; перекладываете вы сами командой «перевод»;
 *  • всё пишется в лист «Журнал», остатки видны в листе «Баланс»,
 *    проценты и суммы меняются в листе «Настройки».
 */

// ===================== ЗАПОЛНИТЕ ЭТИ СТРОКИ =====================
const BOT_TOKEN   = 'ВСТАВЬТЕ_СЮДА_ТОКЕН_ОТ_BOTFATHER';
const WEBAPP_URL  = 'ВСТАВЬТЕ_СЮДА_АДРЕС_ВЕБ_ПРИЛОЖЕНИЯ';
const FAMILY_CODE = 'семья2026';          // кодовое слово для входа в бота
// =================================================================

// Доход с этими словами — налог уже удержан (зарплата W-2), 10% не снимаем
const NO_TAX_WORDS = ['зп', 'зарплата', 'зарплату', 'аванс', 'salary', 'paycheck', 'без налога', 'возврат'];

const TZ  = 'America/New_York';            // часовой пояс Флориды
const CUR = '$';

const SHEET_LOG = 'Журнал';
const SHEET_CFG = 'Настройки';
const SHEET_BAL = 'Баланс';
const SHEET_CHART = 'График';              // скрытый лист для диаграммы

// Дизайн приложения берётся из этой папки Google Drive (самый свежий файл app.html)
const APP_FOLDER_ID = '1tFMo6koC-5Ixl5vwRkSTTfCxajqvcIjk';
const APP_FILE_NAME = 'app.html';
// Приложение на GitHub Pages: открывается в Telegram на весь экран, данные берёт отсюда
const SHELL_URL = 'https://yurimortgage.github.io/family-budget/';
const LOG_HEADER = ['Дата', 'Кто', 'Тип', 'Фонд', 'Сумма', 'Комментарий', 'Операция'];

// Пример настроек для новой таблицы (настоящие фонды и суммы — в листе «Настройки» вашей таблицы)
const DEFAULT_CFG = [
  ['Фонд', 'Вид', 'Значение', 'Другие слова (через запятую)', 'Иконка'],
  ['Налоги',          'налог %',        10,   'налог, tax',                                    '🏛'],
  ['Жильё',           'фонд $ в месяц', 2000, 'квартира, аренда, rent',                        '🏠'],
  ['Машина',          'фонд $ в месяц', 400,  'авто, кредит, машину',                          '🚗'],
  ['Еда (магазины)',  'фонд $ в месяц', 800,  'еда, еду, продукты, магазин, магазины',         '🛒'],
  ['Содержание дома', 'фонд $ в месяц', 300,  'дом, свет, вода, интернет, телефон, ремонт',    '🔧'],
  ['Обучение',        'фонд %',         20,   'курсы',                                         '📘'],
  ['Дети',            'фонд %',         15,   'детям, ребенок',                                '🧸'],
  ['Резерв',          'фонд %',         20,   '',                                              '🛟'],
  ['Развлечения',     'фонд %',         10,   'развлечение, отдых, кино, кафе',                '🎉'],
  ['Одежда',          'фонд %',         10,   'обувь',                                         '👕'],
  ['Непредвиденные',  'фонд %',         10,   'непредвиденное, форс-мажор',                    '⚡'],
  ['Подарки',         'фонд %',         5,    'подарок',                                       '🎁'],
  ['Личное 1',        'фонд %',         5,    'личное, лично, себе',                           '👤'],
  ['Личное 2',        'фонд %',         5,    'личное, лично, себе',                           '👤'],
];

// Иконки по названию фонда — если в «Настройках» нет колонки «Иконка»
const ICONS = [['налог', '🏛'], ['квартир', '🏠'], ['аренд', '🏠'], ['машин', '🚗'], ['авто', '🚗'], ['еда', '🛒'],
  ['содержание', '🔧'], ['обучение детей', '🎓'], ['обучение', '📘'], ['дети', '🧸'], ['резерв', '🛟'],
  ['развлеч', '🎉'], ['одежд', '👕'], ['непредв', '⚡'], ['подар', '🎁'], ['личное', '👤']];

// Цвета диаграммы — у каждого фонда свой
const COLORS = ['#7F8C8D', '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1',
  '#FF9DA7', '#9C755F', '#2F4B7C', '#A05195', '#00A6A6', '#F95D6A', '#665191', '#D45087'];

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
                'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const BTN = {
  EXP: '➖ Расход', INC: '➕ Доход',
  BAL: '💰 Баланс', MON: '📅 Месяц',
  UNDO: '↩️ Отменить', HELP: '❓ Помощь',
};

const MENU = {
  keyboard: [
    [{ text: BTN.EXP }, { text: BTN.INC }],
    [{ text: BTN.BAL }, { text: BTN.MON }],
    [{ text: BTN.UNDO }, { text: BTN.HELP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const LINE = '━━━━━━━━━━━━━━━━';

const HELP =
  '<b>📖 Как пользоваться</b>\n\n' +
  '📱 <b>Приложение</b> — кнопка внизу: баланс, фонды, история, отчёт.\n\n' +
  '<b>Кнопками:</b>\n' +
  '➖ Расход → выберите фонд → напишите сумму\n' +
  '➕ Доход → зарплата или комиссия → напишите сумму\n\n' +
  '<b>Или одной строкой:</b>\n' +
  '<code>+6500 комиссия</code> — доход, минус 10% налог\n' +
  '<code>+2500 зп</code> — зарплата, налог уже удержан\n' +
  '<code>45 publix</code> — расход из «Еды»\n' +
  '<code>25 личное кофе</code> — из вашего личного фонда\n' +
  '<code>перевод 200 еда резерв</code> — между фондами\n' +
  '<code>перевод все еда резерв</code> — весь остаток\n\n' +
  '💰 Баланс — остатки во всех фондах\n' +
  '📅 Месяц — отчёт и диаграмма расходов\n' +
  '↩️ Отменить — убрать вашу последнюю запись\n\n' +
  '<i>Проценты и суммы — в Google Таблице, лист «Настройки».</i>';

// ---------------------------------------------------------------
// Разовые функции: запускаются вручную из редактора скриптов
// ---------------------------------------------------------------

/** 1) Создаёт листы «Настройки», «Журнал», «Баланс». Повторный запуск ничего не стирает. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  if (!ss.getSheetByName(SHEET_CFG)) {
    const cfg = ss.insertSheet(SHEET_CFG);
    cfg.getRange(1, 1, DEFAULT_CFG.length, DEFAULT_CFG[0].length).setValues(DEFAULT_CFG);
    cfg.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEET_LOG)) {
    const log = ss.insertSheet(SHEET_LOG);
    log.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]);
    log.setFrozenRows(1);
  }
  buildBalanceSheet_();
}

/** 2) Подключает бота к этому скрипту (после «Развернуть → Веб-приложение»). */
function setWebhook() {
  const r1 = tg_('setWebhook', {
    url: WEBAPP_URL + '?hook=' + hookKey_(),
    drop_pending_updates: true,
    allowed_updates: ['message', 'callback_query'],
  });
  tg_('setMyCommands', {
    commands: [
      { command: 'expense', description: '➖ Записать расход' },
      { command: 'income', description: '➕ Записать доход' },
      { command: 'balance', description: '💰 Остатки по фондам' },
      { command: 'month', description: '📅 Отчёт и диаграмма за месяц' },
      { command: 'undo', description: '↩️ Отменить мою последнюю запись' },
      { command: 'help', description: '❓ Как пользоваться' },
    ],
  });
  const props = PropertiesService.getScriptProperties();
  const allowed = JSON.parse(props.getProperty('ALLOWED') || '{}');
  Object.keys(allowed).forEach(function (id) { setAppButton_(id); });
  Logger.log(r1 && r1.getContentText ? r1.getContentText() : r1);

  const me = JSON.parse(tg_('getMe', {}).getContentText());
  const uname = me && me.result && me.result.username;
  if (uname) props.setProperty('BOT_USERNAME', uname);
  CacheService.getScriptCache().remove('appHtml');
  Logger.log('Дизайн приложения: ' + appTemplate_().src);
  Logger.log('Адрес для BotFather → Configure Mini App:  ' + (SHELL_URL || WEBAPP_URL + '?app=1'));
  if (uname) Logger.log('Ссылка «на весь экран»:  https://t.me/' + uname + '?startapp&mode=fullscreen');
}

/** Проверка: что Telegram думает о подключении. */
function checkWebhook() {
  Logger.log(tg_('getWebhookInfo', {}).getContentText());
}

// ---------------------------------------------------------------
// Точки входа
// ---------------------------------------------------------------

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.app) {
    let auth = null;
    try { appUser_({ u: p.u, k: p.k }); auth = { u: String(p.u), k: String(p.k) }; } catch (err) { /* нет доступа */ }
    const t = appTemplate_().tpl;
    t.authJson = JSON.stringify(auth);
    return t.evaluate()
      .setTitle('Семейный бюджет')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // можно показывать внутри обёртки
  }
  return HtmlService.createHtmlOutput('Бот семейного бюджета работает.');
}

function doPost(e) {
  let body = null;
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* не JSON */ }
  if (body && body.api) return apiResponse_(body);          // запрос от приложения на GitHub
  try {
    // сообщения от Telegram принимаем только с секретным ключом в адресе (его знает только Telegram)
    if (!body || ((e && e.parameter) || {}).hook !== hookKey_()) return HtmlService.createHtmlOutput('ok');
    const upd = body;
    const cache = CacheService.getScriptCache();
    const key = 'upd' + upd.update_id;
    if (!cache.get(key)) {          // Telegram иногда повторяет одно сообщение
      cache.put(key, '1', 21600);
      handleUpdate_(upd);
    }
  } catch (err) {
    console.error(err && err.stack || err);
  }
  // HtmlService отвечает кодом 200 без перенаправления — Telegram доволен
  return HtmlService.createHtmlOutput('ok');
}

/** Если поменяли «Настройки» — пересобрать лист «Баланс». */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET_CFG) buildBalanceSheet_();
}

// ---------------------------------------------------------------
// Обработка сообщений
// ---------------------------------------------------------------

/** Текст без эмодзи в начале: «💰 Баланс» → «баланс». */
function key_(text) {
  return norm_(text).replace(/^[^0-9a-zа-я\/+\-−–—$.,]+/, '');
}

function handleUpdate_(u) {
  if (u.callback_query) return handleCallback_(u.callback_query);
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const user = msg.from;
  const text = msg.text.trim();
  const key = key_(text);
  const first = key.split(' ')[0].replace(/@.*$/, '');

  if (first === '/join') return join_(chatId, user, text.split(/\s+/).slice(1).join(' '));
  if (!isAllowed_(user.id)) {
    return send_(chatId, 'Это семейный бот. Чтобы войти, отправьте:\n<code>/join КОДОВОЕ_СЛОВО</code>');
  }
  try {
    route_(chatId, user, text, key, first);
  } catch (err) {
    console.error(err && err.stack || err);
    send_(chatId, '⚠️ Ошибка: ' + esc_(err && err.message || err));
  }
}

function route_(chatId, user, text, key, first) {
  const cache = CacheService.getScriptCache();
  const awaitKey = 'await' + user.id;
  const is = function (list) { return list.indexOf(first) >= 0; };

  let cmd = null;
  if (is(['/start', '/help', 'помощь', 'help'])) cmd = function () { setAppButton_(user.id); send_(chatId, HELP, menu_(user)); sendOpenLink_(chatId); };
  else if (is(['/balance', 'баланс', 'остаток', 'остатки'])) cmd = function () { send_(chatId, balanceText_()); };
  else if (is(['/month', 'месяц', 'отчет'])) cmd = function () { monthReport_(chatId); };
  else if (is(['/undo', 'отменить', 'отмена'])) cmd = function () { undo_(chatId, user); };
  else if (first === '/expense' || key === 'расход') cmd = function () { pickFund_(chatId); };
  else if (first === '/income' || key === 'доход') cmd = function () { pickIncome_(chatId); };
  else if (first === 'перевод' || first === 'перенос') cmd = function () { transfer_(chatId, user, text); };
  if (cmd) { cache.remove(awaitKey); return cmd(); }

  const p = parseAmount_(text);

  // ждём сумму после нажатия кнопки «Расход» / «Доход»
  const st = cache.get(awaitKey);
  if (st) {
    const s = JSON.parse(st);
    if (!p) return send_(chatId, 'Напишите сумму числом, например <code>45</code> или <code>45 publix</code>.');
    cache.remove(awaitKey);
    if (s.k === 'exp') return recordExpense_(chatId, user, p.amount, s.name, p.rest);
    return income_(chatId, user, p.amount, (s.tag + ' ' + p.rest).trim());
  }

  if (p) {
    if (p.sign === '+') return income_(chatId, user, p.amount, p.rest);
    return expense_(chatId, user, p.amount, p.rest);
  }
  send_(chatId, 'Не понял 🙂 Нажмите <b>➖ Расход</b> или <b>➕ Доход</b>, или напишите, например:\n' +
    '<code>+6500 комиссия</code>\n<code>45 publix</code>', menu_(user));
}

function join_(chatId, user, code) {
  if (norm_(code) !== norm_(FAMILY_CODE)) return send_(chatId, 'Кодовое слово не подошло.');
  const props = PropertiesService.getScriptProperties();
  const allowed = JSON.parse(props.getProperty('ALLOWED') || '{}');
  allowed[String(user.id)] = whoName_(user);
  props.setProperty('ALLOWED', JSON.stringify(allowed));
  setAppButton_(user.id);
  send_(chatId, '👋 <b>Добро пожаловать, ' + esc_(whoName_(user)) + '!</b>\n\n' + HELP, menu_(user));
}

function isAllowed_(id) {
  const allowed = JSON.parse(PropertiesService.getScriptProperties().getProperty('ALLOWED') || '{}');
  return Object.prototype.hasOwnProperty.call(allowed, String(id));
}

// ---------------------------------------------------------------
// Кнопки: выбор фонда и типа дохода
// ---------------------------------------------------------------

function fundButtons_(env, prefix) {
  const buttons = env.map(function (e, i) { return { text: e.icon + ' ' + e.name + ' (' + size_(e) + ')', callback_data: prefix + '|' + i }; });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: '✖ Отмена', callback_data: prefix + '|x' }]);
  return { inline_keyboard: rows };
}

function pickFund_(chatId) {
  send_(chatId, '➖ <b>Расход</b> — из какого фонда?', fundButtons_(readConfig_(), 'x'));
}

function pickIncome_(chatId) {
  send_(chatId, '➕ <b>Доход</b> — какой?', {
    inline_keyboard: [
      [{ text: '💼 Зарплата (налог уже удержан)', callback_data: 'i|zp' }],
      [{ text: '💵 Комиссия / другое (−10% налог)', callback_data: 'i|com' }],
      [{ text: '✖ Отмена', callback_data: 'i|x' }],
    ],
  });
}

function handleCallback_(q) {
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  if (!isAllowed_(q.from.id)) return tg_('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа' });
  tg_('answerCallbackQuery', { callback_query_id: q.id });

  const data = String(q.data || '');
  const kind = data.split('|')[0];
  const arg = data.slice(kind.length + 1);
  const cache = CacheService.getScriptCache();
  const edit = function (text) { tg_('editMessageText', { chat_id: chatId, message_id: msgId, text: text }); };

  if (kind === 'u') {                                   // ↩️ под сообщением
    tg_('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
    return undo_(chatId, q.from, arg);
  }

  if (kind === 'x') {                                   // кнопка «Расход» → фонд выбран
    if (arg === 'x') return edit('Отменено.');
    const e = readConfig_()[Number(arg)];
    if (!e) return;
    cache.put('await' + q.from.id, JSON.stringify({ k: 'exp', name: e.name }), 600);
    edit('➖ Расход · ' + e.icon + ' ' + e.name);
    return send_(chatId, '<b>' + label_(e) + '</b>\nСколько потратили? Например: <code>45</code> или <code>45 publix</code>');
  }

  if (kind === 'i') {                                   // кнопка «Доход» → тип выбран
    if (arg === 'x') return edit('Отменено.');
    const zp = arg === 'zp';
    cache.put('await' + q.from.id, JSON.stringify({ k: 'inc', tag: zp ? 'зп' : 'комиссия' }), 600);
    edit(zp ? '➕ Доход · 💼 Зарплата' : '➕ Доход · 💵 Комиссия');
    return send_(chatId, (zp ? '💼 <b>Зарплата</b>' : '💵 <b>Комиссия</b>') +
      '\nКакая сумма пришла? Например: <code>' + (zp ? '2500' : '6500 сделка Smith') + '</code>');
  }

  // kind === 'e': расход с незнакомым словом → фонд выбран
  const raw = cache.get('pend' + q.from.id);
  if (arg === 'x' || !raw) {
    cache.remove('pend' + q.from.id);
    return edit(arg === 'x' ? 'Отменено.' : 'Запрос устарел — введите расход ещё раз.');
  }
  const e = readConfig_()[Number(arg)];
  if (!e) return;
  const p = JSON.parse(raw);
  cache.remove('pend' + q.from.id);
  edit('Расход ' + fmt_(p.amount) + ' → ' + e.icon + ' ' + e.name);
  recordExpense_(chatId, q.from, p.amount, e.name, p.comment);
}

// ---------------------------------------------------------------
// Доход
// ---------------------------------------------------------------

function income_(chatId, user, amount, comment) {
  const env = readConfig_();
  const now = new Date();
  const month = monthKey_(now);
  const noTax = isNoTax_(comment);
  const op = opId_(user);
  let parts, coveredBefore;

  withLock_(function () {
    const rows = logRows_();
    coveredBefore = coveredFixed_(rows, month);
    parts = allocate_(amount, env, coveredBefore, noTax);
    const who = whoName_(user);
    const out = [[now, who, 'доход', '—', amount, comment, op]];
    parts.forEach(function (p) { out.push([now, who, 'распределение', p.name, p.amount, comment, op]); });
    appendRows_(out);
  });

  const byName = {};
  parts.forEach(function (p) { byName[p.name] = p.amount; });

  const lines = ['✅ <b>Доход +' + fmt_(amount) + '</b>',
    (noTax ? '💼 ' : '💵 ') + (comment ? esc_(comment) + ' · ' : '') + esc_(whoName_(user)), ''];

  if (noTax) lines.push('🏛 Налог уже удержан — не снимаю');
  else env.filter(isKind_('tax')).forEach(function (e) {
    lines.push(label_(e) + ': <b>' + fmt_(byName[e.name] || 0) + '</b>');
  });

  const fixed = env.filter(isKind_('fixed'));
  const fixedNow = fixed.filter(function (e) { return byName[e.name]; });
  if (fixedNow.length) {
    lines.push('', '<b>🏠 Постоянные фонды</b>');
    fixedNow.forEach(function (e) { lines.push(label_(e) + ' <b>+' + fmt_(byName[e.name]) + '</b>'); });
  }

  const funds = env.filter(isKind_('fund')).filter(function (e) { return byName[e.name]; });
  if (funds.length) {
    const toFunds = funds.reduce(function (s, e) { return r2_(s + byName[e.name]); }, 0);
    lines.push('', '<b>🗂 По фондам +' + fmt_(toFunds) + '</b>');
    funds.forEach(function (e) {
      lines.push(label_(e) + ' <b>+' + fmt_(byName[e.name]) + '</b>');
    });
  }

  const target = fixed.reduce(function (s, e) { return s + e.value; }, 0);
  if (target > 0) {
    const coveredNow = fixed.reduce(function (s, e) {
      return s + Math.min(e.value, (coveredBefore[e.name] || 0) + (byName[e.name] || 0));
    }, 0);
    lines.push('', '<code>' + bar_(coveredNow / target) + '</code> постоянные за ' + MONTHS[Number(month.slice(5)) - 1].toLowerCase(),
      fmt_(coveredNow) + ' из ' + fmt_(target) + (coveredNow >= target ? ' ✔' : ''));
  }

  const pct = env.filter(isKind_('fund')).reduce(function (s, e) { return s + e.value; }, 0);
  if (pct && Math.abs(pct - 100) > 0.001) {
    lines.push('', '⚠️ Проценты фондов в «Настройках» дают ' + pct + '%, а не 100%. Разделил пропорционально.');
  }
  send_(chatId, lines.join('\n'), undoButton_(op));
}

/**
 * Делит доход: налог % → обязательные (до месячной суммы) → фонды %.
 * covered — сколько уже отложено на каждую обязательную статью в этом месяце.
 */
function allocate_(gross, env, covered, noTax) {
  const out = [];
  let left = r2_(gross);

  if (!noTax) env.filter(isKind_('tax')).forEach(function (e) {
    const a = Math.min(left, r2_(gross * e.value / 100));
    if (a > 0) { out.push({ name: e.name, amount: a }); left = r2_(left - a); }
  });

  env.filter(isKind_('fixed')).forEach(function (e) {
    const need = Math.max(0, r2_(e.value - (covered[e.name] || 0)));
    const a = Math.min(need, left);
    if (a > 0) { out.push({ name: e.name, amount: a }); left = r2_(left - a); }
  });

  if (left > 0) splitFunds_(left, env).forEach(function (p) { out.push(p); });
  return out;
}

/** Делит сумму между фондами пропорционально их процентам. */
function splitFunds_(amount, env) {
  const out = [];
  const funds = env.filter(isKind_('fund')).filter(function (e) { return e.value > 0; });
  const total = funds.reduce(function (s, e) { return s + e.value; }, 0);
  if (!amount || !total) return out;
  let given = 0;
  funds.forEach(function (e, i) {
    const a = i === funds.length - 1 ? r2_(amount - given) : r2_(amount * e.value / total);
    given = r2_(given + a);
    if (a !== 0) out.push({ name: e.name, amount: a });
  });
  return out;
}

function isNoTax_(comment) {
  const c = ' ' + norm_(comment) + ' ';
  return NO_TAX_WORDS.some(function (w) { return c.indexOf(' ' + w + ' ') >= 0; });
}

function coveredFixed_(rows, month) {
  const covered = {};
  rows.forEach(function (r) {
    if (r.type === 'распределение' && monthKey_(r.date) === month) {
      covered[r.env] = r2_((covered[r.env] || 0) + r.amount);
    }
  });
  return covered;
}

// ---------------------------------------------------------------
// Расход и перевод
// ---------------------------------------------------------------

function expense_(chatId, user, amount, rest) {
  const env = readConfig_();
  const m = matchEnvelope_(rest, env, user);
  if (m) return recordExpense_(chatId, user, amount, m.env.name, m.remainder);

  CacheService.getScriptCache().put('pend' + user.id, JSON.stringify({ amount: amount, comment: rest }), 900);
  send_(chatId, '➖ <b>' + fmt_(amount) + '</b>' + (rest ? ' · ' + esc_(rest) : '') + '\nИз какого фонда?',
    fundButtons_(env, 'e'));
}

function recordExpense_(chatId, user, amount, envName, comment) {
  const env = readConfig_();
  const e = findEnv_(env, envName);
  const op = opId_(user);
  let bal;
  withLock_(function () {
    appendRows_([[new Date(), whoName_(user), 'расход', envName, -amount, comment, op]]);
    bal = balances_(logRows_())[envName] || 0;
  });
  const lines = ['➖ <b>' + fmt_(amount) + '</b> · ' + (e ? label_(e) : esc_(envName)),
    (comment ? esc_(comment) + ' · ' : '') + esc_(whoName_(user)), ''];
  if (bal < 0) {
    lines.push('⚠️ Фонд в минусе: <b>' + fmt_(bal) + '</b>');
  } else {
    lines.push('Осталось: <b>' + fmt_(bal) + '</b>');
    if (e && e.kind === 'fixed' && e.value > 0) {
      lines.push('<code>' + bar_(bal / e.value) + '</code> ' + pct_(bal / e.value) + ' от месячной суммы');
    }
  }
  send_(chatId, lines.join('\n'), undoButton_(op));
}

function transfer_(chatId, user, text) {
  const usage = 'Формат: <code>перевод 200 еда резерв</code>\n(сумма, откуда, куда)\nВесь остаток: <code>перевод все еда резерв</code>';
  const m = text.match(/^\S+\s+(?:\$?\s*(\d+(?:[.,]\d{1,2})?)|(вс[её]))\s+([\s\S]+)$/i);
  if (!m) return send_(chatId, usage);
  const rest = m[3].split(/\s+/).filter(function (w) {
    return ['из', 'в', 'во', 'на', '>', '->', '→', '—', '-'].indexOf(norm_(w)) < 0;
  }).join(' ');
  const env = readConfig_();
  const a = matchEnvelope_(rest, env, user);
  const b = a && matchEnvelope_(a.remainder, env, user);
  if (!a || !b) return send_(chatId, 'Не нашёл фонды. ' + usage);
  if (a.env.name === b.env.name) return send_(chatId, 'Откуда и куда — один и тот же фонд.');

  const amount = m[1] ? Number(m[1].replace(',', '.')) : r2_(balances_(logRows_())[a.env.name] || 0);
  transferDo_(chatId, user, amount, a.env, b.env, b.remainder);
}

/** Перевод между фондами: запись в журнал + сообщение в чат. */
function transferDo_(chatId, user, amount, from, to, note) {
  if (!(amount > 0)) return send_(chatId, 'В фонде «' + esc_(from.name) + '» нечего переводить: ' + fmt_(amount) + '.');
  const now = new Date(), who = whoName_(user), op = opId_(user);
  let balA, balB;
  withLock_(function () {
    appendRows_([
      [now, who, 'перевод', from.name, -amount, 'в ' + to.name + (note ? ': ' + note : ''), op],
      [now, who, 'перевод', to.name, amount, 'из ' + from.name + (note ? ': ' + note : ''), op],
    ]);
    const bal = balances_(logRows_());
    balA = bal[from.name] || 0;
    balB = bal[to.name] || 0;
  });
  send_(chatId, '🔁 <b>Перевод ' + fmt_(amount) + '</b>\n' +
    label_(from) + ' → ' + label_(to) + '\n\n' +
    from.icon + ' ' + esc_(from.name) + ': <b>' + fmt_(balA) + '</b>\n' +
    to.icon + ' ' + esc_(to.name) + ': <b>' + fmt_(balB) + '</b>', undoButton_(op));
}

// ---------------------------------------------------------------
// Отмена, баланс, отчёт
// ---------------------------------------------------------------

/** Отменить последнюю свою запись или конкретную (кнопка ↩️ под сообщением). */
function undo_(chatId, user, wantOp) {
  let removed = null, denied = false;
  withLock_(function () {
    const rows = logRows_();
    const prefix = String(user.id) + '-';
    let op = null;
    if (wantOp) {
      if (wantOp.indexOf(prefix) !== 0) { denied = true; return; }
      op = wantOp;
    } else {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i].op).indexOf(prefix) === 0) { op = rows[i].op; break; }
      }
    }
    if (!op) return;
    const mine = rows.filter(function (r) { return r.op === op; });
    if (!mine.length) return;
    removed = mine[0];
    const sh = sheet_(SHEET_LOG);
    mine.map(function (r) { return r.rowNum; }).sort(function (x, y) { return y - x; })
      .forEach(function (n) { sh.deleteRow(n); });
  });
  if (denied) return send_(chatId, 'Отменить запись может только тот, кто её сделал.');
  if (!removed) return send_(chatId, wantOp ? 'Эта запись уже отменена.' : 'У вас нет записей для отмены.');
  const what = removed.type === 'доход' ? 'доход ' + fmt_(removed.amount)
    : removed.type === 'перевод' ? 'перевод ' + fmt_(Math.abs(removed.amount))
    : 'расход ' + fmt_(Math.abs(removed.amount)) + ' из «' + esc_(removed.env) + '»';
  send_(chatId, '↩️ <b>Отменено:</b> ' + what +
    (removed.comment && removed.type !== 'перевод' ? ' (' + esc_(removed.comment) + ')' : ''));
}

function balanceText_() {
  const env = readConfig_();
  const bal = balances_(logRows_());
  let total = 0;
  const line = function (e) {
    const b = bal[e.name] || 0;
    total = r2_(total + b);
    return (b < 0 ? '⚠️ ' : e.icon + ' ') + esc_(e.name) + ' (' + size_(e) + ') — <b>' + fmt_(b) + '</b>';
  };
  const out = ['💰 <b>Баланс фондов</b>'];

  const fixed = env.filter(isKind_('fixed'));
  if (fixed.length) {
    out.push('', '<b>🏠 Постоянные</b>');
    fixed.forEach(function (e) {
      out.push(line(e));
      const b = bal[e.name] || 0;
      if (e.value > 0) out.push('<code>' + bar_(b / e.value) + '</code> ' + pct_(b / e.value));
    });
  }
  const funds = env.filter(isKind_('fund'));
  if (funds.length) {
    out.push('', '<b>🗂 Накопительные</b>');
    funds.forEach(function (e) { out.push(line(e)); });
  }
  const tax = env.filter(isKind_('tax'));
  if (tax.length) {
    out.push('');
    tax.forEach(function (e) { out.push(line(e)); });
  }
  out.push(LINE, '<b>Всего: ' + fmt_(total) + '</b>');
  return out.join('\n');
}

/** «Месяц»: цветная диаграмма расходов + отчёт текстом. */
function monthReport_(chatId) {
  const env = readConfig_();
  const now = new Date();
  const month = monthKey_(now);
  const mIdx = Number(month.slice(5)) - 1;
  const rows = logRows_().filter(function (r) { return monthKey_(r.date) === month; });

  let income = 0, spent = 0;
  const alloc = {}, exp = {};
  rows.forEach(function (r) {
    if (r.type === 'доход') income = r2_(income + r.amount);
    if (r.type === 'распределение') alloc[r.env] = r2_((alloc[r.env] || 0) + r.amount);
    if (r.type === 'расход') { exp[r.env] = r2_((exp[r.env] || 0) - r.amount); spent = r2_(spent - r.amount); }
  });

  // расходы по фондам, от больших к меньшим
  const spentList = env.map(function (e, i) { return { e: e, v: exp[e.name] || 0, color: COLORS[i % COLORS.length] }; })
    .filter(function (x) { return x.v > 0; })
    .sort(function (a, b) { return b.v - a.v; });

  if (spentList.length) {
    try {
      const blob = chartBlob_(spentList.map(function (x) {
        return { label: x.e.name + ' — ' + fmt_(x.v), value: x.v, color: x.color };
      }), 'Расходы за ' + MONTHS[mIdx].toLowerCase() + ': ' + fmt_(spent));
      if (blob) sendPhoto_(chatId, blob, '📊 <b>Расходы за ' + MONTHS[mIdx].toLowerCase() + '</b>: ' + fmt_(spent));
    } catch (err) {
      console.error('chart: ' + (err && err.stack || err));
    }
  }

  const out = ['📅 <b>' + MONTHS[mIdx] + ' ' + month.slice(0, 4) + '</b>', ''];
  out.push('💵 Доходы: <b>' + fmt_(income) + '</b>');
  env.filter(isKind_('tax')).forEach(function (e) {
    out.push(label_(e) + ': <b>' + fmt_(alloc[e.name] || 0) + '</b>');
  });

  const fixed = env.filter(isKind_('fixed'));
  if (fixed.length) {
    const target = fixed.reduce(function (s, e) { return s + e.value; }, 0);
    const got = fixed.reduce(function (s, e) { return s + Math.min(e.value, alloc[e.name] || 0); }, 0);
    out.push('', '<b>🏠 Постоянные фонды</b> ' + fmt_(got) + ' из ' + fmt_(target) + (got >= target ? ' ✔' : ''));
    if (target > 0) out.push('<code>' + bar_(got / target) + '</code> ' + pct_(got / target));
    fixed.forEach(function (e) {
      const g = alloc[e.name] || 0;
      out.push(e.icon + ' ' + esc_(e.name) + ' ' + fmt_(g) + ' / ' + fmt_(e.value) + (g >= e.value ? ' ✔' : ''));
    });
  }

  const toFunds = env.filter(isKind_('fund')).reduce(function (s, e) { return r2_(s + (alloc[e.name] || 0)); }, 0);
  out.push('', '<b>🗂 В накопительные фонды:</b> ' + fmt_(toFunds));

  out.push('', '<b>➖ Расходы: ' + fmt_(spent) + '</b>');
  if (!spentList.length) out.push('<i>пока нет</i>');
  spentList.forEach(function (x) { out.push(label_(x.e) + ' <b>' + fmt_(x.v) + '</b>'); });
  send_(chatId, out.join('\n'));
}

/**
 * Рисует кольцевую диаграмму средствами самой Google Таблицы (на скрытом листе «График»).
 * Данные никуда за пределы Google не уходят.
 */
function chartBlob_(items, title) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_CHART);
  if (!sh) { sh = ss.insertSheet(SHEET_CHART); sh.hideSheet(); }
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();
  const data = [['Фонд', 'Сумма']].concat(items.map(function (x) { return [x.label, x.value]; }));
  sh.getRange(1, 1, data.length, 2).setValues(data);
  const chart = sh.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sh.getRange(1, 1, data.length, 2))
    .setNumHeaders(1)
    .setPosition(1, 4, 0, 0)
    .setOption('title', title)
    .setOption('titleTextStyle', { fontSize: 18, bold: true, color: '#14213D' })
    .setOption('pieHole', 0.5)
    .setOption('colors', items.map(function (x) { return x.color; }))
    .setOption('legend', { position: 'right', textStyle: { fontSize: 13, color: '#333333' } })
    .setOption('pieSliceText', 'percentage')
    .setOption('pieSliceTextStyle', { fontSize: 12, color: '#ffffff' })
    .setOption('pieSliceBorderColor', '#ffffff')
    .setOption('chartArea', { left: 20, top: 50, width: '90%', height: '82%' })
    .setOption('width', 820)
    .setOption('height', 480)
    .build();
  sh.insertChart(chart);
  return sh.getCharts()[0].getAs('image/png').setName('chart.png');
}

function balances_(rows) {
  const bal = {};
  rows.forEach(function (r) {
    if (r.type === 'доход') return;
    bal[r.env] = r2_((bal[r.env] || 0) + r.amount);
  });
  return bal;
}

// ---------------------------------------------------------------
// Таблица
// ---------------------------------------------------------------

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Нет листа «' + name + '». Запустите функцию setup в редакторе скриптов.');
  return sh;
}

function readConfig_() {
  const values = sheet_(SHEET_CFG).getDataRange().getValues().slice(1);
  const env = [];
  values.forEach(function (r) {
    const name = String(r[0] || '').trim();
    if (!name) return;
    const kindRaw = norm_(r[1]);
    const kind = kindRaw.indexOf('налог') === 0 ? 'tax'
      : (kindRaw.indexOf('$') >= 0 || kindRaw.indexOf('фикс') >= 0 || kindRaw.indexOf('месяц') >= 0) ? 'fixed' : 'fund';
    const aliases = [norm_(name)].concat(String(r[3] || '').split(',').map(norm_).filter(Boolean));
    const icon = String(r[4] || '').trim() || iconFor_(name);
    env.push({ name: name, kind: kind, value: Number(String(r[2]).replace(',', '.')) || 0, aliases: aliases, icon: icon });
  });
  if (!env.length) throw new Error('Лист «Настройки» пуст.');
  return env;
}

function iconFor_(name) {
  const n = norm_(name);
  for (let i = 0; i < ICONS.length; i++) if (n.indexOf(ICONS[i][0]) === 0) return ICONS[i][1];
  return '▫️';
}

/** Размер фонда: «5%» или «$2,750/мес». */
function size_(e) {
  return e.kind === 'fixed' ? fmt_(e.value) + '/мес' : e.value + '%';
}

/** «🛒 Еда (магазины) ($1,000/мес)» — для HTML-сообщений. */
function label_(e) {
  return e.icon + ' ' + esc_(e.name) + ' (' + size_(e) + ')';
}

function findEnv_(env, name) {
  return env.filter(function (e) { return e.name === name; })[0] || null;
}

function logRows_() {
  const values = sheet_(SHEET_LOG).getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (!v[2]) continue;
    rows.push({
      rowNum: i + 1,
      date: v[0] instanceof Date ? v[0] : new Date(v[0]),
      who: v[1], type: String(v[2]), env: String(v[3]),
      amount: Number(v[4]) || 0, comment: String(v[5] || ''), op: String(v[6] || ''),
    });
  }
  return rows;
}

function appendRows_(rows) {
  const sh = sheet_(SHEET_LOG);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildBalanceSheet_() {
  const ss = SpreadsheetApp.getActive();
  const env = readConfig_();
  const sh = ss.getSheetByName(SHEET_BAL) || ss.insertSheet(SHEET_BAL, 0);
  sh.clear();
  const L = "'" + SHEET_LOG + "'!";
  const rows = [['Фонд', 'Остаток', 'Расход в этом месяце']];
  env.forEach(function (e, i) {
    const r = i + 2;
    rows.push([
      e.name,
      '=SUMIF(' + L + 'D:D,A' + r + ',' + L + 'E:E)',
      '=-SUMIFS(' + L + 'E:E,' + L + 'D:D,A' + r + ',' + L + 'C:C,"расход",' + L + 'A:A,">="&(EOMONTH(TODAY(),-1)+1))',
    ]);
  });
  const last = env.length + 1;
  rows.push(['Всего', '=SUM(B2:B' + last + ')', '=SUM(C2:C' + last + ')']);
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(2, 2, rows.length - 1, 2).setNumberFormat('$#,##0.00');
  sh.getRange(1, 1, 1, 3).setFontWeight('bold');
  sh.getRange(rows.length, 1, 1, 3).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 3);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { fn(); } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------
// Мини-приложение (кнопка «📱 Бюджет» в Telegram)
// ---------------------------------------------------------------

/** Личный ключ входа в приложение: подпись токеном бота, подделать нельзя. */
function appKey_(uid) {
  const sig = Utilities.computeHmacSha256Signature('family-app:' + uid, BOT_TOKEN);
  return sig.slice(0, 12).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** Секретный ключ адреса для Telegram (webhook). */
function hookKey_() { return appKey_('hook'); }

/** Ответ приложению на GitHub: { ok, data } или { ok: false, error }. */
function apiResponse_(b) {
  let out;
  try {
    const fns = {
      data: function () { return apiData(b.auth); },
      add: function () { return apiAdd(b.auth, b.data || {}); },
      transfer: function () { return apiTransfer(b.auth, b.data || {}); },
      undo: function () { return apiUndo(b.auth, b.data); },
    };
    if (!fns[b.api]) throw new Error('Неизвестный запрос');
    out = { ok: true, data: fns[b.api]() };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function appUrl_(uid) {
  const q = 'u=' + encodeURIComponent(String(uid)) + '&k=' + appKey_(String(uid));
  return SHELL_URL ? SHELL_URL + '?' + q : WEBAPP_URL + '?app=1&' + q;
}

/** Кнопка «📱 Бюджет» слева от поля ввода в чате с ботом. */
function setAppButton_(uid) {
  tg_('setChatMenuButton', {
    chat_id: Number(uid),
    menu_button: { type: 'web_app', text: '📱 Бюджет', web_app: { url: appUrl_(uid) } },
  });
}

/** Клавиатура внизу чата, с кнопкой приложения сверху. */
function menu_(user) {
  return {
    keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: appUrl_(user.id) } }]].concat(MENU.keyboard),
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Кнопка-ссылка: открыть приложение на весь экран (через кнопку «Open» бота). */
function sendOpenLink_(chatId) {
  const uname = PropertiesService.getScriptProperties().getProperty('BOT_USERNAME');
  if (!uname) return;
  send_(chatId, '📱 Приложение на весь экран:', {
    inline_keyboard: [[{ text: '📱 Открыть приложение', url: 'https://t.me/' + uname + '?startapp&mode=fullscreen' }]],
  });
}

/** Страница приложения: свежий app.html из папки в Drive, а если не вышло — встроенный файл app. */
function appTemplate_() {
  const cache = CacheService.getScriptCache();
  let html = cache.get('appHtml'), src = html ? 'Google Drive (из кэша)' : '';
  if (!html) {
    try {
      const it = DriveApp.getFolderById(APP_FOLDER_ID).getFilesByName(APP_FILE_NAME);
      let best = null;
      while (it.hasNext()) {
        const f = it.next();
        if (f.isTrashed()) continue;
        if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
      }
      if (best) {
        html = best.getBlob().getDataAsString('UTF-8');
        src = 'Google Drive, файл от ' + Utilities.formatDate(best.getLastUpdated(), TZ, 'dd.MM.yyyy HH:mm');
        if (html.length < 90000) cache.put('appHtml', html, 120);
      }
    } catch (err) {
      console.error('Drive: ' + (err && err.message || err));
    }
  }
  if (html) return { tpl: HtmlService.createTemplate(html), src: src };
  return { tpl: HtmlService.createTemplateFromFile('app'), src: 'встроенный файл app (Drive недоступен)' };
}

/** Кто открыл приложение: личная ссылка (u+k) или данные, подписанные Telegram (кнопка «Open»). */
function appUser_(auth) {
  let u = '';
  if (auth && auth.init) u = verifyInit_(auth.init);
  else {
    u = auth && auth.u != null ? String(auth.u) : '';
    if (!/^\d+$/.test(u) || String(auth.k || '') !== appKey_(u)) throw new Error('Нет доступа');
  }
  const allowed = JSON.parse(PropertiesService.getScriptProperties().getProperty('ALLOWED') || '{}');
  if (!Object.prototype.hasOwnProperty.call(allowed, u)) throw new Error('Нет доступа');
  return { id: Number(u), first_name: allowed[u] };
}

/**
 * Проверка подписи Telegram (initData) по официальному алгоритму:
 * secret = HMAC_SHA256(ключ «WebAppData», токен бота); hash = HMAC_SHA256(secret, строка данных).
 * Возвращает id пользователя или бросает «Нет доступа».
 */
function verifyInit_(init) {
  const params = {};
  String(init).split('&').forEach(function (kv) {
    const i = kv.indexOf('=');
    if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  const hash = params.hash;
  if (!hash || !params.user) throw new Error('Нет доступа');
  const check = Object.keys(params).filter(function (k) { return k !== 'hash'; }).sort()
    .map(function (k) { return k + '=' + params[k]; }).join('\n');
  const secret = Utilities.computeHmacSha256Signature(BOT_TOKEN, 'WebAppData');
  const sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(check).getBytes(), secret);
  const hex = sig.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  if (hex !== String(hash).toLowerCase()) throw new Error('Нет доступа');
  if (Date.now() / 1000 - Number(params.auth_date || 0) > 7 * 24 * 3600) throw new Error('Сессия устарела — откройте приложение заново');
  const id = String(JSON.parse(params.user).id || '');
  if (!/^\d+$/.test(id)) throw new Error('Нет доступа');
  return id;
}

/** Всё, что показывает приложение: фонды, итоги месяца, история. */
function appData_(user) {
  const env = readConfig_();
  const rows = logRows_();
  const bal = balances_(rows);
  const month = monthKey_(new Date());
  const mIdx = Number(month.slice(5)) - 1;
  let income = 0, spent = 0;
  const alloc = {}, exp = {};
  rows.forEach(function (r) {
    if (monthKey_(r.date) !== month) return;
    if (r.type === 'доход') income = r2_(income + r.amount);
    if (r.type === 'распределение') alloc[r.env] = r2_((alloc[r.env] || 0) + r.amount);
    if (r.type === 'расход') { exp[r.env] = r2_((exp[r.env] || 0) - r.amount); spent = r2_(spent - r.amount); }
  });
  let total = 0;
  const funds = env.map(function (e, i) {
    const b = bal[e.name] || 0;
    total = r2_(total + b);
    return { name: e.name, icon: e.icon, kind: e.kind, value: e.value, size: size_(e), color: COLORS[i % COLORS.length],
      balance: b, spentMonth: exp[e.name] || 0, allocMonth: alloc[e.name] || 0 };
  });
  const fixed = env.filter(isKind_('fixed'));
  const fixedTarget = fixed.reduce(function (s, e) { return s + e.value; }, 0);
  const fixedGot = fixed.reduce(function (s, e) { return s + Math.min(e.value, alloc[e.name] || 0); }, 0);
  const tax = env.filter(isKind_('tax')).reduce(function (s, e) { return r2_(s + (alloc[e.name] || 0)); }, 0);

  // история: операции от новых к старым
  const ops = [], byOp = {};
  for (let i = rows.length - 1; i >= 0 && ops.length < 60; i--) {
    const r = rows[i];
    if (!r.op) continue;
    if (!byOp[r.op]) { byOp[r.op] = { op: r.op, rows: [] }; ops.push(byOp[r.op]); }
    byOp[r.op].rows.push(r);
  }
  const prefix = String(user.id) + '-';
  const history = ops.map(function (o) {
    const rs = o.rows, r0 = rs[rs.length - 1];
    const h = { op: o.op, who: String(r0.who || ''), when: Utilities.formatDate(r0.date, TZ, 'dd.MM HH:mm'),
      day: Utilities.formatDate(r0.date, TZ, 'yyyy-MM-dd'), mine: o.op.indexOf(prefix) === 0 };
    const inc = rs.filter(function (r) { return r.type === 'доход'; })[0];
    const ex = rs.filter(function (r) { return r.type === 'расход'; })[0];
    const tr = rs.filter(function (r) { return r.type === 'перевод'; });
    if (inc) {
      h.type = 'inc'; h.amount = inc.amount; h.comment = inc.comment;
      h.noTax = !rs.some(function (r) { return r.type === 'распределение' && env.some(function (e) { return e.kind === 'tax' && e.name === r.env; }); });
    } else if (ex) {
      h.type = 'exp'; h.amount = -ex.amount; h.fund = ex.env; h.comment = ex.comment;
    } else if (tr.length) {
      const from = tr.filter(function (r) { return r.amount < 0; })[0], to = tr.filter(function (r) { return r.amount > 0; })[0];
      h.type = 'tr'; h.amount = to ? to.amount : 0; h.from = from ? from.env : ''; h.to = to ? to.env : '';
    } else {
      h.type = 'other'; h.amount = 0;
    }
    return h;
  });

  return {
    me: { id: String(user.id), name: whoName_(user) },
    month: MONTHS[mIdx] + ' ' + month.slice(0, 4),
    monthName: MONTHS[mIdx],
    total: total, income: income, spent: spent, tax: tax,
    fixedTarget: fixedTarget, fixedGot: fixedGot,
    funds: funds, history: history,
  };
}

// Вызываются из приложения (google.script.run)
function apiData(auth) {
  return appData_(appUser_(auth));
}

function apiAdd(auth, d) {
  const user = appUser_(auth);
  const amount = r2_(Number(String(d && d.amount).replace(',', '.')));
  if (!(amount > 0) || amount > 10000000) throw new Error('Проверьте сумму');
  const comment = String(d.comment || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (d.type === 'inc') {
    income_(user.id, user, amount, ((d.noTax ? 'зп' : 'комиссия') + ' ' + comment).trim());
  } else {
    if (!findEnv_(readConfig_(), d.fund)) throw new Error('Выберите фонд');
    recordExpense_(user.id, user, amount, d.fund, comment);
  }
  return appData_(user);
}

function apiTransfer(auth, d) {
  const user = appUser_(auth);
  const env = readConfig_();
  const from = findEnv_(env, d && d.from), to = findEnv_(env, d && d.to);
  if (!from || !to || from === to) throw new Error('Выберите два разных фонда');
  const amount = r2_(Number(String(d.amount).replace(',', '.')));
  if (!(amount > 0)) throw new Error('Проверьте сумму');
  transferDo_(user.id, user, amount, from, to, String(d.comment || '').slice(0, 200));
  return appData_(user);
}

function apiUndo(auth, op) {
  const user = appUser_(auth);
  undo_(user.id, user, String(op || ''));
  return appData_(user);
}

// ---------------------------------------------------------------
// Разбор текста
// ---------------------------------------------------------------

/** «+6500 комиссия», «45 еда», «-45.50 еда», «$45 еда» */
function parseAmount_(text) {
  const m = String(text).trim().match(/^([+\-−–—])?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const amount = Number(m[2].replace(',', '.'));
  if (!(amount > 0)) return null;
  return { sign: m[1] === '+' ? '+' : '-', amount: amount, rest: (m[3] || '').trim() };
}

/**
 * Ищет фонд в начале текста: по названию или словам из «Настроек».
 * Если слово подходит к нескольким фондам («личное»), выбирает фонд того, кто пишет.
 * Возвращает { env, remainder } или null, если не нашёл / неоднозначно.
 */
function matchEnvelope_(text, env, user) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const nwords = words.map(norm_);

  let n = 0, hits = [];
  env.forEach(function (e) {
    e.aliases.forEach(function (a) {
      const aw = a.split(' ');
      if (aw.length > nwords.length) return;
      for (let i = 0; i < aw.length; i++) if (aw[i] !== nwords[i]) return;
      if (aw.length > n) { n = aw.length; hits = []; }
      if (aw.length === n && hits.indexOf(e) < 0) hits.push(e);
    });
  });

  if (!hits.length) {
    // по началу слова: «развл», «подар», «непредв»
    const w = nwords[0];
    if (w.length >= 3) {
      hits = env.filter(function (e) {
        return e.aliases.some(function (a) {
          const a0 = a.split(' ')[0];
          return a0.indexOf(w) === 0 || (a0.length >= 4 && w.indexOf(a0) === 0);
        });
      });
      n = 1;
    }
  }
  if (hits.length > 1) hits = ownerOf_(hits, user);
  if (hits.length !== 1) return null;
  return { env: hits[0], remainder: words.slice(n).join(' ') };
}

/** Из нескольких фондов оставить тот, в названии которого имя пишущего (латиница → кириллица: Anna → Анна). */
function ownerOf_(list, user) {
  if (!user) return list;
  const names = [user.first_name, user.last_name, user.username].filter(Boolean).map(function (x) {
    const c = translit_(norm_(x));
    return c.length >= 3 ? c.slice(0, 3) : null;
  }).filter(Boolean);
  const mine = list.filter(function (e) {
    const words = norm_(e.name).split(' ');
    return names.some(function (nm) { return words.some(function (w) { return w.indexOf(nm) === 0; }); });
  });
  return mine.length ? mine : list;
}

function translit_(s) {
  const pairs = [['shch', 'щ'], ['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'],
    ['yu', 'ю'], ['ya', 'я'], ['yo', 'е'], ['ye', 'е'], ['iu', 'ю'], ['ia', 'я'],
    ['ju', 'ю'], ['ja', 'я'], ['jo', 'е'], ['je', 'е'],
    ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['j', 'й'],
    ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'],
    ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'к'], ['y', 'и'], ['w', 'в'], ['x', 'кс'], ['q', 'к']];
  let out = '', i = 0;
  while (i < s.length) {
    let hit = null;
    for (let k = 0; k < pairs.length; k++) if (s.substr(i, pairs[k][0].length) === pairs[k][0]) { hit = pairs[k]; break; }
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += s[i]; i++; }
  }
  return out;
}

// ---------------------------------------------------------------
// Мелочи
// ---------------------------------------------------------------

function norm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function isKind_(k) { return function (e) { return e.kind === k; }; }

function r2_(n) { return Math.round(n * 100) / 100; }

function fmt_(n) {
  const neg = n < 0;
  const parts = Math.abs(r2_(n)).toFixed(2).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '−' : '') + CUR + int + (parts[1] === '00' ? '' : '.' + parts[1]);
}

/** Шкала из 10 делений: ▰▰▰▰▰▰▱▱▱▱ */
function bar_(ratio) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const full = Math.floor(r * 10 + 1e-9);
  return new Array(full + 1).join('▰') + new Array(10 - full + 1).join('▱');
}

function pct_(ratio) { return Math.round(Math.max(0, Number(ratio) || 0) * 100) + '%'; }

/** Экранирование для HTML-разметки Telegram. */
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function strip_(html) {
  return String(html).replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function undoButton_(op) {
  return { inline_keyboard: [[{ text: '↩️ Отменить', callback_data: 'u|' + op }]] };
}

function monthKey_(d) { return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM'); }

function whoName_(u) { return (u && (u.first_name || u.username)) || 'Кто-то'; }

function opId_(u) { return String(u.id) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }

/** Сообщение с разметкой; если Telegram её не принял — повторить простым текстом. */
function send_(chatId, html, markup) {
  const p = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (markup) p.reply_markup = markup;
  const res = tg_('sendMessage', p);
  try {
    const j = JSON.parse(res.getContentText());
    if (j && j.ok === false) {
      console.error('sendMessage HTML: ' + res.getContentText());
      delete p.parse_mode;
      p.text = strip_(html);
      return tg_('sendMessage', p);
    }
  } catch (e) { /* ответ не JSON — ничего страшного */ }
  return res;
}

function sendPhoto_(chatId, blob, captionHtml) {
  return UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto', {
    method: 'post',
    payload: { chat_id: String(chatId), photo: blob, caption: captionHtml, parse_mode: 'HTML' },
    muteHttpExceptions: true,
  });
}

function tg_(method, payload) {
  return UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
