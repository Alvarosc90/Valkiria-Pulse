import type { PublishRequest, PublishResult } from "@pulse/contracts";
import { TokenAwareProvider } from "./index.js";

const LINKEDIN_VERSION = "202609";

export class LinkedInProvider extends TokenAwareProvider {
  readonly platform = "linkedin" as const;

  async publish(request: PublishRequest): Promise<PublishResult> {
    const token = await this.token(request.accountId);
    const authorUrn = this.requiredMetadata<string>(request, "authorUrn");

    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: request.content.caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        platform: this.platform,
        status: "failed",
        error: text || `LinkedIn HTTP ${response.status}`
      };
    }

    return {
      platform: this.platform,
      status: "published",
      externalId: response.headers.get("x-restli-id") ?? undefined
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
