import { connection } from "./db-common.js";

try {
  const db = await connection();
  try {
    const [rows] = await db.query<any[]>(
      "SELECT DATABASE() AS databaseName, VERSION() AS serverVersion, 1 AS ok"
    );
    console.log(JSON.stringify({ ok: true, ...rows[0] }, null, 2));
  } finally {
    await db.end();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
