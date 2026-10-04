import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { auditEvent } from "../services/auditService.js";
import {
  createBusinessConnector,
  listBusinessConnectors,
  rotateBusinessConnectorSecret,
  setBusinessConnectorStatus
} from "../integrations/businessConnectors.js";

const router = Router();

router.get("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const data = await listBusinessConnectors(Number(req.auth!.tenantId));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = z.object({
      brandId: z.coerce.number().int().positive().nullable().optional(),
      connectorKey: z.string().min(2).max(80),
      providerKey: z.string().min(2).max(80),
      displayName: z.string().min(2).max(190),
      externalTenantId: z.string().min(1).max(190).nullable().optional(),
      issuer: z.string().min(1).max(190).optional(),
      capabilities: z.array(z.string().min(1).max(120)).max(50).optional(),
      settings: z.record(z.unknown()).optional()
    }).parse(req.body);

    const tenantId = Number(req.auth!.tenantId);
    const data = await createBusinessConnector({
      tenantId,
      userId: Number(req.auth!.userId),
      ...body
    });

    await auditEvent({
      tenantId,
      userId: Number(req.auth!.userId),
      action: "connector.created",
      entityType: "business_connector",
      entityId: data.id,
      metadata: {
        connectorKey: data.connectorKey,
        providerKey: data.providerKey,
        publicId: data.publicId
      },
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:connectorId/rotate-secret",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const connectorId = z.coerce.number().int().positive().parse(req.params.connectorId);
      const tenantId = Number(req.auth!.tenantId);
      const data = await rotateBusinessConnectorSecret({ tenantId, connectorId });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "connector.secret_rotated",
        entityType: "business_connector",
        entityId: connectorId,
        metadata: { secretVersion: data.secretVersion },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:connectorId/status",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const connectorId = z.coerce.number().int().positive().parse(req.params.connectorId);
      const body = z.object({
        status: z.enum(["active", "paused", "revoked"])
      }).parse(req.body);
      const tenantId = Number(req.auth!.tenantId);
      const data = await setBusinessConnectorStatus({
        tenantId,
        connectorId,
        status: body.status
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "connector.status_updated",
        entityType: "business_connector",
        entityId: connectorId,
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

export default router;
