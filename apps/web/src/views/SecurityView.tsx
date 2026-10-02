import { useEffect, useState } from "react";
import {
  changePasswordRequest,
  listSessionsRequest,
  logoutRequest,
  revokeAllSessionsRequest,
  revokeSessionRequest
} from "../api";

type Session = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

function browserLabel(value: string | null) {
  if (!value) return "Dispositivo desconocido";
  if (/Edg\//i.test(value)) return "Microsoft Edge";
  if (/Chrome\//i.test(value)) return "Google Chrome";
  if (/Firefox\//i.test(value)) return "Mozilla Firefox";
  if (/Safari\//i.test(value)) return "Safari";
  return value.slice(0, 70);
}

export function SecurityView({
  onNotice,
  onSignedOut
}: {
  onNotice: (message: string | null) => void;
  onSignedOut: () => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const payload = await listSessionsRequest();
      setSessions(payload.data ?? []);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudieron cargar las sesiones");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(sessionId: string) {
    try {
      await revokeSessionRequest(sessionId);
      await load();
      onNotice("Sesión revocada.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo revocar la sesión");
    }
  }

  async function revokeAll() {
    try {
      await revokeAllSessionsRequest();
      await logoutRequest();
      onSignedOut();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudieron revocar las sesiones");
    }
  }

  async function changePassword() {
    if (
      nextPassword.length < 12 ||
      nextPassword !== confirm ||
      !/[a-z]/.test(nextPassword) ||
      !/[A-Z]/.test(nextPassword) ||
      !/[0-9]/.test(nextPassword) ||
      !/[^A-Za-z0-9]/.test(nextPassword)
    ) {
      onNotice("La nueva contraseña no cumple la política de seguridad.");
      return;
    }

    setBusy(true);
    try {
      await changePasswordRequest(currentPassword, nextPassword);
      await logoutRequest();
      onSignedOut();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="security-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Cuenta</span>
          <h2>Seguridad</h2>
        </div>
        <span className="badge">Sesiones revocables</span>
      </div>

      <div className="security-grid">
        <article className="panel">
          <span className="eyebrow">Contraseña</span>
          <h3>Cambiar credenciales</h3>
          <p className="security-copy">
            El cambio revoca todas las sesiones abiertas y obliga a iniciar sesión nuevamente.
          </p>

          <label className="field">
            <span>Contraseña actual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Repetir nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>

          <small className="security-hint">
            12+ caracteres · mayúscula · minúscula · número · símbolo
          </small>

          <button
            className="primary-button full-width"
            disabled={busy || !currentPassword || !nextPassword}
            onClick={() => void changePassword()}
          >
            {busy ? "Actualizando..." : "Cambiar contraseña"}
          </button>
        </article>

        <article className="panel">
          <div className="security-session-head">
            <div>
              <span className="eyebrow">Dispositivos</span>
              <h3>Sesiones activas</h3>
            </div>
            <button className="mini-button danger" onClick={() => void revokeAll()}>
              Cerrar todas
            </button>
          </div>

          <div className="security-session-list">
            {sessions.length === 0 ? (
              <div className="empty-state compact">
                <strong>No hay sesiones activas para mostrar.</strong>
              </div>
            ) : (
              sessions.map((session) => (
                <div className="security-session" key={session.id}>
                  <div>
                    <strong>{browserLabel(session.userAgent)}</strong>
                    <span>{session.ipAddress ?? "IP no disponible"}</span>
                    <small>
                      Último uso {new Date(session.lastUsedAt).toLocaleString("es-AR")}
                    </small>
                  </div>
                  <button
                    className="mini-button"
                    onClick={() => void revoke(session.id)}
                  >
                    Revocar
                  </button>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
