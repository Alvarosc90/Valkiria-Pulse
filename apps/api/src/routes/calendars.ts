import { Router } from "express";
import multer from "multer";
import type { ResultSetHeader } from "mysql2";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";
import { auditEvent } from "../services/auditService.js";
import { importCalendar, listCalendarEntries } from "../services/calendarImportService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

const platformSchema = z.enum(["instagram", "tiktok", "linkedin"]);

router.post(
  "/import",
  requireRole("owner", "admin", "editor"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Falta el archivo Excel" });
        return;
      }

      const parsed = z.object({
        brandId: z.coerce.number().int().positive(),
        platform: platformSchema,
        timezone: z.string().min(1).default("America/Argentina/Cordoba")
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const result = await importCalendar({
        tenantId,
        ...parsed,
        filename: req.file.originalname,
        buffer: req.file.buffer
      });

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "calendar.imported",
        entityType: "calendar_import",
        entityId: result.importId,
        metadata: {
          brandId: parsed.brandId,
          platform: parsed.platform,
          filename: req.file.originalname,
          total: result.total,
          valid: result.valid,
          invalid: result.invalid
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const body = z.object({
        brandId: z.coerce.number().int().positive(),
        platform: platformSchema,
        scheduledAt: z.string().datetime({ offset: true }).optional(),
        timezone: z.string().min(1).default("America/Argentina/Cordoba"),
        topic: z.string().min(1).max(255),
        objective: z.string().max(255).optional(),
        angle: z.string().max(255).optional(),
        notes: z.string().max(10000).optional(),
        cta: z.string().max(255).optional(),
        platformContext: z.record(z.unknown()).default({})
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const [brands] = await db.query<any[]>(
        "SELECT id FROM brands WHERE id = ? AND tenant_id = ? AND active = 1 LIMIT 1",
        [body.brandId, tenantId]
      );
      if (!brands[0]) {
        throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
      }

      const scheduledAt = body.scheduledAt
        ? new Date(body.scheduledAt)
        : new Date(Date.now() + 60 * 60 * 1000);

      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO calendar_entries
         (tenant_id, brand_id, platform, scheduled_at_utc, timezone, topic,
          objective, angle, copy_seed, cta, platform_payload_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [
          tenantId,
          body.brandId,
          body.platform,
          scheduledAt,
          body.timezone,
          body.topic,
          body.objective ?? null,
          body.angle ?? null,
          body.notes ?? null,
          body.cta ?? null,
          JSON.stringify(body.platformContext)
        ]
      );

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "calendar.created",
        entityType: "calendar_entry",
        entityId: result.insertId,
        metadata: {
          brandId: body.brandId,
          platform: body.platform,
          topic: body.topic,
          scheduledAt: scheduledAt.toISOString()
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({
        data: {
          id: result.insertId,
          status: "draft"
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:entryId",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const entryId = z.coerce.number().int().positive().parse(req.params.entryId);
      const body = z.object({
        scheduledAt: z.string().datetime({ offset: true }).optional(),
        topic: z.string().min(1).max(255).optional(),
        objective: z.string().max(255).nullable().optional(),
        angle: z.string().max(255).nullable().optional(),
        notes: z.string().max(10000).nullable().optional(),
        cta: z.string().max(255).nullable().optional(),
        platformContext: z.record(z.unknown()).optional()
      }).parse(req.body);

      const tenantId = Number(req.auth!.tenantId);
      const [existing] = await db.query<any[]>(
        `SELECT id, status
         FROM calendar_entries
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [entryId, tenantId]
      );

      if (!existing[0]) {
        throw new HttpError("Publicacion no encontrada", 404, "CALENDAR_ENTRY_NOT_FOUND");
      }
      if (["processing", "published"].includes(String(existing[0].status))) {
        throw new HttpError(
          "La publicacion ya no puede editarse",
          409,
          "CALENDAR_ENTRY_LOCKED"
        );
      }

      const fields: string[] = [];
      const values: Array<string | number | Date | null> = [];
      const add = (column: string, value: string | number | Date | null) => {
        fields.push(`${column} = ?`);
        values.push(value);
      };

      if (body.scheduledAt !== undefined) add("scheduled_at_utc", new Date(body.scheduledAt));
      if (body.topic !== undefined) add("topic", body.topic);
      if (body.objective !== undefined) add("objective", body.objective);
      if (body.angle !== undefined) add("angle", body.angle);
      if (body.notes !== undefined) add("copy_seed", body.notes);
      if (body.cta !== undefined) add("cta", body.cta);
      if (body.platformContext !== undefined) add("platform_payload_json", JSON.stringify(body.platformContext));

      if (!fields.length) {
        res.status(400).json({ error: "NO_CHANGES" });
        return;
      }

      fields.push("status = 'draft'");
      values.push(entryId, tenantId);

      await db.execute(
        `UPDATE calendar_entries
         SET ${fields.join(", ")}
         WHERE id = ? AND tenant_id = ?`,
        values
      );

      await db.execute(
        `UPDATE content_approvals
         SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
         WHERE calendar_entry_id = ? AND tenant_id = ? AND status = 'approved'`,
        [entryId, tenantId]
      );

      await auditEvent({
        tenantId,
        userId: Number(req.auth!.userId),
        action: "calendar.updated",
        entityType: "calendar_entry",
        entityId: entryId,
        metadata: { fields: fields.map((field) => field.split(" = ")[0]) },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data: { id: entryId, status: "draft" } });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/", async (req, res, next) => {
  try {
    const parsed = z.object({
      platform: platformSchema.optional(),
      limit: z.coerce.number().int().positive().max(500).optional()
    }).parse(req.query);

    const rows = await listCalendarEntries({
      tenantId: Number(req.auth!.tenantId),
      ...parsed
    });
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
