import "dotenv/config";
import { z } from "zod";

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
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error("Invalid environment: " + parsed.error.message);
}

export const config = parsed.data;
