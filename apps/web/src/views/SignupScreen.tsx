import { useState } from "react";
import {
  apiJson,
  resendVerificationRequest,
  signupRequest
} from "../api";
import type { AuthContext } from "../types";

const LOGO = "/assets/branding/4_VALKIRIA%20PULSE.png";

export function SignupScreen({
  onAuthenticated,
  onBack,
  onLogin,
  onLegal
}: {
  onAuthenticated: (auth: AuthContext) => void;
  onBack: () => void;
  onLogin: () => void;
  onLegal: (type: "terms" | "privacy") => void;
}) {
  const [form, setForm] = useState({
    displayName: "",
    companyName: "",
    brandName: "",
    email: "",
    password: "",
    acceptTerms: false,
    acceptPrivacy: false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<{
    email: string;
    devToken?: string | null;
  } | null>(null);
  const [resendMessage, setResendMessage] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setResendMessage("");

    try {
      const result = await signupRequest(form);
      const data = result?.data;

      if (data?.verificationRequired) {
        setVerification({
          email: data.email,
          devToken: data.devVerificationToken ?? null
        });
        return;
      }

      if (result?.accessToken) {
        const me = await apiJson<{ data: AuthContext }>("/api/v1/auth/me");
        onAuthenticated(me.data);
        return;
      }

      setVerification({ email: form.email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!verification?.email) return;
    setBusy(true);
    setError("");
    setResendMessage("");
    try {
      const result = await resendVerificationRequest(verification.email);
      setResendMessage("Si la cuenta sigue pendiente, enviamos un nuevo enlace.");
      if (result?.devVerificationToken) {
        setVerification((current) => current
          ? { ...current, devToken: result.devVerificationToken }
          : current
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar la verificación");
    } finally {
      setBusy(false);
    }
  }

  const passwordReady =
    form.password.length >= 12 &&
    /[a-z]/.test(form.password) &&
    /[A-Z]/.test(form.password) &&
    /[0-9]/.test(form.password) &&
    /[^A-Za-z0-9]/.test(form.password);

  const ready =
    form.displayName.trim().length >= 2 &&
    form.companyName.trim().length >= 2 &&
    form.email.includes("@") &&
    passwordReady &&
    form.acceptTerms &&
    form.acceptPrivacy;

  if (verification) {
    return (
      <main className="signup-shell">
        <section className="signup-brand">
          <button className="signup-logo" onClick={onBack}>
            <img src={LOGO} alt="Valkiria PULSE" />
          </button>
          <span className="landing-pill">Workspace creado</span>
          <h1>Falta confirmar<br />tu email.</h1>
          <p>
            Creamos tu empresa, tu marca principal y la prueba del plan Inicial.
            El acceso queda protegido hasta que confirmes el correo.
          </p>
        </section>

        <section className="signup-card verification-card">
          <span className="eyebrow">VERIFICACIÓN</span>
          <h2>Revisá tu correo</h2>
          <p className="verification-copy">
            Enviamos el enlace de activación a <strong>{verification.email}</strong>.
            Vence en 30 minutos y puede usarse una sola vez.
          </p>

          {verification.devToken && (
            <div className="dev-verification">
              <strong>Modo local</strong>
              <span>
                SMTP todavía no está configurado en este entorno. Podés verificar
                esta cuenta de desarrollo directamente.
              </span>
              <button
                className="primary-button"
                onClick={() =>
                  window.location.assign(
                    "/verificar-email?token=" +
                      encodeURIComponent(verification.devToken!)
                  )
                }
              >
                Verificar cuenta local
              </button>
            </div>
          )}

          <button
            className="mini-button"
            disabled={busy}
            onClick={() => void resend()}
          >
            {busy ? "Enviando..." : "Reenviar verificación"}
          </button>
          <button className="login-signup-link" onClick={onLogin}>
            Ya verifiqué mi email · ir al login
          </button>

          {resendMessage && <div className="auth-public-message">{resendMessage}</div>}
          {error && <div className="login-error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="signup-shell">
      <section className="signup-brand">
        <button className="signup-logo" onClick={onBack}>
          <img src={LOGO} alt="Valkiria PULSE" />
        </button>
        <span className="landing-pill">14 días para empezar</span>
        <h1>Creá tu workspace.<br />Conectá después.</h1>
        <p>
          Primero tu marca y tu equipo. Instagram, TikTok y LinkedIn se autorizan
          una sola vez cuando estés listo para publicar.
        </p>

        <div className="signup-points">
          <span>✓ Brand Brain inicial</span>
          <span>✓ Calendarios por red</span>
          <span>✓ Agentes especializados</span>
          <span>✓ Sin tarjeta para crear la prueba</span>
        </div>
      </section>

      <section className="signup-card">
        <button className="login-back" onClick={onBack}>← Volver a la landing</button>
        <span className="eyebrow">CREAR CUENTA</span>
        <h2>Empezá con PULSE</h2>

        <div className="signup-grid">
          <label className="field">
            <span>Tu nombre</span>
            <input
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Empresa</span>
            <input
              value={form.companyName}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyName: event.target.value }))
              }
            />
          </label>
          <label className="field full">
            <span>Marca principal</span>
            <input
              placeholder="Opcional · usa el nombre de empresa si lo dejás vacío"
              value={form.brandName}
              onChange={(event) =>
                setForm((current) => ({ ...current, brandName: event.target.value }))
              }
            />
          </label>
          <label className="field full">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label className="field full">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
            />
            <small>
              12+ caracteres · mayúscula · minúscula · número · símbolo · no uses
              “Valkiria”, “PULSE” ni tu email.
            </small>
          </label>
        </div>

        <label className="legal-check">
          <input
            type="checkbox"
            checked={form.acceptTerms}
            onChange={(event) =>
              setForm((current) => ({ ...current, acceptTerms: event.target.checked }))
            }
          />
          <span>
            Acepto los{" "}
            <button type="button" onClick={() => onLegal("terms")}>
              Términos y Condiciones
            </button>.
          </span>
        </label>

        <label className="legal-check">
          <input
            type="checkbox"
            checked={form.acceptPrivacy}
            onChange={(event) =>
              setForm((current) => ({ ...current, acceptPrivacy: event.target.checked }))
            }
          />
          <span>
            Leí la{" "}
            <button type="button" onClick={() => onLegal("privacy")}>
              Política de Privacidad
            </button>.
          </span>
        </label>

        <button
          className="primary-button login-submit"
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {busy ? "Creando..." : "Crear mi workspace"}
        </button>

        {error && <div className="login-error">{error}</div>}
        <small className="login-footnote">
          La aceptación legal queda registrada con versión, fecha, IP y navegador.
        </small>
      </section>
    </main>
  );
}
