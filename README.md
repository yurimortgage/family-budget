# Семейный бюджет

Telegram-бот и мини-приложение для учёта доходов, расходов и фондов семьи.

- `index.html` — мини-приложение (GitHub Pages). Это только внешний вид: данные хранятся в Google Таблице
  владельца и приходят из Google Apps Script после проверки подписи Telegram.
- `apps-script/budget-bot.gs` — код бота для Google Apps Script (без токена и настроек владельца).
- `apps-script/test.js` — проверки на имитации: `node apps-script/test.js`.
