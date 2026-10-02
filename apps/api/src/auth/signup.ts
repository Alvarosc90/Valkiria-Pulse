import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { PULSE_LEGAL_VERSION } from "@pulse/contracts";
import { db } from "../db.js";
import { HttpError } from "../http/httpError.js";

function slugBase(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "workspace";
}

async function uniqueTenantSlug(name: string) {
  const base = slugBase(name);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0
      ? ""
      : "-" + randomUUID().replace(/-/g, "").slice(0, 6);
    const slug = (base + suffix).slice(0, 100);
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT id FROM tenants WHERE slug = ? LIMIT 1",
      [slug]
    );
    if (!rows[0]) return slug;
  }

  return (base.slice(0, 90) + "-" + Date.now().toString(36)).slice(0, 100);
}

export async function createTrialWorkspace(input: {
  displayName: string;
  companyName: string;
  brandName?: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}) {
  if (!input.acceptTerms || !input.acceptPrivacy) {
    throw new HttpError(
      "Debes aceptar los Terminos y la Politica de Privacidad",
      400,
      "LEGAL_ACCEPTANCE_REQUIRED"
    );
  }

  const email = input.email.trim().toLowerCase();
  const [existing] = await db.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (existing[0]) {
    throw new HttpError(
      "Ya existe una cuenta con ese email",
      409,
      "AUTH_EMAIL_ALREADY_EXISTS"
    );
  }

  const slug = await uniqueTenantSlug(input.companyName);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [tenantInsert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO tenants
       (name, slug, country, currency, timezone, status)
       VALUES (?, ?, 'AR', 'ARS', 'America/Argentina/Cordoba', 'active')`,
      [input.companyName.trim(), slug]
    );

    const tenantId = tenantInsert.insertId;

    const [userInsert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users
       (email, password_hash, display_name, active)
       VALUES (?, ?, ?, 1)`,
      [email, passwordHash, input.displayName.trim()]
    );

    const userId = userInsert.insertId;

    await connection.execute(
      `INSERT INTO user_tenants
       (user_id, tenant_id, role, active)
       VALUES (?, ?, 'owner', 1)`,
      [userId, tenantId]
    );

    await connection.execute(
      `INSERT INTO brands
       (tenant_id, name, description, tone_json, products_json,
        approved_claims_json, forbidden_terms_json, ctas_json, active)
       VALUES (?, ?, ?, JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), 1)`,
      [
        tenantId,
        (input.brandName?.trim() || input.companyName.trim()).slice(0, 140),
        "Marca creada durante el registro inicial de Valkiria PULSE."
      ]
    );

    await connection.execute(
      `INSERT INTO tenant_subscriptions
       (tenant_id, plan_key, status, trial_ends_at)
       VALUES (?, 'starter', 'trial', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))`,
      [tenantId]
    );

    for (const documentKey of ["terms", "privacy"]) {
      await connection.execute(
        `INSERT INTO legal_acceptances
         (user_id, tenant_id, document_key, document_version, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          tenantId,
          documentKey,
          PULSE_LEGAL_VERSION,
          input.requestMeta?.ip?.slice(0, 64) || null,
          input.requestMeta?.userAgent?.slice(0, 255) || null
        ]
      );
    }

    await connection.commit();

    return {
      userId,
      tenantId,
      tenantSlug: slug,
      legalVersion: PULSE_LEGAL_VERSION
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
