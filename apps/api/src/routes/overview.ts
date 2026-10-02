import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const tenantId = Number(req.auth!.tenantId);

    const [accounts] = await db.query<RowDataPacket[]>(
      `SELECT platform, status, COUNT(*) AS total
       FROM social_accounts
       WHERE tenant_id = ?
       GROUP BY platform, status`,
      [tenantId]
    );

    const [calendar] = await db.query<RowDataPacket[]>(
      `SELECT platform, status, COUNT(*) AS total
       FROM calendar_entries
       WHERE tenant_id = ?
       GROUP BY platform, status`,
      [tenantId]
    );

    const [jobs] = await db.query<RowDataPacket[]>(
      `SELECT status, COUNT(*) AS total
       FROM publication_jobs
       WHERE tenant_id = ?
       GROUP BY status`,
      [tenantId]
    );

    res.json({ data: { accounts, calendar, jobs } });
  } catch (error) {
    next(error);
  }
});

export default router;
