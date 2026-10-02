import { PULSE_LEGAL_VERSION, LEGAL_DOCS, type LegalType } from "../legal";

const LOGO = "/assets/branding/4_VALKIRIA%20PULSE.png";

export function LegalPage({
  type,
  onBack
}: {
  type: LegalType;
  onBack: () => void;
}) {
  const doc = LEGAL_DOCS[type];

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <button className="legal-brand" onClick={onBack} aria-label="Volver a Valkiria PULSE">
          <img src={LOGO} alt="Valkiria PULSE" />
        </button>
        <button className="legal-back" onClick={onBack}>← Volver a PULSE</button>
      </header>

      <article className="legal-document">
        <span className="legal-kicker">{doc.kicker}</span>
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        <div className="legal-version">Versión {PULSE_LEGAL_VERSION}</div>

        <div className="legal-sections">
          {doc.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>

        <aside className="legal-note">
          <strong>Canal de contacto</strong>
          <span>consultas@valkiria.tech · soporte@valkiria.tech</span>
        </aside>
      </article>
    </main>
  );
}
