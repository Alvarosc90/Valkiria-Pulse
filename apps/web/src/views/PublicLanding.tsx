import { PublicContactForm } from "./PublicContactForm";
import { PublicPulseAssistant } from "./PublicPulseAssistant";
import type { LegalType } from "../legal";

const PULSE_LOGO_SRC = "/assets/branding/valkiria-pulse.png";
const PULSE_LOGO_FALLBACK_SRC = "/assets/branding/valkiria-pulse.svg";

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
  ["agents", "Contenido especializado", "Instagram, TikTok y LinkedIn"],
  ["context", "Datos del negocio", "audiencias y contexto real"],
  ["calendar", "WhatsApp + seguimiento", "reactivación y retención"],
  ["publish", "Campañas de Growth", "sin depender de Ads"],
  ["assistant", "Paid Media opcional", "Meta Ads y Google Ads aparte"]
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
  ["01", "Detectar", "PULSE recibe señales y datos del negocio."],
  ["02", "Segmentar", "Construye audiencias según comportamiento e intención."],
  ["03", "Activar", "Usa contenido, WhatsApp, promociones o seguimiento."],
  ["04", "Convertir", "Cada campaña persigue una acción medible."],
  ["05", "Aprender", "Los resultados retroalimentan la siguiente acción."]
];

const plans = [
  {
    name: "Inicial",
    badge: "Prueba 14 días",
    copy: "Para una marca que quiere ordenar contenido y empezar a activar campañas propias.",
    ars: "ARS 24.900",
    usd: "USD 19",
    annual: "Anual: ARS 249.000 · USD 190",
    items: ["1 marca", "Hasta 3 cuentas sociales", "60 publicaciones / mes", "150 generaciones IA / mes", "Growth básico y campañas propias", "Video premium disponible con créditos prepagos"],
    cta: "Empezar 14 días"
  },
  {
    name: "Profesional",
    badge: "Más volumen",
    copy: "Para equipos que suman WhatsApp, audiencias, seguimiento y retención a su operación.",
    ars: "ARS 59.900",
    usd: "USD 49",
    annual: "Anual: ARS 599.000 · USD 490",
    items: ["Hasta 3 marcas", "Hasta 9 cuentas sociales", "250 publicaciones / mes", "800 generaciones IA / mes", "Growth & Retention", "WhatsApp y segmentación", "Video premium con packs prepagos + Analytics"],
    cta: "Crear cuenta"
  },
  {
    name: "Business",
    badge: "Equipos",
    copy: "Para operaciones multi-marca con automatización, retención y capacidad comercial más avanzada.",
    ars: "ARS 119.900",
    usd: "USD 99",
    annual: "Anual: ARS 1.199.000 · USD 990",
    items: ["Hasta 10 marcas", "Hasta 30 cuentas sociales", "1.200 publicaciones / mes", "5.000 generaciones IA / mes", "Growth avanzado + automatizaciones", "Paid Media disponible como integración opcional", "Video premium con packs prepagos + prioridad"],
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
          <span>Growth engine activo</span>
        </div>

        <div className="preview-body">
          <aside className="preview-sidebar">
            <span className="preview-nav active">Resumen</span>
            <span className="preview-nav">Contenido</span>
            <span className="preview-nav">Growth</span>
            <span className="preview-nav">WhatsApp</span>
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
                  <strong>Activaciones y campañas</strong>
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
                  <strong>Reactivación de clientes</strong>
                  <small>10:30</small>
                </div>
                <div className="preview-schedule-line">
                  <span className="schedule-dot tt" />
                  <strong>Seguimiento por WhatsApp</strong>
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
              <div><span>Audiencias</span><strong>12</strong><small>activas</small></div>
              <div><span>Conversión</span><strong>18%</strong><small>+4%</small></div>
              <div><span>Retención</span><strong>91%</strong><small>+6%</small></div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-result-card">
        <span>↗</span>
        <div>
          <strong>Datos que activan acciones.</strong>
          <small>Contenido, WhatsApp y retención.</small>
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
          <img src={PULSE_LOGO_SRC} alt="Valkiria PULSE" onError={(event) => { event.currentTarget.src = PULSE_LOGO_FALLBACK_SRC; }} />
        </a>

        <nav className="landing-nav" aria-label="Navegación principal">
          <a href="#producto">Producto</a>
          <a href="#growth">Growth</a>
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
            <span className="landing-pill">✦ Growth, comunicación y retención con IA</span>
            <h1>Cada red.<br /><span>Su propio pulso.</span></h1>
            <p>
              PULSE convierte los datos de tu negocio en acciones. Coordiná contenido,
              WhatsApp, campañas, seguimiento y retención con agentes especializados,
              sin mezclar la lógica de cada canal.
            </p>

            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={onSignup}>Comenzar gratis →</button>
              <a className="landing-secondary" href="#growth">Ver cómo funciona</a>
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


        <section className="landing-section" id="growth">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Más que contenido</span>
            <h2>Growth, comunicación y retención en una sola plataforma.</h2>
            <p>
              PULSE no necesita que pagues publicidad para ejecutar campañas. Puede activar
              audiencias usando canales propios, datos del negocio y seguimiento automatizado.
            </p>
          </div>

          <div className="landing-growth-grid">
            <article className="landing-growth-card primary">
              <span>Contenido</span>
              <h3>Instagram, TikTok y LinkedIn</h3>
              <p>
                Cada red conserva su agente, su lenguaje y su memoria editorial. PULSE coordina
                planificación, generación, aprobación y publicación.
              </p>
            </article>
            <article className="landing-growth-card retention">
              <span>Growth & Retention</span>
              <h3>WhatsApp, audiencias y seguimiento</h3>
              <p>
                Reactivación, promociones, recuperación de clientes, cross-sell, upsell y
                secuencias de seguimiento a partir de señales reales del negocio.
              </p>
            </article>
            <article className="landing-growth-card optional">
              <span>Paid Media opcional</span>
              <h3>Meta Ads + Google Ads</h3>
              <p>
                PULSE puede preparar campañas pagas, pero la inversión publicitaria la paga
                el cliente directamente y no forma parte de la suscripción base.
              </p>
            </article>
          </div>

          <div className="landing-business-flow" aria-label="Flujo de PULSE">
            <span>Tu negocio</span><b>→</b><span>PULSE</span><b>→</b><span>Audiencias + contexto</span><b>→</b>
            <span>Agentes</span><b>→</b><span>Redes + WhatsApp</span><b>→</b><span>Conversión + retención</span>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-pill soft">Campañas sin publicidad paga</span>
            <h2>Marketing sobre canales propios.</h2>
            <p>
              Una campaña puede empezar con una audiencia y terminar en una venta, renovación
              o recuperación sin usar Meta Ads ni Google Ads.
            </p>
          </div>

          <div className="landing-usecase-grid">
            <article className="landing-usecase-card"><b>01</b><h3>Reactivación</h3><p>Detectá clientes inactivos y dispará una secuencia personalizada de recuperación.</p></article>
            <article className="landing-usecase-card"><b>02</b><h3>Retención</h3><p>Actuá ante vencimientos, caída de actividad o señales de abandono antes del churn.</p></article>
            <article className="landing-usecase-card"><b>03</b><h3>Promociones</h3><p>Segmentá por comportamiento y enviá ofertas relevantes en vez de mensajes masivos.</p></article>
            <article className="landing-usecase-card"><b>04</b><h3>Cross-sell</h3><p>Usá compras y contexto para proponer el siguiente servicio o producto adecuado.</p></article>
          </div>
        </section>

        <section className="landing-section landing-agents-section" id="agentes">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Especialización por canal</span>
            <h2>Agentes de IA especializados<br />sin mezclar contextos.</h2>
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
              PULSE combina métricas de contenido con señales de campaña y conversión para
              entender no sólo qué genera atención, sino qué mueve clientes y retención.
            </p>
          </div>

          <div className="landing-metrics-row">
            <article><span>◎</span><small>Alcance</small><strong>125.4K</strong><b>+32%</b></article>
            <article><span>♡</span><small>Engagement</small><strong>8.7K</strong><b>+28%</b></article>
            <article><span>♙</span><small>Nuevos seguidores</small><strong>3.2K</strong><b>+41%</b></article>
            <article><span>↗</span><small>Mejor contenido</small><strong>Reels</strong><b>+56%</b></article>
          </div>
        </section>


        <section className="landing-section">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Paid Media separado</span>
            <h2>La publicidad paga es opcional.</h2>
            <p>
              El plan base de PULSE no incluye presupuesto de anuncios. El cliente mantiene
              el control de su cuenta publicitaria y paga directamente a Meta o Google.
            </p>
          </div>
          <div className="landing-paid-layout">
            <article className="landing-paid-card">
              <span>PULSE prepara</span>
              <h3>Campañas listas para ejecutar</h3>
              <ul>
                <li>Objetivo y audiencia</li>
                <li>Copy y creatividad</li>
                <li>Variantes A/B</li>
                <li>Presupuesto sugerido y duración</li>
                <li>CTA, landing, UTM y seguimiento</li>
              </ul>
            </article>
            <article className="landing-paid-card optional">
              <span>Integración opcional</span>
              <h3>Meta Ads / Google Ads</h3>
              <p>
                En una primera etapa PULSE puede dejar la campaña preparada para publicación manual.
                Más adelante, las APIs oficiales podrán habilitar publicación y gestión desde la plataforma.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-video-section" id="video">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Video premium · pagás sólo cuando lo necesitás</span>
            <h2>Generá video sin inflar tu suscripción.</h2>
            <p>
              Los planes incluyen la inteligencia editorial de PULSE. El contenido de video
              se compra aparte con Video Credits prepagos y se descuenta según calidad,
              duración y modelo. Si una generación falla, PULSE libera la reserva.
            </p>
          </div>

          <div className="landing-video-tier-grid">
            <article>
              <span>FAST</span>
              <h3>Video Fast</h3>
              <p>Para volumen, pruebas creativas y piezas rápidas de campaña.</p>
              <strong>Desde 5 créditos / segundo</strong>
            </article>
            <article className="quality">
              <span>QUALITY</span>
              <h3>Video Quality</h3>
              <p>Más detalle y consistencia para contenido principal de marca.</p>
              <strong>Desde 7 créditos / segundo</strong>
            </article>
            <article className="premium">
              <span>PREMIUM</span>
              <h3>Video Premium</h3>
              <p>Modelos de mayor costo para campañas donde la calidad justifica la inversión.</p>
              <strong>Desde 40 créditos / segundo</strong>
            </article>
          </div>

          <div className="landing-video-credit-copy">
            <div>
              <span className="eyebrow">Sin compromiso de consumo</span>
              <h3>Comprá créditos cuando haya demanda.</h3>
              <p>
                No necesitás pagar video todos los meses. Los packs se compran desde PULSE
                cuando tu marca realmente va a producir contenido audiovisual.
              </p>
            </div>
            <div className="landing-video-pack-preview">
              <span>500 créditos</span>
              <span>1.500 créditos</span>
              <span>4.000 créditos</span>
            </div>
          </div>
        </section>

        <section className="landing-section landing-flow" id="flujo">
          <div className="landing-section-heading centered">
            <span className="landing-pill soft">Un flujo simple, poderoso</span>
            <h2>Del dato a la acción.<br />Y de la acción al resultado.</h2>
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
              Elegí el plan por marcas, volumen, canales y nivel de Growth. La publicidad paga
              no está incluida: Meta Ads y Google Ads funcionan como integraciones opcionales y
              el presupuesto se paga directamente al proveedor.
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
            Los Video Credits y el presupuesto de Paid Media son consumos adicionales y no forman parte de la cuota mensual.
          </p>
        </section>

        <section className="landing-section landing-contact-section" id="contacto">
          <div className="landing-contact-copy">
            <span className="landing-pill soft">Hablemos de tu operación</span>
            <h2>¿Querés ver PULSE aplicado a tu marca?</h2>
            <p>
              Contanos cómo trabajás hoy. La consulta queda registrada para que podamos
              revisar tu caso, cantidad de marcas, fuentes de datos, redes, WhatsApp y objetivos de crecimiento.
            </p>
            <div className="landing-contact-points">
              <span><FeatureIcon name="agents" /> Revisión de tu flujo actual</span>
              <span><FeatureIcon name="calendar" /> Diseño de campañas y audiencias</span>
              <span><FeatureIcon name="assistant" /> Configuración de agentes y canales</span>
            </div>
          </div>
          <PublicContactForm />
        </section>

        <section className="landing-cta">
          <div>
            <span className="landing-pill inverted">Valkiria PULSE</span>
            <h2>Convertí tus datos en crecimiento.</h2>
            <p>Contenido, WhatsApp, campañas y retención. Un solo motor de Growth.</p>
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
