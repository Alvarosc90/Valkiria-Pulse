import { schedulerTick } from "../src/services/schedulerService.js";
import { db } from "../src/db.js";

const intervalMs = Number(process.env.PULSE_WORKER_INTERVAL_MS ?? 30000);
let stopping = false;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(JSON.stringify({ service: "pulse-worker", intervalMs, status: "started" }));

  while (!stopping) {
    const startedAt = Date.now();
    try {
      const result = await schedulerTick();
      if (result.polled.length || result.published.length) {
        console.log(JSON.stringify({
          service: "pulse-worker",
          elapsedMs: Date.now() - startedAt,
          ...result
        }));
      }
    } catch (error) {
      console.error("PULSE worker tick failed:", error);
    }

    if (!stopping) await sleep(intervalMs);
  }

  await db.end();
  console.log(JSON.stringify({ service: "pulse-worker", status: "stopped" }));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exitCode = 1;
});
