import type { PublishRequest, PublishResult } from "@pulse/contracts";
import { TokenAwareProvider } from "./index.js";

export class TikTokProvider extends TokenAwareProvider {
  readonly platform = "tiktok" as const;

  async publish(request: PublishRequest): Promise<PublishResult> {
    const token = await this.token(request.accountId);
    const videoUrl = this.requiredMetadata<string>(request, "videoUrl");
    const privacy = (request.content.metadata?.privacy as string | undefined) ?? "SELF_ONLY";

    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        post_info: {
          title: request.content.title ?? request.content.caption,
          privacy_level: privacy,
          disable_duet: Boolean(request.content.metadata?.disableDuet ?? false),
          disable_comment: Boolean(request.content.metadata?.disableComment ?? false),
          disable_stitch: Boolean(request.content.metadata?.disableStitch ?? false),
          video_cover_timestamp_ms: Number(request.content.metadata?.coverTimestampMs ?? 1000)
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: videoUrl
        }
      })
    });

    const payload = await response.json() as any;
    if (!response.ok || payload?.error?.code !== "ok") {
      return {
        platform: this.platform,
        status: "failed",
        error: payload?.error?.message ?? `TikTok HTTP ${response.status}`
      };
    }

    return {
      platform: this.platform,
      status: "processing",
      externalId: payload.data.publish_id
    };
  }

  async getStatus(accountId: string, externalId: string): Promise<PublishResult> {
    const token = await this.token(accountId);

    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({ publish_id: externalId })
    });

    const payload = await response.json() as any;
    if (!response.ok || payload?.error?.code !== "ok") {
      return {
        platform: this.platform,
        status: "failed",
        externalId,
        error: payload?.error?.message ?? `TikTok HTTP ${response.status}`
      };
    }

    const status = String(payload.data?.status ?? "");
    return {
      platform: this.platform,
      status: status === "PUBLISH_COMPLETE" ? "published" : "processing",
      externalId
    };
  }

  async creatorInfo(accountId: string) {
    const token = await this.token(accountId);
    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: "{}"
    });

    const payload = await response.json() as any;
    if (!response.ok || payload?.error?.code !== "ok") {
      throw new Error(payload?.error?.message ?? "TikTok creator_info failed");
    }

    return payload.data;
  }
}
