import { useEffect, useState } from "react";
import { apiJson } from "../api";

type AuditEvent = {
  id: number;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
  userDisplayName?: string;
};

export function AuditView({
  onNotice
}: {
  onNotice: (message: string) => void;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    void apiJson<{ data: AuditEvent[] }>("/api/v1/audit?limit=200")
      .then((payload) => setEvents(payload.data ?? []))
      .catch((error) => onNotice(error instanceof Error ? error.message : "No se pudo cargar la auditoría"));
  }, []);

  return (
    <section className="workspace-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Seguridad</span>
          <h2>Auditoría</h2>
        </div>
        <span className="badge">{events.length} eventos recientes</span>
      </div>

      <article className="panel">
        <div className="audit-list">
          {events.length === 0 ? (
            <div className="empty-state compact"><span>No hay eventos registrados todavía.</span></div>
          ) : events.map((event) => (
            <div className="audit-row" key={event.id}>
              <div>
                <strong>{event.action}</strong>
                <small>{event.entityType}{event.entityId ? " · " + event.entityId : ""}</small>
              </div>
              <div>
                <strong>{event.userDisplayName ?? "Sistema"}</strong>
                <small>{new Date(event.createdAt).toLocaleString("es-AR")}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
