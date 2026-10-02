import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { auditEvent } from "../services/auditService.js";

const router = Router();

async function entryForTenant(entryId: number, tenantId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, brand_id, platform, topic, status
     FROM calendar_entries
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [entryId, tenantId]
  );
  return rows[0] ?? null;
}

router.get("/", async (req, res, next) => {
  try {
    const query = z.object({
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }).parse(req.query);

    const params: Array<string | number> = [Number(req.auth!.tenantId)];
    let statusFilter = "";
    if (query.status) {
      statusFilter = " AND ca.status = ?";
      params.push(query.status);
    }
    params.push(query.limit);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ca.id, ca.calendar_entry_id AS calendarEntryId,
              ca.status, ca.note, ca.requested_at AS requestedAt,
              ca.reviewed_at AS reviewedAt,
              ce.platform, ce.topic, ce.scheduled_at_utc AS scheduledAtUtc,
              requester.display_name AS requestedBy,
              reviewer.display_name AS reviewedBy
       FROM content_approvals ca
       INNER JOIN calendar_entries ce ON ce.id = ca.calendar_entry_id
       INNER JOIN users requester ON requester.id = ca.requested_by
       LEFT JOIN users reviewer ON reviewer.id = ca.reviewed_by
       WHERE ca.tenant_id = ?${statusFilter}
       ORDER BY ca.requested_at DESC
       LIMIT ?`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:entryId/request",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const entryId = z.coerce.number().int().positive().parse(req.params.entryId);
      const body = z.object({
        note: z.string().max(5000).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const entry = await entryForTenant(entryId, tenantId);
      if (!entry) throw new HttpError("Publicacion no encontrada", 404, "CALENDAR_ENTRY_NOT_FOUND");
      if (["processing", "published"].includes(String(entry.status))) {
        throw new HttpError("La publicacion ya no puede enviarse a aprobacion", 409, "APPROVAL_STATE_INVALID");
      }

      await db.execute(
        `INSERT INTO content_approvals
         (tenant_id, calendar_entry_id, requested_by, status, note, requested_at)
         VALUES (?, ?, ?, 'pending', ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           requested_by = VALUES(requested_by),
           reviewed_by = NULL,
           status = 'pending',
           note = VALUES(note),
           requested_at = UTC_TIMESTAMP(),
           reviewed_at = NULL`,
        [tenantId, entryId, Number(req.auth!.userId), body.note ?? null]
      );

      await db.execute(
        "UPDATE calendar_entries SET status = 'draft' WHERE id = ? AND tenant_id = ?",
        [entryId, tenantId]
      );

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "approval.requested",
        entityType: "calendar_entry",
        entityId: entryId,
        metadata: { platform: entry.platform, topic: entry.topic },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data: { entryId, status: "pending" } });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:entryId/review",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const entryId = z.coerce.number().int().positive().parse(req.params.entryId);
      const body = z.object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(5000).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const entry = await entryForTenant(entryId, tenantId);
      if (!entry) throw new HttpError("Publicacion no encontrada", 404, "CALENDAR_ENTRY_NOT_FOUND");

      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE content_approvals
         SET status = ?, reviewed_by = ?, note = ?, reviewed_at = UTC_TIMESTAMP()
         WHERE calendar_entry_id = ? AND tenant_id = ? AND status = 'pending'`,
        [
          body.decision,
          Number(req.auth!.userId),
          body.note ?? null,
          entryId,
          tenantId
        ]
      );

      if (result.affectedRows !== 1) {
        throw new HttpError("No hay una aprobacion pendiente", 409, "APPROVAL_NOT_PENDING");
      }

      await db.execute(
        "UPDATE calendar_entries SET status = ? WHERE id = ? AND tenant_id = ?",
        [body.decision === "approved" ? "ready" : "draft", entryId, tenantId]
      );

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: `approval.${body.decision}`,
        entityType: "calendar_entry",
        entityId: entryId,
        metadata: {
          platform: entry.platform,
          topic: entry.topic,
          note: body.note ?? null
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data: { entryId, status: body.decision } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
