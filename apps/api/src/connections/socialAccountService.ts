import type { ResultSetHeader } from "mysql2";
import type { SocialPlatform } from "@pulse/contracts";
import { db } from "../db.js";
import { encryptCredential } from "../security/credentialVault.js";

export async function saveSocialConnection(input: {
  tenantId: number;
  brandId: number;
  platform: SocialPlatform;
  accountKind?: "profile" | "organization" | "page";
  externalAccountId: string;
  username?: string | null;
  displayName?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  refreshExpiresInSeconds?: number | null;
}) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const tokenExpiresAt = input.expiresInSeconds
      ? new Date(Date.now() + input.expiresInSeconds * 1000)
      : null;
    const refreshExpiresAt = input.refreshExpiresInSeconds
      ? new Date(Date.now() + input.refreshExpiresInSeconds * 1000)
      : null;

    const [accountResult] = await connection.execute<ResultSetHeader>(
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
        input.tenantId,
        input.brandId,
        input.platform,
        input.accountKind ?? "profile",
        input.externalAccountId,
        input.username ?? null,
        input.displayName ?? null,
        JSON.stringify(input.scopes ?? []),
        JSON.stringify(input.metadata ?? {}),
        tokenExpiresAt,
        refreshExpiresAt
      ]
    );

    const accountId = accountResult.insertId;

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
        encryptCredential(input.accessToken),
        input.refreshToken ? encryptCredential(input.refreshToken) : null
      ]
    );

    await connection.commit();
    return { accountId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
