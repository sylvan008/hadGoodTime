const Bot = require('node-telegram-bot-api');
const db = require('./levelDb');
const state = require('./state');

const token = process.env.BOT_ACCESS_TOKEN;

let bot = new Bot(token, { polling: true });

const startHandler = async (chatId, coffer) => {
  coffer.state = state.ENTER_NAME;
  await db.putCoffer(chatId, coffer);
  bot.sendMessage(chatId, "Давайте посчитаем вклад каждого в общий котёл. Введите имя.");
};

const resetHandler = async (chatId, coffer) => {
  coffer.state = state.ENTER_NAME;
  await db.putCoffer(chatId, coffer);
  bot.sendMessage(chatId, "Начнём считать с начала. Введите имя.");
};

const messageHandler = async (chatId, text, coffer) => {
  coffer = await db.getCoffer(chatId);

  if (coffer.state === state.ENTER_NAME) {
    coffer.name = text;
    coffer.state = state.ENTER_EXPENSES;
    bot.sendMessage(chatId, "Отлично! Сколько внёс " + coffer.name + "?");
    await db.putCoffer(chatId, coffer);
    return;
  }

  if (coffer.state === state.ENTER_EXPENSES) {
    if (isNaN(text) || text < 0) {
      bot.sendMessage(chatId, "Число некорректно или меньше нуля.");
      return;
    }
    coffer.expenses = text;
    coffer.clients.push({name: coffer.name, expenses: coffer.expenses});
    coffer.state = state.ENTER_NAME;
    await db.putCoffer(chatId, coffer);
    await bot.sendMessage(chatId, "Так и запишем: " + coffer.name + " внёс " + coffer.expenses +
      "\n Кто далее по списку?");
  }
};

console.log('Bot server started in the ' + process.env.NODE_ENV + ' mode');

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {

  console.log('\n📰  Received message:');
  console.log('  ', msg.text || '(no text)');

  /**
   *
   * @type {{state: number, name: string, expenses: string, clients: Array}}
   */
  let coffer = {
    state: 0,
    name: '',
    expenses: '',
    clients: []
  };

  if (msg.text) {
    /**
     * @type {string}
     */
    const text = msg.text;

    /**
     * @type {Array}
     */
    const args = text.split(" ");

    const chatId = msg.chat.id;

    if (args[0] === '/start') {
      startHandler(chatId, coffer);

    } else if (args[0] === '/reset') {
      resetHandler(chatId, coffer);

    } else {
      messageHandler(chatId, text, coffer);
    }
  }
});

module.exports = bot;