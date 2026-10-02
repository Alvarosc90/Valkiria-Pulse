import type {
  AgentModel,
  AgentModelRequest
} from "@pulse/agents";
import { config } from "../config.js";

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export class OpenAiCompatibleAgentModel implements AgentModel {
  readonly name: string;
  private readonly endpoint: string;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string
  ) {
    this.name = model;
    const base = baseUrl.replace(/\/$/, "");
    this.endpoint = base.endsWith("/v1")
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
  }

  async generateJson(request: AgentModelRequest): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(config.PULSE_LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.75,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ]
      })
    });

    const text = await response.text();
    let payload: any;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Agent model returned invalid HTTP JSON: ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ??
          payload?.message ??
          `Agent model HTTP ${response.status}`
      );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Agent model returned no message content");
    }

    try {
      const result = JSON.parse(stripCodeFence(content));
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("not an object");
      }
      return result as Record<string, unknown>;
    } catch {
      throw new Error(
        `Agent model did not return valid JSON: ${content.slice(0, 500)}`
      );
    }
  }
}

export function configuredAgentModel(): AgentModel | undefined {
  if (!config.PULSE_LLM_BASE_URL || !config.PULSE_LLM_MODEL) return undefined;

  return new OpenAiCompatibleAgentModel(
    config.PULSE_LLM_BASE_URL,
    config.PULSE_LLM_MODEL,
    config.PULSE_LLM_API_KEY
  );
}
