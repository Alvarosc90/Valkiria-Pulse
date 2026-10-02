import { PublicContactForm } from "./PublicContactForm";
import { PublicPulseAssistant } from "./PublicPulseAssistant";
import type { LegalType } from "../legal";

const PULSE_LOGO_SRC = "/assets/branding/4_VALKIRIA%20PULSE.png";

const agents = [
  {
    key: "instagram",
    title: "Instagram Agent",
    subtitle: "Creatividad visual que inspira.",
    copy: "Piensa en piezas, captions, CTAs y memoria editorial propia para Instagram.",
    chips: ["Reels", "Historias", "Posts"]
  },
  {
    key: "tiktok",
    title: "TikTok Agent",
    subtitle: "Ideas que se vuelven tendencia.",
    copy: "Trabaja desde el hook, el ritmo, el guion y el video para crear contenido nativo.",
    chips: ["Hooks", "Video", "Ritmo"]
  },
  {
    key: "linkedin",
    title: "LinkedIn Agent",
    subtitle: "Autoridad que genera oportunidades.",
    copy: "Construye contenido profesional, aprendizaje, producto y conversación B2B.",
    chips: ["Posts", "Carrusel", "Insights"]
  }
];

const featureStrip = [
  ["agents", "3 agentes especializados", "uno por plataforma"],
  ["context", "Contexto separado", "sin mezclar memorias"],
  ["calendar", "Calendarios flexibles", "creá o importá Excel"],
  ["publish", "De idea a publicación", "en un solo flujo"],
  ["assistant", "PULSE IA", "te acompaña desde la landing"]
];

const networkContext = [
  {
    key: "instagram",
    title: "Instagram",
    items: ["Tono visual y aspiracional", "Comunidad y cercanía", "Reels, historias y posts", "Hashtags y tendencias"]
  },
  {
    key: "tiktok",
    title: "TikTok",
    items: ["Tono creativo y auténtico", "Entretenimiento y velocidad", "Videos cortos y hooks", "Tendencias y sonido"]
  },
  {
    key: "linkedin",
    title: "LinkedIn",
    items: ["Tono profesional y confiable", "Valor y conocimiento", "Posts, carruseles y artículos", "Industria y casos de uso"]
  }
];

const flow = [
  ["01", "Idear", "El objetivo de campaña entra una sola vez."],
  ["02", "Crear", "Cada agente produce para su propia red."],
  ["03", "Aprobar", "Revisás contenido y assets en un mismo lugar."],
  ["04", "Programar", "PULSE organiza cada calendario editorial."],
  ["05", "Publicar", "Los providers ejecutan y registran el resultado."]
];

const plans = [
  {
    name: "Inicial",
    badge: "Prueba 14 días",
    copy: "Para una marca que quiere ordenar calendario, agentes y conexiones.",
    ars: "ARS 24.900",
    usd: "USD 19",
    annual: "Anual: ARS 249.000 · USD 190",
    items: ["1 marca", "Hasta 3 cuentas sociales", "60 publicaciones / mes", "150 generaciones IA / mes", "Brand Brain + Excel"],
    cta: "Empezar 14 días"
  },
  {
    name: "Profesional",
    badge: "Más volumen",
    copy: "Para equipos que necesitan colaboración, memoria editorial y biblioteca.",
    ars: "ARS 59.900",
    usd: "USD 49",
    annual: "Anual: ARS 599.000 · USD 490",
    items: ["Hasta 3 marcas", "Hasta 9 cuentas sociales", "250 publicaciones / mes", "800 generaciones IA / mes", "Auditoría + biblioteca + Analytics"],
    cta: "Crear cuenta"
  },
  {
    name: "Business",
    badge: "Equipos",
    copy: "Para operaciones multi-marca con más capacidad y aprobaciones.",
    ars: "ARS 119.900",
    usd: "USD 99",
    annual: "Anual: ARS 1.199.000 · USD 990",
    items: ["Hasta 10 marcas", "Hasta 30 cuentas sociales", "1.200 publicaciones / mes", "5.000 generaciones IA / mes", "Aprobaciones de equipo + prioridad"],
    cta: "Crear cuenta"
  }
];

function SocialIcon({ network }: { network: "instagram" | "tiktok" | "linkedin" }) {
  if (network === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.8" r="1.15" fill="currentColor" />
      </svg>
    );
  }

  if (network === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M14.3 3.2c.5 2.4 1.9 3.9 4.2 4.5v3.2a8.3 8.3 0 0 1-4.2-1.3v5.8a5.6 5.6 0 1 1-4.8-5.5v3.3a2.4 2.4 0 1 0 1.6 2.2V3.2h3.2Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="2.8" fill="currentColor" opacity=".18" />
      <circle cx="7.7" cy="8" r="1.45" fill="currentColor" />
      <rect x="6.35" y="10.2" width="2.7" height="7.2" rx=".7" fill="currentColor" />
      <path fill="currentColor" d="M11 10.2h2.6v1c.8-.9 1.8-1.35 3-1.35 2.45 0 3.4 1.55 3.4 4.15v3.4h-2.8v-3.17c0-1.27-.34-2.05-1.55-2.05-1.28 0-1.85.86-1.85 2.35v2.87H11v-7.2Z" />
    </svg>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true } as const;

  if (name === "agents") {
    return <svg {...common}><circle cx="7" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M2.5 19c.5-3.4 2.1-5 4.5-5s4 1.6 4.5 5M12.5 19c.5-3.4 2.1-5 4.5-5s4 1.6 4.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  }
  if (name === "context") {
    return <svg {...common}><path d="M4 6h16M4 12h10M4 18h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="18" cy="12" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M7 3v4M17 3v4M3.5 9h17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  }
  if (name === "publish") {
    return <svg {...common}><path d="M5 19 19 5M10 5h9v9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }

  return <svg {...common}><path d="M12 2.8c.8 4.2 2.7 6.1 6.9 6.9-4.2.8-6.1 2.7-6.9 6.9-.8-4.2-2.7-6.1-6.9-6.9 4.2-.8 6.1-2.7 6.9-6.9Z" fill="currentColor"/><path d="M19.2 15.4c.35 1.85 1.2 2.7 3.05 3.05-1.85.35-2.7 1.2-3.05 3.05-.35-1.85-1.2-2.7-3.05-3.05 1.85-.35 2.7-1.2 3.05-3.05Z" fill="currentColor" opacity=".65"/></svg>;
}

function SocialBadge({ network }: { network: "instagram" | "tiktok" | "linkedin" }) {
  return (
    <span className={"landing-social-badge " + network}>
      <SocialIcon network={network} />
    </span>
  );
}

function DashboardPreview() {
  return (
    <div className="landing-dashboard-stage" aria-hidden="true">
      <div className="landing-social-float float-instagram"><SocialBadge network="instagram" /></div>
      <div className="landing-social-float float-tiktok"><SocialBadge network="tiktok" /></div>
      <div className="landing-social-float float-linkedin"><SocialBadge network="linkedin" /></div>

      <div className="landing-dashboard-window">
        <div className="preview-topbar">
          <div className="preview-brand-dot" />
          <strong>PULSE Command Center</strong>
          <span>3 agentes activos</span>
        </div>

        <div className="preview-body">
          <aside className="preview-sidebar">
            <span className="preview-nav active">Resumen</span>
            <span className="preview-nav">Calendarios</span>
            <span className="preview-nav">Agentes</span>
            <span className="preview-nav">Analytics</span>
          </aside>

          <div className="preview-content">
            <div className="preview-agent-row">
              {agents.map((agent) => (
                <div className={"preview-agent " + agent.key} key={agent.key}>
                  <span className="preview-agent-icon">
                    <SocialIcon network={agent.key as "instagram" | "tiktok" | "linkedin"} />
                  </span>
                  <div>
                    <strong>{agent.title}</strong>
                    <small>online</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="preview-grid">
              <div className="preview-calendar">
                <div className="preview-panel-title">
                  <strong>Calendario de publicaciones</strong>
                  <span>Octubre</span>
                </div>
                <div className="calendar-days">
                  {[1,2,3,4,5].map((day) => (
                    <div key={day} className="calendar-day">
                      <span>{day + 6}</span>
                      <i className={day === 1 ? "ig" : day === 2 ? "tt" : day === 3 ? "li" : ""} />
                    </div>
                  ))}
                </div>
                <div className="preview-schedule-line">
                  <span className="schedule-dot ig" />
                  <strong>Producto en acción</strong>
                  <small>10:30</small>
                </div>
                <div className="preview-schedule-line">
                  <span className="schedule-dot tt" />
                  <strong>Hook de comunidad</strong>
                  <small>14:00</small>
                </div>
              </div>

              <div className="preview-brandbrain">
                <div className="preview-panel-title">
                  <strong>Brand Brain</strong>
                  <span>sincronizado</span>
                </div>
                <div className="brandbrain-chip-row">
                  <span>Tono cercano</span>
                  <span>Claims</span>
                  <span>CTAs</span>
                </div>
                <div className="brandbrain-bars"><i /><i /><i /></div>
              </div>
            </div>

            <div className="preview-metrics">
              <div><span>Impresiones</span><strong>125K</strong><small>+32%</small></div>
              <div><span>Engagement</span><strong>8.7K</strong><small>+28%</small></div>
              <div><span>Seguidores</span><strong>3.2K</strong><small>+41%</small></div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-result-card">
        <span>↗</span>
        <div>
          <strong>Contenido que conecta.</strong>
          <small>Resultados que se pueden leer.</small>
        </div>
      </div>
    </div>
  );
}

export function PublicLanding({
  onLogin,
  onSignup,
  onLegal
}: {
  onLogin: () => void;
  onSignup: () => void;
  onLegal: (type: LegalType) => void;
}) {
  return (
    <div className="pulse-landing">
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="Valkiria PULSE">
          <img src={PULSE_LOGO_SRC} alt="Valkiria PULSE" />
        </a>

        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#producto">Producto</a>
          <a href="#agentes">Agentes IA</a>
          <a href="#contexto">Diferencia</a>
          <a href="#planes">Planes</a>
          <a href="#contacto">Contacto</a>
        </nav>

        <div className="landing-header-actions">
          <button className="landing-login" onClick={onLogin}>Iniciar sesión</button>
          <button className="landing-primary compact" onClick={onSignup}>Comenzar gratis →</button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="producto">
          <div className="landing-hero-copy">
            <span className="landing-pill">✦ Plataforma de contenido con IA</span>
            <h1>Cada red.<br /><span>Su propio pulso.</span></h1>
            <p>
              Gestioná Instagram, TikTok y LinkedIn con agentes de IA especializados.
              Planificá, creá, aprobá y publicá contenido pensado para cada plataforma,
              con su propio contexto.
            </p>

            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={onSignup}>Comenzar gratis →</button>
              <a className="landing-secondary" href="#agentes">Ver cómo funciona</a>
            </div>

            <div className="landing-trust-row">
              <span>✓ 14 días de prueba</span>
              <span>✓ Sin tarjeta para crear la cuenta</span>
              <span>✓ Configuración guiada</span>
            </div>
          </div>

          <DashboardPreview />
        </section>

        <section className="landing-feature-strip" aria-label="Beneficios">
          {featureStrip.map(([icon, title, copy]) => (
            <article key={title}>
              <span className="feature-strip-icon"><FeatureIcon name={icon} /></span>
              <div><strong>{title}</strong><small>{copy}</small></div>
            </article>
          ))}
        </section>

        <section className="landing-section landing-agents-section" id="agentes">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">3 agentes · 3 especialistas · 1 plataforma</span>
            <h2>Agentes de IA especializados<br />en cada red social.</h2>
            <p>
              Cada plataforma tiene su propio lenguaje, audiencia y oportunidades.
              PULSE mantiene la identidad de tu marca, pero deja que cada agente piense
              de forma nativa.
            </p>
          </div>

          <div className="landing-network-grid">
            {agents.map((agent) => (
              <article className={"landing-network-card " + agent.key} key={agent.key}>
                <div className="network-card-head">
                  <SocialBadge network={agent.key as "instagram" | "tiktok" | "linkedin"} />
                  <span>{agent.subtitle}</span>
                </div>
                <h3>{agent.title}</h3>
                <p>{agent.copy}</p>
                <div className="network-chip-row">
                  {agent.chips.map((chip) => <span key={chip}>{chip}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-context-section" id="contexto">
          <div className="landing-context-copy">
            <span className="landing-pill soft">Inteligencia que entiende las diferencias</span>
            <h2>Cada red, su propio contexto.</h2>
            <p>
              PULSE comparte un Brand Brain, pero mantiene separados el tono,
              la memoria editorial, los objetivos y las señales de rendimiento de cada red.
            </p>
          </div>

          <div className="landing-context-board">
            {networkContext.map((network) => (
              <article key={network.key}>
                <div>
                  <SocialBadge network={network.key as "instagram" | "tiktok" | "linkedin"} />
                  <strong>{network.title}</strong>
                </div>
                <ul>
                  {network.items.map((item) => <li key={item}>✓ {item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-calendar-section">
          <div className="landing-calendar-copy">
            <span className="landing-pill soft">Planificá con lo que ya tenés</span>
            <h2>Calendarios de contenido<br />para cada red.</h2>
            <p>
              Importá tu calendario editorial en Excel o crealo directamente desde PULSE.
              Cada red conserva su estrategia sin obligarte a administrar tres herramientas.
            </p>
            <button className="landing-primary" onClick={onSignup}>Crear mi workspace →</button>
          </div>

          <div className="landing-file-stack" aria-hidden="true">
            <div className="file-row instagram"><SocialBadge network="instagram" /><div><strong>Instagram.xlsx</strong><span>Calendario importado</span></div><b>✓</b></div>
            <div className="file-row tiktok"><SocialBadge network="tiktok" /><div><strong>TikTok.xlsx</strong><span>Calendario importado</span></div><b>✓</b></div>
            <div className="file-row linkedin"><SocialBadge network="linkedin" /><div><strong>LinkedIn.xlsx</strong><span>Calendario importado</span></div><b>✓</b></div>
            <div className="excel-drop">
              <span>▦</span>
              <strong>Arrastrá tu Excel</strong>
              <small>o crealo con PULSE</small>
            </div>
          </div>
        </section>

        <section className="landing-section landing-analytics-section">
          <div className="landing-section-heading">
            <span className="landing-pill soft">Medí lo que importa</span>
            <h2>Visibilidad total del rendimiento.</h2>
            <p>
              Cuando cada red habilita los permisos de métricas, PULSE reúne el rendimiento
              por plataforma y lo convierte en señales editoriales para el agente correcto.
            </p>
          </div>

          <div className="landing-metrics-row">
            <article><span>◎</span><small>Alcance</small><strong>125.4K</strong><b>+32%</b></article>
            <article><span>♡</span><small>Engagement</small><strong>8.7K</strong><b>+28%</b></article>
            <article><span>♙</span><small>Nuevos seguidores</small><strong>3.2K</strong><b>+41%</b></article>
            <article><span>↗</span><small>Mejor contenido</small><strong>Reels</strong><b>+56%</b></article>
          </div>
        </section>

        <section className="landing-section landing-flow" id="flujo">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Un flujo simple, poderoso</span>
            <h2>De la idea a la publicación.<br />Sin complicaciones.</h2>
          </div>

          <div className="landing-flow-line">
            {flow.map(([number, title, copy], index) => (
              <article key={number}>
                <div className="flow-number">{number}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
                {index < flow.length - 1 && <span className="flow-connector">→</span>}
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-pricing-section" id="planes">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Empezá simple y escalá</span>
            <h2>Planes pensados para crecer con tu operación.</h2>
            <p>
              El plan Inicial puede probarse durante 14 días. Los valores comerciales
              definitivos se informan antes de contratar para que siempre veas condiciones vigentes.
            </p>
          </div>

          <div className="landing-plan-grid">
            {plans.map((plan, index) => (
              <article className={index === 0 ? "landing-plan-card featured" : "landing-plan-card"} key={plan.name}>
                <span>{plan.badge}</span>
                <h3>{plan.name}</h3>
                <p>{plan.copy}</p>
                <div className="landing-plan-price">
                  <strong>{plan.ars}</strong>
                  <span>/ mes</span>
                  <small>{plan.usd} / mes · impuestos no incluidos</small>
                  <small>{plan.annual} · equivalente a 2 meses bonificados</small>
                </div>
                <ul>{plan.items.map((item) => <li key={item}>✓ {item}</li>)}</ul>
                <button
                  className={index === 0 ? "landing-primary" : "landing-secondary plan-button"}
                  onClick={onSignup}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
          <p className="landing-enterprise-note">
            ¿Más de 10 marcas o necesitás límites especiales? Enterprise se cotiza a medida.
          </p>
        </section>

        <section className="landing-section landing-contact-section" id="contacto">
          <div className="landing-contact-copy">
            <span className="landing-pill soft">Hablemos de tu operación</span>
            <h2>¿Querés ver PULSE aplicado a tu marca?</h2>
            <p>
              Contanos cómo trabajás hoy. La consulta queda registrada para que podamos
              revisar tu caso, cantidad de marcas, redes y flujo editorial.
            </p>
            <div className="landing-contact-points">
              <span><FeatureIcon name="agents" /> Revisión de tu flujo actual</span>
              <span><FeatureIcon name="calendar" /> Migración desde Excel</span>
              <span><FeatureIcon name="assistant" /> Configuración de agentes</span>
            </div>
          </div>
          <PublicContactForm />
        </section>

        <section className="landing-cta">
          <div>
            <span className="landing-pill inverted">Valkiria PULSE</span>
            <h2>Llevá tu contenido al siguiente nivel.</h2>
            <p>Una marca. Tres lenguajes. Un solo command center.</p>
          </div>
          <button className="landing-cta-button" onClick={onSignup}>Comenzar gratis →</button>
        </section>
      </main>

      <PublicPulseAssistant />

      <footer className="landing-footer">
        <img src={PULSE_LOGO_SRC} alt="Valkiria PULSE" />
        <div className="landing-footer-content">
          <div className="landing-footer-valkiria">
            <span>Un desarrollo de</span>
            <a href="https://valkiria.tech" target="_blank" rel="noopener noreferrer">
              Valkiria Project ↗
            </a>
          </div>
          <nav className="landing-footer-legal" aria-label="Políticas de Valkiria PULSE">
            <button onClick={() => onLegal("terms")}>Términos</button>
            <button onClick={() => onLegal("privacy")}>Privacidad</button>
            <button onClick={() => onLegal("cookies")}>Cookies</button>
            <button onClick={() => onLegal("security")}>Seguridad</button>
            <button onClick={() => onLegal("data")}>Datos</button>
            <button onClick={() => window.dispatchEvent(new CustomEvent("pulse:cookie-settings"))}>Preferencias de cookies</button>
            <a href="mailto:consultas@valkiria.tech">Contacto</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
