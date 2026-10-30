import { loadConfig, ConfigError } from './config/env.js';
import { createTransporter, verifyTransporter } from './config/mailer.js';
import { createMailService } from './services/mailService.js';
import { createApp } from './app.js';

// 1) Validar configuración: si falta algo, se informa QUÉ variables faltan (sin mostrar valores) y se aborta.
let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// 2) Dependencias
const transporter = createTransporter(config.mail);
const mailService = createMailService({ transporter, config });
const app = createApp({ config, mailService });

// 3) Arranque
const server = app.listen(config.port, () => {
  console.log(`Servidor escuchando en el puerto ${config.port} (${config.nodeEnv}).`);
  console.log(`Orígenes CORS permitidos: ${config.allowedOrigins.join(', ')}`);
  verifyTransporter(transporter); // informativo; no bloquea el arranque
});

// 4) Cierre ordenado (Ctrl+C o despliegue)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`${signal} recibido: cerrando servidor...`);
    server.close(() => process.exit(0));
  });
}
