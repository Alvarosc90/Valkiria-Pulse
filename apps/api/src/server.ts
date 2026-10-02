import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import {
  InstagramAgent,
  LinkedInAgent,
  SocialOrchestrator,
  TikTokAgent
} from "@pulse/agents";
import authRouter from "./auth/routes.js";
import { requireAuth, requireTenantMatch } from "./auth/middleware.js";
import { config } from "./config.js";
import connectionsRouter from "./connections/routes.js";
import { pingDb } from "./db.js";
import { errorHandler } from "./http/errorHandler.js";
import { HttpError } from "./http/httpError.js";
import brandsRouter from "./routes/brands.js";
import calendarsRouter from "./routes/calendars.js";
import overviewRouter from "./routes/overview.js";
import socialAccountsRouter from "./routes/socialAccounts.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()),
  credentials: true
}));
app.use(pinoHttp());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

const orchestrator = new SocialOrchestrator([
  new InstagramAgent(),
  new TikTokAgent(),
  new LinkedInAgent()
]);

app.get("/health", async (_req, res) => {
  try {
    await pingDb();
    res.json({
      service: "valkiria-pulse-api",
      status: "ok",
      database: "ok",
      agents: ["instagram", "tiktok", "linkedin"],
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

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/connections", connectionsRouter);

app.post("/api/v1/generate", requireAuth, requireTenantMatch, async (req, res, next) => {
  try {
    const { entry, brand } = req.body;
    const tenantId = req.auth!.tenantId;

    if (
      (entry?.tenantId && String(entry.tenantId) !== tenantId) ||
      (brand?.tenantId && String(brand.tenantId) !== tenantId)
    ) {
      throw new HttpError(
        "Acceso cruzado entre empresas bloqueado",
        403,
        "TENANT_BOUNDARY_VIOLATION"
      );
    }

    const generated = await orchestrator.generate(
      { ...entry, tenantId },
      { ...brand, tenantId }
    );
    res.json({ data: generated });
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/brands", requireAuth, requireTenantMatch, brandsRouter);
app.use("/api/v1/calendars", requireAuth, requireTenantMatch, calendarsRouter);
app.use("/api/v1/overview", requireAuth, requireTenantMatch, overviewRouter);
app.use("/api/v1/social-accounts", requireAuth, requireTenantMatch, socialAccountsRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`Valkiria PULSE API listening on :${config.PORT}`);
});
