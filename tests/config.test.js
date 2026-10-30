import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../config/env.js';
import { BASE_ENV } from './helpers.js';
import { buildWhatsAppLink, sanitizeWhatsAppNumber, toInternationalNumber } from '../utils/whatsapp.js';
import { escapeHtml } from '../utils/html.js';

describe('Configuración (config/env.js)', () => {
  test('configuración mínima válida', () => {
    const c = loadConfig({ ...BASE_ENV });
    assert.equal(c.port, 5000);
    assert.equal(c.rateLimit.max, 5);
    assert.deepEqual(c.mail.to, ['destino-empresa@example.com']);
  });

  test('faltan variables obligatorias → lista los NOMBRES sin revelar valores', () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: 'test', EMAIL_USER: 'cuenta-emisora@example.com' }),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes('EMAIL_PASS'));
        assert.ok(err.message.includes('EMAIL_TO'));
        assert.ok(!err.message.includes('cuenta-emisora@example.com'), 'no debe imprimir valores');
        return true;
      }
    );
  });

  test('una contraseña inválida/valores raros no se imprimen en el error', () => {
    assert.throws(
      () => loadConfig({ ...BASE_ENV, EMAIL_TO: 'esto-no-es-correo-SECRETO', SMTP_PORT: 'abc' }),
      (err) => {
        assert.ok(err.message.includes('EMAIL_TO') && err.message.includes('SMTP_PORT'));
        assert.ok(!err.message.includes('SECRETO'));
        return true;
      }
    );
  });

  test('en producción FRONTEND_ORIGIN es obligatorio', () => {
    assert.throws(() => loadConfig({ ...BASE_ENV, NODE_ENV: 'production', FRONTEND_ORIGIN: '' }), /FRONTEND_ORIGIN/);
  });

  test('FRONTEND_ORIGIN rechaza "*", rutas y esquemas no http(s)', () => {
    for (const bad of ['*', 'https://sitio.example/ruta', 'ftp://sitio.example', 'sitio.example']) {
      assert.throws(() => loadConfig({ ...BASE_ENV, FRONTEND_ORIGIN: bad }), /FRONTEND_ORIGIN/, bad);
    }
  });

  test('la clave de aplicación de Google con espacios se normaliza', () => {
    assert.equal(loadConfig({ ...BASE_ENV, EMAIL_PASS: 'abcd efgh ijkl mnop' }).mail.pass, 'abcdefghijklmnop');
  });

  test('SMTP_SECURE por defecto según el puerto', () => {
    assert.equal(loadConfig({ ...BASE_ENV }).mail.secure, true);
    assert.equal(loadConfig({ ...BASE_ENV, SMTP_PORT: '587' }).mail.secure, false);
  });
});

describe('14. Enlace de WhatsApp (Click to Chat)', () => {
  test('número de empresa con separadores → solo dígitos', () => {
    assert.equal(sanitizeWhatsAppNumber('+57 300 123 45 67'), '573001234567');
    assert.equal(buildWhatsAppLink('+57 (300) 123-4567'), 'https://wa.me/573001234567');
  });

  test('mensaje predefinido codificado con encodeURIComponent', () => {
    const link = buildWhatsAppLink('573001234567', 'Hola, quiero info de la tienda & envíos?');
    assert.equal(link, 'https://wa.me/573001234567?text=Hola%2C%20quiero%20info%20de%20la%20tienda%20%26%20env%C3%ADos%3F');
    assert.equal(new URL(link).searchParams.get('text'), 'Hola, quiero info de la tienda & envíos?');
  });

  test('número inválido → null (no se genera enlace)', () => {
    assert.equal(buildWhatsAppLink('abc'), null);
    assert.equal(buildWhatsAppLink('123'), null);
    assert.equal(buildWhatsAppLink('1'.repeat(16)), null);
  });

  test('teléfono del visitante → formato internacional solo si no hay que adivinar', () => {
    assert.equal(toInternationalNumber('300 123 4567'), '573001234567');
    assert.equal(toInternationalNumber('+57 300 123 4567'), '573001234567');
    assert.equal(toInternationalNumber('0057 3001234567'), '573001234567');
    assert.equal(toInternationalNumber('+1 (415) 555-0100'), '14155550100');
    assert.equal(toInternationalNumber('6011234567'), null); // fijo sin código: no se adivina
    assert.equal(toInternationalNumber(''), null);
  });
});

test('escapeHtml escapa los 5 caracteres peligrosos y respeta tildes', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&ñá</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;ñá&lt;/a&gt;');
});
