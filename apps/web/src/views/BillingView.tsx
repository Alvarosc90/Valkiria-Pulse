import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

type Price = {
  id: number;
  currency: string;
  interval: "monthly" | "yearly";
  unitAmountMinor: number;
};

type Plan = {
  key: string;
  name: string;
  description?: string;
  limits: Record<string, unknown>;
  features: string[];
  entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  prices: Price[];
};

type Subscription = {
  status: string;
  provider?: string | null;
  externalSubscriptionId?: string | null;
  planPriceId?: number | null;
  billingInterval?: "monthly" | "yearly" | null;
  currency?: string | null;
  plan: {
    key: string;
    name: string;
    description?: string;
    limits: Record<string, unknown>;
    features: string[];
    entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  };
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
};

type ProviderStatus = {
  provider: string;
  configured: boolean;
  webhookConfigured: boolean;
  mode: string;
};

function formatMoney(price?: Price) {
  if (!price) return "No disponible";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: price.currency === "ARS" ? 0 : 2
  }).format(price.unitAmountMinor / 100);
}

function humanLimit(key: string) {
  const labels: Record<string, string> = {
    brands: "Marcas",
    socialAccounts: "Cuentas sociales",
    scheduledPostsPerMonth: "Publicaciones / mes",
    teamMembers: "Usuarios",
    aiGenerationsPerMonth: "Generaciones IA / mes"
  };
  return labels[key] ?? key;
}

function idempotency(prefix: string) {
  return prefix + "-" +
    (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36));
}

export function BillingView({
  role,
  onNotice
}: {
  role: string;
  onNotice: (message: string | null) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [currency, setCurrency] = useState("ARS");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const canManage = role === "owner" || role === "admin";

  async function load() {
    setLoading(true);
    try {
      const [catalog, current, providerStatus] = await Promise.all([
        apiJson<{ data: Plan[] }>(
          "/api/v1/billing/catalog?currency=" + currency + "&interval=" + interval
        ),
        apiJson<{
          data: { subscription: Subscription | null; usage: Record<string, number> };
        }>("/api/v1/billing/subscription"),
        apiJson<{ data: ProviderStatus }>("/api/v1/billing/provider/status")
      ]);

      setPlans(catalog.data ?? []);
      setSubscription(current.data.subscription ?? null);
      setUsage(current.data.usage ?? {});
      setProvider(providerStatus.data);
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la información del plan"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [currency, interval]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutId = params.get("checkout");
    if (params.get("billing") !== "return" || !checkoutId) return;

    let cancelled = false;

    const poll = async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        try {
          const result = await apiJson<{
            data: { status: string; providerStatus?: string | null };
          }>("/api/v1/billing/checkout/" + encodeURIComponent(checkoutId));

          if (result.data.status === "completed") {
            onNotice("Pago confirmado. Tu suscripción quedó activa.");
            await load();
            window.history.replaceState({}, "", "/?view=billing");
            return;
          }

          if (["failed", "cancelled", "expired"].includes(result.data.status)) {
            onNotice("El checkout no se completó. Podés volver a intentarlo.");
            window.history.replaceState({}, "", "/?view=billing");
            return;
          }
        } catch {
          // The webhook can still be processing; retry below.
        }

        await new Promise((resolve) => setTimeout(resolve, 1800));
      }

      if (!cancelled) {
        onNotice(
          "Mercado Pago todavía está procesando la suscripción. El estado se actualizará cuando llegue el webhook."
        );
        window.history.replaceState({}, "", "/?view=billing");
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const limits = subscription?.plan?.limits ?? {};
  const usageRows = useMemo(
    () =>
      Object.entries(limits).map(([key, value]) => {
        const numericLimit = Number(value);
        const unlimited = numericLimit < 0;
        return {
          key,
          label: humanLimit(key),
          limit: unlimited ? null : numericLimit,
          used: Number(usage[key] ?? 0)
        };
      }),
    [limits, usage]
  );

  async function startCheckout(plan: Plan, price?: Price) {
    if (!price || !canManage) return;

    if (!provider?.configured) {
      onNotice(
        "Mercado Pago todavía no está configurado en este entorno. El catálogo ya está listo."
      );
      return;
    }

    setBusyPlan(plan.key);
    try {
      const result = await apiJson<{
        data: {
          id: string;
          checkoutUrl?: string | null;
          provider?: string | null;
        };
      }>("/api/v1/billing/checkout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: plan.key,
          currency: price.currency,
          interval: price.interval,
          idempotencyKey: idempotency("checkout-" + plan.key)
        })
      });

      if (!result.data.checkoutUrl) {
        throw new Error("Mercado Pago no devolvió una URL de pago");
      }

      window.location.assign(result.data.checkoutUrl);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "No se pudo iniciar el checkout"
      );
    } finally {
      setBusyPlan(null);
    }
  }

  async function executeAction(
    action: "pause" | "resume" | "cancel" | "change_plan",
    input?: { plan?: Plan; price?: Price }
  ) {
    if (!canManage) return;

    if (
      action === "cancel" &&
      !window.confirm("¿Querés cancelar la suscripción de PULSE?")
    ) {
      return;
    }

    setBusyAction(action);
    try {
      const prepared = await apiJson<{ data: { id: string } }>(
        "/api/v1/billing/subscription/actions/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            idempotencyKey: idempotency("action-" + action),
            ...(action === "change_plan" && input?.plan && input?.price
              ? {
                  targetPlanKey: input.plan.key,
                  targetPriceId: input.price.id
                }
              : {})
          })
        }
      );

      await apiJson(
        "/api/v1/billing/subscription/actions/" +
          encodeURIComponent(prepared.data.id) +
          "/execute",
        { method: "POST" }
      );

      onNotice(
        action === "pause"
          ? "Suscripción pausada."
          : action === "resume"
            ? "Suscripción reactivada."
            : action === "cancel"
              ? "Suscripción cancelada."
              : "Plan actualizado."
      );
      await load();
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : "No se pudo administrar la suscripción"
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return <div className="panel-loading">Cargando plan y consumo...</div>;
  }

  return (
    <section className="billing-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Suscripción</span>
          <h2>Plan y consumo</h2>
        </div>
        <div className="billing-filters">
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <select
            value={interval}
            onChange={(event) =>
              setInterval(event.target.value as "monthly" | "yearly")
            }
          >
            <option value="monthly">Mensual</option>
            <option value="yearly">Anual · 2 meses bonificados</option>
          </select>
        </div>
      </div>

      <div className="billing-provider-state">
        <div>
          <span className={provider?.configured ? "status-dot" : "status-dot offline"} />
          <strong>Mercado Pago</strong>
          <small>
            {provider?.configured
              ? "Cobros configurados · " + provider.mode
              : "Pendiente de credencial segura"}
          </small>
        </div>
        <span className={provider?.webhookConfigured ? "billing-safe" : "billing-warning"}>
          {provider?.webhookConfigured ? "Webhook verificado" : "Webhook pendiente"}
        </span>
      </div>

      <div className="current-plan-card">
        <div>
          <span className="eyebrow">Plan actual</span>
          <h3>{subscription?.plan?.name ?? "Inicial"}</h3>
          <p>
            {subscription?.plan?.description ??
              "Plan base de Valkiria PULSE para comenzar a operar."}
          </p>

          <div className="billing-current-actions">
            {subscription?.status === "active" && (
              <>
                <button
                  className="mini-button"
                  disabled={busyAction != null}
                  onClick={() => void executeAction("pause")}
                >
                  Pausar
                </button>
                <button
                  className="mini-button danger"
                  disabled={busyAction != null}
                  onClick={() => void executeAction("cancel")}
                >
                  Cancelar
                </button>
              </>
            )}

            {subscription?.status === "paused" && (
              <>
                <button
                  className="mini-button success"
                  disabled={busyAction != null}
                  onClick={() => void executeAction("resume")}
                >
                  Reactivar
                </button>
                <button
                  className="mini-button danger"
                  disabled={busyAction != null}
                  onClick={() => void executeAction("cancel")}
                >
                  Cancelar
                </button>
              </>
            )}

            {subscription?.status === "trial" && (
              <span className="billing-trial-note">
                La prueba no genera cargos. Elegí un plan abajo para activar cobros.
              </span>
            )}
          </div>
        </div>

        <div className="subscription-status">
          <span>{subscription?.status ?? "trial"}</span>
          {subscription?.trialEndsAt && (
            <small>
              Prueba hasta {new Date(subscription.trialEndsAt).toLocaleDateString("es-AR")}
            </small>
          )}
          {subscription?.currentPeriodEnd && (
            <small>
              Próximo período {new Date(subscription.currentPeriodEnd).toLocaleDateString("es-AR")}
            </small>
          )}
        </div>
      </div>

      <div className="usage-grid">
        {usageRows.map((row) => {
          const percent =
            row.limit && row.limit > 0
              ? Math.min(100, Math.round((row.used / row.limit) * 100))
              : 0;

          return (
            <article className="usage-card" key={row.key}>
              <span>{row.label}</span>
              <strong>
                {row.used} <small>/ {row.limit == null ? "∞" : row.limit}</small>
              </strong>
              <div className="usage-track">
                <span style={{ width: row.limit == null ? "8%" : percent + "%" }} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="section-heading billing-plans-heading">
        <div>
          <span className="eyebrow">Catálogo</span>
          <h2>Planes disponibles</h2>
        </div>
        <span className="badge">
          {provider?.configured ? "Checkout Mercado Pago" : "Precios activos"}
        </span>
      </div>

      <div className="plan-grid">
        {plans.map((plan) => {
          const current = plan.key === subscription?.plan?.key;
          const price = plan.prices[0];
          const trial = subscription?.status === "trial";
          const active = subscription?.status === "active";
          const sameBillingShape =
            active &&
            subscription?.provider === "mercadopago" &&
            subscription.billingInterval === price?.interval &&
            String(subscription.currency ?? "").toUpperCase() ===
              String(price?.currency ?? "").toUpperCase();

          return (
            <article className={current ? "plan-card current" : "plan-card"} key={plan.key}>
              <div className="plan-card-top">
                <div>
                  <span className="eyebrow">{current ? "Tu plan" : "Disponible"}</span>
                  <h3>{plan.name}</h3>
                </div>
                {current && <span className="plan-current-badge">Actual</span>}
              </div>

              <p>{plan.description}</p>

              <div className="plan-price">
                <strong>{formatMoney(price)}</strong>
                {price && (
                  <span>/{price.interval === "monthly" ? "mes" : "año"}</span>
                )}
              </div>

              {interval === "yearly" && price && (
                <small className="billing-discount">Equivale a 2 meses bonificados.</small>
              )}

              <div className="plan-limits">
                {Object.entries(plan.limits).map(([key, value]) => (
                  <div key={key}>
                    <span>{humanLimit(key)}</span>
                    <strong>{Number(value) < 0 ? "Sin límite" : String(value)}</strong>
                  </div>
                ))}
              </div>

              {trial && price && (
                <button
                  className="connect-button plan-action"
                  disabled={!canManage || busyPlan != null || !provider?.configured}
                  onClick={() => void startCheckout(plan, price)}
                >
                  {busyPlan === plan.key
                    ? "Abriendo Mercado Pago..."
                    : current
                      ? "Activar este plan"
                      : "Elegir " + plan.name}
                </button>
              )}

              {active && !current && price && (
                <button
                  className="connect-button plan-action"
                  disabled={!canManage || busyAction != null || !sameBillingShape}
                  title={
                    sameBillingShape
                      ? "Cambiar plan manteniendo moneda y período"
                      : "Para cambiar moneda o período se requiere un nuevo checkout"
                  }
                  onClick={() =>
                    void executeAction("change_plan", { plan, price })
                  }
                >
                  {sameBillingShape ? "Cambiar a " + plan.name : "Cambio requiere nuevo checkout"}
                </button>
              )}

              {active && current && (
                <div className="plan-active-label">Plan activo</div>
              )}
            </article>
          );
        })}
      </div>

      {!provider?.configured && (
        <div className="billing-setup-note">
          <strong>Checkout bloqueado de forma segura.</strong>
          <span>
            Los precios y límites ya están activos, pero PULSE no habilita cobros hasta
            que el Access Token y el Webhook Secret de Mercado Pago estén configurados
            exclusivamente en el servidor.
          </span>
        </div>
      )}
    </section>
  );
}
