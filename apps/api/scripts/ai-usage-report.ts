import type { RowDataPacket } from "mysql2";
import { db } from "../src/db.js";

type UsageRow = RowDataPacket & {
  tenant_id: number;
  provider: string;
  model: string;
  requests: number;
  successful_requests: number;
  failed_requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
};

async function main() {
  const [rows] = await db.query<UsageRow[]>(
    `SELECT
       tenant_id,
       provider,
       model,
       COUNT(*) AS requests,
       SUM(status = 'success') AS successful_requests,
       SUM(status = 'failed') AS failed_requests,
       SUM(input_tokens) AS input_tokens,
       SUM(cached_input_tokens) AS cached_input_tokens,
       SUM(output_tokens) AS output_tokens,
       SUM(total_tokens) AS total_tokens,
       SUM(estimated_cost_usd) AS estimated_cost_usd
     FROM ai_usage_events
     WHERE created_at >= DATE_FORMAT(UTC_DATE(), '%Y-%m-01')
     GROUP BY tenant_id, provider, model
     ORDER BY estimated_cost_usd DESC, tenant_id ASC`
  );

  const data = rows.map((row) => ({
    tenantId: Number(row.tenant_id),
    provider: String(row.provider),
    model: String(row.model),
    requests: Number(row.requests),
    successfulRequests: Number(row.successful_requests),
    failedRequests: Number(row.failed_requests),
    inputTokens: Number(row.input_tokens),
    cachedInputTokens: Number(row.cached_input_tokens),
    outputTokens: Number(row.output_tokens),
    totalTokens: Number(row.total_tokens),
    estimatedCostUsd: Number(row.estimated_cost_usd)
  }));

  const totals = data.reduce(
    (acc, item) => {
      acc.requests += item.requests;
      acc.totalTokens += item.totalTokens;
      acc.estimatedCostUsd += item.estimatedCostUsd;
      return acc;
    },
    { requests: 0, totalTokens: 0, estimatedCostUsd: 0 }
  );

  console.log(JSON.stringify({
    month: new Date().toISOString().slice(0, 7),
    totals: {
      ...totals,
      estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(6))
    },
    tenants: data
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
