const Bot = require('node-telegram-bot-api');
const db = require('./data/levelDb');
const state = require('./data/state');

const token = process.env.BOT_ACCESS_TOKEN;

let bot = new Bot(token, { polling: true });

const startHandler = async (chatId) => {
  const options = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{text: "Новый расчёт", callback_data: "new_calculation"}]
      ]
    })
  };

  bot.sendMessage(chatId, "Привет! Это хорошо посидели бот :)", options);
};

const resetHandler = async (chatId, coffer) => {
  coffer.state = state.ENTER_NAME;
  await db.putCoffer(chatId, coffer);
  bot.sendMessage(chatId, "Начнём считать сначала. Введите имя.");
};

const finishHandler = async (chatId) => {
  const coffer = await db.getCoffer(chatId);
  let clients = coffer.clients;

  const totalExpenses = clients.reduce((total, client) => {
    return total + Number.parseFloat(client.expenses);
  }, 0);

  const arithmeticAverage = Math.floor(totalExpenses / clients.length);

  const delta = totalExpenses - arithmeticAverage * clients.length;

  clients = findClientsDelta(clients);

  clients = findClientWithMinimumDelta(clients);

  const message = divideExpenses(clients);

  coffer.state = state.CALCULATION;
  coffer.result = message;

  await db.putCoffer(chatId, coffer);

  bot.sendMessage(chatId, message);

  /**
   *
   * @param clients{Object}
   * @returns {Array}
   */
  function findClientsDelta(clients) {
    return clients.map(item => {
      item.delta = arithmeticAverage - item.expenses;
      return item;
    });
  }

  /**
   *
   * @param clients{Object}
   * @returns {Object}
   */
  function findClientWithMinimumDelta(clients) {
    let idx = 0;
    let maxDelta = clients[ idx ].delta;

    clients.forEach((client, index) => {
      if (client.delta > maxDelta) {
        idx = index;
        maxDelta = client.delta;
      }
    });
    clients[idx].delta += delta;

    return clients;
  }

  /**
   *
   * @param clients{Object}
   * @returns message{string}
   */
  function divideExpenses(clients) {
    let message = '';

    // метод проверяет, закончен ли взаиморасчет
    const isFinished = function() {
      let finished = true;

      clients.forEach(function(client) {
        if (client.delta !== 0)
          finished = false;
      });

      return finished;
    };

// в цикле распределяем затраченные средства
    while (!isFinished()) {
      let idx = 0;
      let minPositiveDelta = clients[idx].delta;

      clients.forEach(function(client, index) {
        if (client.delta > 0 && client.delta > minPositiveDelta) {
          idx = index;
          minPositiveDelta = client.delta;
        }
      });

      // отбираем того, у кого самый маленький долг
      let payer = clients[idx];

      // раскидываем долг тем, кто переплатил
      for (let i = 0; i < clients.length; i++) {
        let recipient = clients[i];

        if (recipient.delta < 0 && payer.delta > 0) {
          let payment = Math.min(Math.abs(recipient.delta), payer.delta);

          recipient.delta += payment;
          payer.delta -= payment;

          message += payer.name + " -> " + recipient.name + "  $ " + payment + "\n";

          // логируем платеж
          console.log(payer.name + " -> " + recipient.name + "  $ " + payment);
        }
      }
    }

    return message;
  }
};

const messageHandler = async (chatId, text) => {
  const coffer = await db.getCoffer(chatId);

  if (coffer.state === state.ENTER_NAME) {
    coffer.name = text;
    coffer.state = state.ENTER_EXPENSES;
    await db.putCoffer(chatId, coffer);
    bot.sendMessage(chatId, "Сколько денег потратил?");
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
    await bot.sendMessage(chatId, "Запишем: " + coffer.name + " внес(-ла) " + coffer.expenses +
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
   * @type {{state: string, name: string, expenses: string, clients: Array}}
   */
  let coffer = {
    state: '0',
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

    } else if (args[0] === '/finish') {
      finishHandler(chatId);
    }
    else {
      messageHandler(chatId, text, coffer);
    }
  }
});

bot.on('callback_query', async (msg) => {
  let coffer = {
    state: '0',
    name: '',
    expenses: '',
    clients: []
  };

  const chatId = msg.chat.id;

  if (msg.data === 'new_calculation') {
    coffer.state = state.ENTER_NAME;
    await db.putCoffer(coffer);
    bot.sendMessage(chatId, 'Введите имя первого участника');
  }
});

module.exports = bot;