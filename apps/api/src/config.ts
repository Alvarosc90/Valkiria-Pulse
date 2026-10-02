import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(32).optional()
);

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4200),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4200"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  OAUTH_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4200"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default("pulse"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("valkiria_pulse"),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  AUTH_ACCESS_SECRET: optionalSecret,
  AUTH_REFRESH_SECRET: optionalSecret,
  AUTH_ACCESS_TTL: z.string().default("15m"),
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AUTH_REFRESH_COOKIE: z.string().min(1).default("pulse_refresh"),
  CREDENTIALS_ENCRYPTION_KEY: optionalString,

  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  INSTAGRAM_SCOPES: z.string().default(
    "instagram_business_basic,instagram_business_content_publish"
  ),

  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
  LINKEDIN_SCOPES: z.string().default("openid profile email w_member_social"),

  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_CLIENT_SECRET: optionalString,
  TIKTOK_SCOPES: z.string().default("user.info.basic,video.publish,video.upload")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error("Invalid environment: " + parsed.error.message);
}

if (parsed.data.NODE_ENV === "production") {
  if (!parsed.data.AUTH_ACCESS_SECRET || !parsed.data.AUTH_REFRESH_SECRET) {
    throw new Error("AUTH_ACCESS_SECRET and AUTH_REFRESH_SECRET are required in production");
  }
  if (!parsed.data.CREDENTIALS_ENCRYPTION_KEY) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is required in production");
  }
}

export const config = parsed.data;

export function authSecrets() {
  if (!config.AUTH_ACCESS_SECRET || !config.AUTH_REFRESH_SECRET) {
    throw new Error("Authentication secrets are not configured");
  }
  return {
    access: config.AUTH_ACCESS_SECRET,
    refresh: config.AUTH_REFRESH_SECRET
  };
}

export function oauthCallbackUrl(platform: "instagram" | "tiktok" | "linkedin") {
  const base = config.OAUTH_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/api/v1/connections/${platform}/callback`;
}
