import { useMemo, useState } from "react";
import { requestPasswordReset, resetPasswordRequest } from "../api";

const LOGO = "/assets/branding/valkiria-pulse.png";
const SUPPORT_EMAIL = "soporte@valkiria.tech";

const passwordRules = [
  { key: "length", label: "12 caracteres como mínimo", test: (value: string) => value.length >= 12 },
  { key: "upper", label: "Una mayúscula", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lower", label: "Una minúscula", test: (value: string) => /[a-z]/.test(value) },
  { key: "number", label: "Un número", test: (value: string) => /[0-9]/.test(value) },
  { key: "symbol", label: "Un símbolo", test: (value: string) => /[^A-Za-z0-9]/.test(value) }
];

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
  const [instructionsSent, setInstructionsSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isReset = Boolean(token || devToken);
  const activeToken = token ?? devToken;
  const rules = useMemo(
    () => passwordRules.map((rule) => ({ ...rule, ok: rule.test(password) })),
    [password]
  );
  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordReady = rules.every((rule) => rule.ok) && passwordsMatch;

  async function request() {
    setBusy(true);
    setMessage("");
    try {
      const result = await requestPasswordReset(email);
      setInstructionsSent(true);
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
      setResetDone(true);
      setMessage("Contraseña actualizada. Cerramos las sesiones anteriores para proteger tu cuenta.");
      setPassword("");
      setConfirm("");
      setDevToken(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  const recoveryTitle = resetDone
    ? "Acceso recuperado."
    : isReset
      ? "Creá una nueva contraseña."
      : instructionsSent
        ? "Revisá tu email."
        : "Recuperá tu acceso.";

  return (
    <main className="auth-public-shell recovery-shell">
      <section className="recovery-layout">
        <aside className="recovery-side">
          <button className="auth-public-logo recovery-logo" onClick={onBack} aria-label="Volver a Valkiria PULSE">
            <img src={LOGO} alt="Valkiria PULSE" />
          </button>

          <div>
            <span className="eyebrow">ACCESO SEGURO</span>
            <h2>Volvé a PULSE sin comprometer tu cuenta.</h2>
            <p>
              Usamos enlaces de recuperación de un solo uso, con vencimiento corto y
              revocación automática de sesiones cuando cambiás la contraseña.
            </p>
          </div>

          <div className="recovery-security-list">
            <div>
              <span>01</span>
              <p><strong>Enlace privado</strong><small>Vence en 20 minutos.</small></p>
            </div>
            <div>
              <span>02</span>
              <p><strong>Un solo uso</strong><small>No puede reutilizarse después del cambio.</small></p>
            </div>
            <div>
              <span>03</span>
              <p><strong>Sesiones revocadas</strong><small>Los accesos anteriores quedan cerrados.</small></p>
            </div>
          </div>

          <p className="recovery-support">
            ¿No reconocés una solicitud? Escribinos a{" "}
            <a href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>.
          </p>
        </aside>

        <section className="auth-public-card recovery-card">
          <button className="recovery-mobile-logo" onClick={onBack} aria-label="Volver a Valkiria PULSE">
            <img src={LOGO} alt="Valkiria PULSE" />
          </button>

          <span className="eyebrow">
            {resetDone ? "LISTO" : isReset ? "NUEVA CONTRASEÑA" : "RECUPERACIÓN SEGURA"}
          </span>
          <h1>{recoveryTitle}</h1>

          {!isReset && !resetDone ? (
            <>
              {!instructionsSent ? (
                <>
                  <p>
                    Ingresá el email de tu cuenta. Por seguridad, siempre mostramos la
                    misma respuesta aunque la dirección no esté registrada.
                  </p>

                  <label className="field recovery-field">
                    <span>Email de acceso</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="nombre@empresa.com"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && email.includes("@")) void request();
                      }}
                    />
                  </label>

                  <button
                    className="primary-button recovery-primary"
                    disabled={busy || !email.includes("@")}
                    onClick={() => void request()}
                  >
                    {busy ? "Enviando..." : "Enviar enlace de recuperación"}
                  </button>

                  <div className="recovery-hint">
                    <strong>¿Qué vas a recibir?</strong>
                    <span>Un email de Valkiria PULSE con un botón seguro para crear una contraseña nueva.</span>
                  </div>
                </>
              ) : (
                <div className="recovery-sent">
                  <div className="auth-public-state success" aria-hidden="true">✓</div>
                  <p>
                    Si <strong>{email}</strong> está asociado a una cuenta, ya enviamos
                    el enlace. Revisá también Spam o Promociones.
                  </p>
                  <small>El enlace vence en 20 minutos y sólo funciona una vez.</small>
                  <button
                    className="recovery-secondary"
                    disabled={busy}
                    onClick={() => void request()}
                  >
                    {busy ? "Reenviando..." : "Reenviar instrucciones"}
                  </button>
                  <button
                    className="recovery-text-button"
                    onClick={() => {
                      setInstructionsSent(false);
                      setMessage("");
                    }}
                  >
                    Usar otro email
                  </button>
                </div>
              )}
            </>
          ) : resetDone ? (
            <div className="recovery-sent">
              <div className="auth-public-state success" aria-hidden="true">✓</div>
              <p>Tu contraseña fue actualizada correctamente.</p>
              <small>Por seguridad, todas las sesiones anteriores quedaron revocadas.</small>
              <button className="primary-button recovery-primary" onClick={onLogin}>
                Ir al login
              </button>
            </div>
          ) : (
            <>
              <p>
                Elegí una contraseña única. No uses datos personales ni claves que ya
                utilices en otros servicios.
              </p>

              <label className="field recovery-field">
                <span>Nueva contraseña</span>
                <div className="recovery-password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="12+ caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>

              <div className="password-rules" aria-label="Requisitos de contraseña">
                {rules.map((rule) => (
                  <span className={rule.ok ? "ok" : ""} key={rule.key}>
                    <i>{rule.ok ? "✓" : "·"}</i>{rule.label}
                  </span>
                ))}
              </div>

              <label className="field recovery-field">
                <span>Repetir contraseña</span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repetí la contraseña"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && passwordReady) void reset();
                  }}
                />
                {confirm && (
                  <small className={passwordsMatch ? "password-match ok" : "password-match"}>
                    {passwordsMatch ? "Las contraseñas coinciden." : "Las contraseñas todavía no coinciden."}
                  </small>
                )}
              </label>

              <button
                className="primary-button recovery-primary"
                disabled={busy || !passwordReady}
                onClick={() => void reset()}
              >
                {busy ? "Actualizando..." : "Guardar nueva contraseña"}
              </button>
            </>
          )}

          {message && <div className="auth-public-message">{message}</div>}

          {!resetDone && (
            <div className="auth-public-links recovery-links">
              <button onClick={onLogin}>Volver al login</button>
              <button onClick={onBack}>Ir a la landing</button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
