import type { RowDataPacket } from "mysql2";
import { config } from "../config.js";
import { db } from "../db.js";
import { decryptCredential, encryptCredential } from "../security/credentialVault.js";

type RefreshRow = RowDataPacket & {
  id: number;
  platform: "instagram" | "tiktok" | "linkedin";
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | string | null;
};

async function providerJson(response: Response, platform: string) {
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok || payload?.error?.code && payload.error.code !== "ok") {
    throw new Error(
      payload?.error_description ??
        payload?.error?.message ??
        payload?.message ??
        `${platform} token refresh HTTP ${response.status}`
    );
  }
  return payload;
}

async function refreshTikTok(row: RefreshRow) {
  if (!row.refresh_token_enc) throw new Error("TikTok refresh token missing");
  if (!config.TIKTOK_CLIENT_KEY || !config.TIKTOK_CLIENT_SECRET) {
    throw new Error("TikTok OAuth client is not configured");
  }

  const refreshToken = decryptCredential(row.refresh_token_enc);
  const body = new URLSearchParams({
    client_key: config.TIKTOK_CLIENT_KEY,
    client_secret: config.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await providerJson(response, "TikTok");

  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token ?? refreshToken),
    expiresIn: Number(payload.expires_in ?? 86400),
    refreshExpiresIn: payload.refresh_expires_in
      ? Number(payload.refresh_expires_in)
      : null,
    scopes: payload.scope ? String(payload.scope).split(",").filter(Boolean) : null
  };
}

async function refreshInstagram(row: RefreshRow) {
  if (!row.access_token_enc) throw new Error("Instagram access token missing");
  const currentAccessToken = decryptCredential(row.access_token_enc);

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentAccessToken);

  const response = await fetch(url);
  const payload = await providerJson(response, "Instagram");

  return {
    accessToken: String(payload.access_token ?? currentAccessToken),
    refreshToken: null,
    expiresIn: Number(payload.expires_in ?? 60 * 24 * 60 * 60),
    refreshExpiresIn: null,
    scopes: null
  };
}

async function refreshLinkedIn(row: RefreshRow) {
  if (!row.refresh_token_enc) throw new Error("LinkedIn refresh token unavailable");
  if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET) {
    throw new Error("LinkedIn OAuth client is not configured");
  }

  const refreshToken = decryptCredential(row.refresh_token_enc);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await providerJson(response, "LinkedIn");

  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token ?? refreshToken),
    expiresIn: Number(payload.expires_in ?? 0) || null,
    refreshExpiresIn: payload.refresh_token_expires_in
      ? Number(payload.refresh_token_expires_in)
      : null,
    scopes: payload.scope
      ? String(payload.scope).split(/[ ,]+/).filter(Boolean)
      : null
  };
}

export async function refreshDueSocialTokens(limit = 20) {
  const [rows] = await db.query<RefreshRow[]>(
    `SELECT
       sa.id, sa.platform, sa.token_expires_at,
       sc.access_token_enc, sc.refresh_token_enc
     FROM social_accounts sa
     INNER JOIN social_credentials sc ON sc.social_account_id = sa.id
     WHERE sa.status = 'connected'
       AND sa.token_expires_at IS NOT NULL
       AND sa.token_expires_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 36 HOUR)
     ORDER BY sa.token_expires_at ASC
     LIMIT ?`,
    [Math.min(Math.max(limit, 1), 100)]
  );

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const alreadyExpired =
      row.token_expires_at != null &&
      new Date(row.token_expires_at).getTime() <= Date.now();

    try {
      let refreshed;
      if (row.platform === "tiktok") {
        refreshed = await refreshTikTok(row);
      } else if (row.platform === "instagram") {
        refreshed = await refreshInstagram(row);
      } else if (row.refresh_token_enc) {
        refreshed = await refreshLinkedIn(row);
      } else {
        if (alreadyExpired) {
          await db.execute(
            "UPDATE social_accounts SET status = 'expired' WHERE id = ?",
            [row.id]
          );
          results.push({ accountId: row.id, platform: row.platform, status: "expired" });
        }
        continue;
      }

      const nextAccessExpiry = refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null;
      const nextRefreshExpiry = refreshed.refreshExpiresIn
        ? new Date(Date.now() + refreshed.refreshExpiresIn * 1000)
        : null;

      await db.execute(
        `UPDATE social_credentials
         SET access_token_enc = ?,
             refresh_token_enc = COALESCE(?, refresh_token_enc),
             key_version = 'v1'
         WHERE social_account_id = ?`,
        [
          encryptCredential(refreshed.accessToken),
          refreshed.refreshToken
            ? encryptCredential(refreshed.refreshToken)
            : null,
          row.id
        ]
      );

      if (refreshed.scopes) {
        await db.execute(
          `UPDATE social_accounts
           SET status = 'connected',
               scopes_json = ?,
               token_expires_at = ?,
               refresh_expires_at = COALESCE(?, refresh_expires_at)
           WHERE id = ?`,
          [
            JSON.stringify(refreshed.scopes),
            nextAccessExpiry,
            nextRefreshExpiry,
            row.id
          ]
        );
      } else {
        await db.execute(
          `UPDATE social_accounts
           SET status = 'connected',
               token_expires_at = ?,
               refresh_expires_at = COALESCE(?, refresh_expires_at)
           WHERE id = ?`,
          [nextAccessExpiry, nextRefreshExpiry, row.id]
        );
      }

      results.push({ accountId: row.id, platform: row.platform, status: "refreshed" });
    } catch (error) {
      if (alreadyExpired) {
        await db.execute(
          "UPDATE social_accounts SET status = 'expired' WHERE id = ?",
          [row.id]
        );
      }

      results.push({
        accountId: row.id,
        platform: row.platform,
        status: alreadyExpired ? "expired" : "refresh_failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}
