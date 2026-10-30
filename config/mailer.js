import nodemailer from 'nodemailer';

// Crea el transporte SMTP a partir de la configuración ya validada (config/env.js).
// Gmail: puerto 465 con SSL (secure: true) y contraseña de APLICACIÓN (no la contraseña normal de la cuenta).
export function createTransporter(mail) {
  return nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: { user: mail.user, pass: mail.pass },
    // Tiempos de espera: evitan que una petición HTTP quede colgada si el proveedor no responde.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

// Comprueba conexión y credenciales SMTP. No lanza excepciones: solo informa en el log.
// Solo registra el código del error (nunca credenciales ni la respuesta completa del proveedor).
export async function verifyTransporter(transporter, logger = console) {
  try {
    await transporter.verify();
    logger.info('[MAILER] Servidor de correo listo para enviar mensajes.');
    return true;
  } catch (error) {
    logger.error(`[MAILER] No se pudo verificar el servidor de correo (code=${error.code ?? 'desconocido'}, responseCode=${error.responseCode ?? '-'}). Revise EMAIL_USER, EMAIL_PASS y la conexión.`);
    return false;
  }
}
