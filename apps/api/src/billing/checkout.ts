import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { createMercadoPagoSubscription, mercadoPagoStatus } from "./mercadoPago.js";

type PriceRow = RowDataPacket & {
  id: number;
  plan_key: string;
  plan_name?: string;
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


export async function startCheckoutSession(input: {
  tenantId: number;
  userId: number;
  planKey: string;
  currency: string;
  interval: "monthly" | "yearly";
  idempotencyKey: string;
}) {
  const prepared = await prepareCheckoutSession(input);

  if (
    prepared.status === "pending" &&
    prepared.provider === "mercadopago" &&
    prepared.checkoutUrl
  ) {
    return prepared;
  }

  if (prepared.status === "completed") {
    throw new HttpError(
      "Este checkout ya fue completado",
      409,
      "BILLING_CHECKOUT_COMPLETED"
    );
  }

  const provider = mercadoPagoStatus();
  if (!provider.configured) {
    throw new HttpError(
      "Mercado Pago todavía no está configurado para cobros",
      503,
      "MERCADOPAGO_NOT_CONFIGURED"
    );
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT bcs.id, bcs.plan_key, bcs.plan_price_id,
            spp.name AS plan_name,
            sppp.currency, sppp.billing_interval, sppp.unit_amount_minor,
            u.email
     FROM billing_checkout_sessions bcs
     INNER JOIN saas_plans spp ON spp.plan_key = bcs.plan_key
     INNER JOIN saas_plan_prices sppp ON sppp.id = bcs.plan_price_id
     INNER JOIN users u ON u.id = bcs.requested_by_user_id
     WHERE bcs.id = ?
       AND bcs.tenant_id = ?
       AND bcs.requested_by_user_id = ?
     LIMIT 1`,
    [prepared.id, input.tenantId, input.userId]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No se encontró el checkout preparado",
      404,
      "BILLING_CHECKOUT_NOT_FOUND"
    );
  }

  const result = await createMercadoPagoSubscription({
    checkoutSessionId: String(row.id),
    customerEmail: String(row.email),
    planName: String(row.plan_name),
    currency: String(row.currency),
    interval: row.billing_interval as "monthly" | "yearly",
    unitAmountMinor: Number(row.unit_amount_minor),
    idempotencyKey: "pulse-" + prepared.id
  });

  await db.execute(
    `UPDATE billing_checkout_sessions
     SET provider = 'mercadopago',
         status = 'pending',
         provider_status = ?,
         external_session_id = ?,
         checkout_url = ?,
         provider_payload_json = ?,
         expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
     WHERE id = ?
       AND tenant_id = ?
       AND status IN ('prepared','pending')`,
    [
      result.status,
      result.externalSubscriptionId,
      result.checkoutUrl,
      JSON.stringify({
        id: result.raw.id,
        status: result.raw.status,
        externalReference: result.raw.external_reference,
        dateCreated: result.raw.date_created
      }),
      prepared.id,
      input.tenantId
    ]
  );

  return {
    ...prepared,
    status: "pending",
    provider: "mercadopago",
    checkoutUrl: result.checkoutUrl,
    externalSessionId: result.externalSubscriptionId
  };
}

export async function getCheckoutSession(input: {
  tenantId: number;
  checkoutId: string;
}) {
  await db.execute(
    `UPDATE billing_checkout_sessions
     SET status = 'expired',
         provider_status = COALESCE(provider_status, 'expired')
     WHERE id = ?
       AND tenant_id = ?
       AND status IN ('prepared','pending')
       AND expires_at IS NOT NULL
       AND expires_at <= UTC_TIMESTAMP()`,
    [input.checkoutId, input.tenantId]
  );

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, plan_key AS planKey, provider, status,
            provider_status AS providerStatus,
            checkout_url AS checkoutUrl,
            external_session_id AS externalSessionId,
            completed_at AS completedAt,
            expires_at AS expiresAt
     FROM billing_checkout_sessions
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.checkoutId, input.tenantId]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "Checkout no encontrado",
      404,
      "BILLING_CHECKOUT_NOT_FOUND"
    );
  }

  return row;
}
