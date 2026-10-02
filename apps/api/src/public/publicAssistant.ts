import { config } from "../config.js";

const PRODUCT_CONTEXT = [
  "Valkiria PULSE es una plataforma SaaS para planificar, crear, aprobar y publicar contenido en Instagram, TikTok y LinkedIn.",
  "PULSE usa un Brand Brain compartido para identidad, tono, productos, claims aprobados, términos prohibidos y CTAs.",
  "Instagram, TikTok y LinkedIn tienen agentes separados con memoria editorial y contexto de rendimiento independientes.",
  "Las redes se autorizan una vez por cuenta mediante OAuth; PULSE guarda las credenciales cifradas y reutiliza la conexión cuando la plataforma lo permite.",
  "PULSE puede importar calendarios editoriales desde Excel y también permite trabajar desde el calendario interno.",
  "La plataforma incluye aprobaciones, biblioteca de medios, auditoría, límites por plan y una base de Analytics unificado.",
  "Las métricas reales dependen de los permisos de insights aprobados por cada red.",
  "PULSE ofrece una prueba inicial de 14 días sobre el plan Inicial. Los precios comerciales definitivos se informan antes de contratar.",
  "El canal comercial es consultas@valkiria.tech y el canal de soporte es soporte@valkiria.tech.",
  "Valkiria PULSE es un desarrollo de Valkiria Project."
].join("\n");

function fallback(question: string) {
  const q = question.toLowerCase();

  if (/precio|plan|costo|cu[aá]nto/.test(q)) {
    return "PULSE tiene planes por capacidad y volumen. La prueba inicial del plan Inicial dura 14 días. Los precios comerciales definitivos se informan antes de contratar para evitar mostrar valores desactualizados.";
  }
  if (/instagram|tiktok|linkedin|conectar|oauth|cuenta/.test(q)) {
    return "Conectás cada red una sola vez autorizando tu propia cuenta. Después PULSE conserva la conexión cifrada y se encarga de reutilizarla y renovarla cuando la API de la plataforma lo permite.";
  }
  if (/excel|calendario|import/.test(q)) {
    return "Sí. Podés importar calendarios desde Excel para Instagram, TikTok y LinkedIn. PULSE convierte esas filas al calendario interno para que la ejecución no dependa del archivo original.";
  }
  if (/ia|agente|contexto|brand brain|memoria/.test(q)) {
    return "La diferencia central de PULSE es que comparte el Brand Brain de la marca, pero mantiene separados los agentes, la memoria editorial y las señales de rendimiento de Instagram, TikTok y LinkedIn.";
  }
  if (/analytics|m[eé]trica|rendimiento|insight/.test(q)) {
    return "PULSE ya tiene el modelo de Analytics unificado. Las métricas reales empiezan a sincronizarse cuando cada plataforma aprueba y habilita los permisos de insights correspondientes.";
  }
  if (/privacidad|datos|seguridad|token/.test(q)) {
    return "Las credenciales sociales se mantienen cifradas y no se exponen a los agentes. Desde la landing no accedo a datos privados de cuentas ni de clientes.";
  }
  if (/contact|demo|hablar|venta|comercial/.test(q)) {
    return "Podés dejar tus datos en el formulario de contacto de la landing o escribir a consultas@valkiria.tech. Así coordinamos una demo o una puesta en marcha.";
  }

  return "Puedo ayudarte con agentes por red, calendarios, conexión de cuentas, publicación, Analytics, planes, privacidad y puesta en marcha de Valkiria PULSE.";
}

export async function askPublicPulse(question: string) {
  const clean = String(question ?? "").trim().slice(0, 700);
  if (!clean) return fallback("");

  if (!config.PULSE_LLM_BASE_URL || !config.PULSE_LLM_MODEL) {
    return fallback(clean);
  }

  const base = config.PULSE_LLM_BASE_URL.replace(/\/$/, "");
  const endpoint = base.endsWith("/v1")
    ? base + "/chat/completions"
    : base + "/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (config.PULSE_LLM_API_KEY) {
    headers.Authorization = "Bearer " + config.PULSE_LLM_API_KEY;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(Math.min(config.PULSE_LLM_TIMEOUT_MS, 20000)),
      body: JSON.stringify({
        model: config.PULSE_LLM_MODEL,
        temperature: 0.25,
        max_tokens: 360,
        messages: [
          {
            role: "system",
            content: [
              "Sos PULSE IA, asistente público de producto de Valkiria PULSE.",
              "Respondé en español rioplatense claro, breve y profesional.",
              "Usá solamente el contexto de producto provisto.",
              "No inventes precios, permisos aprobados, integraciones, métricas, clientes ni garantías.",
              "No pidas contraseñas, tokens, secretos ni datos sensibles.",
              "No afirmes tener acceso a cuentas privadas desde la landing.",
              "Si la consulta requiere soporte de una cuenta, indicá soporte@valkiria.tech.",
              "",
              PRODUCT_CONTEXT
            ].join("\n")
          },
          { role: "user", content: clean }
        ]
      })
    });

    const payload = await response.json() as any;
    const answer = payload?.choices?.[0]?.message?.content;
    if (!response.ok || typeof answer !== "string" || !answer.trim()) {
      return fallback(clean);
    }

    return answer.trim().slice(0, 1800);
  } catch {
    return fallback(clean);
  }
}
