import { Router } from "express";
import { createReadStream } from "node:fs";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { config } from "../config.js";
import { auditEvent } from "../services/auditService.js";
import {
  issuePublicMediaUrl,
  listMediaAssets,
  mediaForAuthenticatedTenant,
  mediaForPublicToken,
  saveMediaAsset
} from "../services/mediaService.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: config.PULSE_MEDIA_MAX_MB * 1024 * 1024
  }
});

router.get("/public/:assetId/:token", async (req, res, next) => {
  try {
    const params = z.object({
      assetId: z.coerce.number().int().positive(),
      token: z.string().min(20).max(200)
    }).parse(req.params);

    const asset = await mediaForPublicToken(params.assetId, params.token);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`);
    res.setHeader("Cache-Control", "private, max-age=300");
    createReadStream(asset.path).pipe(res);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const query = z.object({
      brandId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional()
    }).parse(req.query);

    const rows = await listMediaAssets({
      tenantId: Number(req.auth!.tenantId),
      ...query
    });

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  requireRole("owner", "admin", "editor"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "MEDIA_FILE_REQUIRED" });
        return;
      }

      const body = z.object({
        brandId: z.coerce.number().int().positive()
      }).parse(req.body);

      const asset = await saveMediaAsset({
        tenantId: Number(req.auth!.tenantId),
        brandId: body.brandId,
        userId: Number(req.auth!.userId),
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || "application/octet-stream",
        bytes: req.file.buffer
      });

      await auditEvent({
        tenantId: Number(req.auth!.tenantId),
        userId: Number(req.auth!.userId),
        action: "media.uploaded",
        entityType: "media_asset",
        entityId: asset.id,
        metadata: {
          brandId: body.brandId,
          originalName: asset.originalName,
          kind: asset.kind,
          sizeBytes: asset.sizeBytes
        },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.status(201).json({ data: asset });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:assetId/public-link",
  requireRole("owner", "admin", "editor"),
  async (req, res, next) => {
    try {
      const assetId = z.coerce.number().int().positive().parse(req.params.assetId);
      const link = await issuePublicMediaUrl({
        tenantId: Number(req.auth!.tenantId),
        assetId
      });

      await auditEvent({
        tenantId: Number(req.auth!.tenantId),
        userId: Number(req.auth!.userId),
        action: "media.public_link_issued",
        entityType: "media_asset",
        entityId: assetId,
        metadata: { expiresAt: link.expiresAt.toISOString() },
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ data: link });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:assetId/file", async (req, res, next) => {
  try {
    const assetId = z.coerce.number().int().positive().parse(req.params.assetId);
    const asset = await mediaForAuthenticatedTenant({
      tenantId: Number(req.auth!.tenantId),
      assetId
    });

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`);
    createReadStream(asset.path).pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
