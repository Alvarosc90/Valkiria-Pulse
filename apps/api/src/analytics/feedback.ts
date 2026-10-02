import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";

export async function rebuildEditorialSignals(input: {
  tenantId: number;
  brandId: number;
}) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       ce.platform,
       COUNT(DISTINCT ce.id) AS sampleSize,
       AVG(
         COALESCE(m.likes,0) +
         COALESCE(m.comments,0) * 2 +
         COALESCE(m.shares,0) * 3 +
         COALESCE(m.saves,0) * 3 +
         COALESCE(m.clicks,0) * 2
       ) AS avgEngagementScore
     FROM calendar_entries ce
     INNER JOIN social_post_metrics_daily m ON m.calendar_entry_id = ce.id
     WHERE ce.tenant_id = ?
       AND ce.brand_id = ?
       AND m.metric_date >= DATE_SUB(UTC_DATE(), INTERVAL 90 DAY)
     GROUP BY ce.platform`,
    [input.tenantId, input.brandId]
  );

  for (const row of rows) {
    await db.execute(
      `INSERT INTO editorial_performance_signals
       (tenant_id, brand_id, platform, signal_key, signal_value, sample_size, metadata_json)
       VALUES (?, ?, ?, 'avg_engagement_score_90d', ?, ?, ?)`,
      [
        input.tenantId,
        input.brandId,
        row.platform,
        Number(row.avgEngagementScore ?? 0),
        Number(row.sampleSize ?? 0),
        JSON.stringify({ windowDays: 90 })
      ]
    );
  }

  return rows.map((row) => ({
    platform: row.platform,
    sampleSize: Number(row.sampleSize ?? 0),
    averageEngagementScore: Number(row.avgEngagementScore ?? 0)
  }));
}
