import type {
  AgentGenerationContext,
  BrandContext,
  CalendarEntry,
  SocialPlatform
} from "@pulse/contracts";

function brandBlock(brand: BrandContext) {
  return JSON.stringify({
    name: brand.name,
    description: brand.description ?? "",
    tone: brand.tone,
    products: brand.products,
    approvedClaims: brand.approvedClaims,
    forbiddenTerms: brand.forbiddenTerms,
    ctas: brand.ctas ?? []
  });
}

function recentBlock(context?: AgentGenerationContext) {
  const recent = context?.recentPosts?.slice(0, 12) ?? [];
  return recent.length
    ? recent.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "Sin publicaciones recientes.";
}

function performanceBlock(context?: AgentGenerationContext) {
  const signals = context?.performanceSignals?.slice(0, 10) ?? [];
  if (!signals.length) return "Sin señales de rendimiento disponibles.";

  return signals
    .map((signal) =>
      JSON.stringify({
        key: signal.key,
        value: signal.value,
        sampleSize: signal.sampleSize,
        metadata: signal.metadata ?? {}
      })
    )
    .join("\n");
}

export function platformSystemPrompt(platform: SocialPlatform) {
  const common = [
    "Sos un agente editorial especializado de Valkiria PULSE.",
    "Trabajas exclusivamente para una plataforma y no debes aplicar reglas de otras redes.",
    "Usa solamente hechos incluidos en Brand Brain o en la entrada editorial.",
    "No inventes funciones, cifras, clientes, premios, testimonios ni resultados.",
    "Evita frases genericas de IA, exageraciones y cualquier termino prohibido por la marca.",
    "No repitas hooks, aperturas o estructuras de las publicaciones recientes.",
    "Las señales de rendimiento son orientación editorial, no hechos para publicar.",
    "No menciones métricas internas, scores ni relaciones causales salvo que estén explícitamente aprobadas en Brand Brain o la entrada editorial.",
    "Ignora señales con muestra pequeña si entran en conflicto con Brand Brain, el objetivo o el contexto de plataforma.",
    "Devuelve exclusivamente un objeto JSON valido, sin markdown."
  ];

  if (platform === "instagram") {
    return [...common,
      "PLATAFORMA: Instagram.",
      "Prioriza una idea visual clara, caption escaneable, CTA natural y hashtags relevantes sin saturar.",
      "No redactes como LinkedIn ni como guion de TikTok.",
      "JSON: {caption:string, hashtags:string[], mediaBrief:string, cta?:string}."
    ].join("\n");
  }

  if (platform === "tiktok") {
    return [...common,
      "PLATAFORMA: TikTok.",
      "Prioriza hook inmediato, concepto audiovisual vertical, ritmo, guion breve y caption corto.",
      "El hook debe poder entenderse en los primeros segundos.",
      "No conviertas el resultado en un post corporativo de LinkedIn.",
      "JSON: {title:string, caption:string, hook:string, videoIdea:string, script:string, durationSec:number, hashtags:string[]}."
    ].join("\n");
  }

  return [...common,
    "PLATAFORMA: LinkedIn.",
    "Prioriza contexto profesional, problema real, aprendizaje/producto y una conclusion sobria.",
    "Evita lenguaje de TikTok y listas de hashtags excesivas.",
    "JSON: {caption:string, hashtags:string[], professionalAngle:string, cta?:string}."
  ].join("\n");
}

export function platformUserPrompt(
  entry: CalendarEntry,
  brand: BrandContext,
  context?: AgentGenerationContext
) {
  return [
    "BRAND_BRAIN:",
    brandBlock(brand),
    "",
    "ENTRADA_EDITORIAL:",
    JSON.stringify({
      topic: entry.topic,
      objective: entry.objective ?? "",
      angle: entry.angle ?? "",
      notes: entry.notes ?? "",
      scheduledAt: entry.scheduledAt,
      platformContext: entry.platformContext ?? {}
    }),
    "",
    "PUBLICACIONES_RECIENTES_A_EVITAR:",
    recentBlock(context),
    "",
    "SEÑALES_DE_RENDIMIENTO_SOLO_PARA_ORIENTACION_EDITORIAL:",
    performanceBlock(context),
    "",
    "Genera una pieza nueva, especifica para esta red y coherente con la marca."
  ].join("\n");
}
