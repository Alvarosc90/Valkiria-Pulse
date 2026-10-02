import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "../db.js";
import { askPublicPulse } from "../public/publicAssistant.js";

const router = Router();

const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 24,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

router.post("/assistant", assistantLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      question: z.string().min(2).max(700)
    }).parse(req.body);

    const answer = await askPublicPulse(body.question);
    res.json({ data: { answer } });
  } catch (error) {
    next(error);
  }
});

router.post("/contact", contactLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2).max(120),
      company: z.string().trim().min(2).max(160),
      email: z.string().trim().email().max(180),
      phone: z.string().trim().max(60).optional().default(""),
      currentSystem: z.string().trim().max(160).optional().default(""),
      message: z.string().trim().max(3000).optional().default(""),
      website: z.string().max(200).optional().default("")
    }).parse(req.body);

    if (body.website) {
      res.status(201).json({ data: { ok: true } });
      return;
    }

    await db.execute(
      `INSERT INTO public_leads
       (name, company, email, phone, current_system, message, source)
       VALUES (?, ?, ?, ?, ?, ?, 'landing')`,
      [
        body.name,
        body.company,
        body.email.toLowerCase(),
        body.phone || null,
        body.currentSystem || null,
        body.message || null
      ]
    );

    res.status(201).json({
      data: {
        ok: true,
        message: "Recibimos tu consulta. Te vamos a contactar para revisar la puesta en marcha de PULSE."
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
