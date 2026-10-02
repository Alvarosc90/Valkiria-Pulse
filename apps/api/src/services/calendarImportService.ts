import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { parseCalendarWorkbook } from "@pulse/calendars";
import type { SocialPlatform } from "@pulse/contracts";
import { db } from "../db.js";
import { assertPlanLimit, incrementMonthlyUsage } from "../billing/limits.js";

function entryStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["ready", "listo", "aprobado"].includes(normalized)) return "ready";
  if (["scheduled", "programado"].includes(normalized)) return "scheduled";
  return "draft";
}

export async function importCalendar(input: {
  tenantId: number;
  brandId: number;
  platform: SocialPlatform;
  timezone: string;
  filename: string;
  buffer: Buffer;
}) {
  const parsed = parseCalendarWorkbook(input.buffer, input.platform, input.timezone);

  await assertPlanLimit({
    tenantId: input.tenantId,
    metric: "scheduledPostsPerMonth",
    increment: parsed.rows.length
  });

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [importResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO calendar_imports
       (tenant_id, brand_id, platform, filename, rows_total, rows_valid, rows_invalid, status, error_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        input.tenantId,
        input.brandId,
        input.platform,
        input.filename,
        parsed.total,
        parsed.rows.length,
        parsed.errors.length,
        parsed.errors.length ? JSON.stringify(parsed.errors) : null
      ]
    );

    for (const row of parsed.rows) {
      await connection.execute(
        `INSERT INTO calendar_entries
         (tenant_id, brand_id, import_id, platform, scheduled_at_utc, timezone, topic,
          objective, angle, copy_seed, cta, platform_payload_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.tenantId,
          input.brandId,
          importResult.insertId,
          row.platform,
          new Date(row.scheduledAtUtc),
          row.timezone,
          row.topic,
          row.objective ?? null,
          row.angle ?? null,
          row.copySeed ?? null,
          row.cta ?? null,
          JSON.stringify(row.platformPayload),
          entryStatus(row.platformPayload.status)
        ]
      );
    }

    await connection.commit();

    if (parsed.rows.length) {
      await incrementMonthlyUsage(
        input.tenantId,
        "scheduledPostsPerMonth",
        parsed.rows.length
      );
    }

    return {
      importId: importResult.insertId,
      platform: input.platform,
      total: parsed.total,
      valid: parsed.rows.length,
      invalid: parsed.errors.length,
      errors: parsed.errors
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCalendarEntries(input: {
  tenantId: number;
  platform?: SocialPlatform;
  limit?: number;
}) {
  const params: unknown[] = [input.tenantId];
  let where = "WHERE ce.tenant_id = ?";

  if (input.platform) {
    where += " AND ce.platform = ?";
    params.push(input.platform);
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  params.push(limit);

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       ce.id, ce.brand_id AS brandId, ce.platform,
       ce.scheduled_at_utc AS scheduledAtUtc, ce.timezone,
       ce.topic, ce.objective, ce.angle, ce.copy_seed AS copySeed,
       ce.cta, ce.platform_payload_json AS platformPayload, ce.status
     FROM calendar_entries ce
     ${where}
     ORDER BY ce.scheduled_at_utc ASC
     LIMIT ?`,
    params
  );

  return rows;
}
