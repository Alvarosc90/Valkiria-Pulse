import { db } from "../src/db.js";

async function main() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO tenants (name, slug, country, currency, timezone, status)
       VALUES ('TrainIA', 'trainia', 'AR', 'ARS', 'America/Argentina/Cordoba', 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`
    );

    const [tenantRows] = await connection.query<any[]>(
      "SELECT id FROM tenants WHERE slug = 'trainia' LIMIT 1"
    );
    const tenantId = Number(tenantRows[0].id);

    const [brandRows] = await connection.query<any[]>(
      "SELECT id FROM brands WHERE tenant_id = ? AND name = 'TrainIA' LIMIT 1",
      [tenantId]
    );

    let brandId = brandRows[0]?.id ? Number(brandRows[0].id) : null;
    if (!brandId) {
      const [brandResult] = await connection.execute<any>(
        `INSERT INTO brands
         (tenant_id, name, description, tone_json, products_json, approved_claims_json, forbidden_terms_json, ctas_json)
         VALUES (?, 'TrainIA', ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          "Plataforma que conecta comunidades y espacios deportivos.",
          JSON.stringify(["claro", "profesional", "cercano", "sin exageraciones"]),
          JSON.stringify(["TrainIA", "TrainIA Coach", "Comunidad", "Check-in QR"]),
          JSON.stringify(["Construyendo comunidades.", "Menos gestion. Mas comunidad."]),
          JSON.stringify(["revolucionario", "garantizado", "el mejor del mercado"]),
          JSON.stringify(["Conoce TrainIA", "Descubre la plataforma"])
        ]
      );
      brandId = Number(brandResult.insertId);
    }

    await connection.execute(
      `INSERT INTO tenant_links (tenant_id, source, external_tenant_id)
       VALUES (?, 'trainia', 'trainia')
       ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id)`,
      [tenantId]
    );

    await connection.commit();
    console.log(JSON.stringify({ ok: true, tenantId, brandId }, null, 2));
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
