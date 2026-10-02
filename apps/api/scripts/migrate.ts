import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const migrationsDir = resolve(here, "..", "migrations");

function checksum(content: string) {
  return createHash("sha256")
    .update(content.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

async function migrationFiles() {
  return (await readdir(migrationsDir))
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function main() {
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    multipleStatements: true
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.query<any[]>(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename"
    );
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

    for (const filename of await migrationFiles()) {
      const sql = await readFile(resolve(migrationsDir, filename), "utf8");
      const hash = checksum(sql);
      const previous = applied.get(filename);

      if (previous) {
        if (previous !== hash) {
          throw new Error(`Migration changed after apply: ${filename}`);
        }
        console.log(`SKIP ${filename}`);
        continue;
      }

      console.log(`APPLY ${filename}`);
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
          [basename(filename), hash]
        );
        await connection.commit();
        console.log(`PASS ${filename}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
