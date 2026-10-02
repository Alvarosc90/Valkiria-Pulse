import "dotenv/config";
import { z } from "zod";
import { db } from "../src/db.js";
import { encryptCredential } from "../src/security/credentialVault.js";

const input = z.object({
  PULSE_TENANT_ID: z.coerce.number().int().positive(),
  PULSE_BRAND_ID: z.coerce.number().int().positive(),
  PULSE_PLATFORM: z.enum(["instagram", "tiktok", "linkedin"]),
  PULSE_ACCOUNT_KIND: z.enum(["profile", "organization", "page"]).default("profile"),
  PULSE_EXTERNAL_ACCOUNT_ID: z.string().min(1),
  PULSE_USERNAME: z.string().optional(),
  PULSE_DISPLAY_NAME: z.string().optional(),
  PULSE_SCOPES_JSON: z.string().default("[]"),
  PULSE_METADATA_JSON: z.string().default("{}"),
  PULSE_ACCESS_TOKEN: z.string().min(1),
  PULSE_REFRESH_TOKEN: z.string().optional(),
  PULSE_TOKEN_EXPIRES_AT: z.string().optional(),
  PULSE_REFRESH_EXPIRES_AT: z.string().optional()
}).parse(process.env);

function json(raw: string, label: string) {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    throw new Error(label + " must contain valid JSON");
  }
}

async function main() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO social_accounts
       (tenant_id, brand_id, platform, account_kind, external_account_id,
        username, display_name, status, scopes_json, metadata_json,
        token_expires_at, refresh_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         brand_id = VALUES(brand_id),
         account_kind = VALUES(account_kind),
         username = VALUES(username),
         display_name = VALUES(display_name),
         status = 'connected',
         scopes_json = VALUES(scopes_json),
         metadata_json = VALUES(metadata_json),
         token_expires_at = VALUES(token_expires_at),
         refresh_expires_at = VALUES(refresh_expires_at)`,
      [
        input.PULSE_TENANT_ID,
        input.PULSE_BRAND_ID,
        input.PULSE_PLATFORM,
        input.PULSE_ACCOUNT_KIND,
        input.PULSE_EXTERNAL_ACCOUNT_ID,
        input.PULSE_USERNAME ?? null,
        input.PULSE_DISPLAY_NAME ?? null,
        json(input.PULSE_SCOPES_JSON, "PULSE_SCOPES_JSON"),
        json(input.PULSE_METADATA_JSON, "PULSE_METADATA_JSON"),
        input.PULSE_TOKEN_EXPIRES_AT ? new Date(input.PULSE_TOKEN_EXPIRES_AT) : null,
        input.PULSE_REFRESH_EXPIRES_AT ? new Date(input.PULSE_REFRESH_EXPIRES_AT) : null
      ]
    );

    const [idRows] = await connection.query<any[]>("SELECT LAST_INSERT_ID() AS id");
    const accountId = Number(idRows[0].id);

    await connection.execute(
      `INSERT INTO social_credentials
       (social_account_id, access_token_enc, refresh_token_enc, key_version)
       VALUES (?, ?, ?, 'v1')
       ON DUPLICATE KEY UPDATE
         access_token_enc = VALUES(access_token_enc),
         refresh_token_enc = VALUES(refresh_token_enc),
         key_version = 'v1'`,
      [
        accountId,
        encryptCredential(input.PULSE_ACCESS_TOKEN),
        input.PULSE_REFRESH_TOKEN ? encryptCredential(input.PULSE_REFRESH_TOKEN) : null
      ]
    );

    await connection.commit();

    console.log(JSON.stringify({
      ok: true,
      accountId,
      platform: input.PULSE_PLATFORM,
      username: input.PULSE_USERNAME ?? null
    }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
