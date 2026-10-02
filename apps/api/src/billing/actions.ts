import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { getTenantSubscription } from "./subscription.js";

export type BillingAction = "pause" | "resume" | "cancel" | "change_plan";

function assertActionState(action: BillingAction, status: string) {
  if (action === "pause" && status !== "active") {
    throw new HttpError(
      "Solo una suscripcion activa puede pausarse",
      409,
      "BILLING_ACTION_STATE_INVALID"
    );
  }
  if (action === "resume" && status !== "paused") {
    throw new HttpError(
      "Solo una suscripcion pausada puede reanudarse",
      409,
      "BILLING_ACTION_STATE_INVALID"
    );
  }
  if (
    action === "cancel" &&
    !["trial", "active", "paused", "past_due"].includes(status)
  ) {
    throw new HttpError(
      "La suscripcion no puede cancelarse en su estado actual",
      409,
      "BILLING_ACTION_STATE_INVALID"
    );
  }
  if (
    action === "change_plan" &&
    !["trial", "active"].includes(status)
  ) {
    throw new HttpError(
      "El plan no puede cambiarse en el estado actual",
      409,
      "BILLING_ACTION_STATE_INVALID"
    );
  }
}

export async function prepareSubscriptionAction(input: {
  tenantId: number;
  userId: number;
  action: BillingAction;
  idempotencyKey: string;
  targetPlanKey?: string;
  targetPriceId?: number;
}) {
  const current = await getTenantSubscription(input.tenantId);
  if (!current) {
    throw new HttpError(
      "No hay una suscripcion para administrar",
      404,
      "BILLING_SUBSCRIPTION_NOT_FOUND"
    );
  }

  assertActionState(input.action, current.status);

  if (
    input.action === "change_plan" &&
    (!input.targetPlanKey || !input.targetPriceId)
  ) {
    throw new HttpError(
      "El cambio de plan requiere plan y precio destino",
      400,
      "BILLING_TARGET_PLAN_REQUIRED"
    );
  }

  if (input.action === "change_plan") {
    if (input.targetPlanKey === current.plan.key) {
      throw new HttpError(
        "El plan destino debe ser distinto del plan actual",
        409,
        "BILLING_TARGET_PLAN_SAME"
      );
    }

    const [prices] = await db.query<RowDataPacket[]>(
      `SELECT id
       FROM saas_plan_prices
       WHERE id = ?
         AND plan_key = ?
         AND status = 'active'
       LIMIT 1`,
      [input.targetPriceId!, input.targetPlanKey!]
    );

    if (!prices[0]) {
      throw new HttpError(
        "El precio destino no pertenece al plan seleccionado o no esta activo",
        409,
        "BILLING_PRICE_NOT_CONFIGURED"
      );
    }
  }

  const id = randomUUID();
  const [insert] = await db.execute<ResultSetHeader>(
    `INSERT IGNORE INTO billing_subscription_actions
     (id, tenant_id, requested_by_user_id, action_type,
      current_plan_key, target_plan_key, target_price_id,
      status, idempotency_key, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'prepared', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))`,
    [
      id,
      input.tenantId,
      input.userId,
      input.action,
      current.plan.key,
      input.targetPlanKey ?? null,
      input.targetPriceId ?? null,
      input.idempotencyKey
    ]
  );

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, action_type, current_plan_key, target_plan_key,
            target_price_id, provider, status, expires_at
     FROM billing_subscription_actions
     WHERE tenant_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [input.tenantId, input.idempotencyKey]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No se pudo preparar la accion de suscripcion",
      500,
      "BILLING_ACTION_PREPARE_FAILED"
    );
  }

  if (
    row.action_type !== input.action ||
    row.current_plan_key !== current.plan.key ||
    (row.target_plan_key ?? null) !== (input.targetPlanKey ?? null) ||
    (row.target_price_id == null ? null : Number(row.target_price_id)) !==
      (input.targetPriceId ?? null)
  ) {
    throw new HttpError(
      "La clave de idempotencia ya fue usada para otra accion",
      409,
      "BILLING_IDEMPOTENCY_CONFLICT"
    );
  }

  return {
    id: row.id,
    reused: insert.affectedRows === 0,
    action: row.action_type,
    currentPlanKey: row.current_plan_key,
    targetPlanKey: row.target_plan_key,
    targetPriceId: row.target_price_id == null ? null : Number(row.target_price_id),
    provider: row.provider,
    status: row.status,
    expiresAt: row.expires_at
  };
}
