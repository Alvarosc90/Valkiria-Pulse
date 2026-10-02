import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";

export type BillingInterval = "monthly" | "yearly";

type PlanRow = RowDataPacket & {
  plan_key: string;
  name: string;
  description: string | null;
  limits_json: string | Record<string, unknown> | null;
  features_json: string | unknown[] | null;
};

type PriceRow = RowDataPacket & {
  id: number;
  plan_key: string;
  currency: string;
  billing_interval: BillingInterval;
  unit_amount_minor: number | string;
  metadata_json: string | Record<string, unknown> | null;
};

type EntitlementRow = RowDataPacket & {
  plan_key: string;
  entitlement_key: string;
  enabled: number;
  limit_value: number | string | null;
};

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

export async function getPlanCatalog(input?: {
  currency?: string | null;
  interval?: BillingInterval | null;
}) {
  const currency = input?.currency?.toUpperCase() ?? null;
  const interval = input?.interval ?? null;

  const [plans, prices, entitlements] = await Promise.all([
    db.query<PlanRow[]>(
      `SELECT plan_key, name, description, limits_json, features_json
       FROM saas_plans
       WHERE status = 'active'
       ORDER BY display_order ASC, plan_key ASC`
    ).then(([rows]) => rows),
    db.query<PriceRow[]>(
      `SELECT id, plan_key, currency, billing_interval, unit_amount_minor, metadata_json
       FROM saas_plan_prices
       WHERE status = 'active'
         AND (? IS NULL OR currency = ?)
         AND (? IS NULL OR billing_interval = ?)
       ORDER BY display_order ASC, id ASC`,
      [currency, currency, interval, interval]
    ).then(([rows]) => rows),
    db.query<EntitlementRow[]>(
      `SELECT plan_key, entitlement_key, enabled, limit_value
       FROM saas_plan_entitlements
       ORDER BY plan_key, entitlement_key`
    ).then(([rows]) => rows)
  ]);

  const pricesByPlan = new Map<string, any[]>();
  for (const row of prices) {
    const list = pricesByPlan.get(row.plan_key) ?? [];
    list.push({
      id: Number(row.id),
      currency: row.currency,
      interval: row.billing_interval,
      unitAmountMinor: Number(row.unit_amount_minor),
      metadata: jsonObject(row.metadata_json)
    });
    pricesByPlan.set(row.plan_key, list);
  }

  const entitlementsByPlan = new Map<string, Record<string, { enabled: boolean; limit: number | null }>>();
  for (const row of entitlements) {
    const current = entitlementsByPlan.get(row.plan_key) ?? {};
    current[row.entitlement_key] = {
      enabled: Boolean(row.enabled),
      limit: row.limit_value == null ? null : Number(row.limit_value)
    };
    entitlementsByPlan.set(row.plan_key, current);
  }

  return plans.map((plan) => ({
    key: plan.plan_key,
    name: plan.name,
    description: plan.description,
    limits: jsonObject(plan.limits_json),
    features: jsonArray(plan.features_json).filter((item): item is string => typeof item === "string"),
    entitlements: entitlementsByPlan.get(plan.plan_key) ?? {},
    prices: pricesByPlan.get(plan.plan_key) ?? []
  }));
}
