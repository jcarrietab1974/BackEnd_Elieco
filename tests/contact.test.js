import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { startTestApp, VALID_BODY } from './helpers.js';
import { createMailService } from '../services/mailService.js';
import { loadConfig } from '../config/env.js';
import { BASE_ENV } from './helpers.js';

async function withApp(opts, fn) {
  const ctx = await startTestApp(opts);
  try {
    await fn(ctx);
  } finally {
    await ctx.close();
  }
}

describe('POST /api/contact - casos válidos', () => {
  test('1. solicitud válida con todos los campos → 200 y un correo enviado', () =>
    withApp({}, async ({ post, sent, config }) => {
      const res = await post(VALID_BODY);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { success: true, code: 'CONTACT_SENT', message: 'Mensaje enviado correctamente.' });
      assert.equal(sent.length, 1);
      const mail = sent[0];
      assert.deepEqual(mail.to, ['destino-empresa@example.com']);
      assert.equal(mail.from.address, config.mail.user); // remitente = cuenta autorizada
      assert.notEqual(mail.from.address, VALID_BODY.email); // nunca el visitante
      assert.deepEqual(mail.replyTo, { name: VALID_BODY.nombre, address: VALID_BODY.email });
      for (const piece of [VALID_BODY.nombre, VALID_BODY.email, VALID_BODY.telefono, 'más información']) {
        assert.ok(mail.html.includes(piece), `html debe incluir ${piece}`);
        assert.ok(mail.text.includes(piece), `text debe incluir ${piece}`);
      }
      assert.ok(mail.html.includes('https://wa.me/573001234567?text='), 'debe incluir botón de WhatsApp del visitante');
    }));

  test('6. teléfono omitido → 200 y el correo indica "No proporcionado"', () =>
    withApp({}, async ({ post, sent }) => {
      const { telefono, ...sinTelefono } = VALID_BODY;
      const res = await post(sinTelefono);
      assert.equal(res.status, 200);
      assert.ok(sent[0].text.includes('No proporcionado'));
      assert.ok(!sent[0].html.includes('wa.me'));
    }));

  test('6b. teléfono null o vacío también se acepta', () =>
    withApp({}, async ({ post }) => {
      assert.equal((await post({ ...VALID_BODY, telefono: null })).status, 200);
      assert.equal((await post({ ...VALID_BODY, telefono: '   ' })).status, 200);
    }));

  test('7. tildes, eñes, emojis y saltos de línea se conservan', () =>
    withApp({}, async ({ post, sent }) => {
      const mensaje = 'Hola, ¿cómo están?\nNecesito una camisa talla "M" – pañuelo & más 😊\n\nGracias.';
      const res = await post({ ...VALID_BODY, nombre: 'María José Peñaloza-Núñez', mensaje });
      assert.equal(res.status, 200);
      assert.ok(sent[0].text.includes(mensaje), 'texto plano idéntico al original');
      assert.ok(sent[0].html.includes('María José Peñaloza-Núñez'));
      assert.ok(sent[0].html.includes('Hola, ¿cómo están?<br>Necesito'));
      assert.ok(sent[0].html.includes('talla &quot;M&quot; – pañuelo &amp; más 😊'));
    }));

  test('mensaje con CRLF de Windows se normaliza a saltos simples', () =>
    withApp({}, async ({ post, sent }) => {
      await post({ ...VALID_BODY, mensaje: 'línea uno\r\nlínea dos' });
      assert.ok(sent[0].text.includes('línea uno\nlínea dos'));
    }));

  test('campos desconocidos (p. ej. "asunto" del backend antiguo) se ignoran', () =>
    withApp({}, async ({ post, sent }) => {
      const res = await post({ ...VALID_BODY, asunto: 'ASUNTO-IGNORADO', rol: 'ROL-IGNORADO' });
      assert.equal(res.status, 200);
      assert.ok(!sent[0].html.includes('ROL-IGNORADO') && !sent[0].subject.includes('ASUNTO-IGNORADO'));
    }));
});

describe('POST /api/contact - validaciones', () => {
  const casos = [
    ['2. sin nombre', { ...VALID_BODY, nombre: undefined }, 'MISSING_FIELDS', 'nombre'],
    ['3. sin correo', { ...VALID_BODY, email: undefined }, 'MISSING_FIELDS', 'email'],
    ['5. sin mensaje', { ...VALID_BODY, mensaje: '   ' }, 'MISSING_FIELDS', 'mensaje'],
    ['4. correo inválido', { ...VALID_BODY, email: 'no-es-un-correo' }, 'VALIDATION_ERROR', 'email'],
    ['correo con espacios/coma', { ...VALID_BODY, email: 'a@b.com, c@d.com' }, 'VALIDATION_ERROR', 'email'],
    ['teléfono con letras', { ...VALID_BODY, telefono: 'llámame' }, 'VALIDATION_ERROR', 'telefono'],
    ['teléfono muy corto', { ...VALID_BODY, telefono: '12345' }, 'VALIDATION_ERROR', 'telefono'],
    ['nombre demasiado largo', { ...VALID_BODY, nombre: 'a'.repeat(101) }, 'VALIDATION_ERROR', 'nombre'],
    ['mensaje demasiado largo', { ...VALID_BODY, mensaje: 'a'.repeat(2001) }, 'VALIDATION_ERROR', 'mensaje'],
    ['nombre con salto de línea (inyección de cabeceras)', { ...VALID_BODY, nombre: 'Ana\r\nBcc: victima@x.com' }, 'VALIDATION_ERROR', 'nombre'],
    ['nombre numérico (tipo inesperado)', { ...VALID_BODY, nombre: 123 }, 'VALIDATION_ERROR', 'nombre'],
    ['mensaje como objeto (tipo inesperado)', { ...VALID_BODY, mensaje: { $ne: 1 } }, 'VALIDATION_ERROR', 'mensaje'],
    ['email como arreglo (tipo inesperado)', { ...VALID_BODY, email: ['a@b.co', 'c@d.co'] }, 'VALIDATION_ERROR', 'email'],
  ];
  for (const [nombre, body, code, field] of casos) {
    test(`${nombre} → 400 ${code}`, () =>
      withApp({}, async ({ post, sent }) => {
        const res = await post(body);
        const json = await res.json();
        assert.equal(res.status, 400);
        assert.equal(json.success, false);
        assert.equal(json.code, code);
        assert.ok(json.errors.some((e) => e.field === field), `debe señalar el campo ${field}`);
        assert.equal(sent.length, 0, 'no se debe enviar correo');
      }));
  }

  test('cuerpo que es un arreglo → 400', () =>
    withApp({}, async ({ post }) => {
      const res = await post([1, 2, 3]);
      assert.equal(res.status, 400);
    }));

  test('JSON malformado → 400 INVALID_JSON en JSON (no HTML)', () =>
    withApp({}, async ({ post }) => {
      const res = await post('{"nombre":', { raw: true });
      assert.equal(res.status, 400);
      assert.match(res.headers.get('content-type'), /application\/json/);
      assert.equal((await res.json()).code, 'INVALID_JSON');
    }));

  test('Content-Type distinto de JSON → 415', () =>
    withApp({}, async ({ post }) => {
      const res = await post('nombre=a', { raw: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      assert.equal(res.status, 415);
      assert.equal((await res.json()).code, 'UNSUPPORTED_MEDIA_TYPE');
    }));

  test('ruta inexistente → 404 JSON', () =>
    withApp({}, async ({ url }) => {
      const res = await fetch(`${url}/api/otra-cosa`);
      assert.equal(res.status, 404);
      assert.equal((await res.json()).code, 'NOT_FOUND');
    }));
});

describe('Seguridad', () => {
  test('8. HTML en el mensaje/nombre queda escapado en el correo', () =>
    withApp({}, async ({ post, sent }) => {
      const xss = '<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:evil()">x</a>';
      const res = await post({ ...VALID_BODY, nombre: '<b>Hacker</b>', mensaje: xss });
      assert.equal(res.status, 200);
      const { html, text } = sent[0];
      assert.ok(!html.includes('<script>'));
      assert.ok(!html.includes('<img src=x'));
      assert.ok(!html.includes('<b>Hacker</b>'));
      assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert.ok(html.includes('&lt;b&gt;Hacker&lt;/b&gt;'));
      assert.ok(text.includes(xss), 'el texto plano conserva el contenido original (no se interpreta como HTML)');
    }));

  test('9. cuerpo excesivamente grande → 413 PAYLOAD_TOO_LARGE', () =>
    withApp({}, async ({ post, sent }) => {
      const res = await post({ ...VALID_BODY, mensaje: 'x'.repeat(50_000) });
      assert.equal(res.status, 413);
      assert.equal((await res.json()).code, 'PAYLOAD_TOO_LARGE');
      assert.equal(sent.length, 0);
    }));

  test('10. exceso de solicitudes → 429 TOO_MANY_REQUESTS', () =>
    withApp({ env: { RATE_LIMIT_MAX: '3' } }, async ({ post, sent }) => {
      for (let i = 0; i < 3; i++) assert.equal((await post(VALID_BODY)).status, 200);
      const res = await post(VALID_BODY);
      assert.equal(res.status, 429);
      const json = await res.json();
      assert.equal(json.code, 'TOO_MANY_REQUESTS');
      assert.ok(res.headers.get('ratelimit-limit'));
      assert.equal(sent.length, 3);
    }));

  test('campo trampa "website" relleno → 200 simulado y NO se envía correo', () =>
    withApp({}, async ({ post, sent }) => {
      const res = await post({ ...VALID_BODY, website: 'http://spam.example' });
      assert.equal(res.status, 200);
      assert.equal(sent.length, 0);
    }));

  test('campo trampa vacío (persona real) → se procesa normal', () =>
    withApp({}, async ({ post, sent }) => {
      assert.equal((await post({ ...VALID_BODY, website: '' })).status, 200);
      assert.equal(sent.length, 1);
    }));

  test('el asunto no puede inyectar cabeceras (nombre con CRLF rechazado antes de llegar a Nodemailer)', () =>
    withApp({}, async ({ post, sent }) => {
      await post({ ...VALID_BODY, nombre: 'Ana\nBcc: x@y.co' });
      assert.equal(sent.length, 0);
    }));

  test('15a. CORS: origen permitido recibe Access-Control-Allow-Origin', () =>
    withApp({}, async ({ post }) => {
      const res = await post(VALID_BODY, { headers: { Origin: 'http://localhost:5173' } });
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    }));

  test('15b. CORS: origen NO permitido no recibe la cabecera', () =>
    withApp({}, async ({ post }) => {
      const res = await post(VALID_BODY, { headers: { Origin: 'https://sitio-malicioso.example' } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    }));

  test('15c. CORS: preflight OPTIONS desde origen permitido → 204 con métodos y cabeceras', () =>
    withApp({}, async ({ url }) => {
      const res = await fetch(`${url}/api/contact`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.match(res.headers.get('access-control-allow-methods'), /POST/);
    }));

  test('15d. CORS: varios orígenes por variable de entorno', () =>
    withApp({ env: { FRONTEND_ORIGIN: 'https://tienda.example, https://www.tienda.example/' } }, async ({ post, config }) => {
      assert.deepEqual(config.allowedOrigins, ['https://tienda.example', 'https://www.tienda.example']);
      const res = await post(VALID_BODY, { headers: { Origin: 'https://www.tienda.example' } });
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://www.tienda.example');
    }));

  test('Helmet: cabeceras de seguridad presentes y sin X-Powered-By', () =>
    withApp({}, async ({ url }) => {
      const res = await fetch(`${url}/api/health`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-powered-by'), null);
    }));
});

describe('Errores del proveedor de correo y errores inesperados', () => {
  const smtpFail = (code, extra = {}) => ({
    sendMail: async () => {
      throw Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted para cuenta-emisora@example.com con clave-ficticia-1234'), { code, ...extra });
    },
  });

  test('11. error de autenticación SMTP (EAUTH) → 503 genérico, sin filtrar detalles', () =>
    withApp({ transporter: smtpFail('EAUTH', { responseCode: 535, command: 'AUTH PLAIN' }) }, async ({ post, logger }) => {
      const res = await post(VALID_BODY);
      const text = await res.text();
      assert.equal(res.status, 503);
      const json = JSON.parse(text);
      assert.equal(json.success, false);
      assert.equal(json.code, 'MAIL_SERVICE_ERROR');
      for (const secret of ['clave-ficticia-1234', 'cuenta-emisora', '535', 'AUTH', 'Invalid login']) {
        assert.ok(!text.includes(secret), `la respuesta no debe contener "${secret}"`);
      }
      const log = logger.lines.join('\n');
      assert.ok(log.includes('EAUTH'), 'el código sí queda en el log del servidor');
      assert.ok(!log.includes('clave-ficticia-1234'), 'la contraseña no debe aparecer en logs');
      assert.ok(!log.includes(VALID_BODY.email) && !log.includes(VALID_BODY.mensaje), 'datos del visitante no deben aparecer en logs');
    }));

  for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS']) {
    test(`12. error de conexión (${code}) → 503 y nunca "enviado correctamente"`, () =>
      withApp({ transporter: smtpFail(code) }, async ({ post }) => {
        const res = await post(VALID_BODY);
        const json = await res.json();
        assert.equal(res.status, 503);
        assert.equal(json.success, false);
        assert.equal(json.code, 'MAIL_SERVICE_ERROR');
      }));
  }

  test('13. error inesperado del servidor → 500 INTERNAL_ERROR sin detalles', () =>
    withApp(
      { mailService: { sendContactEmail: async () => { throw new TypeError('boom: ruta interna /srv/app/secret.js'); } } },
      async ({ post }) => {
        const res = await post(VALID_BODY);
        const text = await res.text();
        assert.equal(res.status, 500);
        assert.equal(JSON.parse(text).code, 'INTERNAL_ERROR');
        assert.ok(!text.includes('boom') && !text.includes('/srv/app'));
      }
    ));
});

describe('Construcción real del mensaje MIME (sin enviar)', () => {
  test('Nodemailer acepta las opciones y genera From/Reply-To/Subject/multipart correctos', async () => {
    const config = loadConfig({ ...BASE_ENV });
    const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const service = createMailService({ transporter, config });
    const info = await service.sendContactEmail({ ...VALID_BODY, nombre: 'María Peñaloza' });
    const raw = info.message.toString();
    assert.match(raw, /^From: "?ELIECO - Formulario web"? <cuenta-emisora@example\.com>/m);
    assert.match(raw, /^Reply-To: .*<usuario@example\.com>/m);
    assert.match(raw, /^To: destino-empresa@example\.com/m);
    assert.match(raw, /Content-Type: multipart\/alternative/);
    assert.match(raw, /Content-Type: text\/plain/);
    assert.match(raw, /Content-Type: text\/html/);
    assert.match(raw, /^Subject: =\?UTF-8\?/m); // asunto con tilde codificado correctamente
  });
});
