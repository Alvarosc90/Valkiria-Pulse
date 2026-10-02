import { Router } from "express";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db.js";

const router = Router();

router.get("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      status: z.enum(["new","contacted","qualified","won","lost"]).optional()
    }).parse(req.query);

    const params: Array<string | number> = [];
    let where = "";
    if (query.status) {
      where = "WHERE status = ?";
      params.push(query.status);
    }
    params.push(query.limit);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, company, email, phone, current_system, message,
              source, status, created_at, updated_at
       FROM public_leads
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );

    res.json({
      data: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        currentSystem: row.current_system,
        message: row.message,
        source: row.source,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      status: z.enum(["new","contacted","qualified","won","lost"])
    }).parse(req.body);

    await db.execute(
      "UPDATE public_leads SET status = ? WHERE id = ?",
      [body.status, id]
    );

    res.json({ data: { id, status: body.status } });
  } catch (error) {
    next(error);
  }
});

export default router;
