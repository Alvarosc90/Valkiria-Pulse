import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

export type AuthTokenPurpose = "verify_email" | "reset_password";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueOneTimeToken(input: {
  userId: number;
  purpose: AuthTokenPurpose;
  ttlMinutes: number;
  ip?: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  await db.execute(
    `UPDATE auth_one_time_tokens
     SET consumed_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
    [input.userId, input.purpose]
  );

  await db.execute(
    `INSERT INTO auth_one_time_tokens
     (user_id, purpose, token_hash, expires_at, requested_ip)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?)`,
    [
      input.userId,
      input.purpose,
      tokenHash,
      Math.min(Math.max(input.ttlMinutes, 5), 1440),
      input.ip?.slice(0, 64) ?? null
    ]
  );

  return token;
}

export async function consumeOneTimeToken(input: {
  token: string;
  purpose: AuthTokenPurpose;
}) {
  const tokenHash = hashToken(input.token);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT aott.id, aott.user_id, aott.expires_at, aott.consumed_at,
              u.email, u.display_name, u.active, u.email_verified_at
       FROM auth_one_time_tokens aott
       INNER JOIN users u ON u.id = aott.user_id
       WHERE aott.token_hash = ? AND aott.purpose = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash, input.purpose]
    );

    const row = rows[0];
    if (
      !row ||
      row.consumed_at ||
      Number(row.active) !== 1 ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      throw new HttpError(
        "El enlace no es válido o ya venció",
        400,
        "AUTH_ONE_TIME_TOKEN_INVALID"
      );
    }

    const [result] = await connection.execute<any>(
      `UPDATE auth_one_time_tokens
       SET consumed_at = UTC_TIMESTAMP()
       WHERE id = ? AND consumed_at IS NULL`,
      [row.id]
    );

    if (Number(result.affectedRows ?? 0) !== 1) {
      throw new HttpError(
        "El enlace ya fue utilizado",
        409,
        "AUTH_ONE_TIME_TOKEN_USED"
      );
    }

    await connection.commit();
    return {
      userId: Number(row.user_id),
      email: String(row.email),
      displayName: String(row.display_name),
      emailVerifiedAt: row.email_verified_at as Date | null
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
