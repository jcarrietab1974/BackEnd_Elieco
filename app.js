import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createContactRouter } from './routes/contactRoutes.js';
import { notFoundHandler, createErrorHandler } from './middleware/errorHandler.js';
import { fail } from './utils/respond.js';

// Construye la aplicación Express sin arrancar el servidor (así se puede probar sin red ni puertos fijos).
export function createApp({ config, mailService, logger = console }) {
  const app = express();

  // Detrás de un proxy (Render, Railway, Nginx...) la IP real viene en X-Forwarded-For.
  // TRUST_PROXY = número de proxies de confianza delante de la app (0 = ninguno).
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());

  app.use(
    cors({
      // Solo los orígenes declarados en FRONTEND_ORIGIN. Las peticiones sin cabecera Origin
      // (curl, Postman, servidor a servidor) no son de navegador y CORS no aplica.
      origin(origin, callback) {
        callback(null, !origin || config.allowedOrigins.includes(origin));
      },
      methods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    })
  );

  app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

  // Límite de solicitudes por IP (antes de leer el cuerpo, para que los abusos cuesten poco).
  app.use(
    '/api/contact',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) =>
        fail(res, 429, 'TOO_MANY_REQUESTS', 'Has enviado demasiadas solicitudes. Intenta nuevamente más tarde.'),
    })
  );

  // Tamaño máximo del cuerpo: el mensaje máximo son 2000 caracteres; 10 kb sobra.
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/contact', createContactRouter({ mailService, logger }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, isProduction: config.isProduction }));

  return app;
}
