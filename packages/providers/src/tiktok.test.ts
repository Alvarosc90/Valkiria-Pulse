import assert from "node:assert/strict";
import test from "node:test";
import { TikTokProvider } from "./tiktok.js";

const credentials = {
  async getAccessToken() {
    return "test-token";
  }
};

test("TikTok Direct Post validates creator settings and forces SELF_ONLY for sandbox", async () => {
  const provider = new TikTokProvider(credentials);
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body?: any }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });

    if (url.includes("/creator_info/query/")) {
      return new Response(JSON.stringify({
        data: {
          privacy_level_options: ["SELF_ONLY"],
          duet_disabled: false,
          comment_disabled: true,
          stitch_disabled: false
        },
        error: { code: "ok", message: "", log_id: "test" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("/video/init/")) {
      return new Response(JSON.stringify({
        data: { publish_id: "publish-123" },
        error: { code: "ok", message: "", log_id: "test" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    throw new Error("Unexpected URL: " + url);
  }) as typeof fetch;

  try {
    const result = await provider.publish({
      tenantId: "1",
      accountId: "2",
      content: {
        platform: "tiktok",
        title: "Demo",
        caption: "Demo caption",
        assetRefs: [],
        metadata: {
          videoUrl: "https://pulse.example/video.mp4",
          privacy: "PUBLIC_TO_EVERYONE",
          sandbox: true
        }
      }
    });

    assert.equal(result.status, "processing");
    assert.equal(result.externalId, "publish-123");
    assert.equal(calls.length, 2);
    assert.ok(calls[0]?.url.includes("/creator_info/query/"));
    assert.ok(calls[1]?.url.includes("/video/init/"));
    assert.equal(calls[1]?.body?.post_info?.privacy_level, "SELF_ONLY");
    assert.equal(calls[1]?.body?.post_info?.disable_comment, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TikTok blocks a privacy level not offered by creator_info", async () => {
  const provider = new TikTokProvider(credentials);
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      data: { privacy_level_options: ["SELF_ONLY"] },
      error: { code: "ok", message: "", log_id: "test" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await provider.publish({
      tenantId: "1",
      accountId: "2",
      content: {
        platform: "tiktok",
        caption: "Demo caption",
        assetRefs: [],
        metadata: {
          videoUrl: "https://pulse.example/video.mp4",
          privacy: "PUBLIC_TO_EVERYONE"
        }
      }
    });

    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /privacy level/i);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
