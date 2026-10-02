import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";

export async function getAnalyticsOverview(input: {
  tenantId: number;
  brandId?: number;
  days?: number;
}) {
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  const params: Array<string | number> = [input.tenantId];
  let brandFilter = "";

  if (input.brandId) {
    brandFilter = " AND m.brand_id = ?";
    params.push(input.brandId);
  }
  params.push(days);

  const [platformRows] = await db.query<RowDataPacket[]>(
    `SELECT
       m.platform,
       SUM(COALESCE(m.impressions,0)) AS impressions,
       SUM(COALESCE(m.reach,0)) AS reach,
       SUM(COALESCE(m.views,0)) AS views,
       SUM(COALESCE(m.likes,0)) AS likes,
       SUM(COALESCE(m.comments,0)) AS comments,
       SUM(COALESCE(m.shares,0)) AS shares,
       SUM(COALESCE(m.saves,0)) AS saves,
       SUM(COALESCE(m.clicks,0)) AS clicks
     FROM social_post_metrics_daily m
     WHERE m.tenant_id = ?
       ${brandFilter}
       AND m.metric_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY m.platform
     ORDER BY m.platform`,
    params
  );

  const [topPosts] = await db.query<RowDataPacket[]>(
    `SELECT
       ce.id AS calendarEntryId,
       ce.platform,
       ce.topic,
       pj.external_publish_id AS externalPostId,
       SUM(
         COALESCE(m.likes,0) +
         COALESCE(m.comments,0) * 2 +
         COALESCE(m.shares,0) * 3 +
         COALESCE(m.saves,0) * 3 +
         COALESCE(m.clicks,0) * 2
       ) AS engagementScore,
       SUM(COALESCE(m.impressions,0)) AS impressions,
       SUM(COALESCE(m.views,0)) AS views
     FROM social_post_metrics_daily m
     INNER JOIN publication_jobs pj ON pj.id = m.publication_job_id
     INNER JOIN calendar_entries ce ON ce.id = m.calendar_entry_id
     WHERE m.tenant_id = ?
       ${brandFilter.replaceAll("m.brand_id", "ce.brand_id")}
       AND m.metric_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY ce.id, ce.platform, ce.topic, pj.external_publish_id
     ORDER BY engagementScore DESC, impressions DESC
     LIMIT 10`,
    params
  );

  const [syncRows] = await db.query<RowDataPacket[]>(
    `SELECT platform, status, MAX(started_at) AS lastStartedAt,
            MAX(completed_at) AS lastCompletedAt
     FROM analytics_sync_runs
     WHERE tenant_id = ?
     GROUP BY platform, status`,
    [input.tenantId]
  );

  return {
    days,
    platforms: platformRows.map((row) => ({
      platform: row.platform,
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
      saves: Number(row.saves ?? 0),
      clicks: Number(row.clicks ?? 0)
    })),
    topPosts: topPosts.map((row) => ({
      calendarEntryId: Number(row.calendarEntryId),
      platform: row.platform,
      topic: row.topic,
      externalPostId: row.externalPostId,
      engagementScore: Number(row.engagementScore ?? 0),
      impressions: Number(row.impressions ?? 0),
      views: Number(row.views ?? 0)
    })),
    sync: syncRows
  };
}
