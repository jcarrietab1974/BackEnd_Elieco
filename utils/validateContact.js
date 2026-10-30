// Validación y normalización del formulario de contacto.
// Contrato: { nombre, email, telefono?, mensaje }  (+ campo trampa opcional "website", ver contactRoutes.js)
// Cada error: { field, message, required? }  (required = campo obligatorio ausente o vacío)

export const LIMITS = Object.freeze({
  nombre: { min: 2, max: 100 },
  email: { max: 254 },
  telefono: { max: 20, minDigits: 7, maxDigits: 15 },
  mensaje: { min: 5, max: 2000 },
});

// Email práctico (ASCII). No admite espacios, comillas, comas ni saltos de línea.
const EMAIL_REGEX =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const PHONE_REGEX = /^\+?[\d\s().-]+$/;

// Caracteres de control (excepto \t \n \r) y caracteres invisibles de dirección/ancho cero.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function isValidEmail(value) {
  return (
    typeof value === 'string' &&
    value.length <= LIMITS.email.max &&
    value.indexOf('..') === -1 &&
    EMAIL_REGEX.test(value)
  );
}

function clean(value) {
  return value.normalize('NFC').replace(INVISIBLE_CHARS, '').replace(CONTROL_CHARS, '');
}

export function validateContact(body) {
  const errors = [];
  const data = {};

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: [{ field: 'body', message: 'El cuerpo debe ser un objeto JSON.' }], data };
  }

  // --- Tipos: todos los campos presentes deben ser texto (telefono puede ser null/omitido) ---
  for (const field of ['nombre', 'email', 'mensaje']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      errors.push({ field, message: 'Debe ser un texto.' });
    }
  }
  if (body.telefono !== undefined && body.telefono !== null && typeof body.telefono !== 'string') {
    errors.push({ field: 'telefono', message: 'Debe ser un texto.' });
  }
  if (errors.length) return { valid: false, errors, data };

  // --- nombre ---
  const nombreRaw = clean(body.nombre ?? '');
  if (/[\r\n]/.test(nombreRaw)) {
    errors.push({ field: 'nombre', message: 'No puede contener saltos de línea.' });
  } else {
    const nombre = nombreRaw.replace(/\s+/g, ' ').trim();
    if (!nombre) errors.push({ field: 'nombre', message: 'El nombre es obligatorio.', required: true });
    else if (nombre.length < LIMITS.nombre.min) errors.push({ field: 'nombre', message: `Debe tener al menos ${LIMITS.nombre.min} caracteres.` });
    else if (nombre.length > LIMITS.nombre.max) errors.push({ field: 'nombre', message: `Debe tener máximo ${LIMITS.nombre.max} caracteres.` });
    else data.nombre = nombre;
  }

  // --- email ---
  const email = clean(body.email ?? '').trim();
  if (!email) errors.push({ field: 'email', message: 'El correo electrónico es obligatorio.', required: true });
  else if (!isValidEmail(email)) errors.push({ field: 'email', message: 'El correo electrónico no tiene un formato válido.' });
  else data.email = email;

  // --- telefono (opcional) ---
  const telefonoRaw = clean(body.telefono ?? '').trim();
  if (telefonoRaw) {
    const digits = telefonoRaw.replace(/\D/g, '');
    if (
      telefonoRaw.length > LIMITS.telefono.max ||
      !PHONE_REGEX.test(telefonoRaw) ||
      digits.length < LIMITS.telefono.minDigits ||
      digits.length > LIMITS.telefono.maxDigits
    ) {
      errors.push({ field: 'telefono', message: 'El teléfono no es válido. Use entre 7 y 15 dígitos; puede incluir +, espacios, guiones o paréntesis.' });
    } else {
      data.telefono = telefonoRaw;
    }
  }

  // --- mensaje (conserva saltos de línea y tildes; no altera el contenido legítimo) ---
  const mensaje = clean(body.mensaje ?? '').replace(/\r\n?/g, '\n').trim();
  if (!mensaje) errors.push({ field: 'mensaje', message: 'El mensaje es obligatorio.', required: true });
  else if (mensaje.length < LIMITS.mensaje.min) errors.push({ field: 'mensaje', message: `Debe tener al menos ${LIMITS.mensaje.min} caracteres.` });
  else if (mensaje.length > LIMITS.mensaje.max) errors.push({ field: 'mensaje', message: `Debe tener máximo ${LIMITS.mensaje.max} caracteres.` });
  else data.mensaje = mensaje;

  return { valid: errors.length === 0, errors, data };
}
