import { useEffect, useState } from "react";
import { verifyEmailRequest } from "../api";

const LOGO = "/assets/branding/4_VALKIRIA%20PULSE.png";

export function VerifyEmailPage({
  token,
  onLogin,
  onBack
}: {
  token: string | null;
  onLogin: () => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [message, setMessage] = useState(
    token ? "Verificando tu email..." : "Falta el token de verificación."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    void verifyEmailRequest(token)
      .then(() => {
        if (cancelled) return;
        setState("success");
        setMessage("Tu email quedó verificado. Ya podés ingresar a PULSE.");
      })
      .catch((error) => {
        if (cancelled) return;
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo verificar el email."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="auth-public-shell">
      <section className="auth-public-card">
        <button className="auth-public-logo" onClick={onBack}>
          <img src={LOGO} alt="Valkiria PULSE" />
        </button>

        <span className="eyebrow">SEGURIDAD DE CUENTA</span>
        <h1>
          {state === "success"
            ? "Email verificado."
            : state === "loading"
              ? "Estamos verificando..."
              : "No pudimos verificar."}
        </h1>
        <p>{message}</p>

        <div className={"auth-public-state " + state}>
          <span>{state === "success" ? "✓" : state === "loading" ? "…" : "!"}</span>
        </div>

        {state === "success" ? (
          <button className="primary-button" onClick={onLogin}>
            Iniciar sesión
          </button>
        ) : (
          <button className="login-back" onClick={onBack}>
            ← Volver a la landing
          </button>
        )}
      </section>
    </main>
  );
}
