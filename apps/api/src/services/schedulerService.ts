import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type {
  BrandContext,
  CalendarEntry,
  GeneratedPost,
  SocialPlatform
} from "@pulse/contracts";
import { pulseOrchestrator } from "../agents/runtime.js";
import { db } from "../db.js";
import { providerFor } from "../providers/registry.js";
import {
  platformPerformanceSignals,
  recentPlatformPosts
} from "./agentContextService.js";

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function toBrand(row: RowDataPacket): BrandContext {
  return {
    tenantId: String(row.tenant_id),
    brandId: String(row.brand_id),
    name: String(row.brand_name),
    description: row.brand_description ?? undefined,
    tone: json<string[]>(row.tone_json, []),
    products: json<string[]>(row.products_json, []),
    approvedClaims: json<string[]>(row.approved_claims_json, []),
    forbiddenTerms: json<string[]>(row.forbidden_terms_json, []),
    ctas: json<string[]>(row.ctas_json, [])
  };
}

function toEntry(row: RowDataPacket): CalendarEntry {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    platform: row.platform as SocialPlatform,
    scheduledAt: new Date(row.scheduled_at_utc).toISOString(),
    topic: String(row.topic),
    objective: row.objective ?? undefined,
    angle: row.angle ?? undefined,
    assetRefs: [],
    notes: row.copy_seed ?? undefined,
    platformContext: json<Record<string, unknown>>(
      row.platform_payload_json,
      {}
    ),
    status: row.status
  };
}

function enrichContent(row: RowDataPacket, generated: GeneratedPost): GeneratedPost {
  const platformPayload = json<Record<string, unknown>>(row.platform_payload_json, {});
  const accountMetadata = json<Record<string, unknown>>(row.account_metadata_json, {});
  const material = typeof platformPayload.material === "string" ? platformPayload.material : undefined;

  const metadata: Record<string, unknown> = {
    ...platformPayload,
    ...generated.metadata,
    ...accountMetadata
  };

  if (material?.startsWith("http")) {
    if (row.platform === "instagram") metadata.imageUrl = material;
    if (row.platform === "tiktok") metadata.videoUrl = material;
  }

  if (row.platform === "instagram") {
    metadata.instagramUserId = accountMetadata.instagramUserId ?? row.external_account_id;
  }

  if (row.platform === "linkedin") {
    metadata.authorUrn = accountMetadata.authorUrn;
  }

  return { ...generated, metadata };
}

async function dueRows(limit: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       ce.*, b.name AS brand_name, b.description AS brand_description,
       b.tone_json, b.products_json, b.approved_claims_json,
       b.forbidden_terms_json, b.ctas_json,
       sa.id AS social_account_id, sa.external_account_id,
       sa.metadata_json AS account_metadata_json
     FROM calendar_entries ce
     INNER JOIN brands b ON b.id = ce.brand_id
     INNER JOIN social_accounts sa
       ON sa.tenant_id = ce.tenant_id
      AND sa.brand_id = ce.brand_id
      AND sa.platform = ce.platform
      AND sa.status = 'connected'
      AND (ce.target_social_account_id IS NULL OR ce.target_social_account_id = sa.id)
     WHERE ce.status IN ('ready','scheduled')
       AND ce.scheduled_at_utc <= UTC_TIMESTAMP()
       AND NOT EXISTS (
         SELECT 1 FROM publication_jobs pj
         WHERE pj.calendar_entry_id = ce.id AND pj.social_account_id = sa.id
       )
     ORDER BY ce.scheduled_at_utc ASC, sa.id ASC
     LIMIT ?`,
    [limit]
  );

  const seen = new Set<number>();
  return rows.filter((row) => {
    const id = Number(row.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function publishDue(limit = 10) {
  const rows = await dueRows(Math.min(Math.max(limit, 1), 50));
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const connection = await db.getConnection();
    let jobId: number | undefined;

    try {
      await connection.beginTransaction();
      let job: ResultSetHeader;
      try {
        [job] = await connection.execute<ResultSetHeader>(
          `INSERT INTO publication_jobs
           (tenant_id, calendar_entry_id, social_account_id, status, attempt_count)
           VALUES (?, ?, ?, 'processing', 1)`,
          [row.tenant_id, row.id, row.social_account_id]
        );
      } catch (claimError) {
        const code =
          typeof claimError === "object" && claimError
            ? String((claimError as { code?: unknown }).code ?? "")
            : "";

        if (code === "ER_DUP_ENTRY") {
          await connection.rollback();
          continue;
        }
        throw claimError;
      }

      jobId = job.insertId;
      await connection.execute(
        "UPDATE calendar_entries SET status = 'processing' WHERE id = ?",
        [row.id]
      );
      await connection.commit();

      const [recentPosts, performanceSignals] = await Promise.all([
        recentPlatformPosts(
          Number(row.tenant_id),
          Number(row.brand_id),
          row.platform as SocialPlatform
        ),
        platformPerformanceSignals(
          Number(row.tenant_id),
          Number(row.brand_id),
          row.platform as SocialPlatform
        )
      ]);

      const generated = await pulseOrchestrator.generate(
        toEntry(row),
        toBrand(row),
        { recentPosts, performanceSignals }
      );

      const content = enrichContent(row, generated);
      const provider = providerFor(row.platform as SocialPlatform);
      const result = await provider.publish({
        tenantId: String(row.tenant_id),
        accountId: String(row.social_account_id),
        content
      });

      const finalStatus = result.status === "published"
        ? "published"
        : result.status === "failed"
          ? "failed"
          : "processing";

      await db.execute(
        `UPDATE publication_jobs
         SET status = ?, external_publish_id = ?, generated_payload_json = ?,
             last_error = ?, published_at = ?
         WHERE id = ?`,
        [
          finalStatus,
          result.externalId ?? null,
          JSON.stringify(content),
          result.error ?? null,
          result.status === "published" ? new Date() : null,
          jobId
        ]
      );

      await db.execute(
        "UPDATE calendar_entries SET status = ? WHERE id = ?",
        [finalStatus, row.id]
      );

      results.push({ calendarEntryId: row.id, jobId, ...result });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      const message = error instanceof Error ? error.message : String(error);
      if (jobId) {
        await db.execute(
          "UPDATE publication_jobs SET status = 'failed', last_error = ? WHERE id = ?",
          [message, jobId]
        );
      }
      if (jobId) {
        await db.execute(
          "UPDATE calendar_entries SET status = 'failed' WHERE id = ?",
          [row.id]
        );
      }
      results.push({ calendarEntryId: row.id, jobId, status: "failed", error: message });
    } finally {
      connection.release();
    }
  }

  return results;
}

export async function pollProcessing(limit = 25) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT pj.id, pj.calendar_entry_id, pj.social_account_id,
            pj.external_publish_id, sa.platform
     FROM publication_jobs pj
     INNER JOIN social_accounts sa ON sa.id = pj.social_account_id
     WHERE pj.status = 'processing'
       AND pj.external_publish_id IS NOT NULL
     ORDER BY pj.updated_at ASC
     LIMIT ?`,
    [Math.min(Math.max(limit, 1), 100)]
  );

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const provider = providerFor(row.platform as SocialPlatform);
    const result = await provider.getStatus(
      String(row.social_account_id),
      String(row.external_publish_id)
    );

    if (result.status === "processing") continue;

    const status = result.status === "published" ? "published" : "failed";
    await db.execute(
      `UPDATE publication_jobs
       SET status = ?, last_error = ?, published_at = ?
       WHERE id = ?`,
      [status, result.error ?? null, status === "published" ? new Date() : null, row.id]
    );
    await db.execute(
      "UPDATE calendar_entries SET status = ? WHERE id = ?",
      [status, row.calendar_entry_id]
    );
    results.push({ jobId: row.id, ...result });
  }

  return results;
}

export async function schedulerTick() {
  const polled = await pollProcessing();
  const published = await publishDue();
  return { polled, published };
}
