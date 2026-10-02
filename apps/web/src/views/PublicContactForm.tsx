import { FormEvent, useState } from "react";
import { sendPublicContact } from "../api";

export function PublicContactForm() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    currentSystem: "",
    message: "Quiero conocer Valkiria PULSE y evaluar cómo centralizar mis redes.",
    website: ""
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setSuccess("");
    setError("");

    try {
      const result = await sendPublicContact(form);
      setSuccess(result?.message ?? "Recibimos tu consulta.");
      setForm((current) => ({ ...current, message: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar tu consulta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pulse-contact-form" onSubmit={submit}>
      <input
        className="pulse-honeypot"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
      />

      <label>
        <span>Tu nombre *</span>
        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      </label>

      <label>
        <span>Empresa / marca *</span>
        <input required value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
      </label>

      <label>
        <span>Email *</span>
        <input type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
      </label>

      <label>
        <span>WhatsApp / teléfono</span>
        <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
      </label>

      <label className="wide">
        <span>¿Qué usás hoy?</span>
        <input placeholder="Excel, Metricool, Buffer, manual..." value={form.currentSystem} onChange={(event) => setForm((current) => ({ ...current, currentSystem: event.target.value }))} />
      </label>

      <label className="wide">
        <span>¿Qué querés resolver?</span>
        <textarea rows={4} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
      </label>

      {success && <p className="contact-success wide">{success}</p>}
      {error && <p className="contact-error wide">{error}</p>}

      <button className="landing-primary wide" disabled={busy}>
        {busy ? "Enviando..." : "Quiero hablar sobre PULSE →"}
      </button>
    </form>
  );
}
