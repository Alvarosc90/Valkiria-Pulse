import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "@ayocore/exceljs";
import { parseCalendarWorkbook } from "./index.js";

async function workbookBuffer(rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Calendario");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("imports Instagram rows with timezone conversion", async () => {
  const result = await parseCalendarWorkbook(
    await workbookBuffer([{ Fecha: "05/10/2026", Hora: "09:30", Tema: "Comunidad", "Tipo de pieza": "Carrusel" }]),
    "instagram",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0]?.platform, "instagram");
  assert.equal(result.rows[0]?.scheduledAtUtc, "2026-10-05T12:30:00Z");
});

test("keeps TikTok-specific context isolated", async () => {
  const result = await parseCalendarWorkbook(
    await workbookBuffer([{ Fecha: "06/10/2026", Tema: "Coach", Hook: "¿Todavia armas rutinas a mano?", "Idea de video": "Demo vertical" }]),
    "tiktok",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.rows[0]?.platformPayload.hook, "¿Todavia armas rutinas a mano?");
  assert.equal(result.rows[0]?.platformPayload.privacy, "SELF_ONLY");
});

test("reports invalid rows without aborting the whole import", async () => {
  const result = await parseCalendarWorkbook(
    await workbookBuffer([{ Fecha: "07/10/2026", Tema: "Valida" }, { Fecha: "", Tema: "Invalida" }]),
    "linkedin",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.rowNumber, 3);
});
