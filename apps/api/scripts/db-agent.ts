import { pendingMigrations } from "./db-common.js";

const command = String(process.argv[2] ?? "status").trim().toLowerCase();

if (command !== "status") {
  console.error("Unsupported DB agent command: " + command);
  process.exit(2);
}

try {
  const pending = await pendingMigrations();

  if (!pending.length) {
    console.log("READY | no pending migrations");
  } else {
    for (const item of pending) {
      console.log("PENDING | " + item.filename + " | " + item.checksum);
    }
  }

  console.log(
    JSON.stringify(
      { ok: true, pendingCount: pending.length, pending },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
