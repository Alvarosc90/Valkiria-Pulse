import { useMemo, useState } from "react";
import { requestPasswordReset, resetPasswordRequest } from "../api";

const LOGO = "/assets/branding/4_VALKIRIA%20PULSE.png";

export function PasswordRecoveryPage({
  token,
  onLogin,
  onBack
}: {
  token: string | null;
  onLogin: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const isReset = Boolean(token || devToken);
  const activeToken = token ?? devToken;

  const passwordReady = useMemo(
    () =>
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password) &&
      password === confirm,
    [password, confirm]
  );

  async function request() {
    setBusy(true);
    setMessage("");
    try {
      const result = await requestPasswordReset(email);
      setMessage(
        result?.message ??
          "Si existe una cuenta para ese email, enviamos instrucciones."
      );
      if (result?.devResetToken) {
        setDevToken(result.devResetToken);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar la recuperación.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!activeToken || !passwordReady) return;
    setBusy(true);
    setMessage("");
    try {
      await resetPasswordRequest(activeToken, password);
      setMessage("Contraseña actualizada. Todas las sesiones anteriores quedaron revocadas.");
      setPassword("");
      setConfirm("");
      setDevToken(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-public-shell">
      <section className="auth-public-card">
        <button className="auth-public-logo" onClick={onBack}>
          <img src={LOGO} alt="Valkiria PULSE" />
        </button>

        <span className="eyebrow">RECUPERACIÓN SEGURA</span>
        <h1>{isReset ? "Creá una nueva contraseña." : "Recuperá tu acceso."}</h1>

        {!isReset ? (
          <>
            <p>
              Ingresá tu email. La respuesta es siempre genérica para no revelar
              si una cuenta existe.
            </p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !email.includes("@")}
              onClick={() => void request()}
            >
              {busy ? "Enviando..." : "Enviar instrucciones"}
            </button>
          </>
        ) : (
          <>
            <p>
              Usá una contraseña única de al menos 12 caracteres con mayúscula,
              minúscula, número y símbolo.
            </p>
            <label className="field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Repetir contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !passwordReady}
              onClick={() => void reset()}
            >
              {busy ? "Actualizando..." : "Cambiar contraseña"}
            </button>
          </>
        )}

        {message && <div className="auth-public-message">{message}</div>}

        <div className="auth-public-links">
          <button onClick={onLogin}>Ir al login</button>
          <button onClick={onBack}>Volver a la landing</button>
        </div>
      </section>
    </main>
  );
}
