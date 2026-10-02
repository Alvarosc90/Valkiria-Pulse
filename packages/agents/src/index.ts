import type {
  BrandContext,
  CalendarEntry,
  GeneratedPost,
  SocialPlatform
} from "@pulse/contracts";

export interface PlatformAgent {
  readonly platform: SocialPlatform;
  create(entry: CalendarEntry, brand: BrandContext): Promise<GeneratedPost>;
}

abstract class BasePlatformAgent implements PlatformAgent {
  abstract readonly platform: SocialPlatform;

  async create(entry: CalendarEntry, brand: BrandContext): Promise<GeneratedPost> {
    if (entry.platform !== this.platform) {
      throw new Error(`Expected ${this.platform} entry, received ${entry.platform}`);
    }
    return this.compose(entry, brand);
  }

  protected abstract compose(
    entry: CalendarEntry,
    brand: BrandContext
  ): Promise<GeneratedPost>;
}

export class InstagramAgent extends BasePlatformAgent {
  readonly platform = "instagram" as const;

  protected async compose(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: { contentMode: "visual-first" }
    };
  }
}

export class TikTokAgent extends BasePlatformAgent {
  readonly platform = "tiktok" as const;

  protected async compose(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      title: entry.topic,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: { contentMode: "hook-first", privacy: "SELF_ONLY" }
    };
  }
}

export class LinkedInAgent extends BasePlatformAgent {
  readonly platform = "linkedin" as const;

  protected async compose(entry: CalendarEntry): Promise<GeneratedPost> {
    return {
      platform: this.platform,
      caption: entry.notes ?? entry.topic,
      assetRefs: entry.assetRefs,
      metadata: { contentMode: "professional-context" }
    };
  }
}

export class SocialOrchestrator {
  private readonly agents: Map<SocialPlatform, PlatformAgent>;

  constructor(agents: PlatformAgent[]) {
    this.agents = new Map(agents.map((agent) => [agent.platform, agent]));
  }

  async generate(entry: CalendarEntry, brand: BrandContext): Promise<GeneratedPost> {
    const agent = this.agents.get(entry.platform);
    if (!agent) throw new Error(`No agent registered for ${entry.platform}`);
    return agent.create(entry, brand);
  }
}
