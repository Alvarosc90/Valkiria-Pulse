import { createHash, randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { RowDataPacket } from "mysql2";
import { authSecrets, config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import type { PulseRole } from "./types.js";

const ACCESS_ISSUER = "valkiria-pulse";
const REFRESH_ISSUER = "valkiria-pulse-refresh";

function hashTokenId(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueSessionForUserTenant(input: {
  userId: number;
  tenantId: number;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       u.id, u.email, u.display_name, u.auth_version,
       ut.tenant_id, ut.role, ut.auth_version AS tenant_auth_version,
       t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u
     INNER JOIN user_tenants ut
       ON ut.user_id = u.id
      AND ut.tenant_id = ?
      AND ut.active = 1
     INNER JOIN tenants t
       ON t.id = ut.tenant_id
      AND t.status = 'active'
     WHERE u.id = ? AND u.active = 1
     LIMIT 1`,
    [input.tenantId, input.userId]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(
      "No existe acceso activo para la integracion",
      403,
      "AUTH_NO_TENANT"
    );
  }

  const role = row.role as PulseRole;
  const userAuthVersion = Number(row.auth_version || 1);
  const tenantAuthVersion = Number(row.tenant_auth_version || 1);
  const { access, refresh } = authSecrets();

  const accessToken = jwt.sign(
    {
      sub: String(row.id),
      tenantId: String(row.tenant_id),
      role,
      userAuthVersion,
      tenantAuthVersion
    },
    access,
    {
      issuer: ACCESS_ISSUER,
      algorithm: "HS256",
      expiresIn: config.AUTH_ACCESS_TTL as SignOptions["expiresIn"]
    }
  );

  const sessionId = randomUUID();
  const tokenId = randomUUID();
  const expiresAt = new Date(
    Date.now() + config.AUTH_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.execute(
    `INSERT INTO refresh_sessions
     (id, user_id, tenant_id, token_hash, expires_at, last_used_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)`,
    [
      sessionId,
      row.id,
      row.tenant_id,
      hashTokenId(tokenId),
      expiresAt,
      input.requestMeta?.ip?.slice(0, 64) || null,
      input.requestMeta?.userAgent?.slice(0, 255) || null
    ]
  );

  const refreshToken = jwt.sign(
    {
      sub: String(row.id),
      tenantId: String(row.tenant_id),
      role,
      userAuthVersion,
      tenantAuthVersion,
      sid: sessionId,
      jti: tokenId
    },
    refresh,
    {
      issuer: REFRESH_ISSUER,
      algorithm: "HS256",
      expiresIn: (String(config.AUTH_REFRESH_TTL_DAYS) + "d") as SignOptions["expiresIn"]
    }
  );

  return {
    requiresTenantSelection: false as const,
    accessToken,
    refreshToken,
    user: {
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name)
    },
    tenant: {
      id: String(row.tenant_id),
      name: String(row.tenant_name),
      slug: String(row.tenant_slug),
      role
    }
  };
}
