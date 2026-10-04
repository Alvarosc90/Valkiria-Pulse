import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { recordGrowthConversion, upsertGrowthContact } from "../services/growthService.js";

const signalClaimsSchema = z.object({
  sub: z.string().min(1).max(190),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  tenantId: z.union([z.string(), z.number()]).transform((value) => String(value)),
  eventId: z.string().min(4).max(190),
  eventType: z.string().min(2).max(120),
  occurredAt: z.string().datetime({ offset: true }),
  brandName: z.string().min(1).max(190).optional(),
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

function verifyGrowthToken(rawToken: string) {
  if (!config.PULSE_GROWTH_INTEGRATIONS_ENABLED) {
    throw new HttpError(
      "La integración Growth está deshabilitada",
      503,
      "GROWTH_INTEGRATION_DISABLED"
    );
  }
  if (!config.TRAINIA_GROWTH_SECRET) {
    throw new HttpError(
      "La integración Growth no está configurada",
      503,
      "GROWTH_INTEGRATION_NOT_CONFIGURED"
    );
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(rawToken, config.TRAINIA_GROWTH_SECRET, {
      issuer: config.TRAINIA_SSO_ISSUER,
      audience: config.TRAINIA_GROWTH_AUDIENCE,
      algorithms: ["HS256"]
    });
  } catch {
    throw new HttpError(
      "Firma de evento inválida o vencida",
      401,
      "GROWTH_SIGNAL_INVALID"
    );
  }

  if (typeof payload === "string") {
    throw new HttpError("Evento inválido", 401, "GROWTH_SIGNAL_INVALID");
  }

  return signalClaimsSchema.parse(payload);
}

async function resolveTenant(externalTenantId: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT tl.tenant_id AS tenantId
     FROM tenant_links tl
     INNER JOIN tenants t ON t.id = tl.tenant_id
     WHERE tl.source = 'trainia'
       AND tl.external_tenant_id = ?
       AND t.status = 'active'
     LIMIT 1`,
    [externalTenantId]
  );

  if (!rows[0]) {
    throw new HttpError(
      "El tenant de TrainIA todavía no está vinculado con PULSE",
      404,
      "GROWTH_TRAINIA_TENANT_NOT_LINKED"
    );
  }
  return Number(rows[0].tenantId);
}

async function resolveBrand(tenantId: number, brandName?: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    brandName
      ? `SELECT id, name
         FROM brands
         WHERE tenant_id = ? AND active = 1 AND name = ?
         ORDER BY id ASC
         LIMIT 1`
      : `SELECT id, name
         FROM brands
         WHERE tenant_id = ? AND active = 1
         ORDER BY id ASC
         LIMIT 1`,
    brandName ? [tenantId, brandName] : [tenantId]
  );

  if (!rows[0]) {
    throw new HttpError("Marca PULSE no encontrada", 404, "BRAND_NOT_FOUND");
  }
  return { id: Number(rows[0].id), name: String(rows[0].name) };
}

function conversionTypeFor(eventType: string) {
  const map: Record<string, string> = {
    "lead.created": "lead",
    "whatsapp.reply": "reply",
    "checkout.started": "checkout_started",
    "purchase.completed": "purchase",
    "membership.renewed": "renewal",
    "member.reactivated": "reactivated",
    "member.retained": "retained",
    "whatsapp.opt_out": "opt_out"
  };
  return map[eventType] ?? null;
}

export async function ingestTrainiaGrowthSignal(rawToken: string) {
  const claims = verifyGrowthToken(rawToken);
  const tenantId = await resolveTenant(claims.tenantId);
  const brand = await resolveBrand(tenantId, claims.brandName);

  let contactId: number | null = null;
  if (claims.subject) {
    const contact = await upsertGrowthContact({
      tenantId,
      brandId: brand.id,
      sourceSystem: "trainia",
      externalRef: claims.subject.externalRef,
      displayName: claims.subject.displayName ?? null,
      email: claims.subject.email ?? null,
      phoneE164: claims.subject.phoneE164 ?? null,
      whatsappConsent: claims.subject.whatsappConsent,
      consentSource: claims.subject.consentSource ?? "trainia",
      metadata: {
        lastGrowthEventType: claims.eventType,
        lastGrowthEventAt: claims.occurredAt
      }
    });
    contactId = contact.id;
  }

  const [signalResult] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_signals
     (tenant_id, brand_id, source_system, external_event_id, event_type,
      subject_ref, contact_id, occurred_at, payload_json, processing_status)
     VALUES (?, ?, 'trainia', ?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      tenantId,
      brand.id,
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
      sourceSystem: "trainia",
      externalEventId: claims.eventId,
      occurredAt: new Date(claims.occurredAt),
      metadata: {
        signalId,
        sourceEventType: claims.eventType,
        ...claims.data
      }
    });
  }

  return {
    signalId,
    tenantId,
    brandId: brand.id,
    contactId,
    eventType: claims.eventType,
    processingStatus: "pending",
    idempotentReplay: signalResult.affectedRows !== 1
  };
}
