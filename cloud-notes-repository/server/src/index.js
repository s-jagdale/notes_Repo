import { config, validateConfig } from './config.js';
import { connectDb, explainMongoError } from './db.js';
import { createStorage } from './s3.js';
import { createApp } from './app.js';

// 1. Check .env
const problems = validateConfig(config);
if (problems.length) {
  console.error('\n[CONFIG] Please fix server/.env before starting:\n');
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
  console.error('\nTip: run "npm run check" for a step-by-step connection test.\n');
  process.exit(1);
}

// 2. Connect to MongoDB Atlas
try {
  await connectDb(config.mongoUri);
  console.log('[MongoDB] Connected');
} catch (err) {
  console.error(`\n[MongoDB] Connection FAILED.\n  ${explainMongoError(err)}\n`);
  process.exit(1);
}

// 3. Prepare S3 and test it once (a problem here is a warning, not a crash)
const storage = createStorage(config.aws, config.presignExpires);
try {
  await storage.checkBucket();
  console.log(`[S3] Bucket "${config.aws.bucket}" is reachable in ${config.aws.region}`);
} catch (err) {
  console.warn(`[S3] WARNING: ${err.message}\n     Uploads and downloads will fail until this is fixed (run "npm run check").`);
}

// 4. Start the API
createApp({ config, storage }).listen(config.port, () => {
  console.log(`[API] Student Notes API running at http://localhost:${config.port}`);
});
