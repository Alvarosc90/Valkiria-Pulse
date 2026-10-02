import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { getPlanCatalog } from "../billing/catalog.js";
import {
  ensureDefaultSubscription,
  getTenantSubscription
} from "../billing/subscription.js";
import { getMonthlyUsage } from "../billing/limits.js";

const router = Router();

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
    const usage = await getMonthlyUsage(tenantId);

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

export default router;
