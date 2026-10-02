import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db.js";

const router = Router();

router.get("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const query = z.object({
      entityType: z.string().max(80).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }).parse(req.query);

    const params: Array<string | number> = [Number(req.auth!.tenantId)];
    let filter = "";
    if (query.entityType) {
      filter = " AND ae.entity_type = ?";
      params.push(query.entityType);
    }
    params.push(query.limit);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ae.id, ae.action, ae.entity_type AS entityType,
              ae.entity_id AS entityId, ae.metadata_json AS metadata,
              ae.ip_address AS ipAddress, ae.created_at AS createdAt,
              u.display_name AS userDisplayName, u.email AS userEmail
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
       WHERE ae.tenant_id = ?${filter}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT ?`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
