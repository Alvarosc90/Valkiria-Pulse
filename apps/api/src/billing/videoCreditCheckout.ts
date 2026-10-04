import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import {
  createMercadoPagoOneTimeCheckout,
  mercadoPagoStatus
} from "./mercadoPago.js";
import { getTenantSubscription } from "./subscription.js";

type PackPriceRow = RowDataPacket & {
  price_id: number;
  pack_key: string;
  pack_name: string;
  credits: number | string;
  currency: string;
  unit_amount_minor: number | string;
};

type CheckoutRow = RowDataPacket & {
  id: string;
  tenant_id: number;
  requested_by_user_id: number;
  pack_key: string;
  pack_price_id: number;
  credits: number | string;
  provider: string | null;
  status: string;
  idempotency_key: string;
  external_session_id: string | null;
  checkout_url: string | null;
  provider_status: string | null;
  expires_at: Date | null;
};

async function assertEntitled(tenantId: number) {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !["trial", "active"].includes(subscription.status)) {
    throw new HttpError(
      "Necesitás una suscripción activa para comprar Video Credits",
      402,
      "VIDEO_CREDITS_SUBSCRIPTION_REQUIRED"
    );
  }
  if (!subscription.plan?.entitlements?.video_credit_purchases?.enabled) {
    throw new HttpError(
      "Tu plan no habilita la compra de Video Credits",
      403,
      "VIDEO_CREDITS_NOT_ENTITLED"
    );
  }
}

export async function prepareVideoCreditCheckout(input: {
  tenantId: number;
  userId: number;
  packKey: string;
  currency: string;
  idempotencyKey: string;
}) {
  await assertEntitled(input.tenantId);

  const [prices] = await db.query<PackPriceRow[]>(
    `SELECT pp.id AS price_id, p.pack_key, p.name AS pack_name, p.credits,
            pp.currency, pp.unit_amount_minor
     FROM video_credit_packs p
     INNER JOIN video_credit_pack_prices pp ON pp.pack_key = p.pack_key
     WHERE p.pack_key = ?
       AND p.status = 'active'
       AND pp.status = 'active'
       AND pp.currency = ?
     LIMIT 1`,
    [input.packKey, input.currency.toUpperCase()]
  );
  const price = prices[0];
  if (!price) {
    throw new HttpError(
      "El pack de Video Credits no está disponible en esa moneda",
      409,
      "VIDEO_CREDIT_PACK_PRICE_NOT_FOUND"
    );
  }

  const id = randomUUID();
  const [insert] = await db.execute<ResultSetHeader>(
    `INSERT IGNORE INTO video_credit_checkout_sessions
     (id, tenant_id, requested_by_user_id, pack_key, pack_price_id,
      credits, status, idempotency_key, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'prepared', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`,
    [
      id,
      input.tenantId,
      input.userId,
      input.packKey,
      price.price_id,
      Number(price.credits),
      input.idempotencyKey
    ]
  );

  const [rows] = await db.query<CheckoutRow[]>(
    `SELECT id, tenant_id, requested_by_user_id, pack_key, pack_price_id,
            credits, provider, status, idempotency_key, external_session_id,
            checkout_url, provider_status, expires_at
     FROM video_credit_checkout_sessions
     WHERE tenant_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [input.tenantId, input.idempotencyKey]
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No se pudo preparar la compra de Video Credits",
      500,
      "VIDEO_CREDIT_CHECKOUT_PREPARE_FAILED"
    );
  }
  if (
    row.pack_key !== input.packKey ||
    Number(row.pack_price_id) !== Number(price.price_id)
  ) {
    throw new HttpError(
      "La clave de idempotencia ya fue utilizada para otro pack",
      409,
      "BILLING_IDEMPOTENCY_CONFLICT"
    );
  }

  return {
    id: row.id,
    reused: insert.affectedRows === 0,
    status: row.status,
    packKey: row.pack_key,
    credits: Number(row.credits),
    price: {
      id: Number(price.price_id),
      currency: price.currency,
      unitAmountMinor: Number(price.unit_amount_minor)
    },
    provider: row.provider,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at
  };
}

export async function startVideoCreditCheckout(input: {
  tenantId: number;
  userId: number;
  packKey: string;
  currency: string;
  idempotencyKey: string;
}) {
  const prepared = await prepareVideoCreditCheckout(input);
  if (
    prepared.status === "pending" &&
    prepared.provider === "mercadopago" &&
    prepared.checkoutUrl
  ) {
    return prepared;
  }
  if (prepared.status === "completed") {
    throw new HttpError(
      "Esta compra de Video Credits ya fue completada",
      409,
      "VIDEO_CREDIT_CHECKOUT_COMPLETED"
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
    `SELECT vcs.id, vcs.pack_key, vcs.credits,
            vcp.name AS pack_name,
            vcpp.currency, vcpp.unit_amount_minor,
            u.email
     FROM video_credit_checkout_sessions vcs
     INNER JOIN video_credit_packs vcp ON vcp.pack_key = vcs.pack_key
     INNER JOIN video_credit_pack_prices vcpp ON vcpp.id = vcs.pack_price_id
     INNER JOIN users u ON u.id = vcs.requested_by_user_id
     WHERE vcs.id = ?
       AND vcs.tenant_id = ?
       AND vcs.requested_by_user_id = ?
     LIMIT 1`,
    [prepared.id, input.tenantId, input.userId]
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No se encontró la compra preparada",
      404,
      "VIDEO_CREDIT_CHECKOUT_NOT_FOUND"
    );
  }

  const result = await createMercadoPagoOneTimeCheckout({
    checkoutSessionId: String(row.id),
    externalReference: "video-credit:" + String(row.id),
    customerEmail: String(row.email),
    itemId: String(row.pack_key),
    title: "Valkiria PULSE · " + String(row.pack_name),
    currency: String(row.currency),
    unitAmountMinor: Number(row.unit_amount_minor),
    idempotencyKey: "pulse-video-" + prepared.id
  });

  await db.execute(
    `UPDATE video_credit_checkout_sessions
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
      result.externalCheckoutId,
      result.checkoutUrl,
      JSON.stringify({
        id: result.raw.id,
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
    externalSessionId: result.externalCheckoutId
  };
}

export async function getVideoCreditCheckout(input: {
  tenantId: number;
  checkoutId: string;
}) {
  await db.execute(
    `UPDATE video_credit_checkout_sessions
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
    `SELECT id, pack_key AS packKey, credits, provider, status,
            provider_status AS providerStatus,
            checkout_url AS checkoutUrl,
            external_session_id AS externalSessionId,
            completed_at AS completedAt,
            expires_at AS expiresAt
     FROM video_credit_checkout_sessions
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.checkoutId, input.tenantId]
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "Compra de Video Credits no encontrada",
      404,
      "VIDEO_CREDIT_CHECKOUT_NOT_FOUND"
    );
  }
  return row;
}

export async function findVideoCreditCheckoutByReference(reference: string) {
  const checkoutId = reference.startsWith("video-credit:")
    ? reference.slice("video-credit:".length)
    : "";
  if (!checkoutId) return null;

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT vcs.id, vcs.tenant_id, vcs.pack_key, vcs.pack_price_id,
            vcs.credits, vcs.status AS checkout_status,
            vcpp.currency, vcpp.unit_amount_minor
     FROM video_credit_checkout_sessions vcs
     INNER JOIN video_credit_pack_prices vcpp ON vcpp.id = vcs.pack_price_id
     WHERE vcs.id = ?
     LIMIT 1`,
    [checkoutId]
  );
  return rows[0] ?? null;
}

export async function settleVideoCreditCheckout(input: {
  row: RowDataPacket;
  paymentId: string;
  paymentStatus: string;
  currency?: string | null;
  amount?: number | string | null;
}) {
  const expectedCurrency = String(input.row.currency).toUpperCase();
  const actualCurrency = String(input.currency ?? "").toUpperCase();
  const expectedAmount = Number((Number(input.row.unit_amount_minor) / 100).toFixed(2));
  const actualAmount = Number(input.amount);

  if (
    expectedCurrency !== actualCurrency ||
    !Number.isFinite(actualAmount) ||
    Math.abs(expectedAmount - actualAmount) > 0.005
  ) {
    throw new HttpError(
      "El importe del pack confirmado por Mercado Pago no coincide",
      409,
      "VIDEO_CREDIT_PROVIDER_AMOUNT_MISMATCH"
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [checkoutRows] = await connection.query<RowDataPacket[]>(
      `SELECT status, credits
       FROM video_credit_checkout_sessions
       WHERE id = ?
       FOR UPDATE`,
      [input.row.id]
    );
    const checkout = checkoutRows[0];
    if (!checkout) {
      throw new HttpError(
        "Compra de Video Credits no encontrada",
        404,
        "VIDEO_CREDIT_CHECKOUT_NOT_FOUND"
      );
    }
    if (checkout.status === "completed") {
      await connection.rollback();
      return { credited: false, duplicate: true, credits: Number(checkout.credits) };
    }

    const credits = Number(checkout.credits);

    await connection.execute(
      `INSERT IGNORE INTO tenant_video_credit_wallets
       (tenant_id, available_credits, reserved_credits)
       VALUES (?, 0, 0)`,
      [input.row.tenant_id]
    );
    await connection.execute(
      `UPDATE tenant_video_credit_wallets
       SET available_credits = available_credits + ?,
           lifetime_purchased_credits = lifetime_purchased_credits + ?
       WHERE tenant_id = ?`,
      [credits, credits, input.row.tenant_id]
    );
    await connection.execute(
      `INSERT INTO video_credit_ledger
       (tenant_id, entry_type, available_delta, reserved_delta,
        checkout_id, note, metadata_json)
       VALUES (?, 'purchase', ?, 0, ?, ?, ?)`,
      [
        input.row.tenant_id,
        credits,
        input.row.id,
        "Compra de Video Credits acreditada",
        JSON.stringify({
          paymentId: input.paymentId,
          paymentStatus: input.paymentStatus,
          currency: actualCurrency,
          amount: actualAmount
        })
      ]
    );
    await connection.execute(
      `UPDATE video_credit_checkout_sessions
       SET status = 'completed',
           provider = 'mercadopago',
           provider_status = ?,
           completed_at = COALESCE(completed_at, UTC_TIMESTAMP()),
           provider_payload_json = ?
       WHERE id = ?`,
      [
        input.paymentStatus,
        JSON.stringify({
          paymentId: input.paymentId,
          paymentStatus: input.paymentStatus
        }),
        input.row.id
      ]
    );

    await connection.commit();
    return { credited: true, duplicate: false, credits };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateVideoCreditCheckoutPaymentState(input: {
  row: RowDataPacket;
  paymentId: string;
  paymentStatus: string;
  state: "pending" | "failed";
}) {
  await db.execute(
    `UPDATE video_credit_checkout_sessions
     SET status = ?,
         provider = 'mercadopago',
         provider_status = ?,
         provider_payload_json = ?
     WHERE id = ?
       AND status IN ('prepared','pending')`,
    [
      input.state,
      input.paymentStatus,
      JSON.stringify({
        paymentId: input.paymentId,
        paymentStatus: input.paymentStatus
      }),
      input.row.id
    ]
  );
}
