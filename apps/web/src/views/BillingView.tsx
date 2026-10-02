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

function formatMoney(price?: Price) {
  if (!price) return "Consultar";
  const divisor = price.currency === "ARS" ? 100 : 1;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: price.currency === "ARS" ? 0 : 2
  }).format(price.unitAmountMinor / divisor);
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
  const [currency, setCurrency] = useState("ARS");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [catalog, current] = await Promise.all([
        apiJson<{ data: Plan[] }>(
          "/api/v1/billing/catalog?currency=" + currency + "&interval=" + interval
        ),
        apiJson<{
          data: { subscription: Subscription | null; usage: Record<string, number> };
        }>("/api/v1/billing/subscription")
      ]);

      setPlans(catalog.data ?? []);
      setSubscription(current.data.subscription ?? null);
      setUsage(current.data.usage ?? {});
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
            <option value="yearly">Anual</option>
          </select>
        </div>
      </div>

      <div className="current-plan-card">
        <div>
          <span className="eyebrow">Plan actual</span>
          <h3>{subscription?.plan?.name ?? "Inicial"}</h3>
          <p>
            {subscription?.plan?.description ??
              "Plan base de Valkiria PULSE para comenzar a operar."}
          </p>
        </div>
        <div className="subscription-status">
          <span>{subscription?.status ?? "trial"}</span>
          {subscription?.trialEndsAt && (
            <small>
              Prueba hasta {new Date(subscription.trialEndsAt).toLocaleDateString("es-AR")}
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
        <span className="badge">Checkout · próxima capa</span>
      </div>

      <div className="plan-grid">
        {plans.map((plan) => {
          const current = plan.key === subscription?.plan?.key;
          const price = plan.prices[0];

          return (
            <article className={current ? "plan-card current" : "plan-card"} key={plan.key}>
              <div className="plan-card-top">
                <div>
                  <span className="eyebrow">{current ? "Tu plan" : "Disponible"}</span>
                  <h3>{plan.name}</h3>
                </div>
                {current && <span className="plan-current-badge">Activo</span>}
              </div>

              <p>{plan.description}</p>
              <div className="plan-price">
                <strong>{formatMoney(price)}</strong>
                {price && (
                  <span>/{price.interval === "monthly" ? "mes" : "año"}</span>
                )}
              </div>

              <div className="plan-limits">
                {Object.entries(plan.limits).map(([key, value]) => (
                  <div key={key}>
                    <span>{humanLimit(key)}</span>
                    <strong>{Number(value) < 0 ? "Sin límite" : String(value)}</strong>
                  </div>
                ))}
              </div>

              {!current && (
                <button
                  className="connect-button plan-action"
                  disabled={role !== "owner" && role !== "admin"}
                  onClick={() =>
                    onNotice(
                      "El catálogo y los límites ya están activos. El checkout del proveedor se conecta en la siguiente etapa."
                    )
                  }
                >
                  Ver cambio de plan
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
