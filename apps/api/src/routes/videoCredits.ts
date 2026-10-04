import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import {
  getVideoCreditCatalog,
  getVideoCreditWallet,
  quoteVideoCredits
} from "../billing/videoCredits.js";
import {
  getVideoCreditCheckout,
  startVideoCreditCheckout
} from "../billing/videoCreditCheckout.js";
import { auditEvent } from "../services/auditService.js";

const router = Router();

router.get("/catalog", async (req, res, next) => {
  try {
    const query = z.object({
      currency: z.string().length(3).default("ARS")
    }).parse(req.query);

    const data = await getVideoCreditCatalog(query.currency);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/wallet", async (req, res, next) => {
  try {
    const data = await getVideoCreditWallet(Number(req.auth!.tenantId));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/quote", async (req, res, next) => {
  try {
    const body = z.object({
      modelKey: z.string().min(1).max(100),
      units: z.coerce.number().positive().max(120)
    }).parse(req.body);

    const data = await quoteVideoCredits({
      tenantId: Number(req.auth!.tenantId),
      modelKey: body.modelKey,
      units: body.units
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/checkout/start",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        packKey: z.string().min(1).max(80),
        currency: z.string().length(3),
        idempotencyKey: z.string().min(8).max(190)
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const userId = Number(req.auth!.userId);

      const checkout = await startVideoCreditCheckout({
        tenantId,
        userId,
        packKey: body.packKey,
        currency: body.currency,
        idempotencyKey: body.idempotencyKey
      });

      await auditEvent({
        tenantId,
        userId,
        action: "video_credits.checkout_started",
        entityType: "video_credit_checkout",
        entityId: checkout.id,
        metadata: {
          packKey: body.packKey,
          credits: checkout.credits,
          currency: body.currency.toUpperCase(),
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
      const data = await getVideoCreditCheckout({
        tenantId: Number(req.auth!.tenantId),
        checkoutId
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
