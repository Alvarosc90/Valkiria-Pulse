import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { refreshCookieOptions } from "./cookie.js";
import { requireAuth } from "./middleware.js";
import { login, refreshAccess, revokeRefresh } from "./service.js";
import { createTrialWorkspace } from "./signup.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const signupLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 90,
  standardHeaders: "draft-8",
  legacyHeaders: false
});


router.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      displayName: z.string().trim().min(2).max(160),
      companyName: z.string().trim().min(2).max(140),
      brandName: z.string().trim().min(2).max(140).optional(),
      email: z.string().trim().email().max(180),
      password: z.string()
        .min(10)
        .max(128)
        .regex(/[A-Za-z]/, "La contraseña debe incluir letras")
        .regex(/[0-9]/, "La contraseña debe incluir al menos un número"),
      acceptTerms: z.literal(true),
      acceptPrivacy: z.literal(true)
    }).parse(req.body);

    const requestMeta = {
      ip: req.ip,
      userAgent: req.get("user-agent")
    };

    const created = await createTrialWorkspace({
      ...body,
      requestMeta
    });

    const result = await login({
      email: body.email,
      password: body.password,
      tenantSlug: created.tenantSlug,
      requestMeta
    });

    if (result.requiresTenantSelection) {
      throw new Error("Unexpected tenant selection after signup");
    }

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
    const { refreshToken: _hidden, ...safe } = result;

    res.status(201).json({
      ...safe,
      trial: {
        plan: "starter",
        days: 14
      },
      legalVersion: created.legalVersion
    });
  } catch (error) {
    next(error);
  }
});

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

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
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

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
    res.json({ accessToken: result.accessToken });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[config.AUTH_REFRESH_COOKIE] as string | undefined;
    await revokeRefresh(token);
    res.clearCookie(config.AUTH_REFRESH_COOKIE, refreshCookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ data: req.auth });
});

export default router;
