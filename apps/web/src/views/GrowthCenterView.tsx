export function GrowthCenterView({
  brandName,
  onNotice
}: {
  brandName?: string;
  onNotice: (message: string | null) => void;
}) {
  const campaignTypes = [
    {
      title: "Reactivación",
      copy: "Detectá clientes inactivos, segmentalos y prepará una secuencia de recuperación por WhatsApp.",
      steps: ["Señal de inactividad", "Segmento", "Mensaje", "Seguimiento", "Conversión"]
    },
    {
      title: "Retención",
      copy: "Convertí vencimientos, baja de actividad o riesgo de churn en acciones antes de perder al cliente.",
      steps: ["Evento", "Regla", "Audiencia", "Acción", "Resultado"]
    },
    {
      title: "Cross-sell / Upsell",
      copy: "Usá comportamiento y compras para ofrecer el siguiente producto o servicio con contexto.",
      steps: ["Contexto", "Oportunidad", "Oferta", "Canal", "Medición"]
    }
  ];

  return (
    <div className="growth-center">
      <section className="growth-hero">
        <div>
          <span className="eyebrow">Growth & Retention</span>
          <h2>Convertí datos del negocio en acciones.</h2>
          <p>
            PULSE combina contexto, audiencias, contenido y canales para activar campañas
            de adquisición, seguimiento, recuperación y retención sin depender de publicidad paga.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => onNotice("El constructor de campañas queda preparado para la próxima capa de backend Growth.")}
        >
          Crear campaña
        </button>
      </section>

      <section className="growth-status-grid">
        <article>
          <span>Campañas propias</span>
          <strong>Listas para modelar</strong>
          <small>WhatsApp, redes y datos del negocio</small>
        </article>
        <article>
          <span>Audiencias</span>
          <strong>{brandName ?? "Marca activa"}</strong>
          <small>segmentación conectable a TrainIA, ERP y otras fuentes</small>
        </article>
        <article>
          <span>WhatsApp</span>
          <strong>Canal de Growth</strong>
          <small>reactivación, seguimiento y retención</small>
        </article>
        <article>
          <span>Paid Media</span>
          <strong>Opcional</strong>
          <small>Meta Ads / Google Ads · inversión no incluida</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Campañas sin Ads</span>
            <h2>Marketing sobre canales propios</h2>
          </div>
          <span className="badge">Sin presupuesto publicitario</span>
        </div>

        <div className="growth-campaign-grid">
          {campaignTypes.map((campaign) => (
            <article className="growth-campaign-card" key={campaign.title}>
              <span className="growth-card-label">PLAYBOOK</span>
              <h3>{campaign.title}</h3>
              <p>{campaign.copy}</p>
              <div className="growth-step-row">
                {campaign.steps.map((step, index) => (
                  <span key={step}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {step}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="growth-channel-grid">
        <article className="growth-channel-card whatsapp">
          <div className="growth-channel-head">
            <span className="growth-channel-icon">WA</span>
            <div>
              <span className="eyebrow">Canal propio</span>
              <h3>WhatsApp</h3>
            </div>
          </div>
          <p>
            Secuencias de bienvenida, renovación, recuperación, promociones y seguimiento.
            El objetivo es mover una audiencia hacia una acción medible, no enviar mensajes masivos sin contexto.
          </p>
          <div className="growth-chip-row">
            <span>Segmentos</span><span>Secuencias</span><span>Follow-up</span><span>Conversión</span>
          </div>
        </article>

        <article className="growth-channel-card paid">
          <div className="growth-channel-head">
            <span className="growth-channel-icon">ADS</span>
            <div>
              <span className="eyebrow">Integración opcional</span>
              <h3>Meta Ads + Google Ads</h3>
            </div>
          </div>
          <p>
            PULSE puede preparar objetivo, público, copy, creatividades, variantes A/B, CTA,
            landing, UTM y presupuesto sugerido. La inversión publicitaria la paga el cliente
            directamente al proveedor y no forma parte del plan base.
          </p>
          <div className="growth-chip-row">
            <span>Draft primero</span><span>Publicación manual</span><span>API después</span>
          </div>
        </article>
      </section>

      <section className="section-block growth-loop">
        <div>
          <span className="eyebrow">Loop de Growth</span>
          <h2>Negocio → audiencia → acción → resultado.</h2>
          <p>
            La ventaja de PULSE aparece cuando deja de mirar solamente seguidores y empieza a
            usar señales reales del negocio para decidir a quién hablarle, por qué canal y con qué objetivo.
          </p>
        </div>
        <div className="growth-loop-flow" aria-label="Flujo de Growth">
          <span>Datos del negocio</span>
          <b>→</b>
          <span>Audiencia</span>
          <b>→</b>
          <span>Agente</span>
          <b>→</b>
          <span>Canal</span>
          <b>→</b>
          <span>Conversión</span>
        </div>
      </section>
    </div>
  );
}
