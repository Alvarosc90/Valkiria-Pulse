export const PULSE_LEGAL_VERSION = "1.0 · 02/10/2026";

export type LegalType = "privacy" | "terms" | "cookies" | "security" | "data";

export const LEGAL_PATHS: Record<LegalType, string> = {
  privacy: "/privacidad",
  terms: "/terminos",
  cookies: "/cookies",
  security: "/seguridad",
  data: "/datos"
};

export const LEGAL_BY_PATH = Object.fromEntries(
  Object.entries(LEGAL_PATHS).map(([type, path]) => [path, type])
) as Record<string, LegalType>;

const PRIVACY_EMAIL = "consultas@valkiria.tech";
const SUPPORT_EMAIL = "soporte@valkiria.tech";

export const LEGAL_DOCS: Record<LegalType, {
  kicker: string;
  title: string;
  intro: string;
  sections: Array<[string, string]>;
}> = {
  privacy: {
    kicker: "PRIVACIDAD",
    title: "Política de Privacidad",
    intro: "Explica qué información trata Valkiria PULSE, para qué la utiliza y cómo pueden ejercerse los derechos sobre datos personales.",
    sections: [
      ["1. Alcance y responsable", "Valkiria PULSE es un producto desarrollado por Valkiria Project. Para cuentas de plataforma, contratación, soporte y operación propia del servicio, el responsable es el titular informado en la documentación comercial y fiscal vigente de Valkiria Project. El canal de privacidad es " + PRIVACY_EMAIL + "."],
      ["2. Datos que podemos tratar", "Podemos tratar datos de identificación y contacto, datos de cuenta y autenticación, empresa y marca, calendarios editoriales, archivos y contenido cargado, historial de aprobación y publicación, registros técnicos de acceso, IP y dispositivo, consultas comerciales y datos mínimos de facturación cuando corresponda."],
      ["3. Datos de redes sociales", "Cuando una persona conecta Instagram, TikTok o LinkedIn, PULSE recibe identificadores de cuenta, datos de perfil permitidos por la autorización, tokens de acceso y la información necesaria para publicar, consultar estados o sincronizar métricas cuando exista permiso. Los tokens se almacenan cifrados y no se exponen al navegador ni a los agentes editoriales."],
      ["4. Inteligencia artificial", "El contenido que el usuario solicita generar puede ser procesado por el modelo de IA configurado para prestar esa función. PULSE limita el contexto enviado a la información necesaria para la tarea. No debe cargarse información sensible, secretos, contraseñas ni datos personales que no sean necesarios para crear contenido."],
      ["5. Finalidades", "Usamos la información para crear y administrar cuentas, prestar el servicio, mantener seguridad y auditoría, conectar redes sociales, planificar y publicar contenido, ofrecer soporte, gestionar pruebas y suscripciones, responder consultas comerciales y mejorar estabilidad y experiencia."],
      ["6. Proveedores y transferencias", "Podemos utilizar proveedores de infraestructura, correo, modelos de IA, almacenamiento, monitoreo y pagos cuando sean necesarios para prestar el servicio. Algunas operaciones pueden implicar transferencias internacionales de datos; en esos casos se aplican las medidas contractuales y legales correspondientes."],
      ["7. Conservación", "Conservamos la información mientras exista una cuenta o relación contractual y durante los plazos necesarios para cumplir obligaciones legales, resolver disputas, prevenir fraude, mantener respaldos razonables o atender auditorías. Cuando deja de ser necesaria, se elimina, anonimiza o bloquea según corresponda."],
      ["8. Derechos", "Las personas pueden solicitar información, acceso, rectificación, actualización o supresión de sus datos mediante " + PRIVACY_EMAIL + ". Cuando el dato pertenece a una organización cliente, PULSE puede coordinar la solicitud con ese tenant para que sea atendida por quien determine la finalidad del tratamiento."],
      ["9. Seguridad", "Aplicamos control de acceso por rol, aislamiento lógico por tenant, cifrado de credenciales sociales, rotación de sesiones, rate limiting, auditoría y prácticas de respaldo. Ningún sistema elimina todo riesgo; ante incidentes se aplicarán las medidas técnicas, contractuales y legales que correspondan."],
      ["10. Cambios", "Esta política puede actualizarse cuando cambien funciones, proveedores o requisitos legales. La versión vigente se identifica al comienzo de esta página."]
    ]
  },
  terms: {
    kicker: "CONDICIONES DEL SERVICIO",
    title: "Términos y Condiciones",
    intro: "Condiciones generales para usar Valkiria PULSE. Las condiciones comerciales particulares de cada contratación complementan este documento.",
    sections: [
      ["1. Servicio", "Valkiria PULSE ofrece herramientas SaaS para gestión de marcas, calendarios editoriales, generación asistida por IA, aprobación, biblioteca de medios, conexión con redes sociales, publicación, auditoría y métricas cuando los permisos de cada plataforma lo permiten."],
      ["2. Cuenta y seguridad", "Cada usuario debe utilizar credenciales propias, mantenerlas protegidas y respetar los permisos asignados. La organización cliente es responsable de administrar roles, revocar accesos que ya no correspondan y proteger sus cuentas de redes sociales."],
      ["3. Autorización de redes", "Para operar Instagram, TikTok o LinkedIn, el usuario debe autorizar su propia cuenta mediante los mecanismos de cada plataforma. PULSE no garantiza que una red mantenga sin cambios sus APIs, permisos, límites, políticas o procesos de revisión."],
      ["4. Contenido e IA", "La organización conserva la responsabilidad sobre el contenido que aprueba y publica. Las salidas generadas por IA son asistencia editorial y deben ser revisadas antes de su uso. El usuario debe verificar exactitud, derechos de terceros, publicidad, propiedad intelectual y cualquier obligación sectorial aplicable."],
      ["5. Uso permitido", "No se permite utilizar PULSE para vulnerar derechos de terceros, suplantar identidad, distribuir malware, obtener acceso no autorizado, evadir límites técnicos, publicar contenido ilegal o conectar cuentas sobre las que no se tenga autorización suficiente."],
      ["6. Prueba, planes y límites", "El registro inicial puede habilitar una prueba temporal del plan Inicial. Los límites, funciones, promociones, precios, impuestos y condiciones de pago vigentes se muestran o informan antes de contratar. Alcanzar un límite puede restringir nuevas operaciones sin eliminar el contenido ya almacenado."],
      ["7. Servicios de terceros", "Las redes sociales, proveedores de IA, almacenamiento, correo y pagos son servicios independientes y pueden sufrir cambios o interrupciones fuera del control de PULSE. El servicio no promete alcance, engagement, ventas ni aprobación de contenido por terceros."],
      ["8. Propiedad intelectual", "Cada cliente conserva los derechos que le correspondan sobre sus marcas, archivos y contenido. Valkiria Project conserva los derechos sobre PULSE, su software, diseño, documentación y componentes propios. El usuario garantiza contar con derechos suficientes sobre lo que carga o publica."],
      ["9. Disponibilidad y soporte", "Se aplican medidas razonables de operación y recuperación, pero pueden existir mantenimientos, fallas de proveedores o incidentes. Los canales de soporte y condiciones de nivel de servicio que correspondan se informan en la contratación."],
      ["10. Suspensión y terminación", "PULSE puede limitar o suspender accesos ante uso abusivo, riesgo de seguridad, incumplimiento contractual o falta de pago cuando corresponda. La baja, exportación o eliminación de datos se regirá por el plan contratado, la documentación comercial y las obligaciones legales aplicables."],
      ["11. Cambios", "Estas condiciones pueden actualizarse por cambios funcionales, regulatorios o de terceros. Los cambios materiales se comunicarán por medios razonables. La ley y jurisdicción aplicables se determinan por la documentación contractual y las normas imperativas que correspondan."]
    ]
  },
  cookies: {
    kicker: "COOKIES Y ALMACENAMIENTO",
    title: "Política de Cookies",
    intro: "Describe el uso de cookies y almacenamiento local en la landing y en la aplicación de Valkiria PULSE.",
    sections: [
      ["1. Cookies necesarias", "PULSE utiliza una cookie de sesión/refresh estrictamente necesaria para mantener una sesión autenticada de forma segura. Sin esta cookie, el acceso a la aplicación no puede funcionar correctamente."],
      ["2. Almacenamiento local", "La landing puede guardar en el navegador la elección de preferencias de cookies y otros estados estrictamente necesarios para recordar decisiones de interfaz."],
      ["3. Analítica opcional", "PULSE no necesita cookies publicitarias para funcionar. Si en el futuro se habilita una herramienta de analítica no esencial, se activará solamente de acuerdo con la preferencia registrada y se informará el proveedor correspondiente."],
      ["4. Publicidad", "No utilizamos la elección de cookies para publicidad personalizada ni vendemos información personal a anunciantes."],
      ["5. Cambiar preferencias", "Las preferencias pueden volver a abrirse desde el pie de la landing. Rechazar analítica opcional no impide utilizar las funciones esenciales de PULSE."]
    ]
  },
  security: {
    kicker: "SEGURIDAD",
    title: "Seguridad y confianza",
    intro: "Principios técnicos y operativos aplicados para reducir riesgos en Valkiria PULSE.",
    sections: [
      ["1. Separación por tenant", "La información operativa se asocia a un tenant y los endpoints autenticados validan el contexto de organización y rol antes de acceder a recursos."],
      ["2. Credenciales sociales", "Los tokens de redes sociales se guardan cifrados en el servidor. No se envían al navegador para operar publicaciones y no forman parte del contexto editorial de los agentes."],
      ["3. Autenticación", "PULSE utiliza sesiones de acceso de corta duración y sesiones de renovación revocables. Se aplican límites de intentos sobre login y endpoints públicos sensibles."],
      ["4. Auditoría y cambios", "Las operaciones críticas cuentan con trazabilidad y la arquitectura separa al agente que propone contenido del provider determinístico que ejecuta acciones contra una red."],
      ["5. Backups y continuidad", "Las migraciones administradas por Valky incluyen verificación previa y respaldo de base antes de cambios de esquema. La estrategia de producción deberá mantener copias periódicas, restauración probada y monitoreo."],
      ["6. Reporte de incidentes", "Las vulnerabilidades o incidentes pueden comunicarse a " + SUPPORT_EMAIL + ". No deben enviarse contraseñas, tokens ni secretos por correo."]
    ]
  },
  data: {
    kicker: "TRATAMIENTO DE DATOS",
    title: "Roles y tratamiento de datos",
    intro: "Aclara cómo se distribuyen responsabilidades cuando una organización utiliza PULSE para operar sus marcas y redes.",
    sections: [
      ["1. Datos propios de PULSE", "Valkiria Project determina las finalidades necesarias para administrar cuentas, contratación, seguridad, soporte, facturación, prevención de abuso y operación de la plataforma."],
      ["2. Datos del cliente", "La organización cliente decide qué marcas, usuarios, archivos, calendarios y contenido incorpora. Cuando PULSE procesa esa información para prestar el servicio, actúa de acuerdo con las instrucciones y permisos de la organización dentro de las funciones contratadas."],
      ["3. Redes sociales", "Instagram, TikTok y LinkedIn mantienen sus propias condiciones y políticas. La organización debe contar con autoridad suficiente para conectar cada cuenta y solicitar a PULSE que publique o consulte información permitida por la autorización."],
      ["4. Proveedores", "PULSE puede apoyarse en subencargados para infraestructura, IA, almacenamiento, correo, pagos o monitoreo. Se procura limitar cada tratamiento al propósito necesario y aplicar condiciones adecuadas de seguridad y confidencialidad."],
      ["5. Exportación y eliminación", "Las solicitudes de exportación, baja o eliminación se atienden considerando el rol de la organización, las obligaciones legales, las copias de seguridad y los plazos contractuales aplicables."],
      ["6. Solicitudes", "Las consultas sobre tratamiento de datos pueden enviarse a " + PRIVACY_EMAIL + ". Para información almacenada por una organización cliente, podremos coordinar la solicitud con esa organización."]
    ]
  }
};
