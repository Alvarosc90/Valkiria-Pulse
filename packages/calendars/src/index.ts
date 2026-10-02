import { DateTime } from "luxon";
import * as XLSX from "xlsx";
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

function excelDate(value: unknown): string | undefined {
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return undefined;
    return `${d.y.toString().padStart(4, "0")}-${d.m.toString().padStart(2, "0")}-${d.d.toString().padStart(2, "0")}`;
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
  if (typeof value === "number") {
    const seconds = Math.round((value % 1) * 86400);
    const hour = Math.floor(seconds / 3600) % 24;
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

export function parseCalendarWorkbook(buffer: Buffer, platform: SocialPlatform, timezone: string): CalendarImportResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El Excel no contiene hojas");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });

  const rows: ImportedCalendarRow[] = [];
  const errors: CalendarRowError[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
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
