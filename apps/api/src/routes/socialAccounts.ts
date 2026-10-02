import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { db } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const input = z.object({
      tenantId: z.coerce.number().int().positive(),
      brandId: z.coerce.number().int().positive().optional()
    }).parse(req.query);

    const params: unknown[] = [input.tenantId];
    let brandFilter = "";
    if (input.brandId) {
      brandFilter = " AND brand_id = ?";
      params.push(input.brandId);
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, brand_id AS brandId, platform, account_kind AS accountKind,
              external_account_id AS externalAccountId, username, display_name AS displayName,
              status, scopes_json AS scopes, metadata_json AS metadata,
              token_expires_at AS tokenExpiresAt, refresh_expires_at AS refreshExpiresAt
       FROM social_accounts
       WHERE tenant_id = ?${brandFilter}
       ORDER BY platform, id`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
