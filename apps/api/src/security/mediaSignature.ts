import { open } from "node:fs/promises";
import { extname } from "node:path";
import { HttpError } from "../http/httpError.js";

export type TrustedMediaType = {
  kind: "image" | "video" | "document";
  mimeType: string;
  extension: string;
};

const ALLOWED_INPUT_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".mp4", ".mov", ".webm", ".pdf"
]);

function ascii(buffer: Buffer, start: number, end: number) {
  return buffer.subarray(start, end).toString("ascii");
}

function starts(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((value, index) => buffer[index] === value);
}

export function inspectMediaSignature(buffer: Buffer): TrustedMediaType | null {
  if (starts(buffer, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) {
    return { kind: "image", mimeType: "image/png", extension: ".png" };
  }

  if (starts(buffer, [0xff,0xd8,0xff])) {
    return { kind: "image", mimeType: "image/jpeg", extension: ".jpg" };
  }

  if (ascii(buffer, 0, 6) === "GIF87a" || ascii(buffer, 0, 6) === "GIF89a") {
    return { kind: "image", mimeType: "image/gif", extension: ".gif" };
  }

  if (
    ascii(buffer, 0, 4) === "RIFF" &&
    ascii(buffer, 8, 12) === "WEBP"
  ) {
    return { kind: "image", mimeType: "image/webp", extension: ".webp" };
  }

  if (ascii(buffer, 0, 5) === "%PDF-") {
    return { kind: "document", mimeType: "application/pdf", extension: ".pdf" };
  }

  if (starts(buffer, [0x1a,0x45,0xdf,0xa3])) {
    return { kind: "video", mimeType: "video/webm", extension: ".webm" };
  }

  if (buffer.length >= 12 && ascii(buffer, 4, 8) === "ftyp") {
    const brand = ascii(buffer, 8, 12);
    if (brand === "qt  ") {
      return { kind: "video", mimeType: "video/quicktime", extension: ".mov" };
    }
    return { kind: "video", mimeType: "video/mp4", extension: ".mp4" };
  }

  return null;
}

export function assertInputFilename(originalName: string) {
  const extension = extname(originalName).toLowerCase();
  if (!ALLOWED_INPUT_EXTENSIONS.has(extension)) {
    throw new HttpError(
      "Tipo de archivo no permitido",
      415,
      "MEDIA_FILE_TYPE_NOT_ALLOWED"
    );
  }
}

export async function inspectMediaFile(path: string) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const detected = inspectMediaSignature(buffer.subarray(0, bytesRead));
    if (!detected) {
      throw new HttpError(
        "El contenido del archivo no coincide con un formato permitido",
        415,
        "MEDIA_SIGNATURE_INVALID"
      );
    }
    return detected;
  } finally {
    await handle.close();
  }
}
