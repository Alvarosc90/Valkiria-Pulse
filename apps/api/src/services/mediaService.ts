import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".mp4", ".mov", ".webm",
  ".pdf"
]);

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assetKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

function safeExtension(originalName: string) {
  const extension = extname(originalName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : "";
}

function mediaPath(storageKey: string) {
  return resolve(config.PULSE_MEDIA_DIR, storageKey);
}

export async function saveMediaAsset(input: {
  tenantId: number;
  brandId: number;
  userId: number;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const [brandRows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
    [input.brandId, input.tenantId]
  );
  if (!brandRows[0]) {
    throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
  }

  const extension = safeExtension(input.originalName);
  const storageKey = `${randomUUID()}${extension}`;
  await mkdir(config.PULSE_MEDIA_DIR, { recursive: true });
  await writeFile(mediaPath(storageKey), input.bytes, { flag: "wx" });

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO media_assets
     (tenant_id, brand_id, kind, storage_key, original_name, mime_type, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.brandId,
      assetKind(input.mimeType),
      storageKey,
      input.originalName.slice(0, 255),
      input.mimeType.slice(0, 120),
      JSON.stringify({ sizeBytes: input.bytes.length }),
      input.userId
    ]
  );

  return {
    id: result.insertId,
    kind: assetKind(input.mimeType),
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length
  };
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

  if (
    !row ||
    !row.public_token_hash ||
    !row.public_until ||
    new Date(row.public_until).getTime() <= Date.now() ||
    hashToken(token) !== String(row.public_token_hash)
  ) {
    throw new HttpError("Enlace de recurso invalido o vencido", 404, "MEDIA_PUBLIC_LINK_INVALID");
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
