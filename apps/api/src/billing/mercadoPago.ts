import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../http/httpError.js";

type MpSubscription = {
  id?: string;
  status?: string;
  reason?: string;
  external_reference?: string | number | null;
  payer_id?: string | number | null;
  payer_email?: string | null;
  init_point?: string | null;
  date_created?: string | null;
  last_modified?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number | string;
    currency_id?: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
};

function configured() {
  return Boolean(config.MERCADOPAGO_ACCESS_TOKEN);
}

function webhookConfigured() {
  return Boolean(config.MERCADOPAGO_WEBHOOK_SECRET);
}

function providerError(payload: any, status: number) {
  const candidates = [
    payload?.message,
    payload?.error,
    payload?.cause?.[0]?.description,
    payload?.cause?.[0]?.code,
    payload?.status
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return candidates.join(" · ").slice(0, 600) || "HTTP " + status;
}

async function mpFetch<T = any>(
  path: string,
  input: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
    idempotencyKey?: string | null;
  } = {}
): Promise<T> {
  if (!configured()) {
    throw new HttpError(
      "Mercado Pago todavía no está configurado",
      503,
      "MERCADOPAGO_NOT_CONFIGURED"
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: "Bearer " + config.MERCADOPAGO_ACCESS_TOKEN
  };
  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  if (input.idempotencyKey) headers["X-Idempotency-Key"] = input.idempotencyKey;

  const response = await fetch(config.MERCADOPAGO_API_BASE + path, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: AbortSignal.timeout(20000)
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new HttpError(
      "Mercado Pago rechazó la operación: " + providerError(payload, response.status),
      502,
      "MERCADOPAGO_API_ERROR"
    );
  }

  return (payload ?? {}) as T;
}

function parseSignature(value: string) {
  const result: Record<string, string> = {};
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateMercadoPagoSignature(input: {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
}) {
  const secret = String(config.MERCADOPAGO_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    throw new HttpError(
      "La firma webhook de Mercado Pago no está configurada",
      503,
      "MERCADOPAGO_WEBHOOK_NOT_CONFIGURED"
    );
  }

  const id = String(input.dataId ?? "").trim().toLowerCase();
  const requestId = String(input.xRequestId ?? "").trim();
  const parsed = parseSignature(String(input.xSignature ?? ""));

  if (!id || !requestId || !parsed.ts || !parsed.v1) {
    throw new HttpError(
      "Webhook de Mercado Pago incompleto",
      401,
      "MERCADOPAGO_WEBHOOK_INVALID"
    );
  }

  const manifest =
    "id:" + id +
    ";request-id:" + requestId +
    ";ts:" + parsed.ts +
    ";";

  const expected = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (!safeEqualHex(expected, parsed.v1)) {
    throw new HttpError(
      "Firma de Mercado Pago inválida",
      401,
      "MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID"
    );
  }

  return true;
}

export function mercadoPagoStatus() {
  return {
    provider: "mercadopago",
    configured: configured(),
    webhookConfigured: webhookConfigured(),
    mode: configured() ? config.MERCADOPAGO_MODE : "not_configured",
    publicBaseUrl: config.PUBLIC_BASE_URL
  };
}

export async function testMercadoPagoConnection() {
  const account = await mpFetch<any>("/users/me");
  return {
    ok: true,
    provider: "mercadopago",
    mode: config.MERCADOPAGO_MODE,
    account: {
      id: account?.id == null ? null : String(account.id),
      nickname: account?.nickname ?? null,
      countryId: account?.country_id ?? null
    }
  };
}

export async function createMercadoPagoSubscription(input: {
  checkoutSessionId: string;
  customerEmail: string;
  planName: string;
  currency: string;
  interval: "monthly" | "yearly";
  unitAmountMinor: number;
  idempotencyKey: string;
}) {
  const amount = Number((input.unitAmountMinor / 100).toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(
      "Importe inválido",
      400,
      "BILLING_AMOUNT_INVALID"
    );
  }

  const backUrl = new URL(config.PUBLIC_BASE_URL);
  backUrl.searchParams.set("view", "billing");
  backUrl.searchParams.set("billing", "return");
  backUrl.searchParams.set("checkout", input.checkoutSessionId);

  const body = {
    reason: ("Valkiria PULSE · " + input.planName).slice(0, 120),
    external_reference: input.checkoutSessionId,
    payer_email: input.customerEmail.trim().toLowerCase(),
    auto_recurring: {
      frequency: input.interval === "yearly" ? 12 : 1,
      frequency_type: "months",
      transaction_amount: amount,
      currency_id: input.currency.toUpperCase()
    },
    back_url: backUrl.toString(),
    status: "pending"
  };

  const result = await mpFetch<MpSubscription>("/preapproval", {
    method: "POST",
    body,
    idempotencyKey: input.idempotencyKey
  });

  if (!result.id || !result.init_point) {
    throw new HttpError(
      "Mercado Pago no devolvió un checkout válido",
      502,
      "MERCADOPAGO_CHECKOUT_INVALID"
    );
  }

  return {
    externalSubscriptionId: String(result.id),
    checkoutUrl: String(result.init_point),
    status: String(result.status ?? "pending"),
    raw: result
  };
}

export async function getMercadoPagoSubscription(subscriptionId: string) {
  return mpFetch<MpSubscription>(
    "/preapproval/" + encodeURIComponent(subscriptionId)
  );
}

export async function updateMercadoPagoSubscription(
  subscriptionId: string,
  body: Record<string, unknown>
) {
  return mpFetch<MpSubscription>(
    "/preapproval/" + encodeURIComponent(subscriptionId),
    {
      method: "PUT",
      body
    }
  );
}

export function mapMercadoPagoSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "authorized") return "active" as const;
  if (normalized === "paused") return "paused" as const;
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled" as const;
  }
  if (normalized === "pending") return "pending" as const;

  return "unknown" as const;
}


export function mapMercadoPagoPaymentStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "approved") return "approved" as const;
  if (["pending", "in_process", "authorized"].includes(normalized)) {
    return "pending" as const;
  }
  if (
    ["rejected", "cancelled", "canceled", "cancelled_by_collector", "refunded", "charged_back"]
      .includes(normalized)
  ) {
    return "failed" as const;
  }

  return "unknown" as const;
}

export async function getMercadoPagoPayment(paymentId: string) {
  return mpFetch<any>(
    "/v1/payments/" + encodeURIComponent(paymentId)
  );
}
