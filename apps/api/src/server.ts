import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import { agentRuntime, pulseOrchestrator } from "./agents/runtime.js";
import authRouter from "./auth/routes.js";
import { requireAuth, requireTenantMatch } from "./auth/middleware.js";
import {
  assertPlanLimit,
  incrementMonthlyUsage
} from "./billing/limits.js";
import { config } from "./config.js";
import connectionsRouter from "./connections/routes.js";
import { pingDb } from "./db.js";
import { errorHandler } from "./http/errorHandler.js";
import integrationsRouter from "./integrations/routes.js";
import analyticsRouter from "./routes/analytics.js";
import approvalsRouter from "./routes/approvals.js";
import auditRouter from "./routes/audit.js";
import billingRouter from "./routes/billing.js";
import brandsRouter from "./routes/brands.js";
import calendarsRouter from "./routes/calendars.js";
import mediaRouter from "./routes/media.js";
import overviewRouter from "./routes/overview.js";
import socialAccountsRouter from "./routes/socialAccounts.js";
import publicRouter from "./routes/public.js";
import leadsRouter from "./routes/leads.js";
import {
  loadBrandContext,
  platformPerformanceSignals,
  recentPlatformPosts
} from "./services/agentContextService.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()),
  credentials: true
}));
app.use(pinoHttp());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pingDb();
    res.json({
      service: "valkiria-pulse-api",
      status: "ok",
      database: "ok",
      agents: agentRuntime.agents,
      agentMode: agentRuntime.mode,
      agentModel: agentRuntime.model,
      runtime: ["api", "worker"]
    });
  } catch {
    res.status(503).json({
      service: "valkiria-pulse-api",
      status: "degraded",
      database: "unavailable"
    });
  }
});

app.use("/api/v1/public", publicRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/connections", connectionsRouter);
app.use("/api/v1/integrations", integrationsRouter);
app.use("/api/v1/media", mediaRouter);

app.post("/api/v1/generate", requireAuth, requireTenantMatch, async (req, res, next) => {
  try {
    const body = z.object({
      brandId: z.coerce.number().int().positive(),
      entry: z.object({
        id: z.string().default("preview"),
        platform: z.enum(["instagram", "tiktok", "linkedin"]),
        scheduledAt: z.string().optional(),
        topic: z.string().min(1).max(255),
        objective: z.string().max(255).optional(),
        angle: z.string().max(255).optional(),
        assetRefs: z.array(z.string()).default([]),
        notes: z.string().max(10000).optional(),
        platformContext: z.record(z.unknown()).optional(),
        status: z.enum([
          "draft",
          "ready",
          "scheduled",
          "processing",
          "published",
          "failed"
        ]).default("draft")
      })
    }).parse(req.body);

    const tenantId = Number(req.auth!.tenantId);
    await assertPlanLimit({
      tenantId,
      metric: "aiGenerationsPerMonth",
      increment: 1
    });

    const brand = await loadBrandContext(tenantId, body.brandId);
    const [recentPosts, performanceSignals] = await Promise.all([
      recentPlatformPosts(
        tenantId,
        body.brandId,
        body.entry.platform
      ),
      platformPerformanceSignals(
        tenantId,
        body.brandId,
        body.entry.platform
      )
    ]);

    const generated = await pulseOrchestrator.generate(
      {
        ...body.entry,
        tenantId: String(tenantId),
        scheduledAt: body.entry.scheduledAt ?? new Date().toISOString()
      },
      brand,
      { recentPosts, performanceSignals }
    );

    await incrementMonthlyUsage(
      tenantId,
      "aiGenerationsPerMonth",
      1
    );

    res.json({
      data: generated,
      meta: {
        agentMode: agentRuntime.mode,
        model: agentRuntime.model,
        recentPostsUsed: recentPosts.length,
        performanceSignalsUsed: performanceSignals.length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/analytics", requireAuth, requireTenantMatch, analyticsRouter);
app.use("/api/v1/approvals", requireAuth, requireTenantMatch, approvalsRouter);
app.use("/api/v1/audit", requireAuth, requireTenantMatch, auditRouter);
app.use("/api/v1/billing", requireAuth, requireTenantMatch, billingRouter);
app.use("/api/v1/brands", requireAuth, requireTenantMatch, brandsRouter);
app.use("/api/v1/calendars", requireAuth, requireTenantMatch, calendarsRouter);
app.use("/api/v1/overview", requireAuth, requireTenantMatch, overviewRouter);
app.use("/api/v1/social-accounts", requireAuth, requireTenantMatch, socialAccountsRouter);
app.use("/api/v1/leads", requireAuth, requireTenantMatch, leadsRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`Valkiria PULSE API listening on :${config.PORT}`);
});
