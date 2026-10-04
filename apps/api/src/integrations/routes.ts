import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { refreshCookieOptions } from "../auth/cookie.js";
import { exchangeTrainiaSso } from "./trainia.js";
import { ingestTrainiaGrowthSignal } from "./growthSignals.js";

const router = Router();

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const growthLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

router.post("/trainia/growth-events", growthLimiter, async (req, res, next) => {
  try {
    const authorization = req.get("authorization") ?? "";
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) {
      res.status(401).json({
        error: "GROWTH_SIGNAL_AUTH_REQUIRED",
        message: "Evento Growth firmado requerido"
      });
      return;
    }

    const data = await ingestTrainiaGrowthSignal(token);
    res.status(data.idempotentReplay ? 200 : 202).json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/trainia/exchange", limiter, async (req, res, next) => {
  try {
    const body = z.object({
      token: z.string().min(20).max(10000)
    }).parse(req.body);

    const session = await exchangeTrainiaSso({
      token: body.token,
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.cookie(
      config.AUTH_REFRESH_COOKIE,
      session.refreshToken,
      refreshCookieOptions()
    );

    const { refreshToken: _hidden, ...safe } = session;
    res.json({ data: safe });
  } catch (error) {
    next(error);
  }
});

export default router;
