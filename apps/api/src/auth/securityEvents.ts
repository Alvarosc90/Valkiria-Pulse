import { createHash } from "node:crypto";
import { db } from "../db.js";

function emailHash(email?: string | null) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export async function authSecurityEvent(input: {
  userId?: number | null;
  tenantId?: number | null;
  email?: string | null;
  eventKey: string;
  outcome: "success" | "failure" | "info";
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.execute(
    `INSERT INTO auth_security_events
     (user_id, tenant_id, email_hash, event_key, outcome, ip_address, user_agent, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId ?? null,
      input.tenantId ?? null,
      emailHash(input.email),
      input.eventKey.slice(0, 80),
      input.outcome,
      input.ip?.slice(0, 64) ?? null,
      input.userAgent?.slice(0, 255) ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
}
