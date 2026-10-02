export type SocialPlatform = "instagram" | "tiktok" | "linkedin";

export type PublicationStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "processing"
  | "published"
  | "failed";

export interface BrandContext {
  tenantId: string;
  brandId: string;
  name: string;
  description?: string;
  tone: string[];
  products: string[];
  approvedClaims: string[];
  forbiddenTerms: string[];
  ctas?: string[];
}

export interface CalendarEntry {
  id: string;
  tenantId: string;
  platform: SocialPlatform;
  scheduledAt: string;
  topic: string;
  objective?: string;
  angle?: string;
  assetRefs: string[];
  notes?: string;
  platformContext?: Record<string, unknown>;
  status: PublicationStatus;
}

export interface AgentGenerationContext {
  recentPosts?: string[];
}

export interface GeneratedPost {
  platform: SocialPlatform;
  caption: string;
  title?: string;
  hashtags?: string[];
  assetRefs: string[];
  metadata?: Record<string, unknown>;
}

export interface PublishRequest {
  tenantId: string;
  accountId: string;
  content: GeneratedPost;
}

export interface PublishResult {
  platform: SocialPlatform;
  status: "processing" | "published" | "failed";
  externalId?: string;
  error?: string;
}
