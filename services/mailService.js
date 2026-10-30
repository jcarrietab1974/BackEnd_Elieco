import { escapeHtml, escapeHtmlWithBreaks } from '../utils/html.js';
import { buildWhatsAppLink, toInternationalNumber } from '../utils/whatsapp.js';

const BRAND = 'ELIECO';
const BRAND_COLOR = '#0f3320';

// Error propio para fallos del proveedor de correo (conexión, autenticación, envío rechazado).
// Permite a la ruta distinguirlos de errores inesperados del código.
export class MailDeliveryError extends Error {
  constructor(cause) {
    super('Fallo en el envío del correo');
    this.name = 'MailDeliveryError';
    this.smtpCode = cause?.code;
    this.responseCode = cause?.responseCode;
    this.command = cause?.command;
  }
}

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(date);
}

// Construye asunto, HTML y texto plano. Función pura (fácil de probar).
// TODO el contenido del visitante pasa por escapeHtml antes de entrar al HTML.
export function buildContactEmail(contact, { receivedAt = new Date(), timeZone = 'America/Bogota', defaultCountryCode = '57' } = {}) {
  const { nombre, email, telefono, mensaje } = contact;
  const fecha = formatDate(receivedAt, timeZone);

  const waNumber = telefono ? toInternationalNumber(telefono, defaultCountryCode) : null;
  const waLink = waNumber
    ? buildWhatsAppLink(waNumber, `Hola ${nombre}, te escribimos de ${BRAND} sobre el mensaje que nos dejaste en nuestra página web.`)
    : null;

  const row = (label, valueHtml) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e5e5;">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#777777;">${label}</div>
            <div style="font-size:15px;color:#1a1a1a;margin-top:4px;">${valueHtml}</div>
          </td>
        </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nuevo mensaje de contacto</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden;">
        <tr><td style="background:${BRAND_COLOR};padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold;">Nuevo mensaje desde la web · ${BRAND}</td></tr>
        <tr><td style="padding:8px 24px 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row('Nombre completo', escapeHtml(nombre))}${row(
            'Correo electrónico',
            `<a href="mailto:${escapeHtml(email)}" style="color:${BRAND_COLOR};">${escapeHtml(email)}</a>`
          )}${row('Celular / teléfono', telefono ? escapeHtml(telefono) : '<span style="color:#999999;">No proporcionado</span>')}${row(
            'Mensaje',
            `<div style="line-height:1.5;">${escapeHtmlWithBreaks(mensaje)}</div>`
          )}${row('Recibido', escapeHtml(fecha))}
          </table>
          ${
            waLink
              ? `<p style="margin:24px 0 0 0;"><a href="${escapeHtml(waLink)}" style="display:inline-block;background:#25d366;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:4px;font-size:14px;font-weight:bold;">Responder por WhatsApp</a></p>`
              : ''
          }
          <p style="margin:20px 0 0 0;font-size:12px;color:#888888;">Puede responder directamente a este correo: la respuesta llegará al visitante.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `NUEVO MENSAJE DESDE LA WEB - ${BRAND}`,
    '',
    `Nombre: ${nombre}`,
    `Correo: ${email}`,
    `Teléfono: ${telefono || 'No proporcionado'}`,
    `Recibido: ${fecha}`,
    '',
    'Mensaje:',
    mensaje,
    ...(waLink ? ['', `Responder por WhatsApp: ${waLink}`] : []),
    '',
    'Puede responder directamente a este correo: la respuesta llegará al visitante.',
  ].join('\n');

  return { subject: `Nuevo mensaje desde la web - ${nombre}`, html, text };
}

// Servicio de envío. Recibe el transporter y la configuración (inyección de dependencias → fácil de probar).
export function createMailService({ transporter, config }) {
  return {
    async sendContactEmail(contact, receivedAt = new Date()) {
      const { subject, html, text } = buildContactEmail(contact, {
        receivedAt,
        timeZone: config.timeZone,
        defaultCountryCode: config.defaultCountryCode,
      });

      try {
        return await transporter.sendMail({
          // El remitente SIEMPRE es la cuenta autorizada, nunca el correo del visitante.
          from: { name: config.mail.fromName, address: config.mail.user },
          to: config.mail.to,
          // El visitante va en replyTo: al pulsar "Responder" se escribe al visitante.
          replyTo: { name: contact.nombre, address: contact.email },
          subject,
          html,
          text,
        });
      } catch (error) {
        throw new MailDeliveryError(error);
      }
    },
  };
}
