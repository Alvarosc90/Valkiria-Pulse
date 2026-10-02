import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import {
  InstagramAgent,
  LinkedInAgent,
  SocialOrchestrator,
  TikTokAgent
} from "@pulse/agents";
import { config } from "./config.js";
import { pingDb } from "./db.js";
import { errorHandler } from "./http/errorHandler.js";
import calendarsRouter from "./routes/calendars.js";
import overviewRouter from "./routes/overview.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()),
  credentials: true
}));
app.use(pinoHttp());
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
      agents: ["instagram", "tiktok", "linkedin"]
    });
  } catch {
    res.status(503).json({
      service: "valkiria-pulse-api",
      status: "degraded",
      database: "unavailable"
    });
  }
});

app.post("/api/v1/generate", async (req, res, next) => {
  try {
    const { entry, brand } = req.body;
    const generated = await orchestrator.generate(entry, brand);
    res.json({ data: generated });
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/calendars", calendarsRouter);
app.use("/api/v1/overview", overviewRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`Valkiria PULSE API listening on :${config.PORT}`);
});
