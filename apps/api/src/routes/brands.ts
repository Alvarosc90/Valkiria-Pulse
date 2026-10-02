import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, description,
              tone_json AS tone, products_json AS products,
              approved_claims_json AS approvedClaims,
              forbidden_terms_json AS forbiddenTerms,
              ctas_json AS ctas
       FROM brands
       WHERE tenant_id = ? AND active = 1
       ORDER BY name ASC`,
      [Number(req.auth!.tenantId)]
    );

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/:brandId", async (req, res, next) => {
  try {
    const brandId = z.coerce.number().int().positive().parse(req.params.brandId);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, description,
              tone_json AS tone, products_json AS products,
              approved_claims_json AS approvedClaims,
              forbidden_terms_json AS forbiddenTerms,
              ctas_json AS ctas
       FROM brands
       WHERE id = ? AND tenant_id = ? AND active = 1
       LIMIT 1`,
      [brandId, Number(req.auth!.tenantId)]
    );

    if (!rows[0]) {
      res.status(404).json({ error: "BRAND_NOT_FOUND" });
      return;
    }

    res.json({ data: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/:brandId", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const brandId = z.coerce.number().int().positive().parse(req.params.brandId);
    const tenantId = Number(req.auth!.tenantId);

    const body = z.object({
      name: z.string().min(1).max(140).optional(),
      description: z.string().max(5000).nullable().optional(),
      tone: z.array(z.string().min(1).max(120)).max(30).optional(),
      products: z.array(z.string().min(1).max(180)).max(100).optional(),
      approvedClaims: z.array(z.string().min(1).max(300)).max(100).optional(),
      forbiddenTerms: z.array(z.string().min(1).max(180)).max(100).optional(),
      ctas: z.array(z.string().min(1).max(300)).max(100).optional()
    }).parse(req.body);

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    const add = (column: string, value: string | number | null) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (body.name !== undefined) add("name", body.name);
    if (body.description !== undefined) add("description", body.description);
    if (body.tone !== undefined) add("tone_json", JSON.stringify(body.tone));
    if (body.products !== undefined) add("products_json", JSON.stringify(body.products));
    if (body.approvedClaims !== undefined) add("approved_claims_json", JSON.stringify(body.approvedClaims));
    if (body.forbiddenTerms !== undefined) add("forbidden_terms_json", JSON.stringify(body.forbiddenTerms));
    if (body.ctas !== undefined) add("ctas_json", JSON.stringify(body.ctas));

    if (!fields.length) {
      res.status(400).json({ error: "NO_CHANGES" });
      return;
    }

    values.push(brandId, tenantId);
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE brands SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ? AND active = 1`,
      values
    );

    if (!result.affectedRows) {
      res.status(404).json({ error: "BRAND_NOT_FOUND" });
      return;
    }

    res.json({ data: { updated: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
