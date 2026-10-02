import {
  createDefaultAgents,
  SocialOrchestrator
} from "@pulse/agents";
import { configuredAgentModel } from "./modelGateway.js";

const model = configuredAgentModel();

export const pulseOrchestrator = new SocialOrchestrator(
  createDefaultAgents(model)
);

export const agentRuntime = {
  mode: model ? "ai" : "deterministic",
  model: model?.name ?? null,
  agents: ["instagram", "tiktok", "linkedin"]
};
