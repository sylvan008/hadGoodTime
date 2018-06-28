const level = require('level');

const db = level('./coffersDb', {
  valueEncoding: 'json'
});

db.getCoffer = async chatId => {
  return await db.get(chatId);
};

db.putCoffer = async (chatId, coffer) => {
  return await db.put(chatId, coffer);
};

module.exports = db;
