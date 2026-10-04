import { useEffect, useState } from "react";
import { apiJson } from "../api";

type ConnectorRow = {
  id: number;
  publicId: string;
  brandId?: number | null;
  connectorKey: string;
  providerKey: string;
  displayName: string;
  externalTenantId?: string | null;
  status: "active" | "paused" | "revoked";
  issuer: string;
  audience: string;
  secretVersion: number;
  capabilities?: string[];
  lastSeenAt?: string | null;
};

type CreatedConnector = {
  id: number;
  publicId: string;
  connectorKey: string;
  providerKey: string;
  issuer: string;
  audience: string;
  endpointPath: string;
  secret: string;
  secretVersion: number;
  warning: string;
};

const PRESETS = [
  { key: "valkiria-one", provider: "valkiria_one", label: "Valkiria ONE", detail: "IA, CRM, WhatsApp y automatizaciones." },
  { key: "trainia", provider: "trainia", label: "TrainIA", detail: "Actividad, membresías, pagos y retención." },
  { key: "valkiria-erp", provider: "valkiria_erp", label: "Valkiria ERP", detail: "Ventas, clientes, pedidos y señales comerciales." },
  { key: "external", provider: "external", label: "Otro sistema", detail: "CRM, ERP, e-commerce o software propio mediante el contrato PULSE." }
];

export function BusinessConnectorsView({
  brandId,
  role,
  onNotice
}: {
  brandId?: number | null;
  role: string;
  onNotice: (message: string | null) => void;
}) {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0]!.key);
  const [displayName, setDisplayName] = useState(PRESETS[0]!.label);
  const [connectorKey, setConnectorKey] = useState(PRESETS[0]!.key);
  const [externalTenantId, setExternalTenantId] = useState("");
  const [created, setCreated] = useState<CreatedConnector | null>(null);

  const canManage = role === "owner" || role === "admin";

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiJson<{ data: ConnectorRow[] }>("/api/v1/connectors");
      setConnectors(payload.data ?? []);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudieron cargar los conectores");
    } finally {
      setLoading(false);
    }
  }

  function choosePreset(key: string) {
    const selected = PRESETS.find((item) => item.key === key) ?? PRESETS[0]!;
    setPreset(selected.key);
    setDisplayName(selected.label);
    setConnectorKey(
      selected.key === "external"
        ? "mi-sistema"
        : selected.key
    );
  }

  async function createConnector() {
    const selected = PRESETS.find((item) => item.key === preset) ?? PRESETS[0]!;
    setCreating(true);
    setCreated(null);
    try {
      const payload = await apiJson<{ data: CreatedConnector }>("/api/v1/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandId ?? null,
          connectorKey: connectorKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
          providerKey: selected.provider,
          displayName: displayName.trim(),
          externalTenantId: externalTenantId.trim() || null,
          issuer: selected.provider,
          capabilities: ["growth.events.write"],
          settings: {
            contractVersion: "v1",
            source: "pulse-ui"
          }
        })
      });
      setCreated(payload.data);
      onNotice("Conector creado. Guardá el secreto ahora: PULSE no volverá a mostrarlo.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo crear el conector");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: number, status: "active" | "paused" | "revoked") {
    try {
      await apiJson("/api/v1/connectors/" + id + "/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      onNotice(status === "active" ? "Conector activado." : status === "paused" ? "Conector pausado." : "Conector revocado.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo actualizar el conector");
    }
  }

  async function rotate(id: number) {
    try {
      const payload = await apiJson<{ data: CreatedConnector }>("/api/v1/connectors/" + id + "/rotate-secret", {
        method: "POST"
      });
      setCreated(payload.data);
      onNotice("Se rotó el secreto. El anterior dejó de ser válido.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo rotar el secreto");
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(label + " copiado.");
    } catch {
      onNotice("No se pudo copiar automáticamente.");
    }
  }

  return (
    <div className="business-connectors">
      <section className="connector-hero">
        <div>
          <span className="eyebrow">Connector Framework</span>
          <h2>Conectá PULSE con cualquier empresa o sistema.</h2>
          <p>
            TrainIA, Valkiria ONE y ERP usan el mismo contrato. También podés conectar
            un CRM, e-commerce o software propio sin cambiar el núcleo de PULSE.
          </p>
        </div>
        <span className="badge">Multi-tenant · secretos aislados</span>
      </section>

      <section className="connector-principles">
        <article><strong>Tenant-safe</strong><span>PULSE resuelve el tenant por el conector registrado, nunca por datos enviados por el sistema externo.</span></article>
        <article><strong>Contrato único</strong><span>Eventos firmados → señales → triggers → audiencias → campañas.</span></article>
        <article><strong>Sin acoplamiento</strong><span>El sistema externo informa hechos. PULSE decide marketing, canal y secuencia.</span></article>
      </section>

      {canManage && (
        <section className="section-block connector-builder">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Nuevo conector</span>
              <h2>Generar credenciales de integración</h2>
            </div>
            <span className="badge">El secreto se muestra una sola vez</span>
          </div>

          <div className="connector-preset-grid">
            {PRESETS.map((item) => (
              <button
                key={item.key}
                className={preset === item.key ? "connector-preset active" : "connector-preset"}
                onClick={() => choosePreset(item.key)}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>

          <div className="growth-form-grid">
            <label>
              <span>Nombre visible</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label>
              <span>Clave del conector</span>
              <input value={connectorKey} onChange={(event) => setConnectorKey(event.target.value)} />
            </label>
            <label>
              <span>ID externo del tenant · opcional</span>
              <input value={externalTenantId} onChange={(event) => setExternalTenantId(event.target.value)} placeholder="tenant-123 / empresa-acme" />
            </label>
          </div>

          <div className="growth-builder-actions">
            <button
              className="primary-button"
              disabled={creating || !displayName.trim() || !connectorKey.trim()}
              onClick={() => void createConnector()}
            >
              {creating ? "Generando..." : "Crear conector"}
            </button>
          </div>
        </section>
      )}

      {created && (
        <section className="connector-secret-card">
          <div>
            <span className="eyebrow">Credencial nueva</span>
            <h3>Guardala en el sistema que se va a conectar.</h3>
            <p>{created.warning}</p>
          </div>
          <label>
            <span>Endpoint</span>
            <div><code>{created.endpointPath}</code><button onClick={() => void copy(created.endpointPath, "Endpoint")}>Copiar</button></div>
          </label>
          <label>
            <span>Issuer</span>
            <div><code>{created.issuer}</code><button onClick={() => void copy(created.issuer, "Issuer")}>Copiar</button></div>
          </label>
          <label>
            <span>Audience</span>
            <div><code>{created.audience}</code><button onClick={() => void copy(created.audience, "Audience")}>Copiar</button></div>
          </label>
          <label className="connector-secret-field">
            <span>Secret · una sola vez</span>
            <div><code>{created.secret}</code><button onClick={() => void copy(created.secret, "Secret")}>Copiar</button></div>
          </label>
          <button className="secondary-button" onClick={() => setCreated(null)}>Ya lo guardé</button>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Sistemas conectados</span>
            <h2>Conectores de este tenant</h2>
          </div>
          <span className="badge">{connectors.length} configurados</span>
        </div>

        <div className="connector-list">
          {loading ? (
            <div className="empty-state"><strong>Cargando conectores…</strong></div>
          ) : connectors.length === 0 ? (
            <div className="empty-state">
              <strong>Todavía no hay sistemas de negocio conectados.</strong>
              <span>Creá un conector para TrainIA, ONE, ERP o cualquier sistema externo.</span>
            </div>
          ) : connectors.map((connector) => (
            <article key={connector.id}>
              <div className="connector-list-main">
                <span className={"connector-status " + connector.status}>{connector.status}</span>
                <div>
                  <strong>{connector.displayName}</strong>
                  <small>{connector.providerKey} · {connector.connectorKey}</small>
                </div>
              </div>
              <div className="connector-list-meta">
                <span>Secret v{connector.secretVersion}</span>
                <span>{connector.lastSeenAt ? "Última señal " + new Date(connector.lastSeenAt).toLocaleString("es-AR") : "Sin señales todavía"}</span>
              </div>
              {canManage && (
                <div className="connector-list-actions">
                  <button onClick={() => void rotate(connector.id)}>Rotar secret</button>
                  {connector.status === "active" ? (
                    <button onClick={() => void setStatus(connector.id, "paused")}>Pausar</button>
                  ) : connector.status === "paused" ? (
                    <button onClick={() => void setStatus(connector.id, "active")}>Activar</button>
                  ) : null}
                  {connector.status !== "revoked" && (
                    <button className="danger" onClick={() => void setStatus(connector.id, "revoked")}>Revocar</button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
