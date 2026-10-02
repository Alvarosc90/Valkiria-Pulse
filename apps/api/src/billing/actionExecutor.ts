import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import {
  mapMercadoPagoSubscriptionStatus,
  updateMercadoPagoSubscription
} from "./mercadoPago.js";

type ActionRow = RowDataPacket & {
  id: string;
  tenant_id: number;
  requested_by_user_id: number;
  action_type: "pause" | "resume" | "cancel" | "change_plan";
  current_plan_key: string;
  target_plan_key: string | null;
  target_price_id: number | null;
  status: string;
  expires_at: Date | null;
  subscription_status: string;
  provider: string | null;
  external_subscription_id: string | null;
  billing_interval: "monthly" | "yearly" | null;
  currency: string | null;
};

export async function executeSubscriptionAction(input: {
  tenantId: number;
  userId: number;
  actionId: string;
}) {
  const [rows] = await db.query<ActionRow[]>(
    `SELECT
       bsa.id, bsa.tenant_id, bsa.requested_by_user_id,
       bsa.action_type, bsa.current_plan_key, bsa.target_plan_key,
       bsa.target_price_id, bsa.status, bsa.expires_at,
       ts.status AS subscription_status, ts.provider,
       ts.external_subscription_id, ts.billing_interval, ts.currency
     FROM billing_subscription_actions bsa
     INNER JOIN tenant_subscriptions ts ON ts.tenant_id = bsa.tenant_id
     WHERE bsa.id = ?
       AND bsa.tenant_id = ?
       AND bsa.requested_by_user_id = ?
     LIMIT 1`,
    [input.actionId, input.tenantId, input.userId]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "Acción de suscripción no encontrada",
      404,
      "BILLING_ACTION_NOT_FOUND"
    );
  }

  if (row.status === "succeeded") {
    return {
      id: row.id,
      status: row.status,
      action: row.action_type,
      reused: true
    };
  }

  if (!["prepared", "pending"].includes(row.status)) {
    throw new HttpError(
      "La acción ya no puede ejecutarse",
      409,
      "BILLING_ACTION_STATE_INVALID"
    );
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await db.execute(
      "UPDATE billing_subscription_actions SET status = 'failed', error_message = 'expired' WHERE id = ?",
      [row.id]
    );
    throw new HttpError(
      "La acción venció. Volvé a intentarlo.",
      409,
      "BILLING_ACTION_EXPIRED"
    );
  }

  if (row.action_type === "cancel" && row.subscription_status === "trial" && !row.provider) {
    await db.execute(
      `UPDATE tenant_subscriptions
       SET status = 'cancelled',
           cancel_at_period_end = 0
       WHERE tenant_id = ? AND status = 'trial'`,
      [input.tenantId]
    );
    await db.execute(
      `UPDATE billing_subscription_actions
       SET status = 'succeeded',
           completed_at = UTC_TIMESTAMP(),
           provider = 'local'
       WHERE id = ?`,
      [row.id]
    );
    return {
      id: row.id,
      status: "succeeded",
      action: row.action_type,
      provider: "local"
    };
  }

  if (row.provider !== "mercadopago" || !row.external_subscription_id) {
    throw new HttpError(
      "La suscripción todavía no tiene un proveedor de cobro administrable",
      409,
      "BILLING_PROVIDER_SUBSCRIPTION_MISSING"
    );
  }

  let body: Record<string, unknown> = {};
  let targetPrice:
    | {
        id: number;
        planKey: string;
        planName: string;
        currency: string;
        interval: "monthly" | "yearly";
        amountMinor: number;
      }
    | null = null;

  if (row.action_type === "pause") body = { status: "paused" };
  if (row.action_type === "resume") body = { status: "authorized" };
  if (row.action_type === "cancel") body = { status: "cancelled" };

  if (row.action_type === "change_plan") {
    if (!row.target_plan_key || !row.target_price_id) {
      throw new HttpError(
        "Falta el plan destino",
        400,
        "BILLING_TARGET_PLAN_REQUIRED"
      );
    }

    const [prices] = await db.query<RowDataPacket[]>(
      `SELECT spp.id, spp.plan_key, spp.currency, spp.billing_interval,
              spp.unit_amount_minor, sp.name AS plan_name
       FROM saas_plan_prices spp
       INNER JOIN saas_plans sp ON sp.plan_key = spp.plan_key
       WHERE spp.id = ?
         AND spp.plan_key = ?
         AND spp.status = 'active'
       LIMIT 1`,
      [row.target_price_id, row.target_plan_key]
    );

    const price = prices[0];
    if (!price) {
      throw new HttpError(
        "El precio destino ya no está disponible",
        409,
        "BILLING_PRICE_NOT_CONFIGURED"
      );
    }

    targetPrice = {
      id: Number(price.id),
      planKey: String(price.plan_key),
      planName: String(price.plan_name),
      currency: String(price.currency),
      interval: price.billing_interval as "monthly" | "yearly",
      amountMinor: Number(price.unit_amount_minor)
    };

    if (
      row.billing_interval !== targetPrice.interval ||
      String(row.currency ?? "").toUpperCase() !== targetPrice.currency.toUpperCase()
    ) {
      throw new HttpError(
        "Para cambiar moneda o período de facturación se requiere un nuevo checkout",
        409,
        "BILLING_NEW_CHECKOUT_REQUIRED"
      );
    }

    body = {
      reason: ("Valkiria PULSE · " + targetPrice.planName).slice(0, 120),
      auto_recurring: {
        transaction_amount: Number((targetPrice.amountMinor / 100).toFixed(2)),
        currency_id: targetPrice.currency.toUpperCase()
      }
    };
  }

  await db.execute(
    `UPDATE billing_subscription_actions
     SET status = 'pending', provider = 'mercadopago'
     WHERE id = ? AND status = 'prepared'`,
    [row.id]
  );

  try {
    const providerResult = await updateMercadoPagoSubscription(
      row.external_subscription_id,
      body
    );

    const mapped = mapMercadoPagoSubscriptionStatus(providerResult.status);

    if (targetPrice) {
      await db.execute(
        `UPDATE tenant_subscriptions
         SET plan_key = ?,
             plan_price_id = ?,
             billing_interval = ?,
             currency = ?,
             status = CASE
               WHEN ? = 'active' THEN 'active'
               WHEN ? = 'paused' THEN 'paused'
               WHEN ? = 'cancelled' THEN 'cancelled'
               ELSE status
             END,
             metadata_json = ?,
             last_provider_sync_at = UTC_TIMESTAMP()
         WHERE tenant_id = ?`,
        [
          targetPrice.planKey,
          targetPrice.id,
          targetPrice.interval,
          targetPrice.currency,
          mapped,
          mapped,
          mapped,
          JSON.stringify({ providerStatus: providerResult.status }),
          input.tenantId
        ]
      );
    } else if (mapped !== "unknown" && mapped !== "pending") {
      await db.execute(
        `UPDATE tenant_subscriptions
         SET status = ?,
             metadata_json = ?,
             last_provider_sync_at = UTC_TIMESTAMP()
         WHERE tenant_id = ?`,
        [
          mapped,
          JSON.stringify({ providerStatus: providerResult.status }),
          input.tenantId
        ]
      );
    }

    await db.execute(
      `UPDATE billing_subscription_actions
       SET status = 'succeeded',
           provider_payload_json = ?,
           completed_at = UTC_TIMESTAMP(),
           error_message = NULL
       WHERE id = ?`,
      [
        JSON.stringify({
          id: providerResult.id,
          status: providerResult.status,
          lastModified: providerResult.last_modified
        }),
        row.id
      ]
    );

    return {
      id: row.id,
      action: row.action_type,
      status: "succeeded",
      provider: "mercadopago",
      subscriptionStatus: mapped
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.execute(
      `UPDATE billing_subscription_actions
       SET status = 'failed', error_message = ?
       WHERE id = ?`,
      [message.slice(0, 1000), row.id]
    );
    throw error;
  }
}
