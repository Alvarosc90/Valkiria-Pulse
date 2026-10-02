import type { RowDataPacket } from "mysql2";
import type {
  BrandContext,
  SocialPlatform
} from "@pulse/contracts";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export async function loadBrandContext(
  tenantId: number,
  brandId: number
): Promise<BrandContext> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, tenant_id, name, description,
            tone_json, products_json, approved_claims_json,
            forbidden_terms_json, ctas_json
     FROM brands
     WHERE id = ? AND tenant_id = ? AND active = 1
     LIMIT 1`,
    [brandId, tenantId]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError("Marca no encontrada", 404, "BRAND_NOT_FOUND");
  }

  return {
    tenantId: String(row.tenant_id),
    brandId: String(row.id),
    name: String(row.name),
    description: row.description ?? undefined,
    tone: json<string[]>(row.tone_json, []),
    products: json<string[]>(row.products_json, []),
    approvedClaims: json<string[]>(row.approved_claims_json, []),
    forbiddenTerms: json<string[]>(row.forbidden_terms_json, []),
    ctas: json<string[]>(row.ctas_json, [])
  };
}

export async function recentPlatformPosts(
  tenantId: number,
  brandId: number,
  platform: SocialPlatform,
  limit = 12
) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT pj.generated_payload_json
     FROM publication_jobs pj
     INNER JOIN calendar_entries ce ON ce.id = pj.calendar_entry_id
     WHERE pj.tenant_id = ?
       AND ce.brand_id = ?
       AND ce.platform = ?
       AND pj.status = 'published'
       AND pj.generated_payload_json IS NOT NULL
     ORDER BY pj.published_at DESC, pj.id DESC
     LIMIT ?`,
    [tenantId, brandId, platform, Math.min(Math.max(limit, 1), 30)]
  );

  return rows
    .map((row) => json<Record<string, unknown>>(row.generated_payload_json, {}))
    .map((payload) => {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const caption = typeof payload.caption === "string" ? payload.caption.trim() : "";
      return [title, caption].filter(Boolean).join(" — ");
    })
    .filter(Boolean);
}


export async function platformPerformanceSignals(
  tenantId: number,
  brandId: number,
  platform: SocialPlatform,
  limit = 10
) {
  const safeLimit = Math.min(Math.max(limit, 1), 30);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT signal_key, signal_value, sample_size, metadata_json, calculated_at
     FROM editorial_performance_signals
     WHERE tenant_id = ?
       AND brand_id = ?
       AND platform = ?
     ORDER BY calculated_at DESC, id DESC
     LIMIT ?`,
    [tenantId, brandId, platform, safeLimit * 3]
  );

  const seen = new Set<string>();
  const signals: Array<{
    key: string;
    value: number;
    sampleSize: number;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    const key = String(row.signal_key);
    if (seen.has(key)) continue;
    seen.add(key);

    signals.push({
      key,
      value: Number(row.signal_value ?? 0),
      sampleSize: Number(row.sample_size ?? 0),
      metadata: json<Record<string, unknown>>(row.metadata_json, {})
    });

    if (signals.length >= safeLimit) break;
  }

  return signals;
}
