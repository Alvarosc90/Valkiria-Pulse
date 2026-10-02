import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError } from "../http/httpError.js";
import {
  changePassword,
  createVerificationForUser,
  listActiveSessions,
  requestPasswordReset,
  requestVerificationByEmail,
  resetPasswordWithToken,
  revokeAllSessions,
  revokeSession,
  verifyEmailToken
} from "./accountSecurity.js";
import { refreshCookieOptions } from "./cookie.js";
import { requireAuth } from "./middleware.js";
import { passwordSchema } from "./passwordPolicy.js";
import { authSecurityEvent } from "./securityEvents.js";
import { login, refreshAccess, revokeRefresh } from "./service.js";
import { createTrialWorkspace } from "./signup.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "AUTH_RATE_LIMITED",
    message: "Demasiados intentos. Esperá unos minutos antes de volver a intentar."
  }
});

const signupLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const recoveryLimiter = rateLimit({
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

function allowedOrigins() {
  return new Set(
    config.CORS_ORIGIN
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

const requireSameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  if (!allowedOrigins().has(origin)) {
    res.status(403).json({
      error: "AUTH_ORIGIN_FORBIDDEN",
      message: "Origen no autorizado"
    });
    return;
  }
  next();
};

router.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    if (!config.PUBLIC_SIGNUP_ENABLED) {
      throw new HttpError(
        "El registro público no está habilitado",
        403,
        "PUBLIC_SIGNUP_DISABLED"
      );
    }

    const body = z.object({
      displayName: z.string().trim().min(2).max(160),
      companyName: z.string().trim().min(2).max(140),
      brandName: z.string().trim().min(2).max(140).optional(),
      email: z.string().trim().email().max(180),
      password: passwordSchema,
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

    if (config.REQUIRE_EMAIL_VERIFICATION) {
      const verification = await createVerificationForUser({
        userId: created.userId,
        ip: req.ip
      });

      await authSecurityEvent({
        userId: created.userId,
        tenantId: created.tenantId,
        email: body.email,
        eventKey: "signup.created",
        outcome: "success",
        ip: req.ip,
        userAgent: req.get("user-agent"),
        metadata: { emailVerificationRequired: true }
      }).catch(() => undefined);

      res.status(201).json({
        data: {
          verificationRequired: true,
          email: body.email.toLowerCase(),
          tenantSlug: created.tenantSlug,
          trial: { plan: "starter", days: 14 },
          legalVersion: created.legalVersion,
          ...(verification.devToken
            ? { devVerificationToken: verification.devToken }
            : {})
        }
      });
      return;
    }

    await dbVerifyUser(created.userId);
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
      trial: { plan: "starter", days: 14 },
      legalVersion: created.legalVersion
    });
  } catch (error) {
    next(error);
  }
});

async function dbVerifyUser(userId: number) {
  const { db } = await import("../db.js");
  await db.execute(
    "UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?",
    [userId]
  );
}

router.post("/verify-email", recoveryLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      token: z.string().min(20).max(300)
    }).parse(req.body);

    const result = await verifyEmailToken(body.token);

    await authSecurityEvent({
      email: result.email,
      eventKey: "email.verified",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => undefined);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/verification/resend", recoveryLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().email().max(180)
    }).parse(req.body);

    const result = await requestVerificationByEmail({
      email: body.email,
      ip: req.ip
    });

    res.status(202).json({
      data: {
        accepted: true,
        ...(result.devToken ? { devVerificationToken: result.devToken } : {})
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/password/forgot", recoveryLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().email().max(180)
    }).parse(req.body);

    const result = await requestPasswordReset({
      email: body.email,
      ip: req.ip
    });

    await authSecurityEvent({
      email: body.email,
      eventKey: "password.reset_requested",
      outcome: "info",
      ip: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => undefined);

    res.status(202).json({
      data: {
        accepted: true,
        message:
          "Si existe una cuenta para ese email, enviamos instrucciones de recuperación.",
        ...(result.devToken ? { devResetToken: result.devToken } : {})
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/password/reset", recoveryLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      token: z.string().min(20).max(300),
      password: passwordSchema
    }).parse(req.body);

    const result = await resetPasswordWithToken(body);

    await authSecurityEvent({
      eventKey: "password.reset_completed",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => undefined);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  const bodyResult = z.object({
    email: z.string().trim().email().max(180),
    password: z.string().min(1).max(128),
    tenantSlug: z.string().min(1).max(120).optional()
  }).safeParse(req.body);

  if (!bodyResult.success) {
    next(bodyResult.error);
    return;
  }

  const body = bodyResult.data;

  try {
    const result = await login({
      ...body,
      requestMeta: {
        ip: req.ip,
        userAgent: req.get("user-agent")
      }
    });

    if (result.requiresTenantSelection) {
      await authSecurityEvent({
        email: body.email,
        eventKey: "login.tenant_selection",
        outcome: "success",
        ip: req.ip,
        userAgent: req.get("user-agent")
      }).catch(() => undefined);

      res.json(result);
      return;
    }

    res.cookie(config.AUTH_REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
    const { refreshToken: _hidden, ...safe } = result;

    await authSecurityEvent({
      userId: Number(result.user.id),
      tenantId: Number(result.tenant.id),
      email: body.email,
      eventKey: "login.success",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => undefined);

    res.json(safe);
  } catch (error) {
    await authSecurityEvent({
      email: body.email,
      eventKey: "login.failure",
      outcome: "failure",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        code:
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : null
      }
    }).catch(() => undefined);

    next(error);
  }
});

router.post("/refresh", refreshLimiter, requireSameOrigin, async (req, res, next) => {
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
    res.setHeader("Cache-Control", "no-store");
    res.json({ accessToken: result.accessToken });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireSameOrigin, async (req, res, next) => {
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
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: req.auth });
});

router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const sessions = await listActiveSessions({
      userId: Number(req.auth!.userId),
      tenantId: Number(req.auth!.tenantId)
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: sessions });
  } catch (error) {
    next(error);
  }
});

router.delete("/sessions/:sessionId", requireAuth, async (req, res, next) => {
  try {
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const result = await revokeSession({
      userId: Number(req.auth!.userId),
      tenantId: Number(req.auth!.tenantId),
      sessionId
    });

    await authSecurityEvent({
      userId: Number(req.auth!.userId),
      tenantId: Number(req.auth!.tenantId),
      eventKey: "session.revoked",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { sessionId, revoked: result.revoked }
    }).catch(() => undefined);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/sessions/revoke-all", requireAuth, async (req, res, next) => {
  try {
    const result = await revokeAllSessions({
      userId: Number(req.auth!.userId)
    });

    await authSecurityEvent({
      userId: Number(req.auth!.userId),
      tenantId: Number(req.auth!.tenantId),
      eventKey: "session.revoked_all",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { revoked: result.revoked }
    }).catch(() => undefined);

    res.clearCookie(config.AUTH_REFRESH_COOKIE, refreshCookieOptions());
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/password/change", requireAuth, async (req, res, next) => {
  try {
    const body = z.object({
      currentPassword: z.string().min(1).max(128),
      nextPassword: passwordSchema
    }).parse(req.body);

    const result = await changePassword({
      userId: Number(req.auth!.userId),
      currentPassword: body.currentPassword,
      nextPassword: body.nextPassword
    });

    await authSecurityEvent({
      userId: Number(req.auth!.userId),
      tenantId: Number(req.auth!.tenantId),
      eventKey: "password.changed",
      outcome: "success",
      ip: req.ip,
      userAgent: req.get("user-agent")
    }).catch(() => undefined);

    res.clearCookie(config.AUTH_REFRESH_COOKIE, refreshCookieOptions());
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
