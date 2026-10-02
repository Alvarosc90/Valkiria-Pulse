import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

type PriceRow = RowDataPacket & {
  id: number;
  plan_key: string;
  currency: string;
  billing_interval: "monthly" | "yearly";
  unit_amount_minor: number | string;
};

type SessionRow = RowDataPacket & {
  id: string;
  tenant_id: number;
  requested_by_user_id: number;
  plan_key: string;
  plan_price_id: number;
  provider: string | null;
  status: string;
  idempotency_key: string;
  external_session_id: string | null;
  checkout_url: string | null;
  expires_at: Date | null;
  created_at: Date;
};

export async function prepareCheckoutSession(input: {
  tenantId: number;
  userId: number;
  planKey: string;
  currency: string;
  interval: "monthly" | "yearly";
  idempotencyKey: string;
}) {
  const [prices] = await db.query<PriceRow[]>(
    `SELECT id, plan_key, currency, billing_interval, unit_amount_minor
     FROM saas_plan_prices
     WHERE plan_key = ?
       AND currency = ?
       AND billing_interval = ?
       AND status = 'active'
     LIMIT 1`,
    [
      input.planKey,
      input.currency.toUpperCase(),
      input.interval
    ]
  );

  const price = prices[0];
  if (!price) {
    throw new HttpError(
      "El precio comercial todavia no esta configurado",
      409,
      "BILLING_PRICE_NOT_CONFIGURED"
    );
  }

  const id = randomUUID();
  const [insert] = await db.execute<ResultSetHeader>(
    `INSERT IGNORE INTO billing_checkout_sessions
     (id, tenant_id, requested_by_user_id, plan_key, plan_price_id,
      status, idempotency_key, expires_at)
     VALUES (?, ?, ?, ?, ?, 'prepared', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`,
    [
      id,
      input.tenantId,
      input.userId,
      input.planKey,
      price.id,
      input.idempotencyKey
    ]
  );

  const [rows] = await db.query<SessionRow[]>(
    `SELECT id, tenant_id, requested_by_user_id, plan_key, plan_price_id,
            provider, status, idempotency_key, external_session_id,
            checkout_url, expires_at, created_at
     FROM billing_checkout_sessions
     WHERE tenant_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [input.tenantId, input.idempotencyKey]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No se pudo preparar el checkout",
      500,
      "BILLING_CHECKOUT_PREPARE_FAILED"
    );
  }

  if (
    row.plan_key !== input.planKey ||
    Number(row.plan_price_id) !== Number(price.id)
  ) {
    throw new HttpError(
      "La clave de idempotencia ya fue usada para otra seleccion",
      409,
      "BILLING_IDEMPOTENCY_CONFLICT"
    );
  }

  return {
    id: row.id,
    reused: insert.affectedRows === 0,
    status: row.status,
    planKey: row.plan_key,
    price: {
      id: Number(price.id),
      currency: price.currency,
      interval: price.billing_interval,
      unitAmountMinor: Number(price.unit_amount_minor)
    },
    provider: row.provider,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at
  };
}
