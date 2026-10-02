import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import type { PulseRole } from "../auth/types.js";
import { issueSessionForUserTenant } from "../auth/externalSession.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { auditEvent } from "../services/auditService.js";

const claimSchema = z.object({
  sub: z.string().min(1).max(190),
  tenantId: z.union([z.string(), z.number()]).transform((value) => String(value)),
  tenantName: z.string().min(1).max(140),
  tenantSlug: z.string().min(1).max(120).optional(),
  email: z.string().email().max(180),
  displayName: z.string().min(1).max(160),
  role: z.string().min(1).max(80)
});

function roleFromTrainia(role: string): PulseRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "owner") return "owner";
  if (["admin", "manager", "branch_manager"].includes(normalized)) return "admin";
  if (["reception", "coach", "nutritionist"].includes(normalized)) return "editor";
  return "viewer";
}

function safeSlugPart(value: string) {
  const normalized = value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return normalized || "tenant";
}

function verifyTrainiaToken(rawToken: string) {
  if (!config.TRAINIA_SSO_SECRET) {
    throw new HttpError(
      "TrainIA SSO no esta configurado",
      503,
      "TRAINIA_SSO_NOT_CONFIGURED"
    );
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(rawToken, config.TRAINIA_SSO_SECRET, {
      issuer: config.TRAINIA_SSO_ISSUER,
      audience: config.TRAINIA_SSO_AUDIENCE,
      algorithms: ["HS256"]
    });
  } catch {
    throw new HttpError(
      "Token de integracion invalido o vencido",
      401,
      "TRAINIA_SSO_INVALID"
    );
  }

  if (typeof payload === "string") {
    throw new HttpError("Token de integracion invalido", 401, "TRAINIA_SSO_INVALID");
  }

  return claimSchema.parse(payload);
}

async function ensureTenant(input: {
  externalTenantId: string;
  tenantName: string;
  tenantSlug?: string;
}) {
  const [existing] = await db.query<RowDataPacket[]>(
    `SELECT tl.tenant_id
     FROM tenant_links tl
     INNER JOIN tenants t ON t.id = tl.tenant_id
     WHERE tl.source = 'trainia'
       AND tl.external_tenant_id = ?
       AND t.status = 'active'
     LIMIT 1`,
    [input.externalTenantId]
  );

  if (existing[0]) return Number(existing[0].tenant_id);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [recheck] = await connection.query<RowDataPacket[]>(
      `SELECT tenant_id
       FROM tenant_links
       WHERE source = 'trainia' AND external_tenant_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.externalTenantId]
    );
    if (recheck[0]) {
      await connection.commit();
      return Number(recheck[0].tenant_id);
    }

    const preferredSlug = input.tenantSlug
      ? "trainia-" + safeSlugPart(input.tenantSlug)
      : "trainia-" + safeSlugPart(input.externalTenantId);
    const slug = (preferredSlug + "-" + randomBytes(3).toString("hex")).slice(0, 120);

    const [tenantResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO tenants
       (name, slug, country, currency, timezone, status)
       VALUES (?, ?, 'AR', 'ARS', 'America/Argentina/Cordoba', 'active')`,
      [input.tenantName, slug]
    );
    const tenantId = tenantResult.insertId;

    await connection.execute(
      `INSERT INTO tenant_links (tenant_id, source, external_tenant_id)
       VALUES (?, 'trainia', ?)`,
      [tenantId, input.externalTenantId]
    );

    await connection.execute(
      `INSERT INTO brands
       (tenant_id, name, description, tone_json, products_json,
        approved_claims_json, forbidden_terms_json, ctas_json, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        tenantId,
        input.tenantName,
        "Marca administrada desde TrainIA.",
        JSON.stringify(["claro", "cercano", "profesional"]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(["garantizado", "el mejor del mercado"]),
        JSON.stringify(["Conocé más", "Sumate a la comunidad"])
      ]
    );

    await connection.commit();
    return tenantId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureUser(input: {
  externalUserId: string;
  email: string;
  displayName: string;
  role: PulseRole;
  tenantId: number;
}) {
  const [identityRows] = await db.query<RowDataPacket[]>(
    `SELECT ei.user_id
     FROM external_identities ei
     INNER JOIN users u ON u.id = ei.user_id
     WHERE ei.source = 'trainia'
       AND ei.external_user_id = ?
       AND u.active = 1
     LIMIT 1`,
    [input.externalUserId]
  );

  let userId: number | null = identityRows[0]
    ? Number(identityRows[0].user_id)
    : null;

  if (!userId) {
    const [emailRows] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [input.email.trim().toLowerCase()]
    );

    if (emailRows[0]) {
      userId = Number(emailRows[0].id);
    } else {
      const unusablePassword = await bcrypt.hash(
        randomBytes(32).toString("base64url"),
        12
      );
      const [userResult] = await db.execute<ResultSetHeader>(
        `INSERT INTO users
         (email, password_hash, display_name, active)
         VALUES (?, ?, ?, 1)`,
        [input.email.trim().toLowerCase(), unusablePassword, input.displayName]
      );
      userId = userResult.insertId;
    }

    await db.execute(
      `INSERT INTO external_identities
       (source, external_user_id, user_id, metadata_json, last_seen_at)
       VALUES ('trainia', ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         metadata_json = VALUES(metadata_json),
         last_seen_at = UTC_TIMESTAMP()`,
      [
        input.externalUserId,
        userId,
        JSON.stringify({ email: input.email, displayName: input.displayName })
      ]
    );
  } else {
    await db.execute(
      `UPDATE external_identities
       SET last_seen_at = UTC_TIMESTAMP(),
           metadata_json = ?
       WHERE source = 'trainia' AND external_user_id = ?`,
      [
        JSON.stringify({ email: input.email, displayName: input.displayName }),
        input.externalUserId
      ]
    );
  }

  await db.execute(
    `UPDATE users
     SET display_name = ?, active = 1
     WHERE id = ?`,
    [input.displayName, userId]
  );

  await db.execute(
    `INSERT INTO user_tenants
     (user_id, tenant_id, role, active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       role = VALUES(role),
       active = 1`,
    [userId, input.tenantId, input.role]
  );

  return userId;
}

export async function exchangeTrainiaSso(input: {
  token: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const claims = verifyTrainiaToken(input.token);
  const tenantId = await ensureTenant({
    externalTenantId: claims.tenantId,
    tenantName: claims.tenantName,
    tenantSlug: claims.tenantSlug
  });
  const role = roleFromTrainia(claims.role);
  const userId = await ensureUser({
    externalUserId: claims.sub,
    email: claims.email,
    displayName: claims.displayName,
    role,
    tenantId
  });

  const session = await issueSessionForUserTenant({
    userId,
    tenantId,
    requestMeta: {
      ip: input.ip,
      userAgent: input.userAgent
    }
  });

  await auditEvent({
    tenantId,
    userId,
    action: "integration.trainia_sso",
    entityType: "user",
    entityId: userId,
    metadata: {
      externalTenantId: claims.tenantId,
      externalUserId: claims.sub,
      mappedRole: role
    },
    ip: input.ip,
    userAgent: input.userAgent
  });

  return session;
}
