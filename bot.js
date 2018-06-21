const Bot = require('node-telegram-bot-api');

const token = process.env.BOT_ACCESS_TOKEN;

let bot = new Bot(token, { polling: true });

console.log('Bot server started in the ' + process.env.NODE_ENV + ' mode');

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {

  console.log('\n📰  Received message:');
  console.log('  ', msg.text || '(no text)');

  if (msg.text) {
    /**
     * @type {string}
     */
    const text = msg.text;

    /**
     * @type {Array}
     */
    const args = text.split(" ");

    if (args[0] === '/start') {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, "Hello World!");
    }
  }
});

module.exports = bot;
