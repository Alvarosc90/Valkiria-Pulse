import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { auditEvent } from "../services/auditService.js";
import {
  createGrowthActionDraft,
  createGrowthAudience,
  createGrowthCampaign,
  createGrowthSequence,
  createGrowthTrigger,
  growthOverview,
  listGrowthAudiences,
  listGrowthCampaigns,
  recordGrowthConversion,
  updateGrowthCampaign,
  updateGrowthSequenceStatus,
  upsertGrowthContact
} from "../services/growthService.js";

const router = Router();

const campaignStatus = z.enum([
  "draft",
  "ready",
  "active",
  "paused",
  "completed",
  "cancelled"
]);

const campaignType = z.enum([
  "acquisition",
  "reactivation",
  "retention",
  "promotion",
  "cross_sell",
  "upsell",
  "winback",
  "other"
]);

router.get("/overview", async (req, res, next) => {
  try {
    const query = z.object({
      brandId: z.coerce.number().int().positive().optional()
    }).parse(req.query);

    const data = await growthOverview(Number(req.auth!.tenantId), query.brandId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/audiences", async (req, res, next) => {
  try {
    const query = z.object({
      brandId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50)
    }).parse(req.query);

    const data = await listGrowthAudiences({
      tenantId: Number(req.auth!.tenantId),
      brandId: query.brandId,
      limit: query.limit
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/audiences",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        brandId: z.coerce.number().int().positive(),
        name: z.string().min(2).max(190),
        description: z.string().max(1000).nullable().optional(),
        sourceType: z.enum(["manual", "rule", "trainia", "erp", "integration"]).default("manual"),
        definition: z.record(z.unknown()).optional(),
        estimatedSize: z.coerce.number().int().min(0).max(100000000).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await createGrowthAudience({
        tenantId,
        userId: Number(req.auth!.userId),
        ...body
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.audience.created",
        entityType: "growth_audience",
        entityId: data.id,
        metadata: {
          brandId: body.brandId,
          sourceType: body.sourceType,
          estimatedSize: body.estimatedSize ?? 0
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/contacts",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        brandId: z.coerce.number().int().positive().nullable().optional(),
        sourceSystem: z.string().min(1).max(80).default("pulse"),
        externalRef: z.string().min(1).max(190).nullable().optional(),
        displayName: z.string().max(190).nullable().optional(),
        email: z.string().email().max(255).nullable().optional(),
        phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
        whatsappConsent: z.enum(["unknown", "opted_in", "opted_out"]).default("unknown"),
        consentSource: z.string().max(120).nullable().optional(),
        metadata: z.record(z.unknown()).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await upsertGrowthContact({ tenantId, ...body });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.contact.upserted",
        entityType: "growth_contact",
        entityId: data.id,
        metadata: {
          sourceSystem: body.sourceSystem,
          whatsappConsent: body.whatsappConsent
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(data.created ? 201 : 200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/campaigns", async (req, res, next) => {
  try {
    const query = z.object({
      brandId: z.coerce.number().int().positive().optional(),
      status: campaignStatus.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50)
    }).parse(req.query);

    const data = await listGrowthCampaigns({
      tenantId: Number(req.auth!.tenantId),
      brandId: query.brandId,
      status: query.status,
      limit: query.limit
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/campaigns",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        brandId: z.coerce.number().int().positive(),
        audienceId: z.coerce.number().int().positive().nullable().optional(),
        name: z.string().min(2).max(190),
        objective: z.string().min(3).max(500),
        campaignType,
        primaryChannel: z.enum([
          "whatsapp",
          "instagram",
          "tiktok",
          "linkedin",
          "multi",
          "paid_media"
        ]).default("multi"),
        executionMode: z.enum(["owned_channels", "manual_paid_media"]).default("owned_channels"),
        paidProvider: z.enum(["meta", "google"]).nullable().optional(),
        paidBudgetAmountMinor: z.coerce.number().int().min(0).nullable().optional(),
        paidBudgetCurrency: z.string().length(3).toUpperCase().nullable().optional(),
        startsAt: z.string().datetime({ offset: true }).nullable().optional(),
        endsAt: z.string().datetime({ offset: true }).nullable().optional(),
        strategy: z.record(z.unknown()).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await createGrowthCampaign({
        tenantId,
        userId: Number(req.auth!.userId),
        ...body,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.campaign.created",
        entityType: "growth_campaign",
        entityId: data.id,
        metadata: {
          brandId: body.brandId,
          campaignType: body.campaignType,
          primaryChannel: body.primaryChannel,
          executionMode: body.executionMode,
          paidBudgetIsExternal: true
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/campaigns/:campaignId",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const campaignId = z.coerce.number().int().positive().parse(req.params.campaignId);
      const body = z.object({
        status: campaignStatus.optional(),
        audienceId: z.coerce.number().int().positive().nullable().optional(),
        objective: z.string().min(3).max(500).optional(),
        strategy: z.record(z.unknown()).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await updateGrowthCampaign({ tenantId, campaignId, ...body });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.campaign.updated",
        entityType: "growth_campaign",
        entityId: campaignId,
        metadata: {
          status: body.status,
          audienceId: body.audienceId
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/triggers",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        campaignId: z.coerce.number().int().positive().nullable().optional(),
        triggerKey: z.string().min(2).max(120),
        sourceSystem: z.string().min(1).max(80),
        eventType: z.string().min(1).max(120),
        conditions: z.record(z.unknown()).optional(),
        cooldownMinutes: z.coerce.number().int().min(0).max(525600).default(0)
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await createGrowthTrigger({ tenantId, ...body });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.trigger.created",
        entityType: "growth_trigger",
        entityId: data.id,
        metadata: {
          campaignId: body.campaignId ?? null,
          sourceSystem: body.sourceSystem,
          eventType: body.eventType
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/campaigns/:campaignId/sequences",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const campaignId = z.coerce.number().int().positive().parse(req.params.campaignId);
      const body = z.object({
        name: z.string().min(2).max(190),
        stopOnConversion: z.boolean().default(true),
        steps: z.array(z.object({
          channel: z.enum([
            "whatsapp",
            "instagram",
            "tiktok",
            "linkedin",
            "internal",
            "manual_paid_media"
          ]),
          actionType: z.enum([
            "message",
            "content",
            "offer",
            "follow_up",
            "paid_media_draft",
            "wait",
            "task"
          ]),
          delayMinutes: z.coerce.number().int().min(0).max(525600).default(0),
          requiresConsent: z.boolean().optional(),
          template: z.record(z.unknown()).optional()
        })).min(1).max(30)
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await createGrowthSequence({
        tenantId,
        userId: Number(req.auth!.userId),
        campaignId,
        ...body
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.sequence.created",
        entityType: "growth_sequence",
        entityId: data.id,
        metadata: { campaignId, steps: data.steps },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/sequences/:sequenceId",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const sequenceId = z.coerce.number().int().positive().parse(req.params.sequenceId);
      const body = z.object({
        status: z.enum(["draft", "ready", "active", "paused", "completed"])
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await updateGrowthSequenceStatus({
        tenantId,
        sequenceId,
        status: body.status
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.sequence.status_updated",
        entityType: "growth_sequence",
        entityId: sequenceId,
        metadata: { status: body.status },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/campaigns/:campaignId/actions/draft",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const campaignId = z.coerce.number().int().positive().parse(req.params.campaignId);
      const body = z.object({
        sequenceId: z.coerce.number().int().positive().nullable().optional(),
        stepId: z.coerce.number().int().positive().nullable().optional(),
        contactId: z.coerce.number().int().positive().nullable().optional(),
        channel: z.enum([
          "whatsapp",
          "instagram",
          "tiktok",
          "linkedin",
          "internal",
          "meta_ads",
          "google_ads"
        ]),
        executionMode: z.enum(["draft_only", "manual"]).default("draft_only"),
        idempotencyKey: z.string().min(8).max(190),
        payload: z.record(z.unknown()).optional(),
        scheduledAt: z.string().datetime({ offset: true }).nullable().optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await createGrowthActionDraft({
        tenantId,
        campaignId,
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.action.drafted",
        entityType: "growth_channel_action",
        entityId: data.id,
        metadata: {
          campaignId,
          channel: body.channel,
          executionMode: body.executionMode
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/conversions",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        campaignId: z.coerce.number().int().positive().nullable().optional(),
        contactId: z.coerce.number().int().positive().nullable().optional(),
        eventType: z.enum([
          "lead",
          "reply",
          "checkout_started",
          "purchase",
          "renewal",
          "reactivated",
          "retained",
          "opt_out",
          "custom"
        ]),
        sourceSystem: z.string().min(1).max(80),
        externalEventId: z.string().max(190).nullable().optional(),
        valueAmountMinor: z.coerce.number().int().min(0).nullable().optional(),
        valueCurrency: z.string().length(3).toUpperCase().nullable().optional(),
        occurredAt: z.string().datetime({ offset: true }),
        metadata: z.record(z.unknown()).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const data = await recordGrowthConversion({
        tenantId,
        ...body,
        occurredAt: new Date(body.occurredAt)
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "growth.conversion.recorded",
        entityType: "growth_conversion_event",
        entityId: data.id,
        metadata: {
          campaignId: body.campaignId ?? null,
          eventType: body.eventType,
          sourceSystem: body.sourceSystem
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(data.recorded ? 201 : 200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
