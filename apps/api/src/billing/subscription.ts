import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";

function jsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function jsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getTenantSubscription(tenantId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       ts.tenant_id, ts.plan_key, ts.plan_price_id,
       ts.billing_interval, ts.currency,
       ts.status, ts.provider,
       ts.external_customer_id, ts.external_subscription_id,
       ts.trial_ends_at, ts.current_period_start, ts.current_period_end,
       ts.cancel_at_period_end, ts.metadata_json,
       sp.name AS plan_name, sp.description AS plan_description,
       sp.limits_json, sp.features_json
     FROM tenant_subscriptions ts
     INNER JOIN saas_plans sp ON sp.plan_key = ts.plan_key
     WHERE ts.tenant_id = ?
     LIMIT 1`,
    [tenantId]
  );

  const row = rows[0];
  if (!row) return null;

  const [entitlements] = await db.query<RowDataPacket[]>(
    `SELECT entitlement_key, enabled, limit_value
     FROM saas_plan_entitlements
     WHERE plan_key = ?
     ORDER BY entitlement_key`,
    [row.plan_key]
  );

  return {
    tenantId: String(row.tenant_id),
    plan: {
      key: row.plan_key,
      name: row.plan_name,
      description: row.plan_description,
      limits: jsonObject(row.limits_json),
      features: jsonArray(row.features_json).filter((item): item is string => typeof item === "string"),
      entitlements: Object.fromEntries(
        entitlements.map((item) => [
          item.entitlement_key,
          {
            enabled: Boolean(item.enabled),
            limit: item.limit_value == null ? null : Number(item.limit_value)
          }
        ])
      )
    },
    status: row.status,
    provider: row.provider,
    planPriceId: row.plan_price_id == null ? null : Number(row.plan_price_id),
    billingInterval: row.billing_interval ?? null,
    currency: row.currency ?? null,
    externalCustomerId: row.external_customer_id,
    externalSubscriptionId: row.external_subscription_id,
    trialEndsAt: row.trial_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    metadata: jsonObject(row.metadata_json)
  };
}

export async function ensureDefaultSubscription(tenantId: number) {
  await db.execute(
    `INSERT INTO tenant_subscriptions
     (tenant_id, plan_key, status, trial_ends_at)
     VALUES (?, 'starter', 'trial', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))
     ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id)`,
    [tenantId]
  );

  return getTenantSubscription(tenantId);
}
