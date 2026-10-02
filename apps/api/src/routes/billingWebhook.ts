import { Router } from "express";
import { z } from "zod";
import { processMercadoPagoWebhook } from "../billing/webhook.js";

const router = Router();

router.post("/mercadopago", async (req, res, next) => {
  try {
    const dataId = String(
      req.query["data.id"] ??
      req.body?.data?.id ??
      ""
    ).trim();

    const type = String(
      req.query.type ??
      req.body?.type ??
      ""
    ).trim();

    const action = String(req.body?.action ?? "").trim() || null;

    z.string().min(1).max(190).parse(dataId);
    z.string().min(1).max(120).parse(type);

    const result = await processMercadoPagoWebhook({
      dataId,
      type,
      action,
      xSignature: req.get("x-signature"),
      xRequestId: req.get("x-request-id"),
      payload: req.body
    });

    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
