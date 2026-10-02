import type { RowDataPacket } from "mysql2";
import type { CredentialResolver } from "@pulse/providers";
import { db } from "../db.js";
import { decryptCredential } from "../security/credentialVault.js";

export class DbCredentialResolver implements CredentialResolver {
  async getAccessToken(accountId: string): Promise<string> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT sc.access_token_enc
       FROM social_credentials sc
       INNER JOIN social_accounts sa ON sa.id = sc.social_account_id
       WHERE sc.social_account_id = ? AND sa.status = 'connected'
       LIMIT 1`,
      [accountId]
    );

    const encrypted = rows[0]?.access_token_enc;
    if (!encrypted) {
      throw new Error("No connected credential for social account " + accountId);
    }

    return decryptCredential(String(encrypted));
  }
}
