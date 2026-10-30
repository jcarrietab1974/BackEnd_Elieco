import dotenv from 'dotenv';
import { isValidEmail } from '../utils/validateContact.js';

// Carga backend/.env (si existe). En producción las variables suelen venir del panel del hosting.
dotenv.config();

export class ConfigError extends Error {
  constructor(problems) {
    super(
      'Configuración inválida del backend:\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\nRevise su archivo .env (use .env.example como plantilla).'
    );
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const toInt = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));

// Valida las variables de entorno y devuelve un objeto de configuración.
// Nunca incluye VALORES en los mensajes de error, solo los NOMBRES de las variables.
export function loadConfig(env = process.env) {
  const problems = [];
  const get = (name) => (env[name] ?? '').toString().trim();
  const required = (name) => {
    const value = get(name);
    if (!value) problems.push(`${name}: falta (obligatoria)`);
    return value;
  };

  const nodeEnv = get('NODE_ENV') || 'development';
  const isProduction = nodeEnv === 'production';

  // --- Servidor ---
  const port = toInt(get('PORT'), 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT: debe ser un entero entre 1 y 65535');

  const trustProxy = toInt(get('TRUST_PROXY'), 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) problems.push('TRUST_PROXY: debe ser un entero entre 0 y 5');

  // --- CORS ---
  const originsRaw = get('FRONTEND_ORIGIN') || (isProduction ? '' : 'http://localhost:5173');
  if (!originsRaw) problems.push('FRONTEND_ORIGIN: falta (obligatoria en producción)');
  const allowedOrigins = [];
  for (const item of originsRaw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)) {
    try {
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== item) throw new Error('formato');
      allowedOrigins.push(item);
    } catch {
      problems.push('FRONTEND_ORIGIN: cada origen debe tener el formato https://dominio[:puerto], sin ruta ni comodines');
      break;
    }
  }

  // --- Correo ---
  const emailUser = required('EMAIL_USER');
  if (emailUser && !isValidEmail(emailUser)) problems.push('EMAIL_USER: debe ser una dirección de correo válida');
  const emailPass = required('EMAIL_PASS').replace(/\s+/g, ''); // Google muestra la clave de aplicación en grupos de 4
  const emailTo = required('EMAIL_TO')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (emailTo.length && !emailTo.every(isValidEmail)) problems.push('EMAIL_TO: debe contener una o varias direcciones válidas separadas por coma');

  const smtpPort = toInt(get('SMTP_PORT'), 465);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) problems.push('SMTP_PORT: debe ser un entero entre 1 y 65535');
  const smtpSecureRaw = get('SMTP_SECURE').toLowerCase();
  if (smtpSecureRaw && !['true', 'false'].includes(smtpSecureRaw)) problems.push('SMTP_SECURE: debe ser true o false');

  // --- Antispam ---
  const rateLimitWindowMinutes = toInt(get('RATE_LIMIT_WINDOW_MINUTES'), 15);
  const rateLimitMax = toInt(get('RATE_LIMIT_MAX'), 5);
  if (!Number.isInteger(rateLimitWindowMinutes) || rateLimitWindowMinutes < 1) problems.push('RATE_LIMIT_WINDOW_MINUTES: debe ser un entero positivo');
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1) problems.push('RATE_LIMIT_MAX: debe ser un entero positivo');

  // --- Otros ---
  const timeZone = get('APP_TIMEZONE') || 'America/Bogota';
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone });
  } catch {
    problems.push('APP_TIMEZONE: zona horaria IANA no válida (ejemplo: America/Bogota)');
  }
  const defaultCountryCode = get('WHATSAPP_DEFAULT_COUNTRY_CODE') || '57';
  if (!/^\d{1,3}$/.test(defaultCountryCode)) problems.push('WHATSAPP_DEFAULT_COUNTRY_CODE: solo dígitos, sin + (ejemplo: 57)');

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    nodeEnv,
    isProduction,
    port,
    trustProxy,
    allowedOrigins,
    rateLimit: { windowMs: rateLimitWindowMinutes * 60 * 1000, max: rateLimitMax },
    mail: {
      user: emailUser,
      pass: emailPass,
      to: emailTo,
      fromName: get('EMAIL_FROM_NAME') || 'ELIECO - Formulario web',
      host: get('SMTP_HOST') || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpSecureRaw ? smtpSecureRaw === 'true' : smtpPort === 465,
    },
    timeZone,
    defaultCountryCode,
  });
}
