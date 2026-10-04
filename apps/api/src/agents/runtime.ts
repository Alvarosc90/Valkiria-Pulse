import {
  createDefaultAgents,
  SocialOrchestrator
} from "@pulse/agents";
import { configuredAgentModel } from "./modelGateway.js";
import { config } from "../config.js";

const model = configuredAgentModel();

export const pulseOrchestrator = new SocialOrchestrator(
  createDefaultAgents(model)
);

export const agentRuntime = {
  mode: model ? "ai" : "deterministic",
  provider: model?.provider ?? null,
  model: model?.name ?? null,
  maxConcurrency: model ? config.PULSE_LLM_MAX_CONCURRENCY : 0,
  agents: ["instagram", "tiktok", "linkedin"]
};
