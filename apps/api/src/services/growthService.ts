import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

export type GrowthCampaignStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export async function growthOverview(tenantId: number, brandId?: number) {
  const brandFilter = brandId ? " AND brand_id = ?" : "";
  const params = brandId ? [tenantId, brandId] : [tenantId];

  const [[campaignRows], [audienceRows], [conversionRows], [contactRows], [paidRows]] =
    await Promise.all([
      db.query<RowDataPacket[]>(
        `SELECT status, COUNT(*) AS total
         FROM growth_campaigns
         WHERE tenant_id = ?${brandFilter}
         GROUP BY status`,
        params
      ),
      db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(estimated_size), 0) AS estimatedReach
         FROM growth_audiences
         WHERE tenant_id = ?${brandFilter} AND active = 1`,
        params
      ),
      db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(value_amount_minor), 0) AS valueAmountMinor
         FROM growth_conversion_events
         WHERE tenant_id = ?
           AND occurred_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
        [tenantId]
      ),
      db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM growth_contacts
         WHERE tenant_id = ?
           AND whatsapp_consent = 'opted_in'`,
        [tenantId]
      ),
      db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM growth_campaigns
         WHERE tenant_id = ?${brandFilter}
           AND execution_mode = 'manual_paid_media'
           AND status IN ('draft','ready','active')`,
        params
      )
    ]);

  const campaigns = Object.fromEntries(
    campaignRows.map((row) => [String(row.status), Number(row.total)])
  );

  return {
    campaigns: {
      total: Object.values(campaigns).reduce((sum, value) => sum + Number(value), 0),
      byStatus: campaigns
    },
    audiences: {
      total: Number(audienceRows[0]?.total ?? 0),
      estimatedReach: Number(audienceRows[0]?.estimatedReach ?? 0)
    },
    conversions30d: {
      total: Number(conversionRows[0]?.total ?? 0),
      valueAmountMinor: Number(conversionRows[0]?.valueAmountMinor ?? 0)
    },
    whatsapp: {
      optedInContacts: Number(contactRows[0]?.total ?? 0)
    },
    paidMedia: {
      activeDrafts: Number(paidRows[0]?.total ?? 0),
      budgetPolicy: "external"
    }
  };
}

export async function listGrowthAudiences(input: {
  tenantId: number;
  brandId?: number;
  limit: number;
}) {
  const params: number[] = [input.tenantId];
  let brandFilter = "";
  if (input.brandId) {
    brandFilter = " AND ga.brand_id = ?";
    params.push(input.brandId);
  }
  params.push(input.limit);

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ga.id, ga.brand_id AS brandId, ga.name, ga.description,
            ga.source_type AS sourceType, ga.definition_json AS definition,
            ga.estimated_size AS estimatedSize, ga.active,
            ga.created_at AS createdAt, ga.updated_at AS updatedAt,
            COUNT(gam.contact_id) AS memberCount
     FROM growth_audiences ga
     LEFT JOIN growth_audience_members gam ON gam.audience_id = ga.id
     WHERE ga.tenant_id = ?${brandFilter}
     GROUP BY ga.id
     ORDER BY ga.updated_at DESC
     LIMIT ?`,
    params
  );
  return rows;
}

export async function createGrowthAudience(input: {
  tenantId: number;
  userId: number;
  brandId: number;
  name: string;
  description?: string | null;
  sourceType: "manual" | "rule" | "trainia" | "erp" | "integration";
  definition?: Record<string, unknown>;
  estimatedSize?: number;
}) {
  await assertBrand(input.tenantId, input.brandId);

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_audiences
     (tenant_id, brand_id, name, description, source_type, definition_json,
      estimated_size, active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      input.tenantId,
      input.brandId,
      input.name,
      input.description ?? null,
      input.sourceType,
      input.definition ? JSON.stringify(input.definition) : null,
      input.estimatedSize ?? 0,
      input.userId
    ]
  );

  return { id: Number(result.insertId) };
}

export async function listGrowthCampaigns(input: {
  tenantId: number;
  brandId?: number;
  status?: GrowthCampaignStatus;
  limit: number;
}) {
  const params: Array<number | string> = [input.tenantId];
  let filters = "";
  if (input.brandId) {
    filters += " AND gc.brand_id = ?";
    params.push(input.brandId);
  }
  if (input.status) {
    filters += " AND gc.status = ?";
    params.push(input.status);
  }
  params.push(input.limit);

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT gc.id, gc.brand_id AS brandId, gc.audience_id AS audienceId,
            gc.name, gc.objective, gc.campaign_type AS campaignType,
            gc.status, gc.primary_channel AS primaryChannel,
            gc.execution_mode AS executionMode, gc.paid_provider AS paidProvider,
            gc.paid_budget_amount_minor AS paidBudgetAmountMinor,
            gc.paid_budget_currency AS paidBudgetCurrency,
            gc.paid_budget_is_external AS paidBudgetIsExternal,
            gc.starts_at AS startsAt, gc.ends_at AS endsAt,
            gc.strategy_json AS strategy, gc.metrics_json AS metrics,
            gc.created_at AS createdAt, gc.updated_at AS updatedAt,
            ga.name AS audienceName,
            (SELECT COUNT(*) FROM growth_conversion_events gce
             WHERE gce.tenant_id = gc.tenant_id AND gce.campaign_id = gc.id) AS conversions
     FROM growth_campaigns gc
     LEFT JOIN growth_audiences ga
       ON ga.id = gc.audience_id AND ga.tenant_id = gc.tenant_id
     WHERE gc.tenant_id = ?${filters}
     ORDER BY gc.updated_at DESC
     LIMIT ?`,
    params
  );

  return rows;
}

export async function createGrowthCampaign(input: {
  tenantId: number;
  userId: number;
  brandId: number;
  audienceId?: number | null;
  name: string;
  objective: string;
  campaignType:
    | "acquisition"
    | "reactivation"
    | "retention"
    | "promotion"
    | "cross_sell"
    | "upsell"
    | "winback"
    | "other";
  primaryChannel: "whatsapp" | "instagram" | "tiktok" | "linkedin" | "multi" | "paid_media";
  executionMode: "owned_channels" | "manual_paid_media";
  paidProvider?: "meta" | "google" | null;
  paidBudgetAmountMinor?: number | null;
  paidBudgetCurrency?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  strategy?: Record<string, unknown>;
}) {
  await assertBrand(input.tenantId, input.brandId);
  if (input.audienceId) {
    await assertAudience(input.tenantId, input.brandId, input.audienceId);
  }

  if (input.executionMode === "manual_paid_media") {
    if (!input.paidProvider) {
      throw new HttpError(
        "Elegí Meta Ads o Google Ads para una campaña paga",
        400,
        "GROWTH_PAID_PROVIDER_REQUIRED"
      );
    }
  } else if (input.primaryChannel === "paid_media") {
    throw new HttpError(
      "Paid Media debe usar modo manual_paid_media en esta etapa",
      400,
      "GROWTH_PAID_MODE_REQUIRED"
    );
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_campaigns
     (tenant_id, brand_id, audience_id, name, objective, campaign_type,
      status, primary_channel, execution_mode, paid_provider,
      paid_budget_amount_minor, paid_budget_currency, paid_budget_is_external,
      starts_at, ends_at, strategy_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.brandId,
      input.audienceId ?? null,
      input.name,
      input.objective,
      input.campaignType,
      input.primaryChannel,
      input.executionMode,
      input.executionMode === "manual_paid_media" ? input.paidProvider ?? null : null,
      input.executionMode === "manual_paid_media" ? input.paidBudgetAmountMinor ?? null : null,
      input.executionMode === "manual_paid_media" ? input.paidBudgetCurrency ?? null : null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.strategy ? JSON.stringify(input.strategy) : null,
      input.userId
    ]
  );

  return {
    id: Number(result.insertId),
    status: "draft" as const,
    paidBudgetIsExternal: true
  };
}

export async function updateGrowthCampaign(input: {
  tenantId: number;
  campaignId: number;
  status?: GrowthCampaignStatus;
  audienceId?: number | null;
  objective?: string;
  strategy?: Record<string, unknown>;
}) {
  const [current] = await db.query<RowDataPacket[]>(
    `SELECT id, brand_id AS brandId, status
     FROM growth_campaigns
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.campaignId, input.tenantId]
  );
  if (!current[0]) {
    throw new HttpError("Campaña no encontrada", 404, "GROWTH_CAMPAIGN_NOT_FOUND");
  }

  if (input.audienceId) {
    await assertAudience(input.tenantId, Number(current[0].brandId), input.audienceId);
  }

  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  if (input.status !== undefined) {
    fields.push("status = ?");
    values.push(input.status);
  }
  if (input.audienceId !== undefined) {
    fields.push("audience_id = ?");
    values.push(input.audienceId);
  }
  if (input.objective !== undefined) {
    fields.push("objective = ?");
    values.push(input.objective);
  }
  if (input.strategy !== undefined) {
    fields.push("strategy_json = ?");
    values.push(JSON.stringify(input.strategy));
  }
  if (!fields.length) {
    throw new HttpError("No hay cambios para aplicar", 400, "NO_CHANGES");
  }

  values.push(input.campaignId, input.tenantId);
  await db.execute(
    `UPDATE growth_campaigns
     SET ${fields.join(", ")}
     WHERE id = ? AND tenant_id = ?`,
    values
  );

  return { id: input.campaignId, updated: true };
}

export async function upsertGrowthContact(input: {
  tenantId: number;
  brandId?: number | null;
  sourceSystem: string;
  externalRef?: string | null;
  displayName?: string | null;
  email?: string | null;
  phoneE164?: string | null;
  whatsappConsent: "unknown" | "opted_in" | "opted_out";
  consentSource?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.brandId) await assertBrand(input.tenantId, input.brandId);

  if (!input.externalRef && !input.phoneE164) {
    throw new HttpError(
      "El contacto necesita externalRef o teléfono E.164",
      400,
      "GROWTH_CONTACT_IDENTITY_REQUIRED"
    );
  }

  const [existing] = input.externalRef
    ? await db.query<RowDataPacket[]>(
        `SELECT id
         FROM growth_contacts
         WHERE tenant_id = ?
           AND source_system = ?
           AND external_ref = ?
         LIMIT 1`,
        [input.tenantId, input.sourceSystem, input.externalRef]
      )
    : await db.query<RowDataPacket[]>(
        `SELECT id
         FROM growth_contacts
         WHERE tenant_id = ?
           AND phone_e164 = ?
         LIMIT 1`,
        [input.tenantId, input.phoneE164]
      );

  if (existing[0]) {
    await db.execute(
      `UPDATE growth_contacts
       SET brand_id = ?, display_name = ?, email = ?, phone_e164 = ?,
           whatsapp_consent = ?, consent_source = ?,
           consent_updated_at = UTC_TIMESTAMP(), metadata_json = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        input.brandId ?? null,
        input.displayName ?? null,
        input.email ?? null,
        input.phoneE164 ?? null,
        input.whatsappConsent,
        input.consentSource ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        Number(existing[0].id),
        input.tenantId
      ]
    );
    return { id: Number(existing[0].id), created: false };
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_contacts
     (tenant_id, brand_id, source_system, external_ref, display_name, email,
      phone_e164, whatsapp_consent, consent_source, consent_updated_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
    [
      input.tenantId,
      input.brandId ?? null,
      input.sourceSystem,
      input.externalRef ?? null,
      input.displayName ?? null,
      input.email ?? null,
      input.phoneE164 ?? null,
      input.whatsappConsent,
      input.consentSource ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
  return { id: Number(result.insertId), created: true };
}

export async function createGrowthTrigger(input: {
  tenantId: number;
  campaignId?: number | null;
  triggerKey: string;
  sourceSystem: string;
  eventType: string;
  conditions?: Record<string, unknown>;
  cooldownMinutes?: number;
}) {
  if (input.campaignId) {
    await assertCampaign(input.tenantId, input.campaignId);
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_triggers
     (tenant_id, campaign_id, trigger_key, source_system, event_type,
      conditions_json, cooldown_minutes, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      input.tenantId,
      input.campaignId ?? null,
      input.triggerKey,
      input.sourceSystem,
      input.eventType,
      input.conditions ? JSON.stringify(input.conditions) : null,
      input.cooldownMinutes ?? 0
    ]
  );
  return { id: Number(result.insertId) };
}

export async function createGrowthSequence(input: {
  tenantId: number;
  userId: number;
  campaignId: number;
  name: string;
  stopOnConversion: boolean;
  steps: Array<{
    channel: "whatsapp" | "instagram" | "tiktok" | "linkedin" | "internal" | "manual_paid_media";
    actionType: "message" | "content" | "offer" | "follow_up" | "paid_media_draft" | "wait" | "task";
    delayMinutes: number;
    requiresConsent?: boolean;
    template?: Record<string, unknown>;
  }>;
}) {
  await assertCampaign(input.tenantId, input.campaignId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO growth_sequences
       (tenant_id, campaign_id, name, status, stop_on_conversion, created_by)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [
        input.tenantId,
        input.campaignId,
        input.name,
        input.stopOnConversion ? 1 : 0,
        input.userId
      ]
    );
    const sequenceId = Number(result.insertId);

    for (let index = 0; index < input.steps.length; index += 1) {
      const step = input.steps[index]!;
      await connection.execute(
        `INSERT INTO growth_sequence_steps
         (tenant_id, sequence_id, position, channel, action_type,
          delay_minutes, requires_consent, template_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.tenantId,
          sequenceId,
          index + 1,
          step.channel,
          step.actionType,
          step.delayMinutes,
          step.channel === "whatsapp" ? 1 : step.requiresConsent ? 1 : 0,
          step.template ? JSON.stringify(step.template) : null
        ]
      );
    }

    await connection.commit();
    return { id: sequenceId, steps: input.steps.length, status: "draft" as const };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createGrowthActionDraft(input: {
  tenantId: number;
  campaignId: number;
  sequenceId?: number | null;
  stepId?: number | null;
  contactId?: number | null;
  channel: "whatsapp" | "instagram" | "tiktok" | "linkedin" | "internal" | "meta_ads" | "google_ads";
  executionMode: "draft_only" | "manual";
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  scheduledAt?: Date | null;
}) {
  await assertCampaign(input.tenantId, input.campaignId);

  if (input.channel === "whatsapp" && input.contactId) {
    const [contacts] = await db.query<RowDataPacket[]>(
      `SELECT whatsapp_consent AS consent
       FROM growth_contacts
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [input.contactId, input.tenantId]
    );
    if (!contacts[0]) {
      throw new HttpError("Contacto no encontrado", 404, "GROWTH_CONTACT_NOT_FOUND");
    }
    if (String(contacts[0].consent) !== "opted_in") {
      throw new HttpError(
        "WhatsApp bloqueado: el contacto no tiene consentimiento activo",
        409,
        "GROWTH_WHATSAPP_CONSENT_REQUIRED"
      );
    }
  }

  if ((input.channel === "meta_ads" || input.channel === "google_ads") &&
      input.executionMode !== "draft_only") {
    throw new HttpError(
      "Paid Media sólo admite borradores en esta etapa",
      409,
      "GROWTH_PAID_MEDIA_DRAFT_ONLY"
    );
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_channel_actions
     (tenant_id, campaign_id, sequence_id, step_id, contact_id, channel,
      execution_mode, status, idempotency_key, payload_json, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'drafted', ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      input.tenantId,
      input.campaignId,
      input.sequenceId ?? null,
      input.stepId ?? null,
      input.contactId ?? null,
      input.channel,
      input.executionMode,
      input.idempotencyKey,
      input.payload ? JSON.stringify(input.payload) : null,
      input.scheduledAt ?? null
    ]
  );

  return {
    id: Number(result.insertId),
    status: "drafted" as const,
    idempotentReplay: result.affectedRows !== 1
  };
}

export async function recordGrowthConversion(input: {
  tenantId: number;
  campaignId?: number | null;
  contactId?: number | null;
  eventType:
    | "lead"
    | "reply"
    | "checkout_started"
    | "purchase"
    | "renewal"
    | "reactivated"
    | "retained"
    | "opt_out"
    | "custom";
  sourceSystem: string;
  externalEventId?: string | null;
  valueAmountMinor?: number | null;
  valueCurrency?: string | null;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}) {
  if (input.campaignId) await assertCampaign(input.tenantId, input.campaignId);

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO growth_conversion_events
     (tenant_id, campaign_id, contact_id, event_type, source_system,
      external_event_id, value_amount_minor, value_currency, occurred_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      input.tenantId,
      input.campaignId ?? null,
      input.contactId ?? null,
      input.eventType,
      input.sourceSystem,
      input.externalEventId ?? null,
      input.valueAmountMinor ?? null,
      input.valueCurrency ?? null,
      input.occurredAt,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );

  const id = Number(result.insertId);
  if (input.eventType === "opt_out" && input.contactId) {
    await db.execute(
      `UPDATE growth_contacts
       SET whatsapp_consent = 'opted_out', consent_updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND tenant_id = ?`,
      [input.contactId, input.tenantId]
    );
  }

  return { id, recorded: result.affectedRows === 1 };
}

async function assertBrand(tenantId: number, brandId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
    [brandId, tenantId]
  );
  if (!rows[0]) throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
}

async function assertAudience(tenantId: number, brandId: number, audienceId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM growth_audiences
     WHERE id = ? AND tenant_id = ? AND brand_id = ? AND active = 1
     LIMIT 1`,
    [audienceId, tenantId, brandId]
  );
  if (!rows[0]) {
    throw new HttpError("Audiencia no encontrada", 404, "GROWTH_AUDIENCE_NOT_FOUND");
  }
}

async function assertCampaign(tenantId: number, campaignId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM growth_campaigns WHERE id = ? AND tenant_id = ? LIMIT 1",
    [campaignId, tenantId]
  );
  if (!rows[0]) {
    throw new HttpError("Campaña no encontrada", 404, "GROWTH_CAMPAIGN_NOT_FOUND");
  }
}
