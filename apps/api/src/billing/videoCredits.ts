import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { getTenantSubscription } from "./subscription.js";

type ModelRow = RowDataPacket & {
  model_key: string;
  provider: string;
  name: string;
  tier: "fast" | "quality" | "premium";
  billing_unit: "second" | "video";
  provider_cost_usd_per_unit: number | string;
  pulse_credits_per_unit: number | string;
  generation_enabled: number;
  metadata_json: string | Record<string, unknown> | null;
  price_verified_at: Date | null;
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

async function assertVideoCreditsAvailableForTenant(tenantId: number) {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !["trial", "active"].includes(subscription.status)) {
    throw new HttpError(
      "Necesitás una suscripción activa de PULSE para usar Video Credits",
      402,
      "VIDEO_CREDITS_SUBSCRIPTION_REQUIRED"
    );
  }

  const entitlement = subscription.plan?.entitlements?.video_credit_purchases;
  if (!entitlement?.enabled) {
    throw new HttpError(
      "Tu plan no habilita Video Credits",
      403,
      "VIDEO_CREDITS_NOT_ENTITLED"
    );
  }

  return subscription;
}

async function ensureWallet(connection: PoolConnection, tenantId: number) {
  await connection.execute(
    `INSERT IGNORE INTO tenant_video_credit_wallets
     (tenant_id, available_credits, reserved_credits)
     VALUES (?, 0, 0)`,
    [tenantId]
  );
}

export async function getVideoCreditWallet(tenantId: number) {
  const connection = await db.getConnection();
  try {
    await ensureWallet(connection, tenantId);
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT available_credits, reserved_credits,
              lifetime_purchased_credits, lifetime_consumed_credits
       FROM tenant_video_credit_wallets
       WHERE tenant_id = ?
       LIMIT 1`,
      [tenantId]
    );
    const row = rows[0];
    return {
      availableCredits: Number(row?.available_credits ?? 0),
      reservedCredits: Number(row?.reserved_credits ?? 0),
      lifetimePurchasedCredits: Number(row?.lifetime_purchased_credits ?? 0),
      lifetimeConsumedCredits: Number(row?.lifetime_consumed_credits ?? 0)
    };
  } finally {
    connection.release();
  }
}

export async function getVideoCreditCatalog(currency = "ARS") {
  const normalizedCurrency = currency.toUpperCase();
  const [packs, models] = await Promise.all([
    db.query<RowDataPacket[]>(
      `SELECT p.pack_key, p.name, p.description, p.credits, p.metadata_json,
              pp.id AS price_id, pp.currency, pp.unit_amount_minor, pp.metadata_json AS price_metadata_json
       FROM video_credit_packs p
       LEFT JOIN video_credit_pack_prices pp
         ON pp.pack_key = p.pack_key
        AND pp.status = 'active'
        AND pp.currency = ?
       WHERE p.status = 'active'
       ORDER BY p.display_order ASC, p.pack_key ASC`,
      [normalizedCurrency]
    ).then(([rows]) => rows),
    db.query<ModelRow[]>(
      `SELECT model_key, provider, name, tier, billing_unit,
              provider_cost_usd_per_unit, pulse_credits_per_unit,
              generation_enabled, metadata_json, price_verified_at
       FROM video_model_catalog
       WHERE status = 'active'
       ORDER BY display_order ASC, model_key ASC`
    ).then(([rows]) => rows)
  ]);

  const anyGenerationEnabled = models.some((row) => Boolean(row.generation_enabled));
  const commerceEnabled =
    config.PULSE_VIDEO_COMMERCE_ENABLED &&
    Boolean(config.FAL_API_KEY) &&
    anyGenerationEnabled;

  return {
    commerceEnabled,
    provider: {
      key: config.PULSE_VIDEO_PROVIDER,
      configured: Boolean(config.FAL_API_KEY),
      generationEnabled: anyGenerationEnabled
    },
    creditDefinition: {
      creditsPerProviderUsd: 100,
      providerBudgetPerCreditUsd: 0.01,
      note: "100 Video Credits representan USD 1 de presupuesto máximo de proveedor."
    },
    packs: packs.map((row) => ({
      key: String(row.pack_key),
      name: String(row.name),
      description: row.description == null ? null : String(row.description),
      credits: Number(row.credits),
      metadata: jsonObject(row.metadata_json),
      price: row.price_id == null
        ? null
        : {
            id: Number(row.price_id),
            currency: String(row.currency),
            unitAmountMinor: Number(row.unit_amount_minor),
            metadata: jsonObject(row.price_metadata_json)
          }
    })),
    models: models.map((row) => ({
      key: row.model_key,
      provider: row.provider,
      name: row.name,
      tier: row.tier,
      billingUnit: row.billing_unit,
      providerCostUsdPerUnit: Number(row.provider_cost_usd_per_unit),
      creditsPerUnit: Number(row.pulse_credits_per_unit),
      generationEnabled: Boolean(row.generation_enabled),
      metadata: jsonObject(row.metadata_json),
      priceVerifiedAt: row.price_verified_at
    }))
  };
}

export async function quoteVideoCredits(input: {
  tenantId: number;
  modelKey: string;
  units: number;
}) {
  await assertVideoCreditsAvailableForTenant(input.tenantId);

  if (!Number.isFinite(input.units) || input.units <= 0 || input.units > 120) {
    throw new HttpError(
      "La duración o cantidad solicitada no es válida",
      400,
      "VIDEO_QUOTE_UNITS_INVALID"
    );
  }

  const [rows] = await db.query<ModelRow[]>(
    `SELECT model_key, provider, name, tier, billing_unit,
            provider_cost_usd_per_unit, pulse_credits_per_unit,
            generation_enabled, metadata_json, price_verified_at
     FROM video_model_catalog
     WHERE model_key = ? AND status = 'active'
     LIMIT 1`,
    [input.modelKey]
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError("Modelo de video no disponible", 404, "VIDEO_MODEL_NOT_FOUND");
  }

  const credits = Math.ceil(input.units * Number(row.pulse_credits_per_unit));
  const providerCostUsd =
    input.units * Number(row.provider_cost_usd_per_unit);

  return {
    modelKey: row.model_key,
    name: row.name,
    tier: row.tier,
    billingUnit: row.billing_unit,
    units: input.units,
    credits,
    providerCostUsd: Number(providerCostUsd.toFixed(4)),
    generationEnabled: Boolean(row.generation_enabled),
    priceVerifiedAt: row.price_verified_at
  };
}

export async function reserveVideoCredits(input: {
  tenantId: number;
  modelKey: string;
  units: number;
  generationRef?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const quote = await quoteVideoCredits(input);
  const id = randomUUID();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await ensureWallet(connection, input.tenantId);

    const [walletRows] = await connection.query<RowDataPacket[]>(
      `SELECT available_credits, reserved_credits
       FROM tenant_video_credit_wallets
       WHERE tenant_id = ?
       FOR UPDATE`,
      [input.tenantId]
    );
    const wallet = walletRows[0];
    const available = Number(wallet?.available_credits ?? 0);
    const reserved = Number(wallet?.reserved_credits ?? 0);

    if (available < quote.credits) {
      throw new HttpError(
        "No tenés Video Credits suficientes para esta generación",
        402,
        "VIDEO_CREDITS_INSUFFICIENT"
      );
    }

    await connection.execute(
      `UPDATE tenant_video_credit_wallets
       SET available_credits = available_credits - ?,
           reserved_credits = reserved_credits + ?
       WHERE tenant_id = ?`,
      [quote.credits, quote.credits, input.tenantId]
    );

    await connection.execute(
      `INSERT INTO video_credit_reservations
       (id, tenant_id, model_key, requested_units, reserved_credits,
        status, generation_ref, metadata_json, expires_at)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`,
      [
        id,
        input.tenantId,
        input.modelKey,
        input.units,
        quote.credits,
        input.generationRef?.slice(0, 190) ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    await connection.execute(
      `INSERT INTO video_credit_ledger
       (tenant_id, entry_type, available_delta, reserved_delta,
        reservation_id, generation_ref, note, metadata_json)
       VALUES (?, 'reserve', ?, ?, ?, ?, ?, ?)`,
      [
        input.tenantId,
        -quote.credits,
        quote.credits,
        id,
        input.generationRef?.slice(0, 190) ?? null,
        "Reserva previa a generación de video",
        JSON.stringify({
          modelKey: quote.modelKey,
          units: quote.units,
          providerCostUsd: quote.providerCostUsd,
          previousAvailableCredits: available,
          previousReservedCredits: reserved
        })
      ]
    );

    await connection.commit();
    return { id, ...quote, status: "reserved" as const };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function releaseVideoCreditReservation(input: {
  tenantId: number;
  reservationId: string;
  reason?: string | null;
}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT reserved_credits, generation_ref, status
       FROM video_credit_reservations
       WHERE id = ? AND tenant_id = ?
       FOR UPDATE`,
      [input.reservationId, input.tenantId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError("Reserva de Video Credits no encontrada", 404, "VIDEO_RESERVATION_NOT_FOUND");
    }
    if (row.status !== "reserved") {
      await connection.rollback();
      return { released: false, status: row.status };
    }

    const credits = Number(row.reserved_credits);
    await ensureWallet(connection, input.tenantId);
    await connection.execute(
      `UPDATE tenant_video_credit_wallets
       SET available_credits = available_credits + ?,
           reserved_credits = reserved_credits - ?
       WHERE tenant_id = ?`,
      [credits, credits, input.tenantId]
    );
    await connection.execute(
      `UPDATE video_credit_reservations
       SET status = 'released'
       WHERE id = ?`,
      [input.reservationId]
    );
    await connection.execute(
      `INSERT INTO video_credit_ledger
       (tenant_id, entry_type, available_delta, reserved_delta,
        reservation_id, generation_ref, note)
       VALUES (?, 'release', ?, ?, ?, ?, ?)`,
      [
        input.tenantId,
        credits,
        -credits,
        input.reservationId,
        row.generation_ref ?? null,
        (input.reason ?? "Generación cancelada o fallida").slice(0, 500)
      ]
    );
    await connection.commit();
    return { released: true, credits, status: "released" as const };
  } catch (error) {
    if ((connection as any).connection?._closing !== true) {
      try { await connection.rollback(); } catch {}
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function captureVideoCreditReservation(input: {
  tenantId: number;
  reservationId: string;
  generationRef?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT reserved_credits, generation_ref, status
       FROM video_credit_reservations
       WHERE id = ? AND tenant_id = ?
       FOR UPDATE`,
      [input.reservationId, input.tenantId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError("Reserva de Video Credits no encontrada", 404, "VIDEO_RESERVATION_NOT_FOUND");
    }
    if (row.status !== "reserved") {
      await connection.rollback();
      return { captured: false, status: row.status };
    }

    const credits = Number(row.reserved_credits);
    await ensureWallet(connection, input.tenantId);
    await connection.execute(
      `UPDATE tenant_video_credit_wallets
       SET reserved_credits = reserved_credits - ?,
           lifetime_consumed_credits = lifetime_consumed_credits + ?
       WHERE tenant_id = ?`,
      [credits, credits, input.tenantId]
    );
    await connection.execute(
      `UPDATE video_credit_reservations
       SET status = 'captured',
           generation_ref = COALESCE(?, generation_ref),
           metadata_json = COALESCE(?, metadata_json)
       WHERE id = ?`,
      [
        input.generationRef?.slice(0, 190) ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.reservationId
      ]
    );
    await connection.execute(
      `INSERT INTO video_credit_ledger
       (tenant_id, entry_type, available_delta, reserved_delta,
        reservation_id, generation_ref, note, metadata_json)
       VALUES (?, 'consume', 0, ?, ?, ?, ?, ?)`,
      [
        input.tenantId,
        -credits,
        input.reservationId,
        input.generationRef?.slice(0, 190) ?? row.generation_ref ?? null,
        "Generación de video completada",
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
    await connection.commit();
    return { captured: true, credits, status: "captured" as const };
  } catch (error) {
    if ((connection as any).connection?._closing !== true) {
      try { await connection.rollback(); } catch {}
    }
    throw error;
  } finally {
    connection.release();
  }
}
