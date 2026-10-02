import type { SocialPlatform } from "@pulse/contracts";

export type PostMetricSample = {
  externalPostId: string;
  metricDate: string;
  impressions?: number | null;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  clicks?: number | null;
  follows?: number | null;
  watchTimeSeconds?: number | null;
  metadata?: Record<string, unknown>;
};

export interface AnalyticsProvider {
  readonly platform: SocialPlatform;
  fetchPostMetrics(input: {
    accountId: string;
    since: string;
    until: string;
  }): Promise<PostMetricSample[]>;
}
