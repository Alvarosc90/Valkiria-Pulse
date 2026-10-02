import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { rebuildEditorialSignals } from "../analytics/feedback.js";
import { getAnalyticsOverview } from "../analytics/reporting.js";

const router = Router();

router.get("/overview", async (req, res, next) => {
  try {
    const query = z.object({
      brandId: z.coerce.number().int().positive().optional(),
      days: z.coerce.number().int().min(1).max(365).default(30)
    }).parse(req.query);

    const data = await getAnalyticsOverview({
      tenantId: Number(req.auth!.tenantId),
      brandId: query.brandId,
      days: query.days
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/feedback/rebuild",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        brandId: z.coerce.number().int().positive()
      }).parse(req.body);

      const data = await rebuildEditorialSignals({
        tenantId: Number(req.auth!.tenantId),
        brandId: body.brandId
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
