import { useEffect, useState } from "react";
import { apiJson } from "../api";

type GrowthOverview = {
  campaigns: { total: number; byStatus: Record<string, number> };
  audiences: { total: number; estimatedReach: number };
  conversions30d: { total: number; valueAmountMinor: number };
  whatsapp: { optedInContacts: number };
  paidMedia: { activeDrafts: number; budgetPolicy: string };
};

type GrowthCampaign = {
  id: number;
  name: string;
  objective: string;
  campaignType: string;
  status: string;
  primaryChannel: string;
  executionMode: string;
  paidProvider?: string | null;
  audienceName?: string | null;
  conversions?: number;
};

type GrowthAudience = {
  id: number;
  name: string;
  sourceType: string;
  estimatedSize: number;
  memberCount: number;
};

const campaignPlaybooks = [
  {
    title: "Reactivación",
    copy: "Detectá clientes inactivos, segmentalos y prepará una secuencia de recuperación por WhatsApp.",
    steps: ["Señal de inactividad", "Segmento", "Mensaje", "Seguimiento", "Conversión"]
  },
  {
    title: "Retención",
    copy: "Convertí vencimientos, baja de actividad o riesgo de churn en acciones antes de perder al cliente.",
    steps: ["Evento", "Regla", "Audiencia", "Acción", "Resultado"]
  },
  {
    title: "Cross-sell / Upsell",
    copy: "Usá comportamiento y compras para ofrecer el siguiente producto o servicio con contexto.",
    steps: ["Contexto", "Oportunidad", "Oferta", "Canal", "Medición"]
  }
];

export function GrowthCenterView({
  brandId,
  brandName,
  onNotice
}: {
  brandId?: number | null;
  brandName?: string;
  onNotice: (message: string | null) => void;
}) {
  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [campaigns, setCampaigns] = useState<GrowthCampaign[]>([]);
  const [audiences, setAudiences] = useState<GrowthAudience[]>([]);
  const [loading, setLoading] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState("");
  const [campaignType, setCampaignType] = useState("reactivation");
  const [primaryChannel, setPrimaryChannel] = useState("whatsapp");
  const [audienceId, setAudienceId] = useState("");
  const [paidProvider, setPaidProvider] = useState("meta");

  const [audienceName, setAudienceName] = useState("");
  const [audienceSource, setAudienceSource] = useState("manual");

  useEffect(() => {
    if (!brandId) {
      setOverview(null);
      setCampaigns([]);
      setAudiences([]);
      return;
    }
    void loadGrowth();
  }, [brandId]);

  async function loadGrowth() {
    if (!brandId) return;
    setLoading(true);
    try {
      const query = "?brandId=" + brandId;
      const [overviewPayload, campaignPayload, audiencePayload] = await Promise.all([
        apiJson<{ data: GrowthOverview }>("/api/v1/growth/overview" + query),
        apiJson<{ data: GrowthCampaign[] }>("/api/v1/growth/campaigns" + query),
        apiJson<{ data: GrowthAudience[] }>("/api/v1/growth/audiences" + query)
      ]);
      setOverview(overviewPayload.data);
      setCampaigns(campaignPayload.data ?? []);
      setAudiences(audiencePayload.data ?? []);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo cargar Growth");
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    if (!brandId || !campaignName.trim() || !objective.trim()) return;
    setBusy(true);
    try {
      await apiJson("/api/v1/growth/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          audienceId: audienceId ? Number(audienceId) : null,
          name: campaignName.trim(),
          objective: objective.trim(),
          campaignType,
          primaryChannel,
          executionMode: primaryChannel === "paid_media"
            ? "manual_paid_media"
            : "owned_channels",
          paidProvider: primaryChannel === "paid_media" ? paidProvider : null,
          strategy: {
            createdFrom: "growth-center",
            paidMediaBudgetPolicy: "external"
          }
        })
      });

      setCampaignName("");
      setObjective("");
      setAudienceId("");
      setCampaignOpen(false);
      onNotice("Campaña creada como borrador. No se ejecutó ningún envío ni gasto publicitario.");
      await loadGrowth();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo crear la campaña");
    } finally {
      setBusy(false);
    }
  }

  async function createAudience() {
    if (!brandId || !audienceName.trim()) return;
    setBusy(true);
    try {
      await apiJson("/api/v1/growth/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name: audienceName.trim(),
          sourceType: audienceSource,
          definition: {
            mode: audienceSource === "manual" ? "manual" : "pending_integration"
          }
        })
      });

      setAudienceName("");
      setAudienceOpen(false);
      onNotice("Audiencia creada. Todavía no dispara acciones hasta definir sus miembros o reglas.");
      await loadGrowth();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo crear la audiencia");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="growth-center">
      <section className="growth-hero">
        <div>
          <span className="eyebrow">Growth & Retention</span>
          <h2>Convertí datos del negocio en acciones.</h2>
          <p>
            PULSE combina contexto, audiencias, contenido y canales para activar campañas
            de adquisición, seguimiento, recuperación y retención sin depender de publicidad paga.
          </p>
        </div>
        <div className="growth-hero-actions">
          <button
            className="secondary-button"
            disabled={!brandId || busy}
            onClick={() => setAudienceOpen((value) => !value)}
          >
            Nueva audiencia
          </button>
          <button
            className="primary-button"
            disabled={!brandId || busy}
            onClick={() => setCampaignOpen((value) => !value)}
          >
            Nueva campaña
          </button>
        </div>
      </section>

      {campaignOpen && (
        <section className="growth-builder">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Campaign Builder</span>
              <h2>Crear borrador de campaña</h2>
            </div>
            <span className="badge">Sin ejecución automática</span>
          </div>

          <div className="growth-form-grid">
            <label>
              <span>Nombre</span>
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Ej. Recuperar alumnos inactivos"
              />
            </label>
            <label>
              <span>Objetivo</span>
              <input
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Ej. Reactivar clientes de los últimos 30 días"
              />
            </label>
            <label>
              <span>Tipo</span>
              <select value={campaignType} onChange={(event) => setCampaignType(event.target.value)}>
                <option value="reactivation">Reactivación</option>
                <option value="retention">Retención</option>
                <option value="promotion">Promoción</option>
                <option value="cross_sell">Cross-sell</option>
                <option value="upsell">Upsell</option>
                <option value="acquisition">Adquisición</option>
                <option value="winback">Win-back</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label>
              <span>Canal principal</span>
              <select value={primaryChannel} onChange={(event) => setPrimaryChannel(event.target.value)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="multi">Multicanal</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
                <option value="paid_media">Paid Media opcional</option>
              </select>
            </label>
            <label>
              <span>Audiencia</span>
              <select value={audienceId} onChange={(event) => setAudienceId(event.target.value)}>
                <option value="">Sin audiencia todavía</option>
                {audiences.map((audience) => (
                  <option key={audience.id} value={audience.id}>{audience.name}</option>
                ))}
              </select>
            </label>
            {primaryChannel === "paid_media" && (
              <label>
                <span>Proveedor</span>
                <select value={paidProvider} onChange={(event) => setPaidProvider(event.target.value)}>
                  <option value="meta">Meta Ads</option>
                  <option value="google">Google Ads</option>
                </select>
              </label>
            )}
          </div>

          {primaryChannel === "paid_media" && (
            <div className="growth-policy-note">
              PULSE sólo crea el borrador. El presupuesto publicitario es externo y se paga
              directamente a Meta o Google.
            </div>
          )}

          <div className="growth-builder-actions">
            <button className="secondary-button" onClick={() => setCampaignOpen(false)}>Cancelar</button>
            <button
              className="primary-button"
              disabled={busy || !campaignName.trim() || !objective.trim()}
              onClick={() => void createCampaign()}
            >
              {busy ? "Creando..." : "Crear borrador"}
            </button>
          </div>
        </section>
      )}

      {audienceOpen && (
        <section className="growth-builder">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Audience Builder</span>
              <h2>Nueva audiencia</h2>
            </div>
          </div>
          <div className="growth-form-grid">
            <label>
              <span>Nombre</span>
              <input
                value={audienceName}
                onChange={(event) => setAudienceName(event.target.value)}
                placeholder="Ej. Inactivos 20+ días"
              />
            </label>
            <label>
              <span>Fuente</span>
              <select value={audienceSource} onChange={(event) => setAudienceSource(event.target.value)}>
                <option value="manual">Manual</option>
                <option value="rule">Regla PULSE</option>
                <option value="trainia">TrainIA</option>
                <option value="erp">Valkiria ERP</option>
                <option value="integration">Otra integración</option>
              </select>
            </label>
          </div>
          <div className="growth-builder-actions">
            <button className="secondary-button" onClick={() => setAudienceOpen(false)}>Cancelar</button>
            <button
              className="primary-button"
              disabled={busy || !audienceName.trim()}
              onClick={() => void createAudience()}
            >
              {busy ? "Creando..." : "Crear audiencia"}
            </button>
          </div>
        </section>
      )}

      <section className="growth-status-grid">
        <article>
          <span>Campañas</span>
          <strong>{loading ? "…" : overview?.campaigns.total ?? 0}</strong>
          <small>borradores, activas y completadas</small>
        </article>
        <article>
          <span>Audiencias</span>
          <strong>{loading ? "…" : overview?.audiences.total ?? 0}</strong>
          <small>{brandName ?? "Marca activa"} · alcance estimado {overview?.audiences.estimatedReach ?? 0}</small>
        </article>
        <article>
          <span>WhatsApp habilitado</span>
          <strong>{loading ? "…" : overview?.whatsapp.optedInContacts ?? 0}</strong>
          <small>contactos con consentimiento activo</small>
        </article>
        <article>
          <span>Paid Media</span>
          <strong>{loading ? "…" : overview?.paidMedia.activeDrafts ?? 0}</strong>
          <small>drafts · presupuesto siempre externo</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Operación real</span>
            <h2>Campañas de {brandName ?? "la marca"}</h2>
          </div>
          <span className="badge">{overview?.conversions30d.total ?? 0} conversiones · 30 días</span>
        </div>

        <div className="growth-live-list">
          {campaigns.length === 0 ? (
            <div className="empty-state">
              <strong>Todavía no hay campañas.</strong>
              <span>Creá el primer borrador y después agregaremos secuencia, trigger y acciones.</span>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <article key={campaign.id}>
                <div>
                  <span className="growth-card-label">{campaign.campaignType}</span>
                  <strong>{campaign.name}</strong>
                  <small>{campaign.objective}</small>
                </div>
                <div className="growth-live-meta">
                  <span>{campaign.audienceName ?? "Sin audiencia"}</span>
                  <span>{campaign.primaryChannel}</span>
                  <span>{campaign.status}</span>
                  <b>{Number(campaign.conversions ?? 0)} conv.</b>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Campañas sin Ads</span>
            <h2>Marketing sobre canales propios</h2>
          </div>
          <span className="badge">Sin presupuesto publicitario</span>
        </div>

        <div className="growth-campaign-grid">
          {campaignPlaybooks.map((campaign) => (
            <article className="growth-campaign-card" key={campaign.title}>
              <span className="growth-card-label">PLAYBOOK</span>
              <h3>{campaign.title}</h3>
              <p>{campaign.copy}</p>
              <div className="growth-step-row">
                {campaign.steps.map((step, index) => (
                  <span key={step}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {step}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="growth-channel-grid">
        <article className="growth-channel-card whatsapp">
          <div className="growth-channel-head">
            <span className="growth-channel-icon">WA</span>
            <div>
              <span className="eyebrow">Canal propio</span>
              <h3>WhatsApp</h3>
            </div>
          </div>
          <p>
            Secuencias de bienvenida, renovación, recuperación, promociones y seguimiento.
            PULSE exige consentimiento activo antes de preparar una acción dirigida a un contacto.
          </p>
          <div className="growth-chip-row">
            <span>Segmentos</span><span>Consentimiento</span><span>Follow-up</span><span>Conversión</span>
          </div>
        </article>

        <article className="growth-channel-card paid">
          <div className="growth-channel-head">
            <span className="growth-channel-icon">ADS</span>
            <div>
              <span className="eyebrow">Integración opcional</span>
              <h3>Meta Ads + Google Ads</h3>
            </div>
          </div>
          <p>
            PULSE prepara objetivo, público, copy, creatividades, variantes A/B, CTA,
            landing, UTM y presupuesto sugerido. En esta etapa el backend bloquea la
            ejecución automática: Paid Media queda en draft.
          </p>
          <div className="growth-chip-row">
            <span>Draft primero</span><span>Presupuesto externo</span><span>API después</span>
          </div>
        </article>
      </section>

      <section className="section-block growth-loop">
        <div>
          <span className="eyebrow">Loop de Growth</span>
          <h2>Negocio → audiencia → acción → resultado.</h2>
          <p>
            La ventaja de PULSE aparece cuando deja de mirar solamente seguidores y empieza a
            usar señales reales del negocio para decidir a quién hablarle, por qué canal y con qué objetivo.
          </p>
        </div>
        <div className="growth-loop-flow" aria-label="Flujo de Growth">
          <span>Datos del negocio</span>
          <b>→</b>
          <span>Audiencia</span>
          <b>→</b>
          <span>Agente</span>
          <b>→</b>
          <span>Canal</span>
          <b>→</b>
          <span>Conversión</span>
        </div>
      </section>
    </div>
  );
}
