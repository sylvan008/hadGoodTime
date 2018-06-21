const level = require('level');

const db = level('./coffersDb', {
  valueEncoding: 'json'
});

db.getCoffer = chatId => {
  return db.get(chatId, (err, coffer) => {
    if (err && !err.notFound) throw err;
    if (err && err.notFound) return console.log('Value was not found.');

    return coffer;
  });
};

db.putCoffer = (chatId, coffer) => {
  db.put(chatId, coffer, err => {
    if (err) throw err;
  });
};

module.exports = db;
