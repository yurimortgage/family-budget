// Тесты бота: имитация Google Apps Script и Telegram. Запуск: node apps-script/test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');

function makeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (row, col, nr, nc) => ({
      setValues: (vals) => { vals.forEach((v, i) => { data[row - 1 + i] = data[row - 1 + i] || []; v.forEach((x, j) => data[row - 1 + i][col - 1 + j] = x); }); },
      setNumberFormat() { return this; }, setFontWeight() { return this; },
      getSheet: () => sh,
    }),
    deleteRow: (n) => data.splice(n - 1, 1),
    setFrozenRows() {}, clear() { data.length = 0; }, autoResizeColumns() {}, hideSheet() {},
    charts: [],
    getCharts() { return sh.charts; }, removeChart(c) { sh.charts = sh.charts.filter(x => x !== c); },
    insertChart(c) { sh.charts.push(c); },
    newChart() { const opts = {}; const b = new Proxy({}, { get: (t, k) => k === 'build'
      ? () => ({ opts, getAs: () => ({ setName() { return this; }, png: true }) })
      : (k === 'setOption' ? (a, v) => { opts[a] = v; return b; } : () => b) }); return b; },
  };
  return sh;
}

const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = makeSheet(n)),
  setSpreadsheetTimeZone() {},
};
const sent = [];
const cache = {}, props = {};
const ctx = {
  console,
  SpreadsheetApp: { getActive: () => ss },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: (url, o) => { const m = url.split('/').pop(); sent.push({ m, p: typeof o.payload === 'string' ? JSON.parse(o.payload) : o.payload }); return { getContentText: () => '{"ok":true}' }; } },
  Charts: { ChartType: { PIE: 'PIE' } },
  Utilities: {
    formatDate: (d, tz, f) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).map(x => [x.type, x.value]));
      return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
    },
    computeHmacSha256Signature: (v, k) => {
      const buf = x => typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(b => b & 255));
      return Array.from(require('crypto').createHmac('sha256', buf(k)).update(buf(v)).digest()).map(b => b > 127 ? b - 256 : b);
    },
    newBlob: str => ({ getBytes: () => Array.from(Buffer.from(str, 'utf8')).map(b => b > 127 ? b - 256 : b) }),
  },
  DriveApp: { getFolderById: id => {
    if (global.__driveFail) throw new Error('нет доступа к Drive');
    const files = (global.__driveFiles || []).slice();
    return { getFilesByName: n => { const l = files.filter(f => f.name === n); let i = 0;
      return { hasNext: () => i < l.length, next: () => { const f = l[i++]; return { isTrashed: () => !!f.trashed, getLastUpdated: () => f.date,
        getBlob: () => ({ getDataAsString: () => f.html }) }; } }; } }; } },
  ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: s => s, createTemplate: html => {
    const t = { html, evaluate() { const o = { t, title: '', meta: {}, setTitle(x) { o.title = x; return o; }, addMetaTag(a, b) { o.meta[a] = b; return o; }, setXFrameOptionsMode(m) { o.xfo = m; return o; } }; return o; } };
    return t; }, createTemplateFromFile: name => {
    const t = { name, evaluate() { const o = { t, title: '', meta: {}, setTitle(x) { o.title = x; return o; }, addMetaTag(a, b) { o.meta[a] = b; return o; }, setXFrameOptionsMode(m) { o.xfo = m; return o; } }; return o; } };
    return t; } },
  Logger: { log() {} },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'budget-bot.gs'), 'utf8'), ctx);

let uid = 1;
const HOOK = () => vm.runInContext('hookKey_()', ctx);
const A = { id: 111, first_name: 'Анна' }, B = { id: 222, first_name: 'Boris' }, STRANGER = { id: 999, first_name: 'Чужой' };
function checkHtml(h) {
  const t = h.replace(/<\/?(b|i|code|pre)>/g, '');
  assert(!/[<>]/.test(t), 'битая разметка: ' + h);
  assert(!/&(?!amp;|lt;|gt;|quot;)/.test(t), 'неэкранированный &: ' + h);
  for (const tag of ['b', 'i', 'code', 'pre']) {
    assert.strictEqual((h.match(new RegExp('<' + tag + '>', 'g')) || []).length, (h.match(new RegExp('</' + tag + '>', 'g')) || []).length, 'незакрытый <' + tag + '>: ' + h);
  }
}
const plain = h => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function texts() {
  return sent.filter(s => s.m === 'sendMessage' || s.m === 'sendPhoto').map(s => {
    const t = s.m === 'sendPhoto' ? '[ДИАГРАММА] ' + s.p.caption : s.p.text;
    if (s.p.parse_mode === 'HTML') checkHtml(t);
    return plain(t);
  }).join('\n---\n');
}
function say(user, text) {
  sent.length = 0;
  ctx.doPost({ parameter: { hook: HOOK() }, postData: { contents: JSON.stringify({ update_id: uid++, message: { chat: { id: user.id }, from: user, text } }) } });
  return texts();
}
function click(user, data) {
  sent.length = 0;
  ctx.doPost({ parameter: { hook: HOOK() }, postData: { contents: JSON.stringify({ update_id: uid++, callback_query: { id: 'q', from: user, data, message: { chat: { id: user.id }, message_id: 5 } } }) } });
  const edits = sent.filter(s => s.m === 'editMessageText').map(s => s.p.text);
  return edits.concat([texts()]).filter(Boolean).join('\n---\n');
}
const r2 = n => Math.round(n * 100) / 100;
const show = (t, r) => console.log('\n>>> ' + t + '\n' + r);
const bal = () => vm.runInContext('balances_(logRows_())', ctx);


ctx.setup();
const cfg = vm.runInContext('readConfig_()', ctx);
const fixed = cfg.filter(e => e.kind === 'fixed'), funds = cfg.filter(e => e.kind === 'fund'), tax = cfg.find(e => e.kind === 'tax');
const FIXED = fixed.reduce((s, e) => s + e.value, 0);
assert.strictEqual(funds.reduce((s, e) => s + e.value, 0), 100, 'проценты фондов дают 100%');

// доступ
assert(/семейный бот/.test(say(STRANGER, '5 еда')));
say(A, '/join семья2026'); say(B, '/join семья2026');

// доход: налог → постоянные фонды → проценты
const gross = FIXED * 2;
say(A, '+' + gross + ' комиссия');
let b = bal();
assert.strictEqual(b[tax.name], r2(gross * tax.value / 100));
fixed.forEach(e => assert.strictEqual(b[e.name], e.value));
const rest = r2(gross - b[tax.name] - FIXED);
assert(Math.abs(funds.reduce((s, e) => s + (b[e.name] || 0), 0) - rest) < 0.011, 'остаток разложен по фондам');
// зарплата без налога; постоянные уже пополнены — всё в фонды
say(B, '+1000 зп'); assert.strictEqual(bal()[tax.name], b[tax.name]);
fixed.forEach(e => assert.strictEqual(bal()[e.name], e.value));

// расход, перевод, отмена
const food = cfg.find(e => /^еда/i.test(e.name));
say(B, '45 еда'); assert.strictEqual(bal()[food.name], r2(food.value - 45));
say(A, 'перевод все еда резерв'); assert.strictEqual(bal()[food.name], 0);
say(A, 'Отменить'); assert.strictEqual(bal()[food.name], r2(food.value - 45));
// «личное» — фонд того, кто пишет (латиница → кириллица); при неясности бот спрашивает кнопками
assert(/из какого фонда/i.test(say(A, '5 личное')));

// приложение на GitHub: API через doPost, вход по ключу и по подписи Telegram
const key = vm.runInContext('appKey_("111")', ctx);
const api = body => JSON.parse(ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }).text);
let res = api({ api: 'data', auth: { u: '111', k: key } });
assert(res.ok && res.data.me.name === 'Анна' && res.data.funds.length === cfg.length);
assert.strictEqual(api({ api: 'data', auth: { u: '111', k: 'плохой' } }).ok, false);
const crypto = require('crypto');
function initData(user, token) {
  const p = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) };
  const check = Object.keys(p).sort().map(k => k + '=' + p[k]).join('\n');
  p.hash = crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex');
  return Object.keys(p).map(k => k + '=' + encodeURIComponent(p[k])).join('&');
}
const TOKEN = vm.runInContext('BOT_TOKEN', ctx);
res = api({ api: 'add', auth: { init: initData({ id: 222, first_name: 'Boris' }, TOKEN) }, data: { type: 'exp', amount: 3, fund: food.name, comment: 'тест' } });
assert(res.ok); assert.strictEqual(sheets['Журнал'].data.at(-1)[5], 'тест');
assert.strictEqual(api({ api: 'data', auth: { init: initData({ id: 222 }, 'чужой-токен') } }).ok, false);
// Telegram-сообщение без секретного ключа игнорируется
const n = sheets['Журнал'].data.length;
ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ update_id: 9e6, message: { chat: { id: 111 }, from: A, text: '50 еда' } }) } });
assert.strictEqual(sheets['Журнал'].data.length, n);

console.log('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
