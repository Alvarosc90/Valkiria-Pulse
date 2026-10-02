import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { ensureDefaultSubscription } from "./subscription.js";

export type BillingMetric =
  | "brands"
  | "socialAccounts"
  | "scheduledPostsPerMonth"
  | "teamMembers"
  | "aiGenerationsPerMonth";

function limitFrom(plan: any, metric: BillingMetric): number | null {
  const value = Number(plan?.limits?.[metric]);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

export async function getMonthlyUsage(tenantId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT metric_key, usage_value
     FROM tenant_usage_monthly
     WHERE tenant_id = ?
       AND usage_month = DATE_FORMAT(UTC_DATE(), '%Y-%m-01')`,
    [tenantId]
  );

  return Object.fromEntries(
    rows.map((row) => [String(row.metric_key), Number(row.usage_value)])
  );
}

export async function incrementMonthlyUsage(
  tenantId: number,
  metric: Extract<BillingMetric, "scheduledPostsPerMonth" | "aiGenerationsPerMonth">,
  amount = 1
) {
  await db.execute(
    `INSERT INTO tenant_usage_monthly
     (tenant_id, usage_month, metric_key, usage_value)
     VALUES (?, DATE_FORMAT(UTC_DATE(), '%Y-%m-01'), ?, ?)
     ON DUPLICATE KEY UPDATE usage_value = usage_value + VALUES(usage_value)`,
    [tenantId, metric, amount]
  );
}

export async function assertPlanLimit(input: {
  tenantId: number;
  metric: BillingMetric;
  currentValue?: number;
  increment?: number;
}) {
  const subscription = await ensureDefaultSubscription(input.tenantId);
  if (!subscription) {
    throw new HttpError("No hay plan activo", 402, "BILLING_PLAN_REQUIRED");
  }

  if (!["trial", "active"].includes(subscription.status)) {
    throw new HttpError(
      "La suscripcion no esta activa",
      402,
      "BILLING_SUBSCRIPTION_INACTIVE"
    );
  }

  const limit = limitFrom(subscription.plan, input.metric);
  if (limit == null) return subscription;

  let current = input.currentValue;
  if (current == null) {
    const usage = await getMonthlyUsage(input.tenantId);
    current = Number(usage[input.metric] ?? 0);
  }

  const next = current + (input.increment ?? 1);
  if (next > limit) {
    throw new HttpError(
      `Se alcanzo el limite del plan para ${input.metric}`,
      402,
      "BILLING_LIMIT_REACHED"
    );
  }

  return subscription;
}
