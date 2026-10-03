import { inflateRawSync } from "node:zlib";
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

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findEocd(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Archivo XLSX invalido");
}

function readZipEntries(buffer: Buffer) {
  const eocd = findEocd(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Directorio ZIP invalido");

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Entrada ZIP invalida");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error("Metodo de compresion XLSX no soportado");

    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function sharedStrings(xml: string) {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    const parts = Array.from(match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (part) =>
      decodeXml(part[1])
    );
    values.push(parts.join(""));
  }
  return values;
}

function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? "";
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
  return index;
}

function parseWorksheet(xml: string, strings: string[]) {
  const rows = new Map<number, Map<number, unknown>>();

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowMatch[1];
    const rowNumber = Number(rowAttrs.match(/\br="(\d+)"/)?.[1] ?? rows.size + 1);
    const cells = new Map<number, unknown>();

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const col = columnIndex(ref);
      const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];

      if (!col) continue;

      if (type === "s" && raw !== undefined) {
        cells.set(col, strings[Number(raw)] ?? "");
      } else if (type === "inlineStr") {
        const text = Array.from(body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (part) =>
          decodeXml(part[1])
        ).join("");
        cells.set(col, text);
      } else if (type === "str" && raw !== undefined) {
        cells.set(col, decodeXml(raw));
      } else if (raw !== undefined) {
        const numeric = Number(raw);
        cells.set(col, Number.isFinite(numeric) ? numeric : decodeXml(raw));
      } else {
        cells.set(col, "");
      }
    }

    rows.set(rowNumber, cells);
  }

  return rows;
}

function worksheetRows(buffer: Buffer): Array<{ rowNumber: number; raw: Record<string, unknown> }> {
  const entries = readZipEntries(buffer);
  const worksheet = entries.get("xl/worksheets/sheet1.xml");
  if (!worksheet) throw new Error("El Excel no contiene hojas");

  const shared = entries.get("xl/sharedStrings.xml");
  const strings = shared ? sharedStrings(shared.toString("utf8")) : [];
  const rows = parseWorksheet(worksheet.toString("utf8"), strings);
  const headerCells = rows.get(1);
  if (!headerCells) return [];

  const headers = new Map<number, string>();
  for (const [column, value] of headerCells.entries()) {
    const header = String(value ?? "").trim();
    if (header) headers.set(column, header);
  }

  const result: Array<{ rowNumber: number; raw: Record<string, unknown> }> = [];
  const rowNumbers = Array.from(rows.keys()).filter((row) => row >= 2).sort((a, b) => a - b);

  for (const rowNumber of rowNumbers) {
    const cells = rows.get(rowNumber)!;
    const raw: Record<string, unknown> = {};
    let hasValue = false;

    for (const [column, header] of headers.entries()) {
      const value = cells.get(column) ?? "";
      raw[header] = value;
      if (value !== "" && value !== null && value !== undefined) hasValue = true;
    }

    if (hasValue) result.push({ rowNumber, raw });
  }

  return result;
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
  const rawRows = worksheetRows(buffer);
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
