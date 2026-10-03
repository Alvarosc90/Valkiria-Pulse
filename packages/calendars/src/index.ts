import ExcelJS from "@ayocore/exceljs";
import { DateTime } from "luxon";
import type { SocialPlatform } from "@pulse/contracts";

export interface ImportedCalendarRow {
  rowNumber: number;
  platform: SocialPlatform;
  scheduledAtUtc: string;
  timezone: string;
  topic: string;
  objective?: string;
  angle?: string;
  copySeed?: string;
  cta?: string;
  platformPayload: Record<string, unknown>;
}

export interface CalendarRowError {
  rowNumber: number;
  message: string;
}

export interface CalendarImportResult {
  rows: ImportedCalendarRow[];
  errors: CalendarRowError[];
  total: number;
}

const normalizedKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function mapRow(row: Record<string, unknown>) {
  const mapped = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) mapped.set(normalizedKey(key), value);
  return mapped;
}

function first(row: Map<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row.get(normalizedKey(alias));
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return undefined;
}

function textValue(row: Map<string, unknown>, aliases: string[]) {
  const value = first(row, aliases);
  return value === undefined ? undefined : String(value).trim();
}

function excelSerialToDate(serial: number): DateTime | undefined {
  if (!Number.isFinite(serial)) return undefined;
  const wholeDays = Math.floor(serial);
  const epoch = DateTime.utc(1899, 12, 30);
  const parsed = epoch.plus({ days: wholeDays });
  return parsed.isValid ? parsed : undefined;
}

function excelDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return DateTime.fromJSDate(value, { zone: "utc" }).toFormat("yyyy-MM-dd");
  }
  if (typeof value === "number") {
    return excelSerialToDate(value)?.toFormat("yyyy-MM-dd");
  }
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const candidates = ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy"];
  for (const format of candidates) {
    const parsed = DateTime.fromFormat(raw, format);
    if (parsed.isValid) return parsed.toFormat("yyyy-MM-dd");
  }
  const iso = DateTime.fromISO(raw);
  return iso.isValid ? iso.toFormat("yyyy-MM-dd") : undefined;
}

function excelTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return DateTime.fromJSDate(value, { zone: "utc" }).toFormat("HH:mm");
  }
  if (typeof value === "number") {
    const fraction = ((value % 1) + 1) % 1;
    const seconds = Math.round(fraction * 86400) % 86400;
    const hour = Math.floor(seconds / 3600);
    const minute = Math.floor((seconds % 3600) / 60);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const raw = String(value ?? "09:00").trim() || "09:00";
  for (const format of ["HH:mm", "H:mm", "HH:mm:ss", "h:mm a"]) {
    const parsed = DateTime.fromFormat(raw, format);
    if (parsed.isValid) return parsed.toFormat("HH:mm");
  }
  return "09:00";
}

function unwrapCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value && value.result !== undefined) return value.result;
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("hyperlink" in value && typeof value.text === "string") return value.text;
  return String(value);
}

function worksheetRows(worksheet: ExcelJS.Worksheet): Array<{ rowNumber: number; raw: Record<string, unknown> }> {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(unwrapCellValue(cell.value) ?? "").trim();
  });

  const rows: Array<{ rowNumber: number; raw: Record<string, unknown> }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const raw: Record<string, unknown> = {};
    let hasValue = false;

    for (let colNumber = 1; colNumber < headers.length; colNumber += 1) {
      const header = headers[colNumber];
      if (!header) continue;
      const value = unwrapCellValue(row.getCell(colNumber).value);
      raw[header] = value;
      if (value !== "" && value !== null && value !== undefined) hasValue = true;
    }

    if (hasValue) rows.push({ rowNumber, raw });
  }
  return rows;
}

function common(row: Map<string, unknown>, platform: SocialPlatform, timezone: string, rowNumber: number) {
  const dateRaw = first(row, ["Fecha", "Date"]);
  const topic = textValue(row, ["Tema", "Topic"]);
  if (!dateRaw) throw new Error("Falta Fecha");
  if (!topic) throw new Error("Falta Tema");

  const date = excelDate(dateRaw);
  if (!date) throw new Error("Fecha invalida");
  const time = excelTime(first(row, ["Hora", "Time"]));
  const local = DateTime.fromISO(`${date}T${time}:00`, { zone: timezone });
  if (!local.isValid) throw new Error("Fecha/hora invalida para timezone " + timezone);

  return {
    rowNumber,
    platform,
    scheduledAtUtc: local.toUTC().toISO({ suppressMilliseconds: true })!,
    timezone,
    topic,
    objective: textValue(row, ["Objetivo", "Objective"]),
    cta: textValue(row, ["CTA", "Call to action"])
  };
}

function parsePlatformRow(platform: SocialPlatform, raw: Record<string, unknown>, timezone: string, rowNumber: number): ImportedCalendarRow {
  const row = mapRow(raw);
  const base = common(row, platform, timezone, rowNumber);

  if (platform === "instagram") {
    return {
      ...base,
      angle: textValue(row, ["Tipo de pieza", "Formato", "Angle"]),
      copySeed: textValue(row, ["Copy base", "Copy", "Caption"]),
      platformPayload: {
        contentType: textValue(row, ["Tipo de pieza", "Formato"]),
        material: textValue(row, ["Material", "Asset"]),
        status: textValue(row, ["Estado", "Status"])
      }
    };
  }

  if (platform === "tiktok") {
    return {
      ...base,
      angle: textValue(row, ["Hook", "Gancho"]),
      copySeed: textValue(row, ["Idea de video", "Guion", "Copy"]),
      platformPayload: {
        hook: textValue(row, ["Hook", "Gancho"]),
        videoIdea: textValue(row, ["Idea de video", "Idea"]),
        duration: textValue(row, ["Duracion", "Duración"]),
        material: textValue(row, ["Material", "Asset"]),
        privacy: textValue(row, ["Privacidad", "Privacy"]) ?? "SELF_ONLY",
        status: textValue(row, ["Estado", "Status"])
      }
    };
  }

  return {
    ...base,
    angle: textValue(row, ["Enfoque profesional", "Enfoque", "Angle"]),
    copySeed: textValue(row, ["Desarrollo o producto", "Desarrollo/Producto", "Copy base"]),
    platformPayload: {
      professionalAngle: textValue(row, ["Enfoque profesional", "Enfoque"]),
      developmentOrProduct: textValue(row, ["Desarrollo o producto", "Desarrollo/Producto"]),
      material: textValue(row, ["Material", "Asset"]),
      status: textValue(row, ["Estado", "Status"])
    }
  };
}

export async function parseCalendarWorkbook(buffer: Buffer, platform: SocialPlatform, timezone: string): Promise<CalendarImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("El Excel no contiene hojas");

  const rawRows = worksheetRows(worksheet);
  const rows: ImportedCalendarRow[] = [];
  const errors: CalendarRowError[] = [];

  rawRows.forEach(({ raw, rowNumber }) => {
    try {
      rows.push(parsePlatformRow(platform, raw, timezone, rowNumber));
    } catch (error) {
      errors.push({
        rowNumber,
        message: error instanceof Error ? error.message : "Fila invalida"
      });
    }
  });

  return { rows, errors, total: rawRows.length };
}
