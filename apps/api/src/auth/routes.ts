import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { requireAuth } from "./middleware.js";
import { login, refreshAccess, revokeRefresh } from "./service.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 90,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1/auth",
    maxAge: config.AUTH_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email().max(180),
      password: z.string().min(8).max(128),
      tenantSlug: z.string().min(1).max(120).optional()
    }).parse(req.body);

    const result = await login({
      ...body,
      requestMeta: {
        ip: req.ip,
        userAgent: req.get("user-agent")
      }
    });

    if (result.requiresTenantSelection) {
      res.json(result);
      return;
    }

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, cookieOptions());
    const { refreshToken: _hidden, ...safe } = result;
    res.json(safe);
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", refreshLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.[config.AUTH_REFRESH_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "AUTH_REFRESH_REQUIRED" });
      return;
    }

    const result = await refreshAccess(token, {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.json({ accessToken: result.accessToken });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[config.AUTH_REFRESH_COOKIE] as string | undefined;
    await revokeRefresh(token);
    res.clearCookie(config.AUTH_REFRESH_COOKIE, cookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ data: req.auth });
});

export default router;
