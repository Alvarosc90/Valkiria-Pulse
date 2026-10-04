import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../src/db.js";

const OWNER_EMAIL = "consultas@valkiria.tech";
const OWNER_NAME = "PULSE Owner";
const TENANT_NAME = "Valkiria Project";
const TENANT_SLUG = "valkiria-project";
const BRAND_NAME = "Valkiria PULSE";

function temporaryPassword() {
  return randomBytes(15).toString("base64url") + "aA7!";
}

async function main() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [tenantRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM tenants WHERE slug = ? LIMIT 1",
      [TENANT_SLUG]
    );

    let tenantId = Number(tenantRows[0]?.id ?? 0);
    if (!tenantId) {
      const [tenantInsert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO tenants
         (name, slug, country, currency, timezone, status)
         VALUES (?, ?, 'AR', 'ARS', 'America/Argentina/Cordoba', 'active')`,
        [TENANT_NAME, TENANT_SLUG]
      );
      tenantId = tenantInsert.insertId;
    } else {
      await connection.execute(
        "UPDATE tenants SET name = ?, status = 'active' WHERE id = ?",
        [TENANT_NAME, tenantId]
      );
    }

    const [userRows] = await connection.query<RowDataPacket[]>(
      `SELECT u.id, u.display_name, u.email_verified_at,
              ut.role, ut.active AS tenant_access_active
       FROM users u
       LEFT JOIN user_tenants ut
         ON ut.user_id = u.id AND ut.tenant_id = ?
       WHERE u.email = ?
       LIMIT 1`,
      [tenantId, OWNER_EMAIL]
    );

    const existing = userRows[0];
    const alreadyBootstrapped =
      existing &&
      String(existing.display_name) === OWNER_NAME &&
      existing.email_verified_at &&
      existing.role === "owner" &&
      Number(existing.tenant_access_active) === 1;

    if (alreadyBootstrapped) {
      await connection.rollback();
      console.log(JSON.stringify({
        ok: true,
        status: "existing",
        email: OWNER_EMAIL,
        tenantSlug: TENANT_SLUG
      }));
      return;
    }

    const password = temporaryPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    let userId = Number(existing?.id ?? 0);

    if (userId) {
      await connection.execute(
        `UPDATE users
         SET password_hash = ?,
             display_name = ?,
             active = 1,
             email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()),
             password_changed_at = UTC_TIMESTAMP(),
             auth_version = auth_version + 1
         WHERE id = ?`,
        [passwordHash, OWNER_NAME, userId]
      );
    } else {
      const [userInsert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users
         (email, password_hash, display_name, active, email_verified_at, password_changed_at)
         VALUES (?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [OWNER_EMAIL, passwordHash, OWNER_NAME]
      );
      userId = userInsert.insertId;
    }

    await connection.execute(
      `INSERT INTO user_tenants (user_id, tenant_id, role, active)
       VALUES (?, ?, 'owner', 1)
       ON DUPLICATE KEY UPDATE role = 'owner', active = 1, auth_version = auth_version + 1`,
      [userId, tenantId]
    );

    const [brandRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM brands WHERE tenant_id = ? AND name = ? LIMIT 1",
      [tenantId, BRAND_NAME]
    );
    if (!brandRows[0]) {
      await connection.execute(
        `INSERT INTO brands
         (tenant_id, name, description, tone_json, products_json,
          approved_claims_json, forbidden_terms_json, ctas_json, active)
         VALUES (?, ?, ?, JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), 1)`,
        [
          tenantId,
          BRAND_NAME,
          "Marca principal de Valkiria PULSE."
        ]
      );
    }

    const [subscriptionRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM tenant_subscriptions WHERE tenant_id = ? LIMIT 1",
      [tenantId]
    );
    if (!subscriptionRows[0]) {
      await connection.execute(
        `INSERT INTO tenant_subscriptions
         (tenant_id, plan_key, status, trial_ends_at)
         VALUES (?, 'starter', 'trial', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))`,
        [tenantId]
      );
    }

    await connection.execute(
      `UPDATE refresh_sessions
       SET revoked_at = UTC_TIMESTAMP()
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );

    await connection.commit();

    console.log(
      "PULSE_OWNER_BOOTSTRAP_CREDENTIALS " +
      JSON.stringify({
        email: OWNER_EMAIL,
        password,
        role: "owner",
        tenantSlug: TENANT_SLUG,
        changePasswordAfterLogin: true
      })
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
