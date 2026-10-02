import { useMemo, useState } from "react";
import { apiJson } from "../api";
import type { CalendarEntry, Platform } from "../types";

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

export function CalendarView({
  brandId,
  entries,
  onRefresh,
  onNotice
}: {
  brandId: number | null;
  entries: CalendarEntry[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [angle, setAngle] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledAt, setScheduledAt] = useState(
    localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc)),
    [entries]
  );

  async function createEntry() {
    if (!brandId || !topic.trim()) return;
    setBusy(true);
    try {
      await apiJson("/api/v1/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          platform,
          scheduledAt: new Date(scheduledAt).toISOString(),
          timezone: "America/Argentina/Cordoba",
          topic: topic.trim(),
          objective: objective.trim() || undefined,
          angle: angle.trim() || undefined,
          notes: notes.trim() || undefined,
          platformContext: {}
        })
      });
      setTopic("");
      setObjective("");
      setAngle("");
      setNotes("");
      onNotice("Borrador creado. Ya puede pasar por aprobación.");
      await onRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo crear el borrador");
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval(entryId: number) {
    try {
      await apiJson("/api/v1/approvals/" + entryId + "/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      onNotice("Publicación enviada a aprobación.");
      await onRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo solicitar aprobación");
    }
  }

  return (
    <section className="workspace-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Calendarios</span>
          <h2>Planificar y preparar contenido</h2>
        </div>
        <span className="badge">3 contextos separados</span>
      </div>

      <div className="composer-grid">
        <article className="panel">
          <span className="eyebrow">Nueva publicación</span>
          <h3>Crear borrador</h3>

          <label className="field">
            <span>Red</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </label>

          <label className="field">
            <span>Tema</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Qué queremos comunicar" />
          </label>

          <label className="field">
            <span>Objetivo</span>
            <input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ej. awareness, demo, comunidad" />
          </label>

          <label className="field">
            <span>Enfoque</span>
            <input value={angle} onChange={(event) => setAngle(event.target.value)} placeholder="Ángulo de la pieza" />
          </label>

          <label className="field">
            <span>Fecha y hora</span>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </label>

          <label className="field">
            <span>Notas / semilla</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ideas, copy base, restricciones..." />
          </label>

          <button className="primary-button full-width" disabled={busy || !brandId || !topic.trim()} onClick={() => void createEntry()}>
            {busy ? "Creando..." : "Crear borrador"}
          </button>
        </article>

        <article className="panel list-panel">
          <span className="eyebrow">Agenda</span>
          <h3>Próximas piezas</h3>
          <div className="data-list">
            {sorted.length === 0 ? (
              <div className="empty-state compact"><span>No hay piezas cargadas todavía.</span></div>
            ) : sorted.map((entry) => (
              <div className="data-row" key={entry.id}>
                <span className={"network-dot " + entry.platform} />
                <div className="data-main">
                  <strong>{entry.topic}</strong>
                  <small>{entry.platform} · {entry.status}</small>
                </div>
                <time>{new Date(entry.scheduledAtUtc).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                {entry.status === "draft" && (
                  <button className="mini-button" onClick={() => void requestApproval(entry.id)}>
                    Aprobar
                  </button>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
