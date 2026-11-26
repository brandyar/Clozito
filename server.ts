import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './server/auth';
import { proxyRouter } from './server/proxy';
import { paymentRouter } from './server/payment';
import { woocommerceRouter } from './server/woocommerce';
import { SERVER_CONFIG } from './server/config';
import {
  createCorsMiddleware,
  securityHeadersMiddleware,
  apiErrorSanitizerMiddleware,
  globalApiErrorHandler,
} from './server/security';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = SERVER_CONFIG.port;
  const server = http.createServer(app);

  // Security fundamentals: hide framework signature & trust reverse-proxy headers (Coolify/Nginx/Cloud Run)
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Defense-in-depth HTTP security headers (HSTS, CSP, nosniff, Referrer-Policy, Permissions-Policy)
  app.use(securityHeadersMiddleware);

  // Strict origin-validated CORS (official production domains + Tauri native WebViews; no wildcard *)
  app.use(createCorsMiddleware());

  // Body parsers (preserve rawBody Buffer for Stripe webhook signature verification)
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Sanitize 5xx API error responses so internal details never leak in production
  app.use('/api', apiErrorSanitizerMiddleware);

  // API Routes (Mounted FIRST)
  app.use('/api/auth', authRouter);
  app.use('/api/payment', paymentRouter);
  app.use('/api/woocommerce', woocommerceRouter);
  app.use('/api', proxyRouter);

  // Centralized error handler for API JSON parse errors and unhandled exceptions
  app.use('/api', globalApiErrorHandler);

  // Vite middleware in dev or static serving in production
  if (!SERVER_CONFIG.isProduction) {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[Clozito BFF] Server running on http://0.0.0.0:${PORT} (env=${
        SERVER_CONFIG.isProduction ? 'production' : 'development'
      }, appUrl=${SERVER_CONFIG.appUrl})`
    );
  });
}

startServer().catch((err) => {
  console.error('[Clozito BFF] Failed to start server:', err);
});
