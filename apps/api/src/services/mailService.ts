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
  const safeName = escapeHtml(input.displayName);
  const safeUrl = escapeHtml(url);

  return sendMail({
    to: input.to,
    subject: "Recuperá tu contraseña de Valkiria PULSE",
    text: [
      "Hola " + input.displayName + ".",
      "Recibimos una solicitud para restablecer tu contraseña:",
      url,
      "El enlace vence en 20 minutos y puede utilizarse una sola vez.",
      "Si no solicitaste el cambio, ignorá este mensaje."
    ].join("\n\n"),
    html:
      '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#142033">' +
      "<h2>Recuperá tu contraseña</h2>" +
      "<p>Hola " + safeName + ".</p>" +
      '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;background:#0d72e8;color:#fff;text-decoration:none;border-radius:9px">Crear nueva contraseña</a></p>' +
      '<p style="font-size:12px;word-break:break-all">' + safeUrl + "</p>" +
      "<p>El enlace vence en 20 minutos y puede utilizarse una sola vez.</p>" +
      "</body></html>"
  });
}

export function passwordChangedEmail(input: {
  to: string;
  displayName: string;
}) {
  return sendMail({
    to: input.to,
    subject: "Tu contraseña de Valkiria PULSE fue actualizada",
    text:
      "Hola " + input.displayName +
      ". La contraseña de tu cuenta fue actualizada. Si no realizaste este cambio, contactá a " +
      config.PULSE_SUPPORT_EMAIL + " inmediatamente.",
    html:
      '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#142033">' +
      "<h2>Contraseña actualizada</h2>" +
      "<p>Hola " + escapeHtml(input.displayName) + ".</p>" +
      "<p>La contraseña de tu cuenta fue actualizada correctamente.</p>" +
      "<p>Si no realizaste este cambio, contactá a " +
      escapeHtml(config.PULSE_SUPPORT_EMAIL) +
      " inmediatamente.</p></body></html>"
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
