import { useEffect, useState } from "react";

const STORAGE_KEY = "pulse_cookie_consent";

export function CookieConsent({ onOpenCookies }: { onOpenCookies: () => void }) {
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) == null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("pulse:cookie-settings", show);
    return () => window.removeEventListener("pulse:cookie-settings", show);
  }, []);

  if (!open) return null;

  function choose(value: "necessary" | "analytics") {
    localStorage.setItem(STORAGE_KEY, value);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("pulse:consent-changed", { detail: value }));
  }

  return (
    <section className="cookie-banner" role="dialog" aria-label="Preferencias de privacidad">
      <div>
        <span>PRIVACIDAD</span>
        <strong>Vos elegís cómo medimos la experiencia.</strong>
        <p>
          Las cookies necesarias mantienen PULSE funcionando. La analítica opcional
          sólo se habilitará respetando tu preferencia.
        </p>
        <button onClick={onOpenCookies}>Ver política de cookies</button>
      </div>
      <div className="cookie-actions">
        <button className="cookie-secondary" onClick={() => choose("necessary")}>
          Solo necesarias
        </button>
        <button className="cookie-primary" onClick={() => choose("analytics")}>
          Aceptar analítica
        </button>
      </div>
    </section>
  );
}
