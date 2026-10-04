import net from "node:net";
import tls from "node:tls";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const CRLF = "\r\n";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function envelopeAddress(value: string) {
  const match = /<([^<>]+)>/.exec(value);
  return (match?.[1] ?? value).trim();
}

function assertHeaderSafe(value: string, label: string) {
  if (/[\r\n]/.test(value)) throw new Error("Invalid " + label + " header");
  return value;
}

function encodeHeader(value: string) {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : "=?UTF-8?B?" + Buffer.from(value, "utf8").toString("base64") + "?=";
}

function mailConfigured() {
  return Boolean(config.SMTP_HOST && config.SMTP_FROM);
}

async function openSocket() {
  if (!config.SMTP_HOST) throw new Error("SMTP is not configured");

  const options = {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT
  };

  const socket = config.SMTP_SECURE
    ? tls.connect({
        ...options,
        servername: config.SMTP_HOST,
        rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED
      })
    : net.connect(options);

  await new Promise<void>((resolve, reject) => {
    const event = config.SMTP_SECURE ? "secureConnect" : "connect";
    socket.once(event, () => resolve());
    socket.once("error", reject);
    socket.setTimeout(config.SMTP_TIMEOUT_MS, () =>
      reject(new Error("SMTP connection timeout"))
    );
  });

  socket.setTimeout(0);
  return socket;
}

function readerFor(socket: net.Socket | tls.TLSSocket) {
  const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = rl[Symbol.asyncIterator]();

  async function nextLine() {
    return Promise.race([
      iterator.next().then((result) => {
        if (result.done) throw new Error("SMTP connection closed");
        return String(result.value);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SMTP response timeout")), config.SMTP_TIMEOUT_MS)
      )
    ]);
  }

  return {
    async response() {
      const lines: string[] = [];
      while (true) {
        const line = await nextLine();
        lines.push(line);
        const match = /^(\d{3})([ -])/.exec(line);
        if (match && match[2] === " ") {
          return { code: Number(match[1]), lines };
        }
      }
    },
    close() {
      rl.close();
    }
  };
}

function expect(
  response: { code: number; lines: string[] },
  codes: number[],
  stage: string
) {
  if (codes.includes(response.code)) return;
  throw new Error(
    "SMTP " + stage + " failed: " + response.lines.join(" | ").slice(0, 500)
  );
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}) {
  if (!mailConfigured()) {
    throw Object.assign(new Error("SMTP is not configured"), {
      code: "MAIL_NOT_CONFIGURED"
    });
  }

  let socket: net.Socket | tls.TLSSocket = await openSocket();
  let reader = readerFor(socket);

  const write = async (command: string, codes: number[], stage: string) => {
    socket.write(command + CRLF);
    const response = await reader.response();
    expect(response, codes, stage);
  };

  try {
    expect(await reader.response(), [220], "greeting");
    await write("EHLO " + config.SMTP_HELO_NAME, [250], "EHLO");

    if (!config.SMTP_SECURE && config.SMTP_STARTTLS) {
      await write("STARTTLS", [220], "STARTTLS");
      reader.close();

      socket = tls.connect({
        socket,
        servername: config.SMTP_HOST,
        rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED
      });

      await new Promise<void>((resolve, reject) => {
        socket.once("secureConnect", () => resolve());
        socket.once("error", reject);
        socket.setTimeout(config.SMTP_TIMEOUT_MS, () =>
          reject(new Error("SMTP TLS timeout"))
        );
      });
      socket.setTimeout(0);
      reader = readerFor(socket);
      await write("EHLO " + config.SMTP_HELO_NAME, [250], "EHLO after STARTTLS");
    }

    if (config.SMTP_USER) {
      await write("AUTH LOGIN", [334], "AUTH LOGIN");
      await write(
        Buffer.from(config.SMTP_USER, "utf8").toString("base64"),
        [334],
        "AUTH username"
      );
      await write(
        Buffer.from(config.SMTP_PASSWORD ?? "", "utf8").toString("base64"),
        [235],
        "AUTH password"
      );
    }

    const from = assertHeaderSafe(envelopeAddress(config.SMTP_FROM!), "from");
    const recipient = assertHeaderSafe(envelopeAddress(input.to), "to");

    await write("MAIL FROM:<" + from + ">", [250], "MAIL FROM");
    await write("RCPT TO:<" + recipient + ">", [250, 251], "RCPT TO");
    await write("DATA", [354], "DATA");

    const boundary = "pulse-" + randomUUID().replace(/-/g, "");
    const headers = [
      "From: " + assertHeaderSafe(config.SMTP_FROM!, "from"),
      "To: " + recipient,
      ...(input.replyTo
        ? ["Reply-To: " + assertHeaderSafe(input.replyTo, "reply-to")]
        : []),
      "Subject: " + encodeHeader(assertHeaderSafe(input.subject, "subject")),
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      "Message-ID: <" + randomUUID() + "@" + config.SMTP_HELO_NAME + ">",
      "Date: " + new Date().toUTCString()
    ];

    const body = [
      ...headers,
      "",
      "--" + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.text,
      "",
      "--" + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.html,
      "",
      "--" + boundary + "--",
      ""
    ].join(CRLF).replace(/^\./gm, "..");

    socket.write(body + CRLF + "." + CRLF);
    expect(await reader.response(), [250], "message body");
    await write("QUIT", [221], "QUIT").catch(() => undefined);
    return { ok: true };
  } finally {
    reader.close();
    socket.destroy();
  }
}

function publicUrl(path: string, token: string) {
  const base = String(config.PUBLIC_BASE_URL).replace(/\/$/, "");
  return base + path + "?token=" + encodeURIComponent(token);
}

function pulseEmailShell(input: {
  eyebrow: string;
  title: string;
  greeting: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footnote?: string;
}) {
  const action = input.actionLabel && input.actionUrl
    ? '<p style="margin:28px 0"><a href="' + escapeHtml(input.actionUrl) + '" style="display:inline-block;padding:13px 20px;background:#1478e8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">' + escapeHtml(input.actionLabel) + '</a></p>'
    : "";
  const fallback = input.actionUrl
    ? '<p style="margin:22px 0 0;color:#6c7f95;font-size:12px;line-height:1.6">Si el botón no funciona, copiá este enlace en tu navegador:<br><span style="word-break:break-all;color:#4e9fe8">' + escapeHtml(input.actionUrl) + '</span></p>'
    : "";

  return '<!doctype html><html><body style="margin:0;background:#050914;font-family:Arial,sans-serif;color:#eaf2fb">' +
    '<div style="padding:34px 16px"><div style="max-width:620px;margin:0 auto;border:1px solid #20334c;border-radius:18px;background:#08111e;overflow:hidden">' +
    '<div style="padding:24px 28px;border-bottom:1px solid #18293d;background:#0a1626"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;color:#5fcaf5">VALKIRIA PULSE</div><div style="margin-top:5px;font-size:11px;color:#637a94">Cada red. Su propio pulso.</div></div>' +
    '<div style="padding:30px 28px"><div style="font-size:10px;font-weight:800;letter-spacing:.14em;color:#5fcaf5">' + escapeHtml(input.eyebrow) + '</div>' +
    '<h1 style="margin:10px 0 18px;font-size:30px;line-height:1.1;color:#f4f8fd">' + escapeHtml(input.title) + '</h1>' +
    '<p style="margin:0 0 14px;color:#b7c6d7;line-height:1.7">Hola ' + escapeHtml(input.greeting) + '.</p>' +
    '<p style="margin:0;color:#8fa1b6;line-height:1.75">' + input.body + '</p>' +
    action + fallback +
    (input.footnote ? '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #17283c;color:#667b94;font-size:12px;line-height:1.6">' + input.footnote + '</p>' : '') +
    '</div></div></div></body></html>';
}

export function verificationEmail(input: {
  to: string;
  displayName: string;
  token: string;
}) {
  const url = publicUrl("/verificar-email", input.token);
  const safeName = escapeHtml(input.displayName);
  const safeUrl = escapeHtml(url);

  return sendMail({
    to: input.to,
    subject: "Verificá tu cuenta de Valkiria PULSE",
    text: [
      "Hola " + input.displayName + ".",
      "Verificá tu email para activar tu workspace de Valkiria PULSE:",
      url,
      "El enlace vence en 30 minutos.",
      "Si no creaste esta cuenta, ignorá este mensaje."
    ].join("\n\n"),
    html:
      '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#142033">' +
      "<h2>Verificá tu cuenta de Valkiria PULSE</h2>" +
      "<p>Hola " + safeName + ".</p>" +
      "<p>Confirmá tu email para activar el workspace.</p>" +
      '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;background:#0d72e8;color:#fff;text-decoration:none;border-radius:9px">Verificar email</a></p>' +
      '<p style="font-size:12px;word-break:break-all">' + safeUrl + "</p>" +
      "<p>El enlace vence en 30 minutos.</p>" +
      "</body></html>"
  });
}

export function passwordResetEmail(input: {
  to: string;
  displayName: string;
  token: string;
}) {
  const url = publicUrl("/recuperar", input.token);

  return sendMail({
    to: input.to,
    subject: "Recuperá tu acceso a Valkiria PULSE",
    text: [
      "Hola " + input.displayName + ".",
      "Recibimos una solicitud para restablecer tu contraseña de Valkiria PULSE.",
      "Abrí este enlace seguro:",
      url,
      "El enlace vence en 20 minutos y puede utilizarse una sola vez.",
      "Cuando cambies la contraseña, las sesiones anteriores quedarán revocadas.",
      "Si no solicitaste este cambio, ignorá el mensaje o escribí a " + config.PULSE_SUPPORT_EMAIL + "."
    ].join("\n\n"),
    html: pulseEmailShell({
      eyebrow: "RECUPERACIÓN SEGURA",
      title: "Creá una nueva contraseña",
      greeting: input.displayName,
      body:
        "Recibimos una solicitud para recuperar tu acceso. El enlace es privado, vence en <strong style=\"color:#dbe8f6\">20 minutos</strong> y sólo puede usarse una vez.",
      actionLabel: "Crear nueva contraseña",
      actionUrl: url,
      footnote:
        "Si no solicitaste este cambio, podés ignorar este mensaje. Ante cualquier duda escribinos a " +
        escapeHtml(config.PULSE_SUPPORT_EMAIL) + "."
    })
  });
}

export function passwordChangedEmail(input: {
  to: string;
  displayName: string;
}) {
  return sendMail({
    to: input.to,
    subject: "Tu contraseña de Valkiria PULSE fue actualizada",
    text: [
      "Hola " + input.displayName + ".",
      "La contraseña de tu cuenta fue actualizada correctamente.",
      "Todas las sesiones anteriores quedaron revocadas.",
      "Si no realizaste este cambio, contactá a " + config.PULSE_SUPPORT_EMAIL + " inmediatamente."
    ].join("\n\n"),
    html: pulseEmailShell({
      eyebrow: "SEGURIDAD",
      title: "Contraseña actualizada",
      greeting: input.displayName,
      body:
        "Tu nueva contraseña ya está activa. Para proteger tu cuenta, <strong style=\"color:#dbe8f6\">cerramos las sesiones anteriores</strong> y vas a tener que iniciar sesión nuevamente en tus dispositivos.",
      footnote:
        "¿No fuiste vos? Contactanos inmediatamente en " +
        escapeHtml(config.PULSE_SUPPORT_EMAIL) + "."
    })
  });
}

export function commercialLeadEmail(input: {
  name: string;
  company: string;
  email: string;
  phone?: string | null;
  currentSystem?: string | null;
  message?: string | null;
}) {
  return sendMail({
    to: config.PULSE_CONTACT_EMAIL,
    replyTo: input.email,
    subject: "Nueva consulta comercial PULSE · " + input.company.slice(0, 100),
    text: [
      "Nueva consulta desde Valkiria PULSE",
      "Nombre: " + input.name,
      "Empresa: " + input.company,
      "Email: " + input.email,
      "Teléfono: " + (input.phone || "—"),
      "Sistema actual: " + (input.currentSystem || "—"),
      "",
      input.message || ""
    ].join("\n"),
    html:
      '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#142033">' +
      "<h2>Nueva consulta comercial PULSE</h2>" +
      "<p><b>Nombre:</b> " + escapeHtml(input.name) + "</p>" +
      "<p><b>Empresa:</b> " + escapeHtml(input.company) + "</p>" +
      "<p><b>Email:</b> " + escapeHtml(input.email) + "</p>" +
      "<p><b>Teléfono:</b> " + escapeHtml(input.phone || "—") + "</p>" +
      "<p><b>Sistema actual:</b> " + escapeHtml(input.currentSystem || "—") + "</p>" +
      "<hr><p>" + escapeHtml(input.message || "").replace(/\n/g, "<br>") + "</p>" +
      "</body></html>"
  });
}

export function isMailConfigured() {
  return mailConfigured();
}
