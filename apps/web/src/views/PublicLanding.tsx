const PULSE_LOGO_SRC = "/assets/branding/4_VALKIRIA%20PULSE.png";

const networks = [
  {
    key: "instagram",
    name: "Instagram",
    eyebrow: "Visual-first",
    copy: "Piensa en pieza, caption, estética y CTA para Instagram. Conserva su propia memoria editorial."
  },
  {
    key: "tiktok",
    name: "TikTok",
    eyebrow: "Hook-first",
    copy: "Trabaja desde el video: hook, ritmo, guion, duración y contexto nativo de TikTok."
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    eyebrow: "Professional-first",
    copy: "Construye contexto profesional, aprendizaje, producto y conversación sin sonar como otra red."
  }
];

const differentiators = [
  {
    number: "01",
    title: "Brand Brain compartido",
    copy: "La marca, sus productos, tono, claims aprobados y límites viven en una sola fuente de verdad."
  },
  {
    number: "02",
    title: "Memoria separada por red",
    copy: "Cada agente recuerda su propio historial para reducir repeticiones sin mezclar Instagram, TikTok y LinkedIn."
  },
  {
    number: "03",
    title: "Orquestación, no copia y pega",
    copy: "Una campaña puede tener un objetivo común, pero cada red recibe una ejecución pensada desde cero para su contexto."
  },
  {
    number: "04",
    title: "Aprende de resultados",
    copy: "Las métricas vuelven como señales editoriales a la red correcta, sin contaminar el contexto de las demás."
  }
];

export function PublicLanding({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="pulse-landing">
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="Valkiria PULSE">
          <img src={PULSE_LOGO_SRC} alt="Valkiria PULSE" />
        </a>

        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#diferencia">La diferencia</a>
          <a href="#agentes">Agentes</a>
          <a href="#flujo">Cómo funciona</a>
        </nav>

        <button className="landing-login" onClick={onLogin}>
          Entrar
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">Social intelligence · por plataforma</span>
            <h1>Cada red.<br /><span>Su propio pulso.</span></h1>
            <p>
              PULSE coordina agentes especializados para Instagram, TikTok y LinkedIn.
              Comparten la identidad de tu marca, pero cada uno piensa, recuerda y
              crea según la lógica de su propia red.
            </p>

            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={onLogin}>
                Empezar con PULSE
              </button>
              <a className="landing-secondary" href="#diferencia">
                Ver cómo funciona
              </a>
            </div>

            <div className="landing-proof">
              <span>3 agentes especializados</span>
              <span>1 Brand Brain</span>
              <span>1 operación</span>
            </div>
          </div>

          <div className="landing-orbit-card" aria-hidden="true">
            <div className="orbit-core">
              <span className="orbit-core-label">Brand Brain</span>
              <strong>PULSE</strong>
            </div>
            <div className="orbit-node orbit-node-instagram">
              <span>IG</span>
              <strong>Instagram</strong>
              <small>Visual · caption · CTA</small>
            </div>
            <div className="orbit-node orbit-node-tiktok">
              <span>TT</span>
              <strong>TikTok</strong>
              <small>Hook · video · ritmo</small>
            </div>
            <div className="orbit-node orbit-node-linkedin">
              <span>LI</span>
              <strong>LinkedIn</strong>
              <small>Contexto · autoridad</small>
            </div>
          </div>
        </section>

        <section className="landing-section" id="diferencia">
          <div className="landing-section-heading">
            <span className="landing-kicker">La diferencia</span>
            <h2>No es publicar lo mismo tres veces.</h2>
            <p>
              PULSE está diseñado para que una marca sea coherente sin volverse idéntica
              en todas sus redes.
            </p>
          </div>

          <div className="difference-grid">
            {differentiators.map((item) => (
              <article key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="agentes">
          <div className="landing-section-heading split">
            <div>
              <span className="landing-kicker">Tres redes. Tres cerebros.</span>
              <h2>Un agente especializado para cada plataforma.</h2>
            </div>
            <p>
              La identidad de marca se comparte. La estrategia editorial, la memoria
              reciente y las señales de rendimiento se mantienen separadas.
            </p>
          </div>

          <div className="landing-network-grid">
            {networks.map((network) => (
              <article className={"landing-network-card " + network.key} key={network.key}>
                <div>
                  <span className="landing-network-icon">
                    {network.key === "instagram" ? "IG" : network.key === "tiktok" ? "TT" : "LI"}
                  </span>
                  <span className="landing-network-eyebrow">{network.eyebrow}</span>
                </div>
                <h3>{network.name} Agent</h3>
                <p>{network.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-flow" id="flujo">
          <div className="landing-section-heading">
            <span className="landing-kicker">Simple para usar. Potente por dentro.</span>
            <h2>Conectás una vez. PULSE sigue.</h2>
          </div>

          <div className="landing-flow-grid">
            <article>
              <span>01</span>
              <h3>Conectá tus redes</h3>
              <p>Autorizás cada cuenta una única vez. PULSE guarda las credenciales cifradas y renueva accesos cuando la plataforma lo permite.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Definí tu marca</h3>
              <p>Productos, tono, claims, CTAs y restricciones quedan centralizados en Brand Brain.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Planificá o importá</h3>
              <p>Creá contenido desde PULSE o importá calendarios. Cada red mantiene su propio enfoque.</p>
            </article>
            <article>
              <span>04</span>
              <h3>Aprobá y publicá</h3>
              <p>Revisás cuando querés. El scheduler y los providers se encargan de la ejecución técnica.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta">
          <span className="landing-kicker">Valkiria PULSE</span>
          <h2>Una marca. Tres lenguajes. Un solo command center.</h2>
          <button className="landing-primary" onClick={onLogin}>
            Entrar a PULSE
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <img src={PULSE_LOGO_SRC} alt="Valkiria PULSE" />
        <span>Un desarrollo de Valkiria Project.</span>
      </footer>
    </div>
  );
}
