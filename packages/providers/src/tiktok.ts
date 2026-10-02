import type { PublishRequest, PublishResult } from "@pulse/contracts";
import { TokenAwareProvider } from "./base.js";

export class TikTokProvider extends TokenAwareProvider {
  readonly platform = "tiktok" as const;

  async publish(request: PublishRequest): Promise<PublishResult> {
    const token = await this.token(request.accountId);
    const videoUrl = this.requiredMetadata<string>(request, "videoUrl");

    const creator = await this.creatorInfo(request.accountId);
    const allowedPrivacy = Array.isArray(creator?.privacy_level_options)
      ? creator.privacy_level_options.map(String)
      : [];

    const requestedPrivacy =
      (request.content.metadata?.privacy as string | undefined) ?? "SELF_ONLY";
    const privacy = request.content.metadata?.sandbox === true
      ? "SELF_ONLY"
      : requestedPrivacy;

    if (allowedPrivacy.length && !allowedPrivacy.includes(privacy)) {
      return {
        platform: this.platform,
        status: "failed",
        error: "TikTok privacy level is not allowed for this creator: " + privacy
      };
    }

    const disableDuet =
      Boolean(request.content.metadata?.disableDuet ?? false) ||
      Boolean(creator?.duet_disabled ?? false);
    const disableComment =
      Boolean(request.content.metadata?.disableComment ?? false) ||
      Boolean(creator?.comment_disabled ?? false);
    const disableStitch =
      Boolean(request.content.metadata?.disableStitch ?? false) ||
      Boolean(creator?.stitch_disabled ?? false);

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
          disable_duet: disableDuet,
          disable_comment: disableComment,
          disable_stitch: disableStitch,
          video_cover_timestamp_ms: Number(
            request.content.metadata?.coverTimestampMs ?? 1000
          )
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
