import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { ensureDefaultSubscription } from "./subscription.js";

export type BillingMetric =
  | "brands"
  | "socialAccounts"
  | "scheduledPostsPerMonth"
  | "teamMembers"
  | "aiGenerationsPerMonth"
  | "mediaStorageBytes";

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

export async function getUsageSnapshot(tenantId: number) {
  const [monthly, brandRows, accountRows, teamRows, mediaStorageBytes] = await Promise.all([
    getMonthlyUsage(tenantId),
    db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM brands WHERE tenant_id = ? AND active = 1",
      [tenantId]
    ).then(([rows]) => Number(rows[0]?.total ?? 0)),
    db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM social_accounts WHERE tenant_id = ?",
      [tenantId]
    ).then(([rows]) => Number(rows[0]?.total ?? 0)),
    db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM user_tenants WHERE tenant_id = ? AND active = 1",
      [tenantId]
    ).then(([rows]) => Number(rows[0]?.total ?? 0)),
    db.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM media_assets WHERE tenant_id = ?",
      [tenantId]
    ).then(([rows]) => Number(rows[0]?.total ?? 0))
  ]);

  return {
    ...monthly,
    brands: brandRows,
    socialAccounts: accountRows,
    teamMembers: teamRows,
    mediaStorageBytes,
    scheduledPostsPerMonth: Number(monthly.scheduledPostsPerMonth ?? 0),
    aiGenerationsPerMonth: Number(monthly.aiGenerationsPerMonth ?? 0)
  };
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
      "La suscripción no está activa",
      402,
      "BILLING_SUBSCRIPTION_INACTIVE"
    );
  }

  if (
    subscription.status === "trial" &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt).getTime() <= Date.now()
  ) {
    await db.execute(
      "UPDATE tenant_subscriptions SET status = 'past_due' WHERE tenant_id = ? AND status = 'trial'",
      [input.tenantId]
    );
    throw new HttpError(
      "La prueba gratuita finalizó. Elegí un plan para continuar.",
      402,
      "BILLING_TRIAL_EXPIRED"
    );
  }

  const limit = limitFrom(subscription.plan, input.metric);
  if (limit == null) return subscription;

  let current = input.currentValue;
  if (current == null) {
    const usage = await getUsageSnapshot(input.tenantId);
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
