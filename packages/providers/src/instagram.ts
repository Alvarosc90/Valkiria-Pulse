import type { PublishRequest, PublishResult } from "@pulse/contracts";
import { TokenAwareProvider } from "./base.js";

const GRAPH_VERSION = "v25.0";

export class InstagramProvider extends TokenAwareProvider {
  readonly platform = "instagram" as const;

  async publish(request: PublishRequest): Promise<PublishResult> {
    const token = await this.token(request.accountId);
    const instagramUserId = this.requiredMetadata<string>(request, "instagramUserId");
    const imageUrl = this.requiredMetadata<string>(request, "imageUrl");

    const mediaBody = new URLSearchParams();
    mediaBody.set("image_url", imageUrl);
    mediaBody.set("caption", request.content.caption);
    mediaBody.set("access_token", token);

    const createResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(instagramUserId)}/media`,
      { method: "POST", body: mediaBody }
    );
    const createPayload = await createResponse.json() as any;

    if (!createResponse.ok || !createPayload?.id) {
      return {
        platform: this.platform,
        status: "failed",
        error: createPayload?.error?.message ?? `Instagram media HTTP ${createResponse.status}`
      };
    }

    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", createPayload.id);
    publishBody.set("access_token", token);

    const publishResponse = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(instagramUserId)}/media_publish`,
      { method: "POST", body: publishBody }
    );
    const publishPayload = await publishResponse.json() as any;

    if (!publishResponse.ok || !publishPayload?.id) {
      return {
        platform: this.platform,
        status: "failed",
        error: publishPayload?.error?.message ?? `Instagram publish HTTP ${publishResponse.status}`
      };
    }

    return {
      platform: this.platform,
      status: "published",
      externalId: publishPayload.id
    };
  }

  async getStatus(_accountId: string, externalId: string): Promise<PublishResult> {
    return {
      platform: this.platform,
      status: "published",
      externalId
    };
  }
}
