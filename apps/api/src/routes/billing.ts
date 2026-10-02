import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { getPlanCatalog } from "../billing/catalog.js";
import {
  getCheckoutSession,
  prepareCheckoutSession,
  startCheckoutSession
} from "../billing/checkout.js";
import { prepareSubscriptionAction } from "../billing/actions.js";
import { executeSubscriptionAction } from "../billing/actionExecutor.js";
import {
  ensureDefaultSubscription,
  getTenantSubscription
} from "../billing/subscription.js";
import { getUsageSnapshot } from "../billing/limits.js";
import {
  mercadoPagoStatus,
  testMercadoPagoConnection
} from "../billing/mercadoPago.js";
import { auditEvent } from "../services/auditService.js";

const router = Router();


router.get("/provider/status", async (_req, res) => {
  res.json({ data: mercadoPagoStatus() });
});

router.post(
  "/provider/test",
  requireRole("owner"),
  async (_req, res, next) => {
    try {
      const result = await testMercadoPagoConnection();
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/checkout/start",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        planKey: z.string().min(1).max(80),
        currency: z.string().length(3),
        interval: z.enum(["monthly", "yearly"]),
        idempotencyKey: z.string().min(8).max(190)
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const userId = Number(req.auth!.userId);

      const checkout = await startCheckoutSession({
        tenantId,
        userId,
        planKey: body.planKey,
        currency: body.currency,
        interval: body.interval,
        idempotencyKey: body.idempotencyKey
      });

      await auditEvent({
        tenantId,
        userId,
        action: "billing.checkout_started",
        entityType: "billing_checkout",
        entityId: checkout.id,
        metadata: {
          planKey: body.planKey,
          currency: body.currency.toUpperCase(),
          interval: body.interval,
          provider: checkout.provider
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data: checkout });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/checkout/:checkoutId",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const checkoutId = z.string().uuid().parse(req.params.checkoutId);
      const checkout = await getCheckoutSession({
        tenantId: Number(req.auth!.tenantId),
        checkoutId
      });

      res.json({ data: checkout });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/catalog", async (req, res, next) => {
  try {
    const query = z.object({
      currency: z.string().length(3).optional(),
      interval: z.enum(["monthly", "yearly"]).optional()
    }).parse(req.query);

    const plans = await getPlanCatalog(query);
    res.json({ data: plans });
  } catch (error) {
    next(error);
  }
});

router.get("/subscription", async (req, res, next) => {
  try {
    const tenantId = Number(req.auth!.tenantId);
    const subscription =
      await getTenantSubscription(tenantId) ??
      await ensureDefaultSubscription(tenantId);
    const usage = await getUsageSnapshot(tenantId);

    res.json({
      data: {
        subscription,
        usage
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/subscription/bootstrap",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const subscription = await ensureDefaultSubscription(
        Number(req.auth!.tenantId)
      );
      res.status(201).json({ data: subscription });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/checkout/prepare",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        planKey: z.string().min(1).max(80),
        currency: z.string().length(3),
        interval: z.enum(["monthly", "yearly"]),
        idempotencyKey: z.string().min(8).max(190)
      }).parse(req.body);

      const prepared = await prepareCheckoutSession({
        tenantId: Number(req.auth!.tenantId),
        userId: Number(req.auth!.userId),
        planKey: body.planKey,
        currency: body.currency,
        interval: body.interval,
        idempotencyKey: body.idempotencyKey
      });

      res.status(201).json({ data: prepared });
    } catch (error) {
      next(error);
    }
  }
);


router.post(
  "/subscription/actions/:actionId/execute",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const actionId = z.string().uuid().parse(req.params.actionId);
      const tenantId = Number(req.auth!.tenantId);
      const userId = Number(req.auth!.userId);

      const result = await executeSubscriptionAction({
        tenantId,
        userId,
        actionId
      });

      await auditEvent({
        tenantId,
        userId,
        action: "billing.subscription_action_executed",
        entityType: "billing_subscription_action",
        entityId: actionId,
        metadata: {
          action: result.action,
          status: result.status,
          provider: result.provider ?? null
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/subscription/actions/prepare",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        action: z.enum(["pause", "resume", "cancel", "change_plan"]),
        idempotencyKey: z.string().min(8).max(190),
        targetPlanKey: z.string().min(1).max(80).optional(),
        targetPriceId: z.coerce.number().int().positive().optional()
      }).parse(req.body);

      const prepared = await prepareSubscriptionAction({
        tenantId: Number(req.auth!.tenantId),
        userId: Number(req.auth!.userId),
        action: body.action,
        idempotencyKey: body.idempotencyKey,
        targetPlanKey: body.targetPlanKey,
        targetPriceId: body.targetPriceId
      });

      res.status(201).json({ data: prepared });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
