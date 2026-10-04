import type { RowDataPacket } from "mysql2";
import { config } from "../src/config.js";
import { db } from "../src/db.js";

async function main() {
  const [wallets, purchases, consumption] = await Promise.all([
    db.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS tenants,
         SUM(available_credits) AS available_credits,
         SUM(reserved_credits) AS reserved_credits,
         SUM(lifetime_purchased_credits) AS purchased_credits,
         SUM(lifetime_consumed_credits) AS consumed_credits
       FROM tenant_video_credit_wallets`
    ).then(([rows]) => rows[0] ?? {}),
    db.query<RowDataPacket[]>(
      `SELECT
         vcpp.currency,
         COUNT(*) AS purchases,
         SUM(vcs.credits) AS credits_sold,
         SUM(vcpp.unit_amount_minor) AS revenue_minor
       FROM video_credit_checkout_sessions vcs
       INNER JOIN video_credit_pack_prices vcpp ON vcpp.id = vcs.pack_price_id
       WHERE vcs.status = 'completed'
       GROUP BY vcpp.currency
       ORDER BY vcpp.currency`
    ).then(([rows]) => rows),
    db.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS generations,
         COALESCE(SUM(vcr.requested_units * vmc.provider_cost_usd_per_unit), 0) AS provider_cost_usd,
         COALESCE(SUM(vcr.reserved_credits), 0) AS credits_consumed
       FROM video_credit_reservations vcr
       INNER JOIN video_model_catalog vmc ON vmc.model_key = vcr.model_key
       WHERE vcr.status = 'captured'`
    ).then(([rows]) => rows[0] ?? {})
  ]);

  const purchasedCredits = Number(wallets.purchased_credits ?? 0);
  const consumedCredits = Number(wallets.consumed_credits ?? 0);
  const outstandingCredits =
    Number(wallets.available_credits ?? 0) +
    Number(wallets.reserved_credits ?? 0);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    policy: {
      creditsPerProviderUsd: 100,
      providerBufferTargetUsd: config.PULSE_VIDEO_PROVIDER_BUFFER_USD,
      commerceEnabled: config.PULSE_VIDEO_COMMERCE_ENABLED,
      provider: config.PULSE_VIDEO_PROVIDER
    },
    wallets: {
      tenants: Number(wallets.tenants ?? 0),
      purchasedCredits,
      consumedCredits,
      availableCredits: Number(wallets.available_credits ?? 0),
      reservedCredits: Number(wallets.reserved_credits ?? 0),
      outstandingCredits,
      outstandingProviderBudgetCeilingUsd: Number((outstandingCredits / 100).toFixed(2))
    },
    purchases: purchases.map((row) => ({
      currency: String(row.currency),
      purchases: Number(row.purchases ?? 0),
      creditsSold: Number(row.credits_sold ?? 0),
      revenueMinor: Number(row.revenue_minor ?? 0)
    })),
    generation: {
      completedGenerations: Number(consumption.generations ?? 0),
      creditsConsumed: Number(consumption.credits_consumed ?? 0),
      estimatedProviderCostUsd: Number(Number(consumption.provider_cost_usd ?? 0).toFixed(4))
    }
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
