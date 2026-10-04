import type { SocialPlatform } from "@pulse/contracts";

export interface AgentModelRequest {
  platform: SocialPlatform;
  systemPrompt: string;
  userPrompt: string;
  tenantId?: string;
  brandId?: string;
  entryId?: string;
}

export interface AgentModel {
  readonly name: string;
  readonly provider?: string;
  generateJson(request: AgentModelRequest): Promise<Record<string, unknown>>;
}
