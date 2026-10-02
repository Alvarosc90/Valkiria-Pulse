import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

export const apiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const repoRoot = resolve(apiRoot, "..", "..");
export const migrationsDir = resolve(apiRoot, "migrations");
export const valkyDbDir = resolve(apiRoot, ".valky-db");
export const actionsDir = resolve(valkyDbDir, "actions");
export const backupsDir = resolve(valkyDbDir, "backups");

function digest(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function normalizeMigrationSql(content: string) {
  return String(content).replace(/\r\n?/g, "\n");
}

export function checksum(content: string) {
  return digest(normalizeMigrationSql(content));
}

export function checksumVariants(content: string) {
  const raw = String(content);
  const lf = normalizeMigrationSql(raw);
  const crlf = lf.replace(/\n/g, "\r\n");
  return new Set([digest(raw), digest(lf), digest(crlf)]);
}

export async function migrationFiles() {
  return (await readdir(migrationsDir))
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export async function connection() {
  return mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    multipleStatements: true
  });
}

export async function pendingMigrations() {
  const files = await migrationFiles();
  const db = await connection();

  try {
    let applied = new Map<string, string>();

    try {
      const [rows] = await db.query<any[]>(
        "SELECT filename, checksum FROM schema_migrations ORDER BY filename"
      );
      applied = new Map(
        rows.map((row) => [String(row.filename), String(row.checksum)])
      );
    } catch (error: any) {
      if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
    }

    const pending: Array<{ filename: string; checksum: string }> = [];

    for (const filename of files) {
      const sql = await readFile(resolve(migrationsDir, filename), "utf8");
      const hash = checksum(sql);
      const previous = applied.get(filename);

      if (previous && !checksumVariants(sql).has(previous)) {
        throw new Error("Migration checksum mismatch for " + filename);
      }

      if (!previous) pending.push({ filename, checksum: hash });
    }

    return pending;
  } finally {
    await db.end();
  }
}

export async function ensureRuntimeDirs() {
  await Promise.all([
    mkdir(actionsDir, { recursive: true }),
    mkdir(backupsDir, { recursive: true })
  ]);
}
