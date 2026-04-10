const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'greenspace_user',
  password: process.env.DB_PASSWORD || 'greenspace_pass',
  database: process.env.DB_NAME || 'greenspace_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
});

module.exports = pool;
