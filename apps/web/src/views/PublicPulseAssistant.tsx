import { FormEvent, useEffect, useState } from "react";
import { askPublicPulse } from "../api";

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8c.8 4.2 2.7 6.1 6.9 6.9-4.2.8-6.1 2.7-6.9 6.9-.8-4.2-2.7-6.1-6.9-6.9 4.2-.8 6.1-2.7 6.9-6.9Z" fill="currentColor" />
      <path d="M19.2 15.4c.35 1.85 1.2 2.7 3.05 3.05-1.85.35-2.7 1.2-3.05 3.05-.35-1.85-1.2-2.7-3.05-3.05 1.85-.35 2.7-1.2 3.05-3.05Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}

export function PublicPulseAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Soy PULSE IA. Contame qué querés resolver con tus redes y te muestro cómo encaja la plataforma."
    }
  ]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = question.trim();
    if (!value || busy) return;

    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", text: value }]);
    setBusy(true);

    try {
      const answer = await askPublicPulse(value);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: answer || "Puedo ayudarte con agentes, calendarios, conexiones, Analytics y planes." }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude responder en este momento.");
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    "¿Qué diferencia a PULSE?",
    "¿Tengo que conectar las redes cada vez?",
    "¿Puedo importar Excel?"
  ];

  return (
    <div className={"pulse-assistant-dock" + (open ? " open" : "")}>
      {open && (
        <aside className="pulse-assistant-panel" role="dialog" aria-label="PULSE IA">
          <header>
            <div className="assistant-title-icon"><SparkIcon /></div>
            <div>
              <span>PULSE IA</span>
              <strong>Asistente de producto</strong>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          </header>

          <div className="assistant-thread" aria-live="polite">
            {messages.slice(-6).map((message, index) => (
              <div className={"assistant-message " + message.role} key={index}>
                {message.text}
              </div>
            ))}
            {busy && <div className="assistant-typing"><i /><i /><i /></div>}
          </div>

          <div className="assistant-suggestions">
            {suggestions.map((item) => (
              <button key={item} onClick={() => setQuestion(item)}>{item}</button>
            ))}
          </div>

          <form className="assistant-input" onSubmit={submit}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={700}
              placeholder="Ej.: publico en 3 redes y repito demasiado"
            />
            <button disabled={busy || !question.trim()} aria-label="Enviar">→</button>
          </form>

          {error && <p className="assistant-error">{error}</p>}
          <small>No accedo a cuentas privadas ni te voy a pedir tokens o contraseñas.</small>
        </aside>
      )}

      <button
        className="pulse-assistant-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span><SparkIcon /></span>
        <div>
          <strong>PULSE IA</strong>
          <small>{open ? "Cerrar" : "Preguntame"}</small>
        </div>
      </button>
    </div>
  );
}
