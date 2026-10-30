// Utilidades para enlaces "Click to Chat" de WhatsApp (https://wa.me/NUMERO?text=MENSAJE).
// No requieren API, credenciales ni endpoints: es solo un enlace.

const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // máximo E.164

// Deja solo dígitos (sin +, espacios, guiones ni paréntesis). Devuelve null si no es plausible.
export function sanitizeWhatsAppNumber(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

// Construye https://wa.me/<numero>[?text=<mensaje codificado>]
export function buildWhatsAppLink(number, text) {
  const digits = sanitizeWhatsAppNumber(number);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

// Convierte un teléfono escrito por el visitante a formato internacional (solo dígitos),
// únicamente cuando se puede hacer sin adivinar:
//  - "+57 300 123 4567" o "0057 300..." -> ya trae el código de país
//  - "3001234567" (celular colombiano de 10 dígitos que empieza por 3) -> antepone 57
//  - "573001234567" -> ya trae 57
// En cualquier otro caso devuelve null (no se genera enlace en lugar de arriesgar un número equivocado).
export function toInternationalNumber(phone, defaultCountryCode = '57') {
  const raw = String(phone ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+')) return sanitizeWhatsAppNumber(digits);
  if (digits.startsWith('00')) return sanitizeWhatsAppNumber(digits.slice(2));

  if (defaultCountryCode === '57') {
    if (/^3\d{9}$/.test(digits)) return `57${digits}`;
    if (/^573\d{9}$/.test(digits)) return digits;
  }
  return null;
}
