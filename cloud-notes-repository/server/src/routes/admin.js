import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { buildReport, importMissing, removeBrokenRecords } from '../services/s3Sync.js';

export function adminRouter({ config, storage }) {
  const router = Router();
  router.use(requireAuth(config), requireAdmin);

  // Compare bucket and database: what is in S3 but not in MongoDB, and the other way round.
  router.get('/s3-report', asyncHandler(async (_req, res) => {
    const r = await buildReport(storage);
    res.json({ ...r, inS3NotInDb: r.inS3NotInDb.map((o) => ({ key: o.key, size: o.size })) });
  }));

  // Create database records for PDFs that were uploaded straight to S3 (e.g. from the AWS console).
  router.post('/sync-s3', asyncHandler(async (req, res) => {
    res.json(await importMissing(storage, { uploaderName: 'S3 import' }));
  }));

  // Remove database records whose file no longer exists in S3.
  router.post('/remove-broken', asyncHandler(async (_req, res) => {
    res.json(await removeBrokenRecords(storage));
  }));

  return router;
}
