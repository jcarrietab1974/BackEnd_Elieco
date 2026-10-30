import { createApp } from '../app.js';
import { createMailService } from '../services/mailService.js';
import { loadConfig } from '../config/env.js';

export const BASE_ENV = {
  NODE_ENV: 'test',
  EMAIL_USER: 'cuenta-emisora@example.com',
  EMAIL_PASS: 'clave-ficticia-1234',
  EMAIL_TO: 'destino-empresa@example.com',
  FRONTEND_ORIGIN: 'http://localhost:5173',
};

export const VALID_BODY = Object.freeze({
  nombre: 'Usuario de prueba',
  email: 'usuario@example.com',
  telefono: '3001234567',
  mensaje: 'Deseo obtener más información sobre sus productos.',
});

// Logger que acumula lo registrado (para comprobar que no se filtran datos sensibles)
export function memoryLogger() {
  const lines = [];
  const push = (...a) => lines.push(a.join(' '));
  return { lines, info: push, warn: push, error: push };
}

// Levanta la app en un puerto libre, con un transporter simulado. Devuelve utilidades para probar.
export async function startTestApp({ env = {}, transporter, mailService } = {}) {
  const config = loadConfig({ ...BASE_ENV, ...env });
  const sent = [];
  const fakeTransporter = transporter ?? {
    sendMail: async (options) => {
      sent.push(options);
      return { messageId: '<test@local>' };
    },
  };
  const logger = memoryLogger();
  const app = createApp({
    config,
    mailService: mailService ?? createMailService({ transporter: fakeTransporter, config }),
    logger,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  const post = (body, { headers = {}, raw = false } = {}) =>
    fetch(`${url}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: raw ? body : JSON.stringify(body),
    });

  return { url, post, sent, logger, config, close: () => new Promise((r) => server.close(r)) };
}
