import { useEffect, useState } from "react";
import { apiJson } from "../api";
import type { PulseRole } from "../types";

type Approval = {
  id: number;
  calendarEntryId: number;
  status: "pending" | "approved" | "rejected";
  note?: string;
  requestedAt: string;
  reviewedAt?: string;
  platform: string;
  topic: string;
  scheduledAtUtc: string;
  requestedBy: string;
  reviewedBy?: string;
};

export function ApprovalsView({
  role,
  onNotice,
  onCalendarRefresh
}: {
  role: PulseRole;
  onNotice: (message: string) => void;
  onCalendarRefresh: () => Promise<void>;
}) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const canReview = role === "owner" || role === "admin";

  async function load() {
    setLoading(true);
    try {
      const payload = await apiJson<{ data: Approval[] }>("/api/v1/approvals?limit=200");
      setItems(payload.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().catch((error) => {
      onNotice(error instanceof Error ? error.message : "No se pudieron cargar las aprobaciones");
    });
  }, []);

  async function review(entryId: number, decision: "approved" | "rejected") {
    try {
      await apiJson("/api/v1/approvals/" + entryId + "/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      onNotice(decision === "approved" ? "Publicación aprobada y lista para programarse." : "Publicación devuelta a borrador.");
      await Promise.all([load(), onCalendarRefresh()]);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo revisar la publicación");
    }
  }

  return (
    <section className="workspace-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Publicaciones</span>
          <h2>Aprobaciones</h2>
        </div>
        <span className="badge">{items.filter((item) => item.status === "pending").length} pendientes</span>
      </div>

      <article className="panel">
        {loading ? (
          <div className="empty-state compact"><span>Cargando aprobaciones...</span></div>
        ) : items.length === 0 ? (
          <div className="empty-state compact"><span>No hay solicitudes de aprobación.</span></div>
        ) : (
          <div className="approval-list">
            {items.map((item) => (
              <div className="approval-row" key={item.id}>
                <span className={"network-dot " + item.platform} />
                <div className="approval-copy">
                  <strong>{item.topic}</strong>
                  <small>{item.platform} · solicitó {item.requestedBy}</small>
                </div>
                <span className={"status-pill " + item.status}>{item.status}</span>
                {item.status === "pending" && canReview && (
                  <div className="approval-actions">
                    <button className="mini-button success" onClick={() => void review(item.calendarEntryId, "approved")}>Aprobar</button>
                    <button className="mini-button danger" onClick={() => void review(item.calendarEntryId, "rejected")}>Rechazar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
