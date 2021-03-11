require('dotenv').config({ path: './config.env' });
const mysql = require("mysql");
const util = require("util");
const con = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: true,
});

exports.con = con; 
exports.query = util.promisify(con.query).bind(con);
