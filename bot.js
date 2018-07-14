const Bot = require('node-telegram-bot-api');
const db = require('./data/levelDb');
const state = require('./data/state');

const token = process.env.BOT_ACCESS_TOKEN;
const isProduction = process.env.NODE_ENV === 'production';

let bot;

if (isProduction) {
    bot = new Bot(token);
    bot.setWebHook(process.env.HEROKU_URL + bot.token);
} else {
    bot = new Bot(token, { polling: true });
    bot.deleteWebHook();
}

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

  if (msg.text) {
    /**
     * @type {string}
     */
    const text = msg.text;
    const userId = msg.from.id;

    let coffer = {
      state: '0',
      name: '',
      expenses: '',
      clients: []
    };

    /**
     * @type {Array}
     */
    const args = text.split(" ");

    if (args[0] === '/start') {
      startHandler(userId);

    } else if (args[0] === '/resume') {
      resumeHandler(userId);

    } else if (args[0] === '/reset') {
      resetHandler(userId, coffer);

    } else if (args[0] === '/finish') {
      finishHandler(userId);
    }
    else {
      messageHandler(userId, text, coffer);
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

  const text = msg.data;
  const userId = msg.from.id;

  if (text === 'new_calculation') {
    coffer.state = state.ENTER_NAME;
    await db.putCoffer(userId, coffer);
    await bot.sendMessage(userId, 'Введите имя первого участника');
    bot.answerCallbackQuery(msg.id);
  }

  if (text === 'resume') {
    resumeHandler(userId);

    bot.answerCallbackQuery(msg.id);
  }

  if (text === 'reset') {
    startHandler(userId, coffer);
    bot.answerCallbackQuery(msg.id);
  }

  if (text === 'finish') {
    finishHandler(userId);
    bot.answerCallbackQuery(msg.id);
  }
});

async function startHandler(userId) {
  const options = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{text: "Новый расчёт", callback_data: "new_calculation"}]
      ]
    })
  };

  const welcomeMessage =
    "Привет! Это хорошо посидели бот. 😎\n\n" +

    "Бот помогает разобраться кто, кому и сколько должен после того как хорошо посидели.\n" +
    "Подразумевается, что суммарный счет делится поровну.\n\n" +

    "Вопросы и предложения: @vadimcpp\n";

  bot.sendMessage(userId, welcomeMessage, options);
}

async function resetHandler(userId, coffer) {
  coffer.state = state.START;
  await db.putCoffer(userId, coffer);
  startHandler(userId);
}

async function finishHandler(userId) {
  const coffer = await db.getCoffer(userId);
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

  await db.putCoffer(userId, coffer);

  bot.sendMessage(userId, message);

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

          message += payer.name + " → " + recipient.name + "  💸 " + payment + "\n";

          // логируем платеж
          console.log(payer.name + " → " + recipient.name + "  💸 " + payment);
        }
      }
    }

    return message;
  }
}

async function messageHandler(userId, text) {
  const coffer = await db.getCoffer(userId);

  if (coffer.state === state.ENTER_NAME) {
    coffer.name = text;
    coffer.state = state.ENTER_EXPENSES;
    await db.putCoffer(userId, coffer);
    bot.sendMessage(userId, "Сколько денег потратил?");
    return;
  }

  if (coffer.state === state.ENTER_EXPENSES) {
    if (isNaN(text) || text < 0) {
      bot.sendMessage(userId, "Число некорректно или меньше нуля.");
      return;
    }

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [ { text: "👤Добавить ещё", callback_data: "resume" } ],
          [ { text: "💰Расчет", callback_data: "finish" } ],
          [ { text: "❌Сброс", callback_data: "reset" } ]
        ]
      })
    };

    coffer.expenses = text;
    coffer.clients.push({name: coffer.name, expenses: coffer.expenses});

    let message = '';

    if (coffer.clients.length > 1) {
      coffer.state = state.INTERMEDIATE;
      await db.putCoffer(userId, coffer);
      message = createMessage();

      bot.sendMessage(userId, message, options);
    } else {
      coffer.state = state.ENTER_NAME;
      await db.putCoffer(userId, coffer);
      message = 'Введите имя второго участника';

      bot.sendMessage(userId, message);
    }
  }

  function createMessage() {
    let message = '';

    coffer.clients.forEach(element => {
      message += element.name + " потратил: " + element.expenses + "\n"
    });

    return message;
  }
}

async function resumeHandler(userId) {
  const coffer = await db.getCoffer(userId);
  coffer.state = state.ENTER_NAME;
  await db.putCoffer(userId, coffer);

  bot.sendMessage(userId, 'Введите имя следующего участника');
}

module.exports = bot;