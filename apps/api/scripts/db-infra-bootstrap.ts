import mysql from "mysql2/promise";
import { config } from "../src/config.js";

function required(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function safeIdentifier(value: string, label: string) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(value)) {
    throw new Error(label + " contains unsupported characters");
  }
  return value;
}

const host = required("PULSE_INFRA_ADMIN_HOST");
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error("PULSE infra bootstrap only allows local MariaDB");
}

const port = Number(required("PULSE_INFRA_ADMIN_PORT"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid PULSE_INFRA_ADMIN_PORT");
}

const adminUser = required("PULSE_INFRA_ADMIN_USER");
const adminPassword = required("PULSE_INFRA_ADMIN_PASSWORD");
const database = safeIdentifier(config.DB_NAME, "DB_NAME");
const appUser = safeIdentifier(config.DB_USER, "DB_USER");

if (!config.DB_PASSWORD) {
  throw new Error("DB_PASSWORD must be configured before bootstrap");
}

const admin = await mysql.createConnection({
  host,
  port,
  user: adminUser,
  password: adminPassword,
  multipleStatements: false
});

try {
  const escapedPassword = admin.escape(config.DB_PASSWORD);

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  for (const userHost of ["localhost", "127.0.0.1"]) {
    await admin.query(
      `CREATE USER IF NOT EXISTS '${appUser}'@'${userHost}' IDENTIFIED BY ${escapedPassword}`
    );
    await admin.query(
      `ALTER USER '${appUser}'@'${userHost}' IDENTIFIED BY ${escapedPassword}`
    );
    await admin.query(
      `GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'${userHost}'`
    );
  }

  await admin.query("FLUSH PRIVILEGES");
} finally {
  await admin.end();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      host,
      port,
      database,
      user: appUser
    },
    null,
    2
  )
);
