import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { importCalendar, listCalendarEntries } from "../services/calendarImportService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

const platformSchema = z.enum(["instagram", "tiktok", "linkedin"]);

router.post("/import", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Falta el archivo Excel" });
      return;
    }

    const parsed = z.object({
      tenantId: z.coerce.number().int().positive(),
      brandId: z.coerce.number().int().positive(),
      platform: platformSchema,
      timezone: z.string().min(1).default("America/Argentina/Cordoba")
    }).parse(req.body);

    const result = await importCalendar({
      ...parsed,
      filename: req.file.originalname,
      buffer: req.file.buffer
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const parsed = z.object({
      tenantId: z.coerce.number().int().positive(),
      platform: platformSchema.optional(),
      limit: z.coerce.number().int().positive().max(500).optional()
    }).parse(req.query);

    const rows = await listCalendarEntries(parsed);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
