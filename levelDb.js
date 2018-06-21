const level = require('level');

const db = level('./mydb', {
  valueEncoding: 'json'
});

module.exports = db;
