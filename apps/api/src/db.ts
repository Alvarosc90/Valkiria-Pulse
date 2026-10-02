import mysql from "mysql2/promise";
import { config } from "./config.js";

export const db = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  connectionLimit: config.DB_CONNECTION_LIMIT,
  waitForConnections: true,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true
});

export async function pingDb() {
  const connection = await db.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
