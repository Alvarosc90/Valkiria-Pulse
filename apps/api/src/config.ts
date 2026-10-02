import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.string().min(32).optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4200),
  APP_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
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
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional()
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
