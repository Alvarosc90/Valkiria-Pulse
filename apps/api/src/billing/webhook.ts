import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import {
  getMercadoPagoPayment,
  getMercadoPagoSubscription,
  mapMercadoPagoSubscriptionStatus,
  validateMercadoPagoSignature
} from "./mercadoPago.js";

type CheckoutRow = RowDataPacket & {
  id: string;
  tenant_id: number;
  plan_key: string;
  plan_price_id: number;
  provider: string | null;
  external_session_id: string | null;
  checkout_status: string;
  currency: string;
  billing_interval: "monthly" | "yearly";
  unit_amount_minor: number | string;
};

function payloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}

async function recordEvent(input: {
  eventId: string;
  eventType: string;
  payload: unknown;
}) {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT IGNORE INTO billing_webhook_events
     (provider, external_event_id, event_type, payload_sha256, status)
     VALUES ('mercadopago', ?, ?, ?, 'received')`,
    [
      input.eventId.slice(0, 190),
      input.eventType.slice(0, 120),
      payloadHash(input.payload)
    ]
  );

  return result.affectedRows === 1;
}

async function finishEvent(input: {
  eventId: string;
  tenantId?: number | null;
  status: "processed" | "failed" | "ignored";
  error?: string | null;
}) {
  await db.execute(
    `UPDATE billing_webhook_events
     SET tenant_id = COALESCE(?, tenant_id),
         status = ?,
         error_message = ?,
         processed_at = UTC_TIMESTAMP()
     WHERE provider = 'mercadopago'
       AND external_event_id = ?`,
    [
      input.tenantId ?? null,
      input.status,
      input.error?.slice(0, 1000) ?? null,
      input.eventId.slice(0, 190)
    ]
  );
}

async function checkoutByReference(reference: string) {
  const [rows] = await db.query<CheckoutRow[]>(
    `SELECT
       bcs.id,
       bcs.tenant_id,
       bcs.plan_key,
       bcs.plan_price_id,
       bcs.provider,
       bcs.external_session_id,
       bcs.status AS checkout_status,
       spp.currency,
       spp.billing_interval,
       spp.unit_amount_minor
     FROM billing_checkout_sessions bcs
     INNER JOIN saas_plan_prices spp ON spp.id = bcs.plan_price_id
     WHERE bcs.id = ?
     LIMIT 1`,
    [reference]
  );

  return rows[0] ?? null;
}

function expectedAmount(row: CheckoutRow) {
  return Number((Number(row.unit_amount_minor) / 100).toFixed(2));
}

function assertCommercialMatch(input: {
  row: CheckoutRow;
  currency?: string | null;
  amount?: number | string | null;
  frequency?: number | null;
  frequencyType?: string | null;
}) {
  const expectedCurrency = input.row.currency.toUpperCase();
  const actualCurrency = String(input.currency ?? "").toUpperCase();
  const expected = expectedAmount(input.row);
  const actual = Number(input.amount);

  if (
    actualCurrency !== expectedCurrency ||
    !Number.isFinite(actual) ||
    Math.abs(actual - expected) > 0.005
  ) {
    throw new HttpError(
      "El importe confirmado por Mercado Pago no coincide con el checkout",
      409,
      "BILLING_PROVIDER_AMOUNT_MISMATCH"
    );
  }

  if (input.frequency != null || input.frequencyType != null) {
    const expectedFrequency = input.row.billing_interval === "yearly" ? 12 : 1;
    if (
      Number(input.frequency) !== expectedFrequency ||
      String(input.frequencyType ?? "").toLowerCase() !== "months"
    ) {
      throw new HttpError(
        "La frecuencia confirmada por Mercado Pago no coincide con el plan",
        409,
        "BILLING_PROVIDER_INTERVAL_MISMATCH"
      );
    }
  }
}

async function activateSubscription(input: {
  row: CheckoutRow;
  externalSubscriptionId: string;
  externalCustomerId?: string | null;
  currentPeriodStart?: string | Date | null;
  currentPeriodEnd?: string | Date | null;
  providerStatus: string;
}) {
  const start = input.currentPeriodStart
    ? new Date(input.currentPeriodStart)
    : new Date();
  const end = input.currentPeriodEnd
    ? new Date(input.currentPeriodEnd)
    : null;

  await db.execute(
    `UPDATE tenant_subscriptions
     SET plan_key = ?,
         plan_price_id = ?,
         billing_interval = ?,
         currency = ?,
         status = 'active',
         provider = 'mercadopago',
         external_customer_id = ?,
         external_subscription_id = ?,
         trial_ends_at = NULL,
         current_period_start = ?,
         current_period_end = ?,
         cancel_at_period_end = 0,
         metadata_json = ?,
         last_provider_sync_at = UTC_TIMESTAMP()
     WHERE tenant_id = ?`,
    [
      input.row.plan_key,
      input.row.plan_price_id,
      input.row.billing_interval,
      input.row.currency,
      input.externalCustomerId ?? null,
      input.externalSubscriptionId,
      Number.isNaN(start.getTime()) ? new Date() : start,
      end && !Number.isNaN(end.getTime()) ? end : null,
      JSON.stringify({ providerStatus: input.providerStatus }),
      input.row.tenant_id
    ]
  );

  await db.execute(
    `UPDATE billing_checkout_sessions
     SET status = 'completed',
         provider = 'mercadopago',
         provider_status = ?,
         completed_at = COALESCE(completed_at, UTC_TIMESTAMP())
     WHERE id = ?`,
    [input.providerStatus, input.row.id]
  );
}

async function processPreapproval(dataId: string) {
  const subscription = await getMercadoPagoSubscription(dataId);
  const externalReference = String(subscription.external_reference ?? "").trim();

  if (!externalReference) {
    return { matched: false as const, reason: "external_reference_missing" };
  }

  const row = await checkoutByReference(externalReference);
  if (!row) {
    return { matched: false as const, reason: "checkout_not_found" };
  }

  if (
    row.external_session_id &&
    String(row.external_session_id) !== String(subscription.id ?? dataId)
  ) {
    throw new HttpError(
      "La suscripción no coincide con el checkout registrado",
      409,
      "BILLING_PROVIDER_SUBSCRIPTION_MISMATCH"
    );
  }

  const providerStatus = String(subscription.status ?? "unknown");
  const mapped = mapMercadoPagoSubscriptionStatus(providerStatus);

  if (mapped === "active") {
    assertCommercialMatch({
      row,
      currency: subscription.auto_recurring?.currency_id,
      amount: subscription.auto_recurring?.transaction_amount,
      frequency: subscription.auto_recurring?.frequency,
      frequencyType: subscription.auto_recurring?.frequency_type
    });

    await activateSubscription({
      row,
      externalSubscriptionId: String(subscription.id ?? dataId),
      externalCustomerId:
        subscription.payer_id == null ? null : String(subscription.payer_id),
      currentPeriodStart: subscription.date_created ?? null,
      currentPeriodEnd: subscription.next_payment_date ?? null,
      providerStatus
    });
  } else if (mapped === "pending") {
    await db.execute(
      `UPDATE billing_checkout_sessions
       SET status = 'pending',
           provider = 'mercadopago',
           provider_status = ?
       WHERE id = ?`,
      [providerStatus, row.id]
    );
  } else if (mapped === "paused" || mapped === "cancelled") {
    await db.execute(
      `UPDATE tenant_subscriptions
       SET status = ?,
           last_provider_sync_at = UTC_TIMESTAMP(),
           metadata_json = ?
       WHERE tenant_id = ?
         AND provider = 'mercadopago'
         AND external_subscription_id = ?`,
      [
        mapped,
        JSON.stringify({ providerStatus }),
        row.tenant_id,
        String(subscription.id ?? dataId)
      ]
    );

    await db.execute(
      `UPDATE billing_checkout_sessions
       SET provider_status = ?,
           status = CASE WHEN ? = 'cancelled' THEN 'cancelled' ELSE status END
       WHERE id = ?`,
      [providerStatus, mapped, row.id]
    );
  }

  return {
    matched: true as const,
    tenantId: row.tenant_id,
    checkoutId: row.id,
    status: mapped,
    providerStatus
  };
}

async function processPayment(dataId: string) {
  const payment = await getMercadoPagoPayment(dataId);
  const externalReference = String(payment?.external_reference ?? "").trim();
  if (!externalReference) {
    return { matched: false as const, reason: "external_reference_missing" };
  }

  const row = await checkoutByReference(externalReference);
  if (!row) {
    return { matched: false as const, reason: "checkout_not_found" };
  }

  const status = String(payment?.status ?? "unknown").toLowerCase();

  if (status === "approved") {
    assertCommercialMatch({
      row,
      currency: payment?.currency_id,
      amount: payment?.transaction_amount
    });

    if (!row.external_session_id) {
      throw new HttpError(
        "El checkout no tiene suscripción externa asociada",
        409,
        "BILLING_PROVIDER_SUBSCRIPTION_MISSING"
      );
    }

    await activateSubscription({
      row,
      externalSubscriptionId: row.external_session_id,
      externalCustomerId:
        payment?.payer?.id == null ? null : String(payment.payer.id),
      currentPeriodStart: payment?.date_approved ?? payment?.date_created ?? null,
      currentPeriodEnd: null,
      providerStatus: "authorized"
    });
  } else if (
    ["rejected", "cancelled", "cancelled_by_collector", "refunded", "charged_back"].includes(status)
  ) {
    await db.execute(
      `UPDATE tenant_subscriptions
       SET status = 'past_due',
           last_provider_sync_at = UTC_TIMESTAMP(),
           metadata_json = ?
       WHERE tenant_id = ?
         AND provider = 'mercadopago'
         AND status = 'active'`,
      [
        JSON.stringify({
          lastPaymentStatus: status,
          lastPaymentId: String(payment?.id ?? dataId)
        }),
        row.tenant_id
      ]
    );
  }

  return {
    matched: true as const,
    tenantId: row.tenant_id,
    checkoutId: row.id,
    paymentStatus: status
  };
}

export async function processMercadoPagoWebhook(input: {
  dataId: string;
  type: string;
  action?: string | null;
  xSignature?: string | null;
  xRequestId?: string | null;
  payload: unknown;
}) {
  validateMercadoPagoSignature({
    xSignature: input.xSignature,
    xRequestId: input.xRequestId,
    dataId: input.dataId
  });

  const eventType = String(input.type || "unknown").toLowerCase();
  const requestId = String(input.xRequestId ?? "").trim();
  const eventId = (
    eventType + ":" +
    requestId + ":" +
    String(input.action ?? "")
  ).slice(0, 190);

  const fresh = await recordEvent({
    eventId,
    eventType,
    payload: input.payload
  });

  if (!fresh) {
    return { duplicate: true, matched: false };
  }

  try {
    let result: any;

    if (eventType === "subscription_preapproval") {
      result = await processPreapproval(input.dataId);
    } else if (eventType === "payment") {
      result = await processPayment(input.dataId);
    } else {
      await finishEvent({
        eventId,
        status: "ignored",
        error: "Unsupported Mercado Pago topic: " + eventType
      });
      return {
        duplicate: false,
        matched: false,
        ignored: true,
        type: eventType
      };
    }

    await finishEvent({
      eventId,
      tenantId: result.tenantId ?? null,
      status: result.matched ? "processed" : "ignored",
      error: result.matched ? null : result.reason ?? "not matched"
    });

    return {
      duplicate: false,
      ...result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishEvent({
      eventId,
      status: "failed",
      error: message
    });
    throw error;
  }
}
