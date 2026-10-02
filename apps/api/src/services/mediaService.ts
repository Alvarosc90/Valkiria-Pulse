import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { inspectMediaFile } from "../security/mediaSignature.js";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function mediaPath(storageKey: string) {
  return resolve(config.PULSE_MEDIA_DIR, storageKey);
}

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

function storageLimit(limitsJson: unknown) {
  const raw = Number(jsonObject(limitsJson).mediaStorageBytes);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

export async function saveMediaAsset(input: {
  tenantId: number;
  brandId: number;
  userId: number;
  originalName: string;
  tempPath: string;
}) {
  const detected = await inspectMediaFile(input.tempPath);
  const fileStat = await stat(input.tempPath);
  const sizeBytes = Number(fileStat.size);

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new HttpError("El archivo está vacío", 400, "MEDIA_FILE_EMPTY");
  }

  const storageKey = randomUUID() + detected.extension;
  const destination = mediaPath(storageKey);
  let copied = false;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [brands] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
      [input.brandId, input.tenantId]
    );
    if (!brands[0]) {
      throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
    }

    const [subscriptions] = await connection.query<RowDataPacket[]>(
      `SELECT ts.status, ts.trial_ends_at, sp.limits_json
       FROM tenant_subscriptions ts
       INNER JOIN saas_plans sp ON sp.plan_key = ts.plan_key
       WHERE ts.tenant_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId]
    );

    const subscription = subscriptions[0];
    if (!subscription || !["trial", "active"].includes(String(subscription.status))) {
      throw new HttpError(
        "La suscripción no está activa",
        402,
        "BILLING_SUBSCRIPTION_INACTIVE"
      );
    }

    if (
      subscription.status === "trial" &&
      subscription.trial_ends_at &&
      new Date(subscription.trial_ends_at).getTime() <= Date.now()
    ) {
      throw new HttpError(
        "La prueba gratuita finalizó. Elegí un plan para continuar.",
        402,
        "BILLING_TRIAL_EXPIRED"
      );
    }

    const [usageRows] = await connection.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM media_assets WHERE tenant_id = ?",
      [input.tenantId]
    );
    const currentBytes = Number(usageRows[0]?.total ?? 0);
    const limit = storageLimit(subscription.limits_json);

    if (limit != null && currentBytes + sizeBytes > limit) {
      throw new HttpError(
        "Se alcanzó el límite de almacenamiento del plan",
        402,
        "BILLING_MEDIA_STORAGE_LIMIT_REACHED"
      );
    }

    await mkdir(config.PULSE_MEDIA_DIR, { recursive: true });
    await copyFile(input.tempPath, destination, fsConstants.COPYFILE_EXCL);
    copied = true;

    const safeOriginalName =
      basename(input.originalName).slice(0, 255) || "asset" + detected.extension;

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO media_assets
       (tenant_id, brand_id, kind, storage_key, original_name, mime_type,
        size_bytes, metadata_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.tenantId,
        input.brandId,
        detected.kind,
        storageKey,
        safeOriginalName,
        detected.mimeType,
        sizeBytes,
        JSON.stringify({
          sizeBytes,
          signatureValidated: true,
          canonicalExtension: detected.extension
        }),
        input.userId
      ]
    );

    await connection.commit();

    return {
      id: result.insertId,
      kind: detected.kind,
      originalName: safeOriginalName,
      mimeType: detected.mimeType,
      sizeBytes
    };
  } catch (error) {
    await connection.rollback();
    if (copied) {
      await unlink(destination).catch(() => undefined);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function listMediaAssets(input: {
  tenantId: number;
  brandId?: number;
  limit?: number;
}) {
  const params: Array<string | number> = [input.tenantId];
  let filter = "";
  if (input.brandId) {
    filter = " AND ma.brand_id = ?";
    params.push(input.brandId);
  }
  params.push(Math.min(Math.max(input.limit ?? 100, 1), 500));

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ma.id, ma.brand_id AS brandId, ma.kind,
            ma.original_name AS originalName, ma.mime_type AS mimeType,
            ma.size_bytes AS sizeBytes,
            ma.metadata_json AS metadata, ma.public_until AS publicUntil,
            ma.created_at AS createdAt,
            u.display_name AS createdBy
     FROM media_assets ma
     LEFT JOIN users u ON u.id = ma.created_by
     WHERE ma.tenant_id = ?${filter}
     ORDER BY ma.created_at DESC, ma.id DESC
     LIMIT ?`,
    params
  );

  return rows;
}

export async function issuePublicMediaUrl(input: {
  tenantId: number;
  assetId: number;
}) {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM media_assets WHERE id = ? AND tenant_id = ? LIMIT 1",
    [input.assetId, input.tenantId]
  );
  if (!rows[0]) {
    throw new HttpError("Recurso no encontrado", 404, "MEDIA_NOT_FOUND");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + config.PULSE_MEDIA_PUBLIC_TTL_HOURS * 60 * 60 * 1000
  );

  await db.execute(
    `UPDATE media_assets
     SET public_token_hash = ?, public_until = ?
     WHERE id = ? AND tenant_id = ?`,
    [hashToken(token), expiresAt, input.assetId, input.tenantId]
  );

  const base = config.API_URL.replace(/\/$/, "");
  return {
    url: `${base}/api/v1/media/public/${input.assetId}/${token}`,
    expiresAt
  };
}

export async function mediaForAuthenticatedTenant(input: {
  tenantId: number;
  assetId: number;
}) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, storage_key, original_name, mime_type
     FROM media_assets
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.assetId, input.tenantId]
  );
  const row = rows[0];
  if (!row) throw new HttpError("Recurso no encontrado", 404, "MEDIA_NOT_FOUND");

  return {
    path: mediaPath(String(row.storage_key)),
    filename: String(row.original_name ?? "asset"),
    mimeType: String(row.mime_type ?? "application/octet-stream")
  };
}

export async function mediaForPublicToken(assetId: number, token: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, storage_key, original_name, mime_type, public_until, public_token_hash
     FROM media_assets
     WHERE id = ?
     LIMIT 1`,
    [assetId]
  );
  const row = rows[0];
  const submittedHash = hashToken(token);
  const storedHash = String(row?.public_token_hash ?? "");

  if (
    !row ||
    !row.public_token_hash ||
    !row.public_until ||
    new Date(row.public_until).getTime() <= Date.now() ||
    !safeHashEqual(submittedHash, storedHash)
  ) {
    throw new HttpError(
      "Enlace de recurso inválido o vencido",
      404,
      "MEDIA_PUBLIC_LINK_INVALID"
    );
  }

  const path = mediaPath(String(row.storage_key));
  try {
    await stat(path);
  } catch {
    throw new HttpError("Archivo no disponible", 404, "MEDIA_FILE_MISSING");
  }

  return {
    path,
    filename: String(row.original_name ?? "asset"),
    mimeType: String(row.mime_type ?? "application/octet-stream")
  };
}
