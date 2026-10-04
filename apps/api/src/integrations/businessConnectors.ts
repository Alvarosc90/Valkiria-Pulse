import { randomBytes, randomUUID } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { decryptCredential, encryptCredential } from "../security/credentialVault.js";
import { recordGrowthConversion, upsertGrowthContact } from "../services/growthService.js";

const connectorKeyPattern = /^[a-z0-9][a-z0-9_-]{1,79}$/;

const connectorEventSchema = z.object({
  sub: z.string().min(1).max(190),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  eventId: z.string().min(4).max(190),
  eventType: z.string().min(2).max(120),
  occurredAt: z.string().datetime({ offset: true }),
  subject: z.object({
    externalRef: z.string().min(1).max(190),
    displayName: z.string().max(190).optional(),
    email: z.string().email().max(255).optional(),
    phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
    whatsappConsent: z.enum(["unknown", "opted_in", "opted_out"]).default("unknown"),
    consentSource: z.string().max(120).optional()
  }).optional(),
  data: z.record(z.unknown()).default({})
});

function conversionTypeFor(eventType: string) {
  const map: Record<string, string> = {
    "lead.created": "lead",
    "contact.reply": "reply",
    "whatsapp.reply": "reply",
    "checkout.started": "checkout_started",
    "purchase.completed": "purchase",
    "membership.renewed": "renewal",
    "subscription.renewed": "renewal",
    "customer.reactivated": "reactivated",
    "member.reactivated": "reactivated",
    "customer.retained": "retained",
    "member.retained": "retained",
    "contact.opt_out": "opt_out",
    "whatsapp.opt_out": "opt_out"
  };
  return map[eventType] ?? null;
}

async function assertBrand(tenantId: number, brandId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
    [brandId, tenantId]
  );
  if (!rows[0]) throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
}

export async function listBusinessConnectors(tenantId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, public_id AS publicId, brand_id AS brandId,
            connector_key AS connectorKey, provider_key AS providerKey,
            display_name AS displayName, external_tenant_id AS externalTenantId,
            status, auth_mode AS authMode, issuer, audience,
            secret_version AS secretVersion, capabilities_json AS capabilities,
            settings_json AS settings, last_seen_at AS lastSeenAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM business_connectors
     WHERE tenant_id = ?
     ORDER BY display_name ASC, id ASC`,
    [tenantId]
  );
  return rows;
}

export async function createBusinessConnector(input: {
  tenantId: number;
  userId: number;
  brandId?: number | null;
  connectorKey: string;
  providerKey: string;
  displayName: string;
  externalTenantId?: string | null;
  issuer?: string;
  capabilities?: string[];
  settings?: Record<string, unknown>;
}) {
  const connectorKey = input.connectorKey.trim().toLowerCase();
  const providerKey = input.providerKey.trim().toLowerCase();
  if (!connectorKeyPattern.test(connectorKey) || !connectorKeyPattern.test(providerKey)) {
    throw new HttpError("Clave de conector inválida", 400, "CONNECTOR_KEY_INVALID");
  }

  if (input.brandId) await assertBrand(input.tenantId, input.brandId);

  const publicId = randomUUID();
  const secret = randomBytes(48).toString("base64url");
  const issuer = (input.issuer ?? providerKey).trim();
  const audience = "valkiria-pulse-growth";

  try {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO business_connectors
       (public_id, tenant_id, brand_id, connector_key, provider_key, display_name,
        external_tenant_id, status, auth_mode, issuer, audience, secret_enc,
        secret_version, capabilities_json, settings_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'jwt_hs256', ?, ?, ?, 1, ?, ?, ?)`,
      [
        publicId,
        input.tenantId,
        input.brandId ?? null,
        connectorKey,
        providerKey,
        input.displayName.trim(),
        input.externalTenantId?.trim() || null,
        issuer,
        audience,
        encryptCredential(secret),
        JSON.stringify(input.capabilities ?? ["growth.events.write"]),
        input.settings ? JSON.stringify(input.settings) : null,
        input.userId
      ]
    );

    return {
      id: Number(result.insertId),
      publicId,
      connectorKey,
      providerKey,
      issuer,
      audience,
      endpointPath: `/api/v1/integrations/connectors/${publicId}/events`,
      secret,
      secretVersion: 1,
      warning: "El secreto se muestra una sola vez. Guardalo en el sistema emisor."
    };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      throw new HttpError(
        "Ya existe un conector con esa clave para este tenant",
        409,
        "CONNECTOR_DUPLICATE"
      );
    }
    throw error;
  }
}

export async function rotateBusinessConnectorSecret(input: {
  tenantId: number;
  connectorId: number;
}) {
  const secret = randomBytes(48).toString("base64url");
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE business_connectors
     SET secret_enc = ?,
         secret_version = secret_version + 1,
         status = 'active'
     WHERE id = ? AND tenant_id = ?`,
    [encryptCredential(secret), input.connectorId, input.tenantId]
  );

  if (!result.affectedRows) {
    throw new HttpError("Conector no encontrado", 404, "CONNECTOR_NOT_FOUND");
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT public_id AS publicId, connector_key AS connectorKey,
            provider_key AS providerKey, issuer, audience,
            secret_version AS secretVersion
     FROM business_connectors
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.connectorId, input.tenantId]
  );

  return {
    ...rows[0],
    secret,
    endpointPath: `/api/v1/integrations/connectors/${rows[0]!.publicId}/events`,
    warning: "El secreto anterior dejó de ser válido."
  };
}

export async function setBusinessConnectorStatus(input: {
  tenantId: number;
  connectorId: number;
  status: "active" | "paused" | "revoked";
}) {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE business_connectors
     SET status = ?
     WHERE id = ? AND tenant_id = ?`,
    [input.status, input.connectorId, input.tenantId]
  );
  if (!result.affectedRows) {
    throw new HttpError("Conector no encontrado", 404, "CONNECTOR_NOT_FOUND");
  }
  return { id: input.connectorId, status: input.status };
}

async function connectorByPublicId(publicId: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, public_id AS publicId, tenant_id AS tenantId,
            brand_id AS brandId, connector_key AS connectorKey,
            provider_key AS providerKey, display_name AS displayName,
            external_tenant_id AS externalTenantId, status, auth_mode AS authMode,
            issuer, audience, secret_enc AS secretEnc,
            capabilities_json AS capabilities
     FROM business_connectors
     WHERE public_id = ?
     LIMIT 1`,
    [publicId]
  );
  if (!rows[0]) {
    throw new HttpError("Conector no encontrado", 404, "CONNECTOR_NOT_FOUND");
  }
  return rows[0];
}

function capabilitiesFrom(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function verifyConnectorEventToken(connector: RowDataPacket, rawToken: string) {
  if (String(connector.status) !== "active") {
    throw new HttpError("Conector inactivo", 403, "CONNECTOR_INACTIVE");
  }
  if (String(connector.authMode) !== "jwt_hs256") {
    throw new HttpError("Modo de autenticación no soportado", 409, "CONNECTOR_AUTH_UNSUPPORTED");
  }
  if (!capabilitiesFrom(connector.capabilities).includes("growth.events.write")) {
    throw new HttpError("El conector no puede enviar eventos Growth", 403, "CONNECTOR_SCOPE_DENIED");
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(rawToken, decryptCredential(String(connector.secretEnc)), {
      issuer: String(connector.issuer),
      audience: String(connector.audience),
      algorithms: ["HS256"]
    });
  } catch {
    throw new HttpError("Firma de conector inválida o vencida", 401, "CONNECTOR_TOKEN_INVALID");
  }

  if (typeof payload === "string") {
    throw new HttpError("Evento de conector inválido", 401, "CONNECTOR_TOKEN_INVALID");
  }

  return connectorEventSchema.parse(payload);
}

export async function ingestBusinessConnectorEvent(input: {
  publicId: string;
  rawToken: string;
}) {
  const connector = await connectorByPublicId(input.publicId);
  const claims = verifyConnectorEventToken(connector, input.rawToken);
  const tenantId = Number(connector.tenantId);
  const brandId = connector.brandId ? Number(connector.brandId) : null;
  const providerKey = String(connector.providerKey);

  let contactId: number | null = null;
  if (claims.subject) {
    const contact = await upsertGrowthContact({
      tenantId,
      brandId,
      sourceSystem: providerKey,
      externalRef: claims.subject.externalRef,
      displayName: claims.subject.displayName ?? null,
      email: claims.subject.email ?? null,
      phoneE164: claims.subject.phoneE164 ?? null,
      whatsappConsent: claims.subject.whatsappConsent,
      consentSource: claims.subject.consentSource ?? providerKey,
      metadata: {
        connectorPublicId: input.publicId,
        connectorKey: connector.connectorKey,
        lastGrowthEventType: claims.eventType,
        lastGrowthEventAt: claims.occurredAt
      }
    });
    contactId = contact.id;
  }

  const [signalResult] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_signals
     (tenant_id, brand_id, connector_id, source_system, external_event_id,
      event_type, subject_ref, contact_id, occurred_at, payload_json, processing_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      tenantId,
      brandId,
      Number(connector.id),
      providerKey,
      claims.eventId,
      claims.eventType,
      claims.subject?.externalRef ?? null,
      contactId,
      new Date(claims.occurredAt),
      JSON.stringify(claims.data)
    ]
  );

  const signalId = Number(signalResult.insertId);
  const conversionType = conversionTypeFor(claims.eventType);
  if (conversionType) {
    await recordGrowthConversion({
      tenantId,
      contactId,
      eventType: conversionType as
        | "lead"
        | "reply"
        | "checkout_started"
        | "purchase"
        | "renewal"
        | "reactivated"
        | "retained"
        | "opt_out",
      sourceSystem: providerKey,
      externalEventId: claims.eventId,
      occurredAt: new Date(claims.occurredAt),
      metadata: {
        signalId,
        connectorId: Number(connector.id),
        connectorKey: connector.connectorKey,
        sourceEventType: claims.eventType,
        ...claims.data
      }
    });
  }

  await db.execute(
    "UPDATE business_connectors SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = ?",
    [Number(connector.id)]
  );

  return {
    signalId,
    connectorId: Number(connector.id),
    connectorKey: String(connector.connectorKey),
    providerKey,
    tenantId,
    brandId,
    contactId,
    eventType: claims.eventType,
    processingStatus: "pending",
    idempotentReplay: signalResult.affectedRows !== 1
  };
}
