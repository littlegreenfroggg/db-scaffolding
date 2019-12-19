const mysql = require("mysql2");

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'easymarketingdemo',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });


  exports.GetConnection = function() {
    return pool.promise();
  }