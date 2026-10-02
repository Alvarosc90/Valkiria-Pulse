import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCalendarWorkbook } from "./index.js";

function workbookBuffer(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Calendario");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

test("imports Instagram rows with timezone conversion", () => {
  const result = parseCalendarWorkbook(
    workbookBuffer([{ Fecha: "05/10/2026", Hora: "09:30", Tema: "Comunidad", "Tipo de pieza": "Carrusel" }]),
    "instagram",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0]?.platform, "instagram");
  assert.equal(result.rows[0]?.scheduledAtUtc, "2026-10-05T12:30:00Z");
});

test("keeps TikTok-specific context isolated", () => {
  const result = parseCalendarWorkbook(
    workbookBuffer([{ Fecha: "06/10/2026", Tema: "Coach", Hook: "¿Todavia armas rutinas a mano?", "Idea de video": "Demo vertical" }]),
    "tiktok",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.rows[0]?.platformPayload.hook, "¿Todavia armas rutinas a mano?");
  assert.equal(result.rows[0]?.platformPayload.privacy, "SELF_ONLY");
});

test("reports invalid rows without aborting the whole import", () => {
  const result = parseCalendarWorkbook(
    workbookBuffer([{ Fecha: "07/10/2026", Tema: "Valida" }, { Fecha: "", Tema: "Invalida" }]),
    "linkedin",
    "America/Argentina/Cordoba"
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.rowNumber, 3);
});
