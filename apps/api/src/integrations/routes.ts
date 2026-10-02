import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { refreshCookieOptions } from "../auth/cookie.js";
import { exchangeTrainiaSso } from "./trainia.js";

const router = Router();

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
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
