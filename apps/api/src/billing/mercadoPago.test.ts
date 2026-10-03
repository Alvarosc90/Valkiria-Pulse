import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_USER = "pulse";
process.env.DB_NAME = "pulse_test";
const testAccessSecret = Buffer.alloc(48, 11).toString("base64");
const testRefreshSecret = Buffer.alloc(48, 13).toString("base64");
const testWebhookSecret = Buffer.alloc(48, 17).toString("base64");

process.env.AUTH_ACCESS_SECRET = testAccessSecret;
process.env.AUTH_REFRESH_SECRET = testRefreshSecret;
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.MERCADOPAGO_WEBHOOK_SECRET = testWebhookSecret;

const {
  mapMercadoPagoPaymentStatus,
  mapMercadoPagoSubscriptionStatus,
  validateMercadoPagoSignature
} = await import("./mercadoPago.js");

test("validates Mercado Pago webhook signature manifest", () => {
  const dataId = "PREAPPROVAL-ABC";
  const requestId = "request-42";
  const ts = "1790030000";
  const manifest =
    "id:" + dataId.toLowerCase() +
    ";request-id:" + requestId +
    ";ts:" + ts +
    ";";

  const v1 = createHmac("sha256", testWebhookSecret)
    .update(manifest)
    .digest("hex");

  assert.equal(
    validateMercadoPagoSignature({
      dataId,
      xRequestId: requestId,
      xSignature: "ts=" + ts + ",v1=" + v1
    }),
    true
  );
});

test("rejects tampered Mercado Pago signature", () => {
  assert.throws(() =>
    validateMercadoPagoSignature({
      dataId: "abc",
      xRequestId: "request",
      xSignature: "ts=10,v1=deadbeef"
    })
  );
});

test("maps subscription statuses without activating pending checkout", () => {
  assert.equal(mapMercadoPagoSubscriptionStatus("authorized"), "active");
  assert.equal(mapMercadoPagoSubscriptionStatus("pending"), "pending");
  assert.equal(mapMercadoPagoSubscriptionStatus("paused"), "paused");
  assert.equal(mapMercadoPagoSubscriptionStatus("cancelled"), "cancelled");
  assert.equal(mapMercadoPagoSubscriptionStatus("other"), "unknown");
});

test("maps Mercado Pago payment states for checkout lifecycle", () => {
  assert.equal(mapMercadoPagoPaymentStatus("approved"), "approved");
  assert.equal(mapMercadoPagoPaymentStatus("pending"), "pending");
  assert.equal(mapMercadoPagoPaymentStatus("in_process"), "pending");
  assert.equal(mapMercadoPagoPaymentStatus("rejected"), "failed");
  assert.equal(mapMercadoPagoPaymentStatus("refunded"), "failed");
  assert.equal(mapMercadoPagoPaymentStatus("charged_back"), "failed");
  assert.equal(mapMercadoPagoPaymentStatus("other"), "unknown");
});
