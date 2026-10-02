import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { getTenantSubscription } from "./subscription.js";

export type BillingAction = "pause" | "resume" | "cancel" | "change_plan";

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
    (row.target_plan_key ?? null) !== (input.targetPlanKey ?? null)
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
