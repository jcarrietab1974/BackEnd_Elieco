import { fail } from '../utils/respond.js';

export function notFoundHandler(req, res) {
  return fail(res, 404, 'NOT_FOUND', 'Ruta no encontrada.');
}

// Manejador central de errores: siempre responde JSON y nunca expone detalles internos.
export function createErrorHandler({ logger = console, isProduction = false } = {}) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    switch (err?.type) {
      case 'entity.too.large':
        return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
      case 'entity.parse.failed':
        return fail(res, 400, 'INVALID_JSON', 'El cuerpo de la solicitud no es un JSON válido.');
      case 'encoding.unsupported':
      case 'charset.unsupported':
        return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Codificación no soportada. Use UTF-8.');
      default:
        break;
    }

    // Se registra solo lo necesario para depurar (sin cuerpo de la solicitud ni datos personales).
    logger.error(`[ERROR] ${err?.name ?? 'Error'}: ${err?.message ?? 'sin mensaje'}`);
    if (!isProduction && err?.stack) logger.error(err.stack);
    return fail(res, 500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado. Intente nuevamente más tarde.');
  };
}
