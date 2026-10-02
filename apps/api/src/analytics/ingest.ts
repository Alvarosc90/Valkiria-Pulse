import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { SocialPlatform } from "@pulse/contracts";
import { db } from "../db.js";
import type { PostMetricSample } from "./provider.js";

type AccountRow = RowDataPacket & {
  id: number;
  tenant_id: number;
  brand_id: number;
  platform: SocialPlatform;
};

export async function startAnalyticsSyncRun(input: {
  tenantId: number;
  socialAccountId: number;
}) {
  const [accounts] = await db.query<AccountRow[]>(
    `SELECT id, tenant_id, brand_id, platform
     FROM social_accounts
     WHERE id = ? AND tenant_id = ? AND status = 'connected'
     LIMIT 1`,
    [input.socialAccountId, input.tenantId]
  );
  const account = accounts[0];
  if (!account) throw new Error("ANALYTICS_ACCOUNT_NOT_AVAILABLE");

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO analytics_sync_runs
     (tenant_id, social_account_id, platform, status, started_at)
     VALUES (?, ?, ?, 'running', UTC_TIMESTAMP())`,
    [account.tenant_id, account.id, account.platform]
  );

  return {
    runId: result.insertId,
    account
  };
}

export async function ingestPostMetricSamples(input: {
  runId: number;
  tenantId: number;
  socialAccountId: number;
  samples: PostMetricSample[];
}) {
  const [accounts] = await db.query<AccountRow[]>(
    `SELECT id, tenant_id, brand_id, platform
     FROM social_accounts
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [input.socialAccountId, input.tenantId]
  );
  const account = accounts[0];
  if (!account) throw new Error("ANALYTICS_ACCOUNT_NOT_FOUND");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (const sample of input.samples) {
      const [jobs] = await connection.query<RowDataPacket[]>(
        `SELECT pj.id AS publicationJobId, pj.calendar_entry_id AS calendarEntryId
         FROM publication_jobs pj
         WHERE pj.social_account_id = ?
           AND pj.external_publish_id = ?
         ORDER BY pj.id DESC
         LIMIT 1`,
        [account.id, sample.externalPostId]
      );

      const job = jobs[0];

      await connection.execute(
        `INSERT INTO social_post_metrics_daily
         (tenant_id, brand_id, social_account_id, calendar_entry_id,
          publication_job_id, platform, external_post_id, metric_date,
          impressions, reach, views, likes, comments, shares, saves,
          clicks, follows, watch_time_seconds, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           calendar_entry_id = VALUES(calendar_entry_id),
           publication_job_id = VALUES(publication_job_id),
           impressions = VALUES(impressions),
           reach = VALUES(reach),
           views = VALUES(views),
           likes = VALUES(likes),
           comments = VALUES(comments),
           shares = VALUES(shares),
           saves = VALUES(saves),
           clicks = VALUES(clicks),
           follows = VALUES(follows),
           watch_time_seconds = VALUES(watch_time_seconds),
           metadata_json = VALUES(metadata_json)`,
        [
          account.tenant_id,
          account.brand_id,
          account.id,
          job?.calendarEntryId ?? null,
          job?.publicationJobId ?? null,
          account.platform,
          sample.externalPostId,
          sample.metricDate,
          sample.impressions ?? null,
          sample.reach ?? null,
          sample.views ?? null,
          sample.likes ?? null,
          sample.comments ?? null,
          sample.shares ?? null,
          sample.saves ?? null,
          sample.clicks ?? null,
          sample.follows ?? null,
          sample.watchTimeSeconds ?? null,
          sample.metadata ? JSON.stringify(sample.metadata) : null
        ]
      );
    }

    await connection.execute(
      `UPDATE analytics_sync_runs
       SET records_received = ?, updated_at = COALESCE(updated_at, UTC_TIMESTAMP())
       WHERE id = ? AND tenant_id = ?`,
      [input.samples.length, input.runId, input.tenantId]
    ).catch(async () => {
      await connection.execute(
        `UPDATE analytics_sync_runs
         SET records_received = ?
         WHERE id = ? AND tenant_id = ?`,
        [input.samples.length, input.runId, input.tenantId]
      );
    });

    await connection.commit();
    return { records: input.samples.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function finishAnalyticsSyncRun(input: {
  runId: number;
  tenantId: number;
  status: "completed" | "failed" | "skipped";
  error?: string | null;
}) {
  await db.execute(
    `UPDATE analytics_sync_runs
     SET status = ?, error_message = ?, completed_at = UTC_TIMESTAMP()
     WHERE id = ? AND tenant_id = ? AND status = 'running'`,
    [
      input.status,
      input.error?.slice(0, 1000) ?? null,
      input.runId,
      input.tenantId
    ]
  );
}
