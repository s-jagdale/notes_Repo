import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth.js';
import { notesRouter } from './routes/notes.js';
import { adminRouter } from './routes/admin.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { isDbConnected } from './db.js';

// The app is built by a function so tests can plug in their own settings.
export function createApp({ config, storage, quiet = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '100kb' }));
  if (!quiet) app.use(morgan('dev'));

  // Health check: shows whether MongoDB and S3 are both reachable.
  app.get('/api/health', async (_req, res) => {
    const result = { status: 'ok', time: new Date().toISOString(), mongodb: { ok: isDbConnected() }, s3: { ok: false, bucket: config.aws.bucket, region: config.aws.region } };
    try {
      await Promise.race([
        storage.checkBucket(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('S3 check timed out')), 6000))
      ]);
      result.s3.ok = true;
    } catch (err) {
      result.s3.error = err.message;
    }
    if (!result.mongodb.ok || !result.s3.ok) result.status = 'degraded';
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  });

  app.use('/api/auth', authRouter(config));
  app.use('/api/notes', notesRouter({ config, storage }));
  app.use('/api/admin', adminRouter({ config, storage }));

  app.use(notFound);
  app.use(errorHandler(config.maxFileMb));
  return app;
}
