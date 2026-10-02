import { db } from "../db.js";

export async function auditEvent(input: {
  tenantId: number;
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await db.execute(
    `INSERT INTO audit_events
     (tenant_id, user_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.userId ?? null,
      input.action.slice(0, 120),
      input.entityType.slice(0, 80),
      input.entityId == null ? null : String(input.entityId).slice(0, 120),
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip?.slice(0, 64) ?? null,
      input.userAgent?.slice(0, 255) ?? null
    ]
  );
}
