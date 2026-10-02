import type { SocialPlatform } from "@pulse/contracts";
import { config, oauthCallbackUrl } from "../config.js";
import { HttpError } from "../http/httpError.js";

export interface OAuthConnectionResult {
  externalAccountId: string;
  username?: string | null;
  displayName?: string | null;
  accountKind?: "profile" | "organization" | "page";
  scopes: string[];
  metadata: Record<string, unknown>;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  refreshExpiresInSeconds?: number | null;
}

function required(value: string | undefined, name: string) {
  if (!value) {
    throw new HttpError(
      `Falta configurar ${name}`,
      503,
      "OAUTH_CLIENT_NOT_CONFIGURED"
    );
  }
  return value;
}

function scopes(raw: string, separator: RegExp) {
  return raw.split(separator).map((value) => value.trim()).filter(Boolean);
}

async function jsonResponse(response: Response, provider: string) {
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new HttpError(
      payload?.error_description ??
        payload?.error?.message ??
        payload?.message ??
        `${provider} OAuth HTTP ${response.status}`,
      400,
      "OAUTH_PROVIDER_ERROR"
    );
  }

  return payload;
}

function linkedInAuthorizationUrl(state: string) {
  const clientId = required(config.LINKEDIN_CLIENT_ID, "LINKEDIN_CLIENT_ID");
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", oauthCallbackUrl("linkedin"));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.LINKEDIN_SCOPES);
  return url.toString();
}

async function exchangeLinkedIn(code: string): Promise<OAuthConnectionResult> {
  const clientId = required(config.LINKEDIN_CLIENT_ID, "LINKEDIN_CLIENT_ID");
  const clientSecret = required(config.LINKEDIN_CLIENT_SECRET, "LINKEDIN_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthCallbackUrl("linkedin"),
    client_id: clientId,
    client_secret: clientSecret
  });

  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const token = await jsonResponse(tokenResponse, "LinkedIn");
  if (!token.access_token) {
    throw new HttpError("LinkedIn no devolvio access_token", 400, "OAUTH_PROVIDER_ERROR");
  }

  const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const user = await jsonResponse(userResponse, "LinkedIn");

  const sub = String(user.sub ?? "");
  if (!sub) {
    throw new HttpError("LinkedIn no devolvio identidad", 400, "OAUTH_IDENTITY_MISSING");
  }

  return {
    externalAccountId: sub,
    username: user.email ?? null,
    displayName: user.name ?? null,
    accountKind: "profile",
    scopes: scopes(String(token.scope ?? config.LINKEDIN_SCOPES), /[ ,]+/),
    metadata: {
      authorUrn: `urn:li:person:${sub}`,
      picture: user.picture ?? null
    },
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    expiresInSeconds: token.expires_in ? Number(token.expires_in) : null,
    refreshExpiresInSeconds: token.refresh_token_expires_in
      ? Number(token.refresh_token_expires_in)
      : null
  };
}

function tiktokAuthorizationUrl(state: string) {
  const clientKey = required(config.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.TIKTOK_SCOPES);
  url.searchParams.set("redirect_uri", oauthCallbackUrl("tiktok"));
  url.searchParams.set("state", state);
  url.searchParams.set("disable_auto_auth", "1");
  return url.toString();
}

async function exchangeTikTok(code: string): Promise<OAuthConnectionResult> {
  const clientKey = required(config.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY");
  const clientSecret = required(config.TIKTOK_CLIENT_SECRET, "TIKTOK_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: oauthCallbackUrl("tiktok")
  });

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const token = await jsonResponse(tokenResponse, "TikTok");
  if (!token.access_token || !token.open_id) {
    throw new HttpError("TikTok no devolvio token/identidad", 400, "OAUTH_PROVIDER_ERROR");
  }

  const userUrl = new URL("https://open.tiktokapis.com/v2/user/info/");
  userUrl.searchParams.set("fields", "open_id,union_id,avatar_url,display_name");
  const userResponse = await fetch(userUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const userPayload = await jsonResponse(userResponse, "TikTok");
  if (userPayload?.error?.code && userPayload.error.code !== "ok") {
    throw new HttpError(
      userPayload.error.message ?? "TikTok user info failed",
      400,
      "OAUTH_PROVIDER_ERROR"
    );
  }

  const user = userPayload?.data?.user ?? {};
  const openId = String(user.open_id ?? token.open_id ?? "");

  return {
    externalAccountId: openId,
    username: user.display_name ?? null,
    displayName: user.display_name ?? null,
    accountKind: "profile",
    scopes: scopes(String(token.scope ?? config.TIKTOK_SCOPES), /[ ,]+/),
    metadata: {
      openId,
      unionId: user.union_id ?? null,
      avatarUrl: user.avatar_url ?? null
    },
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    expiresInSeconds: token.expires_in ? Number(token.expires_in) : null,
    refreshExpiresInSeconds: token.refresh_expires_in
      ? Number(token.refresh_expires_in)
      : null
  };
}

function instagramAuthorizationUrl(state: string) {
  const clientId = required(config.INSTAGRAM_APP_ID, "INSTAGRAM_APP_ID");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", oauthCallbackUrl("instagram"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.INSTAGRAM_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

async function exchangeInstagram(code: string): Promise<OAuthConnectionResult> {
  const clientId = required(config.INSTAGRAM_APP_ID, "INSTAGRAM_APP_ID");
  const clientSecret = required(config.INSTAGRAM_APP_SECRET, "INSTAGRAM_APP_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: oauthCallbackUrl("instagram"),
    code
  });

  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const shortToken = await jsonResponse(shortResponse, "Instagram");
  if (!shortToken.access_token) {
    throw new HttpError("Instagram no devolvio access_token", 400, "OAUTH_PROVIDER_ERROR");
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", clientSecret);
  longUrl.searchParams.set("access_token", String(shortToken.access_token));

  const longResponse = await fetch(longUrl);
  const longToken = await jsonResponse(longResponse, "Instagram");
  const accessToken = String(longToken.access_token ?? shortToken.access_token);

  const meUrl = new URL("https://graph.instagram.com/me");
  meUrl.searchParams.set("fields", "id,username");
  meUrl.searchParams.set("access_token", accessToken);
  const meResponse = await fetch(meUrl);
  const me = await jsonResponse(meResponse, "Instagram");

  const id = String(me.id ?? shortToken.user_id ?? "");
  if (!id) {
    throw new HttpError("Instagram no devolvio identidad", 400, "OAUTH_IDENTITY_MISSING");
  }

  return {
    externalAccountId: id,
    username: me.username ?? null,
    displayName: me.username ?? null,
    accountKind: "profile",
    scopes: scopes(config.INSTAGRAM_SCOPES, /[ ,]+/),
    metadata: {
      instagramUserId: id
    },
    accessToken,
    expiresInSeconds: longToken.expires_in ? Number(longToken.expires_in) : null
  };
}

export function authorizationUrl(platform: SocialPlatform, state: string) {
  if (platform === "linkedin") return linkedInAuthorizationUrl(state);
  if (platform === "tiktok") return tiktokAuthorizationUrl(state);
  return instagramAuthorizationUrl(state);
}

export async function exchangeAuthorizationCode(
  platform: SocialPlatform,
  code: string
): Promise<OAuthConnectionResult> {
  if (platform === "linkedin") return exchangeLinkedIn(code);
  if (platform === "tiktok") return exchangeTikTok(code);
  return exchangeInstagram(code);
}
