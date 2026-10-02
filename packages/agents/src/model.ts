import type { SocialPlatform } from "@pulse/contracts";

export interface AgentModelRequest {
  platform: SocialPlatform;
  systemPrompt: string;
  userPrompt: string;
}

export interface AgentModel {
  readonly name: string;
  generateJson(request: AgentModelRequest): Promise<Record<string, unknown>>;
}
