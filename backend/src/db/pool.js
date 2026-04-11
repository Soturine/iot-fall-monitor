const mysql = require("mysql2/promise");

const { env } = require("../config/env");

const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true,
});

async function execute(executor, sql, params = []) {
  const runner = executor || pool;
  const [rows] = await runner.execute(sql, params);
  return rows;
}

async function one(executor, sql, params = []) {
  const rows = await execute(executor, sql, params);
  return rows[0] || null;
}

async function transaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function testConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  execute,
  one,
  transaction,
  testConnection,
};
