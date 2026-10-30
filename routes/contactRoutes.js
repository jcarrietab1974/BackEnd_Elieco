import express from 'express';
import { validateContact } from '../utils/validateContact.js';
import { MailDeliveryError } from '../services/mailService.js';
import { ok, fail } from '../utils/respond.js';

// Campo trampa anti-bots: el futuro formulario incluirá un input oculto llamado "website".
// Las personas no lo ven ni lo rellenan; muchos bots sí. Si llega con contenido se descarta en silencio.
const HONEYPOT_FIELD = 'website';

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type debe ser application/json.');
  }
  return next();
}

export function createContactRouter({ mailService, logger = console }) {
  const router = express.Router();

  // POST /api/contact
  router.post('/', requireJson, async (req, res, next) => {
    const body = req.body;

    // 1) Antispam: campo trampa
    if (body && typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== '') {
      logger.warn('[CONTACT] Solicitud descartada por campo trampa.');
      return ok(res, 'CONTACT_SENT', 'Mensaje enviado correctamente.'); // respuesta idéntica para no dar pistas al bot
    }

    // 2) Validación y normalización en el servidor
    const { valid, errors, data } = validateContact(body);
    if (!valid) {
      const hasMissing = errors.some((e) => e.required);
      return fail(
        res,
        400,
        hasMissing ? 'MISSING_FIELDS' : 'VALIDATION_ERROR',
        hasMissing ? 'Faltan campos obligatorios.' : 'Los datos enviados no son válidos.',
        errors.map(({ field, message }) => ({ field, message }))
      );
    }

    // 3) Envío
    try {
      const info = await mailService.sendContactEmail(data);
      logger.info(`[CONTACT] Correo enviado (messageId=${info?.messageId ?? 'n/d'}).`);
      return ok(res, 'CONTACT_SENT', 'Mensaje enviado correctamente.');
    } catch (error) {
      if (error instanceof MailDeliveryError) {
        // Detalle técnico solo en el log del servidor (sin datos del visitante). Al cliente, mensaje genérico.
        logger.error(`[CONTACT] Fallo SMTP (code=${error.smtpCode ?? 'n/d'}, responseCode=${error.responseCode ?? 'n/d'}, command=${error.command ?? 'n/d'}).`);
        return fail(res, 503, 'MAIL_SERVICE_ERROR', 'No pudimos enviar tu mensaje en este momento. Intenta nuevamente en unos minutos.');
      }
      return next(error); // error inesperado → 500 genérico
    }
  });

  return router;
}
