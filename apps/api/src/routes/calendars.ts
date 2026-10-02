import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
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

      const result = await importCalendar({
        tenantId: Number(req.auth!.tenantId),
        ...parsed,
        filename: req.file.originalname,
        buffer: req.file.buffer
      });

      res.status(201).json({ data: result });
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
