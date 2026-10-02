import test from "node:test";
import assert from "node:assert/strict";
import { inspectMediaSignature } from "./mediaSignature.js";

test("detects safe image and document signatures", () => {
  assert.equal(
    inspectMediaSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?.mimeType,
    "image/png"
  );
  assert.equal(
    inspectMediaSignature(Buffer.from("%PDF-1.7\n", "ascii"))?.mimeType,
    "application/pdf"
  );
});

test("does not trust HTML disguised as media", () => {
  assert.equal(
    inspectMediaSignature(Buffer.from("<script>alert(1)</script>", "utf8")),
    null
  );
});

test("detects MP4 ISO BMFF signature", () => {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(16, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  assert.equal(inspectMediaSignature(buffer)?.mimeType, "video/mp4");
});
