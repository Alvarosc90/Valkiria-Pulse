import { useState } from "react";
import { apiJson, signupRequest } from "../api";
import type { AuthContext } from "../types";

const LOGO = "/assets/branding/4_VALKIRIA%20PULSE.png";

export function SignupScreen({
  onAuthenticated,
  onBack,
  onLegal
}: {
  onAuthenticated: (auth: AuthContext) => void;
  onBack: () => void;
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

  async function submit() {
    setBusy(true);
    setError("");

    try {
      await signupRequest(form);
      const me = await apiJson<{ data: AuthContext }>("/api/v1/auth/me");
      onAuthenticated(me.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setBusy(false);
    }
  }

  const ready =
    form.displayName.trim().length >= 2 &&
    form.companyName.trim().length >= 2 &&
    form.email.includes("@") &&
    form.password.length >= 10 &&
    /[0-9]/.test(form.password) &&
    form.acceptTerms &&
    form.acceptPrivacy;

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
            <input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
          </label>
          <label className="field">
            <span>Empresa</span>
            <input value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Marca principal</span>
            <input placeholder="Opcional · usa el nombre de empresa si lo dejás vacío" value={form.brandName} onChange={(event) => setForm((current) => ({ ...current, brandName: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Email</span>
            <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Contraseña</span>
            <input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            <small>Mínimo 10 caracteres, con letras y al menos un número.</small>
          </label>
        </div>

        <label className="legal-check">
          <input type="checkbox" checked={form.acceptTerms} onChange={(event) => setForm((current) => ({ ...current, acceptTerms: event.target.checked }))} />
          <span>Acepto los <button type="button" onClick={() => onLegal("terms")}>Términos y Condiciones</button>.</span>
        </label>

        <label className="legal-check">
          <input type="checkbox" checked={form.acceptPrivacy} onChange={(event) => setForm((current) => ({ ...current, acceptPrivacy: event.target.checked }))} />
          <span>Leí la <button type="button" onClick={() => onLegal("privacy")}>Política de Privacidad</button>.</span>
        </label>

        <button className="primary-button login-submit" disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? "Creando..." : "Crear mi workspace"}
        </button>

        {error && <div className="login-error">{error}</div>}
        <small className="login-footnote">La aceptación legal queda registrada con versión y fecha para tu workspace.</small>
      </section>
    </main>
  );
}
