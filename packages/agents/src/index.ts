import type {
  AgentGenerationContext,
  BrandContext,
  CalendarEntry,
  GeneratedPost,
  SocialPlatform
} from "@pulse/contracts";
import type { AgentModel } from "./model.js";
import { platformSystemPrompt, platformUserPrompt } from "./prompts.js";

export type { AgentModel, AgentModelRequest } from "./model.js";
export { platformSystemPrompt, platformUserPrompt } from "./prompts.js";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface PlatformAgent {
  readonly platform: SocialPlatform;
  create(
    entry: CalendarEntry,
    brand: BrandContext,
    context?: AgentGenerationContext
  ): Promise<GeneratedPost>;
}

abstract class BasePlatformAgent implements PlatformAgent {
  abstract readonly platform: SocialPlatform;

  constructor(protected readonly model?: AgentModel) {}

  async create(
    entry: CalendarEntry,
    brand: BrandContext,
    context?: AgentGenerationContext
  ): Promise<GeneratedPost> {
    if (entry.platform !== this.platform) {
      throw new Error(`Expected ${this.platform} entry, received ${entry.platform}`);
    }

    if (!this.model) return this.fallback(entry, brand);

    const output = await this.model.generateJson({
      platform: this.platform,
      systemPrompt: platformSystemPrompt(this.platform),
      userPrompt: platformUserPrompt(entry, brand, context)
    });

    return this.fromModel(output, entry, brand);
  }

  protected abstract fallback(
    entry: CalendarEntry,
    brand: BrandContext
  ): Promise<GeneratedPost>;

  protected abstract fromModel(
    output: Record<string, unknown>,
    entry: CalendarEntry,
    brand: BrandContext
  ): GeneratedPost;

  protected modelMetadata() {
    return {
      generationMode: "ai",
      model: this.model?.name
    };
  }
}

export class InstagramAgent extends BasePlatformAgent {
  readonly platform = "instagram" as const;

  protected async fallback(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: {
        contentMode: "visual-first",
        generationMode: "deterministic"
      }
    };
  }

  protected fromModel(
    output: Record<string, unknown>,
    entry: CalendarEntry
  ): GeneratedPost {
    const caption = text(output.caption);
    if (!caption) throw new Error("Instagram Agent returned an empty caption");

    return {
      platform: this.platform,
      caption,
      hashtags: stringArray(output.hashtags),
      assetRefs: entry.assetRefs,
      metadata: {
        ...entry.platformContext,
        ...this.modelMetadata(),
        contentMode: "visual-first",
        mediaBrief: text(output.mediaBrief),
        cta: text(output.cta)
      }
    };
  }
}

export class TikTokAgent extends BasePlatformAgent {
  readonly platform = "tiktok" as const;

  protected async fallback(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      title: entry.topic,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: {
        ...entry.platformContext,
        contentMode: "hook-first",
        privacy: entry.platformContext?.privacy ?? "SELF_ONLY",
        generationMode: "deterministic"
      }
    };
  }

  protected fromModel(
    output: Record<string, unknown>,
    entry: CalendarEntry
  ): GeneratedPost {
    const caption = text(output.caption);
    const title = text(output.title, entry.topic);
    if (!caption) throw new Error("TikTok Agent returned an empty caption");

    return {
      platform: this.platform,
      title,
      caption,
      hashtags: stringArray(output.hashtags),
      assetRefs: entry.assetRefs,
      metadata: {
        ...entry.platformContext,
        ...this.modelMetadata(),
        contentMode: "hook-first",
        privacy: entry.platformContext?.privacy ?? "SELF_ONLY",
        hook: text(output.hook),
        videoIdea: text(output.videoIdea),
        script: text(output.script),
        durationSec: Number(output.durationSec) || undefined
      }
    };
  }
}

export class LinkedInAgent extends BasePlatformAgent {
  readonly platform = "linkedin" as const;

  protected async fallback(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: {
        ...entry.platformContext,
        contentMode: "professional-context",
        generationMode: "deterministic"
      }
    };
  }

  protected fromModel(
    output: Record<string, unknown>,
    entry: CalendarEntry
  ): GeneratedPost {
    const caption = text(output.caption);
    if (!caption) throw new Error("LinkedIn Agent returned an empty caption");

    return {
      platform: this.platform,
      caption,
      hashtags: stringArray(output.hashtags),
      assetRefs: entry.assetRefs,
      metadata: {
        ...entry.platformContext,
        ...this.modelMetadata(),
        contentMode: "professional-context",
        professionalAngle: text(output.professionalAngle),
        cta: text(output.cta)
      }
    };
  }
}

export function createDefaultAgents(model?: AgentModel): PlatformAgent[] {
  return [
    new InstagramAgent(model),
    new TikTokAgent(model),
    new LinkedInAgent(model)
  ];
}

export class SocialOrchestrator {
  private readonly agents: Map<SocialPlatform, PlatformAgent>;

  constructor(agents: PlatformAgent[]) {
    this.agents = new Map(agents.map((agent) => [agent.platform, agent]));
  }

  async generate(
    entry: CalendarEntry,
    brand: BrandContext,
    context?: AgentGenerationContext
  ): Promise<GeneratedPost> {
    const agent = this.agents.get(entry.platform);
    if (!agent) throw new Error(`No agent registered for ${entry.platform}`);
    return agent.create(entry, brand, context);
  }
}
