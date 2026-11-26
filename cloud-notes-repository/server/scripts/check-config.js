// Run:  npm run check
// Tests every connection step by step and tells you exactly what to fix.
import { config, validateConfig } from '../src/config.js';
import { connectDb, disconnectDb, explainMongoError } from '../src/db.js';
import { createStorage } from '../src/s3.js';

let failed = false;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m, hint) => {
  failed = true;
  console.log(`  FAIL  ${m}${hint ? `\n        -> ${hint}` : ''}`);
};

console.log('\n1) .env values');
const problems = validateConfig(config);
if (problems.length) problems.forEach((p) => fail(p));
else pass('All required values are present and look valid');

if (!problems.length) {
  console.log('\n2) MongoDB Atlas');
  try {
    await connectDb(config.mongoUri);
    pass('Connected to MongoDB');
    await disconnectDb();
  } catch (err) {
    fail('Could not connect to MongoDB', explainMongoError(err));
  }

  console.log(`\n3) AWS S3 (bucket "${config.aws.bucket}", region ${config.aws.region})`);
  const storage = createStorage(config.aws, config.presignExpires);
  const testKey = `_healthcheck/check-${Date.now()}.pdf`;
  let wrote = false;
  try {
    await storage.checkBucket();
    pass('Bucket exists and credentials are accepted (HeadBucket)');
  } catch (err) {
    fail('Bucket check failed', err.message);
  }
  try {
    const objs = await storage.listAll('');
    pass(`Listing works (${objs.length} object(s) in the bucket)`);
  } catch (err) {
    fail('Listing objects failed', err.message);
  }
  try {
    await storage.putObject({ key: testKey, body: Buffer.from('%PDF-1.4\n% connection test\n'), contentType: 'application/pdf' });
    wrote = true;
    pass('Upload works (PutObject)');
    const head = await storage.headObject(testKey);
    head.exists ? pass('Uploaded object is visible (HeadObject)') : fail('Object was written but is not visible');
    const url = await storage.getTemporaryUrl({ key: testKey, fileName: 'check.pdf' });
    const res = await fetch(url);
    const text = await res.text();
    res.ok && text.startsWith('%PDF-')
      ? pass('Temporary download link works (pre-signed URL)')
      : fail(`Pre-signed URL returned HTTP ${res.status}`);
  } catch (err) {
    fail('Upload/download test failed', err.message);
  } finally {
    if (wrote) {
      try {
        await storage.deleteObject(testKey);
        pass('Delete works (test file removed)');
      } catch (err) {
        fail('Delete failed (test file may remain under _healthcheck/)', err.message);
      }
    }
  }
}

console.log(failed ? '\nResult: FIX the items marked FAIL, then run "npm run check" again.\n' : '\nResult: Everything works. Run "npm run dev".\n');
process.exit(failed ? 1 : 0);
