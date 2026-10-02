import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { authSecrets, config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import type { AuthContext, PulseRole } from "./types.js";

const ACCESS_ISSUER = "valkiria-pulse";
const REFRESH_ISSUER = "valkiria-pulse-refresh";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  active: number;
  auth_version: number;
};

type TenantLinkRow = RowDataPacket & {
  user_id: number;
  tenant_id: number;
  role: PulseRole;
  active: number;
  auth_version: number;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
};

function hashTokenId(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function accessToken(link: TenantLinkRow, user: UserRow) {
  const { access } = authSecrets();
  return jwt.sign(
    {
      sub: String(user.id),
      tenantId: String(link.tenant_id),
      role: link.role,
      userAuthVersion: Number(user.auth_version || 1),
      tenantAuthVersion: Number(link.auth_version || 1)
    },
    access,
    {
      issuer: ACCESS_ISSUER,
      algorithm: "HS256",
      expiresIn: config.AUTH_ACCESS_TTL as SignOptions["expiresIn"]
    }
  );
}

function refreshToken(input: {
  user: UserRow;
  link: TenantLinkRow;
  sessionId: string;
  tokenId: string;
}) {
  const { refresh } = authSecrets();
  return jwt.sign(
    {
      sub: String(input.user.id),
      tenantId: String(input.link.tenant_id),
      role: input.link.role,
      userAuthVersion: Number(input.user.auth_version || 1),
      tenantAuthVersion: Number(input.link.auth_version || 1),
      sid: input.sessionId,
      jti: input.tokenId
    },
    refresh,
    {
      issuer: REFRESH_ISSUER,
      algorithm: "HS256",
      expiresIn: `${config.AUTH_REFRESH_TTL_DAYS}d` as SignOptions["expiresIn"]
    }
  );
}

async function userByEmail(email: string) {
  const [rows] = await db.query<UserRow[]>(
    `SELECT id, email, display_name, password_hash, active, auth_version
     FROM users
     WHERE email = ? AND active = 1
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  return rows[0] ?? null;
}

async function linksForUser(userId: number, tenantSlug?: string) {
  const params: Array<string | number> = [userId];
  let slugFilter = "";
  if (tenantSlug) {
    slugFilter = " AND t.slug = ?";
    params.push(tenantSlug);
  }

  const [rows] = await db.query<TenantLinkRow[]>(
    `SELECT
       ut.user_id, ut.tenant_id, ut.role, ut.active, ut.auth_version,
       t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
     FROM user_tenants ut
     INNER JOIN tenants t ON t.id = ut.tenant_id
     WHERE ut.user_id = ?
       AND ut.active = 1
       AND t.status = 'active'
       ${slugFilter}
     ORDER BY t.name ASC`,
    params
  );
  return rows;
}

function publicUser(user: UserRow) {
  return {
    id: String(user.id),
    email: user.email,
    displayName: user.display_name
  };
}

function publicTenant(link: TenantLinkRow) {
  return {
    id: String(link.tenant_id),
    name: link.tenant_name,
    slug: link.tenant_slug,
    role: link.role
  };
}

async function createRefreshSession(
  user: UserRow,
  link: TenantLinkRow,
  requestMeta: { ip?: string | null; userAgent?: string | null }
) {
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
      user.id,
      link.tenant_id,
      hashTokenId(tokenId),
      expiresAt,
      requestMeta.ip?.slice(0, 64) || null,
      requestMeta.userAgent?.slice(0, 255) || null
    ]
  );

  return refreshToken({ user, link, sessionId, tokenId });
}

export async function login(input: {
  email: string;
  password: string;
  tenantSlug?: string;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}) {
  const user = await userByEmail(input.email);
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new HttpError("Credenciales invalidas", 401, "AUTH_INVALID_CREDENTIALS");
  }

  const links = await linksForUser(user.id, input.tenantSlug);
  if (!links.length) {
    throw new HttpError("La cuenta no tiene acceso activo", 403, "AUTH_NO_TENANT");
  }

  if (!input.tenantSlug && links.length > 1) {
    return {
      requiresTenantSelection: true as const,
      user: publicUser(user),
      tenants: links.map(publicTenant)
    };
  }

  const link = links[0]!;
  const refresh = await createRefreshSession(user, link, input.requestMeta ?? {});

  return {
    requiresTenantSelection: false as const,
    accessToken: accessToken(link, user),
    refreshToken: refresh,
    user: publicUser(user),
    tenant: publicTenant(link)
  };
}

function verifyRefresh(raw: string): JwtPayload {
  try {
    const { refresh } = authSecrets();
    const payload = jwt.verify(raw, refresh, {
      issuer: REFRESH_ISSUER,
      algorithms: ["HS256"]
    });
    if (typeof payload === "string") throw new Error("invalid payload");
    return payload;
  } catch {
    throw new HttpError("La sesion vencio. Inicia sesion nuevamente.", 401, "AUTH_REFRESH_INVALID");
  }
}

export async function refreshAccess(
  rawRefreshToken: string,
  requestMeta: { ip?: string | null; userAgent?: string | null } = {}
) {
  const payload = verifyRefresh(rawRefreshToken);
  const sessionId = String(payload.sid ?? "");
  const tokenId = String(payload.jti ?? "");
  const userId = Number(payload.sub);
  const tenantId = Number(payload.tenantId);

  if (!sessionId || !tokenId || !userId || !tenantId) {
    throw new HttpError("Sesion de renovacion invalida", 401, "AUTH_REFRESH_INVALID");
  }

  const [rows] = await db.query<(UserRow & TenantLinkRow & RowDataPacket)[]>(
    `SELECT
       u.id, u.email, u.display_name, u.password_hash, u.active,
       u.auth_version,
       ut.user_id, ut.tenant_id, ut.role, ut.active AS tenant_access_active,
       ut.auth_version AS tenant_auth_version,
       t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status,
       rs.token_hash, rs.expires_at, rs.revoked_at
     FROM refresh_sessions rs
     INNER JOIN users u ON u.id = rs.user_id
     INNER JOIN user_tenants ut ON ut.user_id = rs.user_id AND ut.tenant_id = rs.tenant_id
     INNER JOIN tenants t ON t.id = rs.tenant_id
     WHERE rs.id = ? AND rs.user_id = ? AND rs.tenant_id = ?
     LIMIT 1`,
    [sessionId, userId, tenantId]
  );

  const row = rows[0] as any;
  if (
    !row ||
    row.revoked_at ||
    Number(row.active) !== 1 ||
    Number(row.tenant_access_active) !== 1 ||
    row.tenant_status !== "active" ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    throw new HttpError("La sesion fue revocada", 401, "AUTH_REFRESH_REVOKED");
  }

  if (
    Number(payload.userAuthVersion ?? 1) !== Number(row.auth_version ?? 1) ||
    Number(payload.tenantAuthVersion ?? 1) !== Number(row.tenant_auth_version ?? 1)
  ) {
    await db.execute("UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [sessionId]);
    throw new HttpError("La sesion fue revocada", 401, "AUTH_REFRESH_REVOKED");
  }

  const currentHash = hashTokenId(tokenId);
  if (currentHash !== row.token_hash) {
    await db.execute("UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?", [sessionId]);
    throw new HttpError("Sesion reutilizada; inicia sesion nuevamente", 401, "AUTH_REFRESH_REUSED");
  }

  const nextTokenId = randomUUID();
  const [updated] = await db.execute<ResultSetHeader>(
    `UPDATE refresh_sessions
     SET token_hash = ?, last_used_at = UTC_TIMESTAMP(), ip_address = ?, user_agent = ?
     WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`,
    [
      hashTokenId(nextTokenId),
      requestMeta.ip?.slice(0, 64) || null,
      requestMeta.userAgent?.slice(0, 255) || null,
      sessionId,
      currentHash
    ]
  );

  if (updated.affectedRows !== 1) {
    throw new HttpError("La sesion fue revocada", 401, "AUTH_REFRESH_REUSED");
  }

  const user = {
    ...row,
    auth_version: Number(row.auth_version)
  } as UserRow;
  const link = {
    user_id: userId,
    tenant_id: tenantId,
    role: row.role,
    active: 1,
    auth_version: Number(row.tenant_auth_version),
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    tenant_status: row.tenant_status
  } as TenantLinkRow;

  return {
    accessToken: accessToken(link, user),
    refreshToken: refreshToken({
      user,
      link,
      sessionId,
      tokenId: nextTokenId
    })
  };
}

export async function revokeRefresh(rawRefreshToken?: string | null) {
  if (!rawRefreshToken) return;

  try {
    const { refresh } = authSecrets();
    const payload = jwt.verify(rawRefreshToken, refresh, {
      issuer: REFRESH_ISSUER,
      algorithms: ["HS256"],
      ignoreExpiration: true
    });
    if (typeof payload === "string" || !payload.sid || !payload.sub) return;
    await db.execute(
      "UPDATE refresh_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
      [String(payload.sid), Number(payload.sub)]
    );
  } catch {
    return;
  }
}

export async function resolveAccessToken(rawAccessToken: string): Promise<AuthContext> {
  let payload: JwtPayload;
  try {
    const { access } = authSecrets();
    const verified = jwt.verify(rawAccessToken, access, {
      issuer: ACCESS_ISSUER,
      algorithms: ["HS256"]
    });
    if (typeof verified === "string") throw new Error("invalid payload");
    payload = verified;
  } catch {
    throw new HttpError("Token invalido o vencido", 401, "AUTH_INVALID_TOKEN");
  }

  const userId = Number(payload.sub);
  const tenantId = Number(payload.tenantId);
  if (!userId || !tenantId) {
    throw new HttpError("Token invalido", 401, "AUTH_INVALID_TOKEN");
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       u.id AS user_id, u.email, u.display_name, u.active AS user_active,
       u.auth_version AS user_auth_version,
       ut.tenant_id, ut.role, ut.active AS tenant_access_active,
       ut.auth_version AS tenant_auth_version,
       t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
     FROM user_tenants ut
     INNER JOIN users u ON u.id = ut.user_id
     INNER JOIN tenants t ON t.id = ut.tenant_id
     WHERE ut.user_id = ? AND ut.tenant_id = ?
     LIMIT 1`,
    [userId, tenantId]
  );

  const row = rows[0];
  if (
    !row ||
    Number(row.user_active) !== 1 ||
    Number(row.tenant_access_active) !== 1 ||
    row.tenant_status !== "active" ||
    Number(payload.userAuthVersion ?? 1) !== Number(row.user_auth_version ?? 1) ||
    Number(payload.tenantAuthVersion ?? 1) !== Number(row.tenant_auth_version ?? 1)
  ) {
    throw new HttpError("El acceso fue revocado", 401, "AUTH_ACCESS_REVOKED");
  }

  return {
    userId: String(row.user_id),
    tenantId: String(row.tenant_id),
    role: row.role as PulseRole,
    user: {
      email: String(row.email),
      displayName: String(row.display_name)
    },
    tenant: {
      name: String(row.tenant_name),
      slug: String(row.tenant_slug)
    }
  };
}
