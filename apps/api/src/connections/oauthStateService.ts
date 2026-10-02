import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { SocialPlatform } from "@pulse/contracts";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

const TTL_MINUTES = 10;

function hashState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createOAuthState(input: {
  tenantId: number;
  brandId: number;
  userId: number;
  platform: SocialPlatform;
  returnTo?: string;
}) {
  const [brands] = await db.query<RowDataPacket[]>(
    "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
    [input.brandId, input.tenantId]
  );
  if (!brands[0]) {
    throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
  }

  const raw = randomBytes(32).toString("base64url");
  await db.execute(
    `INSERT INTO oauth_states
     (id, state_hash, tenant_id, brand_id, user_id, platform, return_to, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [
      randomUUID(),
      hashState(raw),
      input.tenantId,
      input.brandId,
      input.userId,
      input.platform,
      input.returnTo ?? null,
      TTL_MINUTES
    ]
  );

  return raw;
}

export async function consumeOAuthState(raw: string, platform: SocialPlatform) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, tenant_id, brand_id, user_id, platform, return_to, expires_at, consumed_at
       FROM oauth_states
       WHERE state_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [hashState(raw)]
    );

    const row = rows[0];
    if (
      !row ||
      row.platform !== platform ||
      row.consumed_at ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      throw new HttpError("Estado OAuth invalido o vencido", 400, "OAUTH_STATE_INVALID");
    }

    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE oauth_states SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL",
      [row.id]
    );

    if (updated.affectedRows !== 1) {
      throw new HttpError("Estado OAuth ya utilizado", 400, "OAUTH_STATE_REUSED");
    }

    await connection.commit();

    return {
      tenantId: Number(row.tenant_id),
      brandId: Number(row.brand_id),
      userId: Number(row.user_id),
      returnTo: row.return_to ? String(row.return_to) : undefined
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
