// Run:  npm run import-s3
// Creates MongoDB records for PDFs that are ALREADY in your S3 bucket (for example uploaded in the AWS console)
// following the layout  Semester-N/Subject/file.pdf .  Safe to run many times: existing records are skipped.
import { config, validateConfig } from '../src/config.js';
import { connectDb, disconnectDb, explainMongoError } from '../src/db.js';
import { createStorage } from '../src/s3.js';
import { importMissing } from '../src/services/s3Sync.js';

const problems = validateConfig(config);
if (problems.length) {
  problems.forEach((p) => console.error(`- ${p}`));
  process.exit(1);
}
try {
  await connectDb(config.mongoUri);
} catch (err) {
  console.error(explainMongoError(err));
  process.exit(1);
}
try {
  const storage = createStorage(config.aws, config.presignExpires);
  const { imported, skipped, brokenRecords } = await importMissing(storage);
  console.log(`\nImported ${imported.length} note(s):`);
  imported.forEach((n) => console.log(`  + ${n.key}`));
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} object(s):`);
    skipped.forEach((s) => console.log(`  - ${s.key}  (${s.reason})`));
  }
  if (brokenRecords.length) {
    console.log(`\nWARNING: ${brokenRecords.length} database record(s) point to files missing in S3:`);
    brokenRecords.forEach((b) => console.log(`  ! ${b.s3Key}`));
  }
  console.log('\nDone.\n');
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
