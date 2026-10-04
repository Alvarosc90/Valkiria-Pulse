import type {
  AgentModel,
  AgentModelRequest
} from "@pulse/agents";
import { config } from "../config.js";
import { db } from "../db.js";

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function asPositiveInt(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function asNullablePositiveInt(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function estimatedCostUsd(inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  const cached = Math.min(inputTokens, Math.max(0, cachedInputTokens));
  const uncached = Math.max(0, inputTokens - cached);
  return (
    (uncached * config.PULSE_LLM_INPUT_USD_PER_MILLION) +
    (cached * config.PULSE_LLM_CACHED_INPUT_USD_PER_MILLION) +
    (outputTokens * config.PULSE_LLM_OUTPUT_USD_PER_MILLION)
  ) / 1_000_000;
}

async function recordUsage(input: {
  request: AgentModelRequest;
  provider: string;
  model: string;
  providerRequestId?: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  status: "success" | "failed";
  errorCode?: string | null;
}) {
  const tenantId = asNullablePositiveInt(input.request.tenantId);
  if (!tenantId) return;

  const inputTokens = input.inputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const totalTokens = input.totalTokens ?? (inputTokens + outputTokens);
  const cost = estimatedCostUsd(inputTokens, cachedInputTokens, outputTokens);

  try {
    await db.execute(
      `INSERT INTO ai_usage_events
       (tenant_id, brand_id, platform, entry_id, provider, model,
        provider_request_id, input_tokens, cached_input_tokens,
        output_tokens, total_tokens, estimated_cost_usd, status, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        asNullablePositiveInt(input.request.brandId),
        input.request.platform,
        input.request.entryId?.slice(0, 190) ?? null,
        input.provider,
        input.model,
        input.providerRequestId?.slice(0, 190) ?? null,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens,
        cost,
        input.status,
        input.errorCode?.slice(0, 120) ?? null
      ]
    );
  } catch (error) {
    console.error(
      "PULSE AI metering write failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

class ConcurrencyGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

const generationGate = new ConcurrencyGate(config.PULSE_LLM_MAX_CONCURRENCY);

function retryable(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAiCompatibleAgentModel implements AgentModel {
  readonly name: string;
  readonly provider: string;
  private readonly endpoint: string;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string
  ) {
    this.name = model;
    this.provider = config.PULSE_LLM_PROVIDER;
    const base = baseUrl.replace(/\/$/, "");
    this.endpoint = base.endsWith("/v1")
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
  }

  async generateJson(request: AgentModelRequest): Promise<Record<string, unknown>> {
    return generationGate.run(async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= config.PULSE_LLM_MAX_RETRIES; attempt += 1) {
        let response: Response;
        let payload: any = {};
        try {
          response = await fetch(this.endpoint, {
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

          const raw = await response.text();
          try {
            payload = raw ? JSON.parse(raw) : {};
          } catch {
            throw new Error(`Agent model returned invalid HTTP JSON: ${raw.slice(0, 300)}`);
          }

          if (!response.ok) {
            const message =
              payload?.error?.message ??
              payload?.message ??
              `Agent model HTTP ${response.status}`;
            const error = new Error(message);
            lastError = error;

            if (retryable(response.status) && attempt < config.PULSE_LLM_MAX_RETRIES) {
              await sleep(350 * (attempt + 1));
              continue;
            }

            await recordUsage({
              request,
              provider: this.provider,
              model: this.model,
              providerRequestId: payload?.id ?? null,
              status: "failed",
              errorCode: `HTTP_${response.status}`
            });
            throw error;
          }

          const content = payload?.choices?.[0]?.message?.content;
          if (typeof content !== "string" || !content.trim()) {
            throw new Error("Agent model returned no message content");
          }

          const usage = payload?.usage ?? {};
          const inputTokens = asPositiveInt(usage.prompt_tokens);
          const cachedInputTokens = asPositiveInt(
            usage?.prompt_tokens_details?.cached_tokens
          );
          const outputTokens = asPositiveInt(usage.completion_tokens);
          const totalTokens = asPositiveInt(usage.total_tokens) ||
            (inputTokens + outputTokens);

          await recordUsage({
            request,
            provider: this.provider,
            model: this.model,
            providerRequestId: payload?.id ?? null,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            totalTokens,
            status: "success"
          });

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
        } catch (error) {
          if (error instanceof Error && error === lastError) throw error;
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < config.PULSE_LLM_MAX_RETRIES) {
            await sleep(350 * (attempt + 1));
            continue;
          }

          await recordUsage({
            request,
            provider: this.provider,
            model: this.model,
            status: "failed",
            errorCode: lastError.name || "MODEL_ERROR"
          });
          throw lastError;
        }
      }

      throw lastError ?? new Error("Agent model request failed");
    });
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
