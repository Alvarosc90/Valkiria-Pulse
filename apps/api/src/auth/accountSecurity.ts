import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import {
  isMailConfigured,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail
} from "../services/mailService.js";
import { consumeOneTimeToken, issueOneTimeToken } from "./oneTimeTokens.js";
import { assertPasswordSafe } from "./passwordPolicy.js";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  active: number;
  email_verified_at: Date | null;
};

async function activeUserByEmail(email: string) {
  const [rows] = await db.query<UserRow[]>(
    `SELECT id, email, display_name, password_hash, active, email_verified_at
     FROM users
     WHERE email = ? AND active = 1
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  return rows[0] ?? null;
}

async function activeUserById(userId: number) {
  const [rows] = await db.query<UserRow[]>(
    `SELECT id, email, display_name, password_hash, active, email_verified_at
     FROM users
     WHERE id = ? AND active = 1
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

async function deliverVerification(user: UserRow, token: string) {
  if (!isMailConfigured()) {
    if (config.NODE_ENV === "production") {
      throw new HttpError(
        "El servicio de email no está disponible",
        503,
        "MAIL_NOT_CONFIGURED"
      );
    }
    return;
  }

  await verificationEmail({
    to: user.email,
    displayName: user.display_name,
    token
  });
}

export async function createVerificationForUser(input: {
  userId: number;
  ip?: string | null;
}) {
  const user = await activeUserById(input.userId);
  if (!user) {
    throw new HttpError("Cuenta no disponible", 404, "AUTH_USER_NOT_FOUND");
  }

  if (user.email_verified_at) {
    return { alreadyVerified: true, devToken: null as string | null };
  }

  const token = await issueOneTimeToken({
    userId: user.id,
    purpose: "verify_email",
    ttlMinutes: 30,
    ip: input.ip
  });

  await deliverVerification(user, token);

  return {
    alreadyVerified: false,
    devToken: config.NODE_ENV === "production" ? null : token
  };
}

export async function requestVerificationByEmail(input: {
  email: string;
  ip?: string | null;
}) {
  const user = await activeUserByEmail(input.email);
  if (!user || user.email_verified_at) {
    return { accepted: true, devToken: null as string | null };
  }

  const result = await createVerificationForUser({
    userId: user.id,
    ip: input.ip
  });

  return {
    accepted: true,
    devToken: result.devToken
  };
}

export async function verifyEmailToken(token: string) {
  const consumed = await consumeOneTimeToken({
    token,
    purpose: "verify_email"
  });

  await db.execute(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()),
         auth_version = auth_version + 1
     WHERE id = ? AND active = 1`,
    [consumed.userId]
  );

  return {
    verified: true,
    email: consumed.email
  };
}

export async function requestPasswordReset(input: {
  email: string;
  ip?: string | null;
}) {
  const user = await activeUserByEmail(input.email);
  if (!user) {
    return { accepted: true, devToken: null as string | null };
  }

  const token = await issueOneTimeToken({
    userId: user.id,
    purpose: "reset_password",
    ttlMinutes: 20,
    ip: input.ip
  });

  if (isMailConfigured()) {
    await passwordResetEmail({
      to: user.email,
      displayName: user.display_name,
      token
    });
  } else if (config.NODE_ENV === "production") {
    throw new HttpError(
      "El servicio de recuperación no está disponible",
      503,
      "MAIL_NOT_CONFIGURED"
    );
  }

  return {
    accepted: true,
    devToken: config.NODE_ENV === "production" ? null : token
  };
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
}) {
  const consumed = await consumeOneTimeToken({
    token: input.token,
    purpose: "reset_password"
  });

  assertPasswordSafe(input.password, consumed.email);
  const passwordHash = await bcrypt.hash(input.password, 12);

  await db.execute(
    `UPDATE users
     SET password_hash = ?,
         password_changed_at = UTC_TIMESTAMP(),
         auth_version = auth_version + 1
     WHERE id = ? AND active = 1`,
    [passwordHash, consumed.userId]
  );

  await db.execute(
    `UPDATE refresh_sessions
     SET revoked_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND revoked_at IS NULL`,
    [consumed.userId]
  );

  if (isMailConfigured()) {
    await passwordChangedEmail({
      to: consumed.email,
      displayName: consumed.displayName
    }).catch(() => undefined);
  }

  return { changed: true };
}

export async function changePassword(input: {
  userId: number;
  currentPassword: string;
  nextPassword: string;
}) {
  const user = await activeUserById(input.userId);
  if (!user || !(await bcrypt.compare(input.currentPassword, user.password_hash))) {
    throw new HttpError(
      "La contraseña actual no es correcta",
      400,
      "AUTH_CURRENT_PASSWORD_INVALID"
    );
  }

  if (await bcrypt.compare(input.nextPassword, user.password_hash)) {
    throw new HttpError(
      "La nueva contraseña debe ser diferente",
      400,
      "AUTH_PASSWORD_REUSE"
    );
  }

  assertPasswordSafe(input.nextPassword, user.email);
  const passwordHash = await bcrypt.hash(input.nextPassword, 12);

  await db.execute(
    `UPDATE users
     SET password_hash = ?,
         password_changed_at = UTC_TIMESTAMP(),
         auth_version = auth_version + 1
     WHERE id = ?`,
    [passwordHash, user.id]
  );

  await db.execute(
    `UPDATE refresh_sessions
     SET revoked_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND revoked_at IS NULL`,
    [user.id]
  );

  if (isMailConfigured()) {
    await passwordChangedEmail({
      to: user.email,
      displayName: user.display_name
    }).catch(() => undefined);
  }

  return { changed: true };
}

export async function listActiveSessions(input: {
  userId: number;
  tenantId: number;
}) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, ip_address, user_agent, created_at, last_used_at, expires_at
     FROM refresh_sessions
     WHERE user_id = ?
       AND tenant_id = ?
       AND revoked_at IS NULL
       AND expires_at > UTC_TIMESTAMP()
     ORDER BY last_used_at DESC, created_at DESC
     LIMIT 50`,
    [input.userId, input.tenantId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    ipAddress: row.ip_address == null ? null : String(row.ip_address),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at
  }));
}

export async function revokeSession(input: {
  userId: number;
  tenantId: number;
  sessionId: string;
}) {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE refresh_sessions
     SET revoked_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND user_id = ?
       AND tenant_id = ?
       AND revoked_at IS NULL`,
    [input.sessionId, input.userId, input.tenantId]
  );

  return { revoked: result.affectedRows === 1 };
}

export async function revokeAllSessions(input: {
  userId: number;
  tenantId?: number | null;
}) {
  const params: Array<number> = [input.userId];
  let tenantFilter = "";
  if (input.tenantId) {
    tenantFilter = " AND tenant_id = ?";
    params.push(input.tenantId);
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE refresh_sessions
     SET revoked_at = UTC_TIMESTAMP()
     WHERE user_id = ?
       ${tenantFilter}
       AND revoked_at IS NULL`,
    params
  );

  return { revoked: result.affectedRows };
}
