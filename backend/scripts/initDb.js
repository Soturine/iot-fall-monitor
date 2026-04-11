const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const backendRoot = path.resolve(__dirname, "..");
const envPath = path.join(backendRoot, ".env");
const mysqlModulePath = path.join(backendRoot, "node_modules", "mysql2", "promise");
const dotenvModulePath = path.join(backendRoot, "node_modules", "dotenv");

if (!fs.existsSync(envPath)) {
  console.error("[initDb] backend/.env nao foi encontrado.");
  process.exit(1);
}

if (!fs.existsSync(path.join(backendRoot, "node_modules"))) {
  console.error("[initDb] backend/node_modules nao existe. Rode npm install em backend primeiro.");
  process.exit(1);
}

const dotenv = require(dotenvModulePath);
const mysql = require(mysqlModulePath);

dotenv.config({ path: envPath, quiet: true });

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

function removeDatabaseStatements(sql) {
  return String(sql)
    .replace(/^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS[\s\S]*?;\s*/im, "")
    .replace(/^\s*USE\s+.+?;\s*/gim, "")
    .trim();
}

async function main() {
  const database = process.env.MYSQL_DATABASE || "queda_monitor";
  const schemaPath = path.join(projectRoot, "database", "schema.sql");
  const seedPath = path.join(projectRoot, "database", "seed.sql");

  if (!fs.existsSync(schemaPath) || !fs.existsSync(seedPath)) {
    console.error("[initDb] database/schema.sql ou database/seed.sql nao foi encontrado.");
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    port: toPort(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    multipleStatements: true,
  });

  try {
    const databaseSql =
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} ` +
      "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";

    const schemaSql = removeDatabaseStatements(fs.readFileSync(schemaPath, "utf8"));
    const seedSql = removeDatabaseStatements(fs.readFileSync(seedPath, "utf8"));
    const useDatabaseSql = `USE ${quoteIdentifier(database)};`;

    await connection.query(databaseSql);
    await connection.query(`${useDatabaseSql}\n${schemaSql}`);
    await connection.query(`${useDatabaseSql}\n${seedSql}`);

    console.log(`[initDb] Banco ${database} criado/atualizado com sucesso.`);
    console.log(`[initDb] Schema aplicado a partir de ${schemaPath}`);
    console.log(`[initDb] Seed aplicado a partir de ${seedPath}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`[initDb] Falha ao inicializar o banco: ${error.message}`);
  process.exit(1);
});
