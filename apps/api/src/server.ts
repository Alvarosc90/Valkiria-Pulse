import express from "express";
import {
  InstagramAgent,
  LinkedInAgent,
  SocialOrchestrator,
  TikTokAgent
} from "@pulse/agents";

const app = express();
app.use(express.json());

const orchestrator = new SocialOrchestrator([
  new InstagramAgent(),
  new TikTokAgent(),
  new LinkedInAgent()
]);

app.get("/health", (_req, res) => {
  res.json({
    service: "valkiria-pulse-api",
    status: "ok",
    agents: ["instagram", "tiktok", "linkedin"]
  });
});

app.post("/api/v1/generate", async (req, res) => {
  try {
    const { entry, brand } = req.body;
    const generated = await orchestrator.generate(entry, brand);
    res.json({ data: generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

const port = Number(process.env.PORT ?? 4200);
app.listen(port, () => {
  console.log(`Valkiria PULSE API listening on :${port}`);
});
