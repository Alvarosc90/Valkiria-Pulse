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

const booleanFromEnv = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return value;
  }, z.boolean());

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
  PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  PUBLIC_SIGNUP_ENABLED: booleanFromEnv(true),
  REQUIRE_EMAIL_VERIFICATION: booleanFromEnv(true),

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromEnv(false),
  SMTP_STARTTLS: booleanFromEnv(true),
  SMTP_TLS_REJECT_UNAUTHORIZED: booleanFromEnv(true),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,
  SMTP_HELO_NAME: z.string().min(1).default("pulse.valkiria.tech"),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  PULSE_CONTACT_EMAIL: z.string().email().default("consultas@valkiria.tech"),
  PULSE_SUPPORT_EMAIL: z.string().email().default("soporte@valkiria.tech"),

  MERCADOPAGO_ACCESS_TOKEN: optionalString,
  MERCADOPAGO_WEBHOOK_SECRET: optionalString,
  MERCADOPAGO_MODE: z.enum(["test", "production", "unknown"]).default("unknown"),
  MERCADOPAGO_API_BASE: z.string().url().default("https://api.mercadopago.com"),

  PULSE_LLM_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().optional()
  ),
  PULSE_LLM_API_KEY: optionalString,
  PULSE_LLM_MODEL: optionalString,
  PULSE_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),

  PULSE_MEDIA_DIR: z.string().min(1).default("./data/media"),
  PULSE_MEDIA_PUBLIC_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  PULSE_MEDIA_MAX_MB: z.coerce.number().int().min(1).max(1024).default(100),

  TRAINIA_SSO_SECRET: optionalSecret,
  TRAINIA_SSO_ISSUER: z.string().min(1).default("trainia"),
  TRAINIA_SSO_AUDIENCE: z.string().min(1).default("valkiria-pulse"),

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
  if (
    parsed.data.PUBLIC_SIGNUP_ENABLED &&
    parsed.data.REQUIRE_EMAIL_VERIFICATION &&
    (!parsed.data.SMTP_HOST || !parsed.data.SMTP_FROM)
  ) {
    throw new Error(
      "SMTP_HOST and SMTP_FROM are required in production when public signup requires email verification"
    );
  }
  if (
    parsed.data.MERCADOPAGO_ACCESS_TOKEN &&
    !parsed.data.MERCADOPAGO_WEBHOOK_SECRET
  ) {
    throw new Error(
      "MERCADOPAGO_WEBHOOK_SECRET is required in production when Mercado Pago is configured"
    );
  }
}

export const config = {
  ...parsed.data,
  PUBLIC_BASE_URL: parsed.data.PUBLIC_BASE_URL ?? parsed.data.APP_URL
};

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
