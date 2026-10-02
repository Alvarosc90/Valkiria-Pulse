import { execFile, execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { config } from "../src/config.js";
import {
  actionsDir,
  apiRoot,
  backupsDir,
  connection,
  ensureRuntimeDirs,
  migrationsDir,
  pendingMigrations,
  repoRoot
} from "./db-common.js";

const execFileAsync = promisify(execFile);

type DbAction = {
  version: 1;
  id: number;
  status: "prepared" | "completed";
  headSha: string;
  pending: Array<{ filename: string; checksum: string }>;
  createdAt: string;
  updatedAt: string;
  backupPath?: string;
};

function actionPath(id: number) {
  return resolve(actionsDir, String(id) + ".json");
}

async function readAction(id: number): Promise<DbAction> {
  const action = JSON.parse(await readFile(actionPath(id), "utf8")) as DbAction;
  if (action.version !== 1 || action.id !== id) {
    throw new Error("Invalid DB action: " + id);
  }
  return action;
}

async function writeAction(action: DbAction) {
  await ensureRuntimeDirs();
  await writeFile(actionPath(action.id), JSON.stringify(action, null, 2), "utf8");
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
}

async function backupDatabase() {
  await ensureRuntimeDirs();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = resolve(backupsDir, stamp + "-pre-migrate.sql");
  const candidates = ["mariadb-dump", "mysqldump"];
  let lastError: any = null;

  for (const command of candidates) {
    try {
      const args = [
        "--host=" + config.DB_HOST,
        "--port=" + config.DB_PORT,
        "--user=" + config.DB_USER,
        "--single-transaction",
        "--routines",
        "--events",
        "--databases",
        config.DB_NAME
      ];

      const { stdout } = await execFileAsync(command, args, {
        cwd: apiRoot,
        env: { ...process.env, MYSQL_PWD: config.DB_PASSWORD ?? "" },
        maxBuffer: 128 * 1024 * 1024
      });

      await writeFile(target, stdout, "utf8");
      return target;
    } catch (error: any) {
      lastError = error;
      if (error?.code !== "ENOENT") break;
    }
  }

  throw new Error(
    "Database backup failed before migration: " +
      (lastError?.message || "dump client unavailable")
  );
}

async function prepare() {
  const pending = await pendingMigrations();

  if (!pending.length) {
    console.log("No hay migraciones pendientes.");
    return;
  }

  const id = Date.now();
  const now = new Date().toISOString();
  const action: DbAction = {
    version: 1,
    id,
    status: "prepared",
    headSha: gitHead(),
    pending,
    createdAt: now,
    updatedAt: now
  };

  await writeAction(action);
  console.log("Action #" + id + ": PREPARED");

  for (const item of pending) {
    console.log("PENDING | " + item.filename + " | " + item.checksum);
  }
}

async function preview(id: number) {
  const action = await readAction(id);
  console.log("Action #" + action.id + ": " + action.status.toUpperCase());
  console.log("HEAD | " + action.headSha);

  for (const item of action.pending) {
    console.log("PENDING | " + item.filename + " | " + item.checksum);
  }
}

async function execute(id: number, confirmation: string) {
  const action = await readAction(id);

  if (confirmation !== "CONFIRM:" + id) {
    throw new Error("Invalid confirmation");
  }
  if (action.status !== "prepared") {
    throw new Error("Action is not prepared: " + action.status);
  }
  if (gitHead() !== action.headSha) {
    throw new Error("HEAD drift detected");
  }

  const current = await pendingMigrations();

  if (JSON.stringify(action.pending) !== JSON.stringify(current)) {
    throw new Error("Pending migration drift detected");
  }

  const backupPath = await backupDatabase();
  const db = await connection();

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const item of action.pending) {
      const sql = await readFile(resolve(migrationsDir, item.filename), "utf8");

      await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
        [item.filename, item.checksum]
      );

      console.log("APPLIED | " + item.filename);
    }
  } finally {
    await db.end();
  }

  action.status = "completed";
  action.backupPath = backupPath;
  action.updatedAt = new Date().toISOString();
  await writeAction(action);

  console.log("BACKUP | " + backupPath);
  console.log("Action #" + id + ": COMPLETED");
}

const command = String(process.argv[2] ?? "").trim().toLowerCase();

try {
  await ensureRuntimeDirs();

  if (command === "prepare") await prepare();
  else if (command === "preview") await preview(Number(process.argv[3]));
  else if (command === "execute") {
    await execute(Number(process.argv[3]), String(process.argv[4] ?? ""));
  } else {
    throw new Error("Unsupported DB executor command: " + command);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
