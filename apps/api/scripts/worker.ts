import { db } from "../src/db.js";
import { schedulerTick } from "../src/services/schedulerService.js";
import { refreshDueSocialTokens } from "../src/services/socialTokenRefreshService.js";

const intervalMs = Number(process.env.PULSE_WORKER_INTERVAL_MS ?? 30000);
const tokenRefreshIntervalMs = Number(
  process.env.PULSE_TOKEN_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000
);

let stopping = false;
let lastTokenRefreshAt = 0;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(JSON.stringify({
    service: "pulse-worker",
    intervalMs,
    tokenRefreshIntervalMs,
    status: "started"
  }));

  while (!stopping) {
    const startedAt = Date.now();

    try {
      let tokenRefresh: Array<Record<string, unknown>> = [];
      if (startedAt - lastTokenRefreshAt >= tokenRefreshIntervalMs) {
        tokenRefresh = await refreshDueSocialTokens();
        lastTokenRefreshAt = startedAt;
      }

      const result = await schedulerTick();

      if (
        tokenRefresh.length ||
        result.polled.length ||
        result.published.length
      ) {
        console.log(JSON.stringify({
          service: "pulse-worker",
          elapsedMs: Date.now() - startedAt,
          tokenRefresh,
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
