import { useEffect, useMemo, useState } from "react";

type Platform = "instagram" | "tiktok" | "linkedin";

type CalendarEntry = {
  id: number;
  platform: Platform;
  scheduledAtUtc: string;
  timezone: string;
  topic: string;
  objective?: string;
  status: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4200";
const tenantId = Number(import.meta.env.VITE_DEMO_TENANT_ID ?? 1);
const brandId = Number(import.meta.env.VITE_DEMO_BRAND_ID ?? 1);

const platforms: Array<{
  id: Platform;
  label: string;
  agent: string;
  description: string;
}> = [
  {
    id: "instagram",
    label: "Instagram",
    agent: "Instagram Agent",
    description: "Visual-first, captions, piezas y memoria editorial propia."
  },
  {
    id: "tiktok",
    label: "TikTok",
    agent: "TikTok Agent",
    description: "Hooks, video, privacidad y flujo de Direct Post especializado."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    agent: "LinkedIn Agent",
    description: "Contexto profesional, perfiles y organizaciones separados."
  }
];

export default function App() {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [uploadState, setUploadState] = useState<Record<Platform, string>>({
    instagram: "Listo para importar",
    tiktok: "Listo para importar",
    linkedin: "Listo para importar"
  });

  const upcoming = useMemo(
    () => [...entries].sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc)).slice(0, 8),
    [entries]
  );

  async function refreshCalendar() {
    try {
      const response = await fetch(`${apiUrl}/api/v1/calendars?tenantId=${tenantId}&limit=100`);
      if (!response.ok) return;
      const payload = await response.json();
      setEntries(payload.data ?? []);
    } catch {
      // API may not be running during static UI work.
    }
  }

  useEffect(() => {
    void refreshCalendar();
  }, []);

  async function uploadCalendar(platform: Platform, file: File) {
    setUploadState((current) => ({ ...current, [platform]: "Importando..." }));

    const form = new FormData();
    form.set("file", file);
    form.set("tenantId", String(tenantId));
    form.set("brandId", String(brandId));
    form.set("platform", platform);
    form.set("timezone", "America/Argentina/Cordoba");

    try {
      const response = await fetch(`${apiUrl}/api/v1/calendars/import`, {
        method: "POST",
        body: form
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "No se pudo importar");
      }

      const data = payload.data;
      setUploadState((current) => ({
        ...current,
        [platform]: `${data.valid} filas listas · ${data.invalid} con observaciones`
      }));
      await refreshCalendar();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        [platform]: error instanceof Error ? error.message : "Error de importacion"
      }));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">V</div>
          <div className="brand-copy">
            <strong>Valkiria</strong>
            <span>PULSE</span>
          </div>
        </div>

        <nav>
          <button className="nav-item active">Resumen</button>
          <button className="nav-item">Calendarios</button>
          <button className="nav-item">Publicaciones</button>
          <button className="nav-item">Biblioteca</button>
          <button className="nav-item">Agentes</button>
          <button className="nav-item muted">Analytics · pronto</button>
        </nav>

        <div className="tenant-chip">
          <span className="status-dot" />
          <div>
            <small>Marca activa</small>
            <strong>TrainIA</strong>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Social command center</span>
            <h1>Tu marca tiene un pulso distinto en cada red.</h1>
            <p>
              Tres agentes, tres calendarios y una sola operación. PULSE mantiene separado
              el contexto editorial de Instagram, TikTok y LinkedIn.
            </p>
          </div>
          <button className="primary-button">Nueva publicación</button>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <span>Programadas</span>
            <strong>{entries.filter((entry) => ["ready", "scheduled"].includes(entry.status)).length}</strong>
            <small>en los tres calendarios</small>
          </article>
          <article className="stat-card">
            <span>Agentes activos</span>
            <strong>3</strong>
            <small>contexto aislado por red</small>
          </article>
          <article className="stat-card">
            <span>Redes conectables</span>
            <strong>3</strong>
            <small>Instagram · TikTok · LinkedIn</small>
          </article>
          <article className="stat-card">
            <span>Analytics</span>
            <strong>—</strong>
            <small>preparado para permisos futuros</small>
          </article>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Agentes especializados</span>
              <h2>Un cerebro por plataforma</h2>
            </div>
            <span className="badge">Brand Brain compartido</span>
          </div>

          <div className="platform-grid">
            {platforms.map((platform) => (
              <article className="platform-card" key={platform.id}>
                <div className="platform-header">
                  <div>
                    <span className={`platform-icon ${platform.id}`}>
                      {platform.label.slice(0, 2)}
                    </span>
                    <div>
                      <strong>{platform.label}</strong>
                      <small>{platform.agent}</small>
                    </div>
                  </div>
                  <span className="agent-state">Activo</span>
                </div>

                <p>{platform.description}</p>

                <label className="upload-button">
                  Subir calendario Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadCalendar(platform.id, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                <small className="upload-state">{uploadState[platform.id]}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block two-column">
          <div>
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Calendario unificado</span>
                <h2>Próximas publicaciones</h2>
              </div>
            </div>

            <div className="timeline">
              {upcoming.length === 0 ? (
                <div className="empty-state">
                  <strong>Todavía no hay publicaciones importadas.</strong>
                  <span>Subí uno de los tres Excel para empezar.</span>
                </div>
              ) : (
                upcoming.map((entry) => (
                  <div className="timeline-row" key={entry.id}>
                    <span className={`network-dot ${entry.platform}`} />
                    <div className="timeline-copy">
                      <strong>{entry.topic}</strong>
                      <span>{entry.platform} · {entry.status}</span>
                    </div>
                    <time>
                      {new Date(entry.scheduledAtUtc).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </time>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="agent-panel">
            <span className="eyebrow">Orquestación</span>
            <h2>Social Orchestrator</h2>
            <p>
              Recibe cada fila importada y la deriva únicamente al agente de su red.
              El agente crea; el provider publica.
            </p>
            <div className="flow-step"><span>01</span><strong>Calendario</strong><small>intención editorial</small></div>
            <div className="flow-step"><span>02</span><strong>Agente</strong><small>contexto por plataforma</small></div>
            <div className="flow-step"><span>03</span><strong>Provider</strong><small>API determinística</small></div>
            <div className="flow-step"><span>04</span><strong>Historial</strong><small>estado y memoria</small></div>
          </aside>
        </section>
      </main>
    </div>
  );
}
