// Test helpers: a fake S3 server (s3rver) + any MongoDB-compatible server on TEST_MONGODB_URI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import S3rver from 's3rver';
import { loadConfig } from '../src/config.js';
import { createStorage } from '../src/s3.js';
import { createApp } from '../src/app.js';

export const BUCKET = 'test-notes-bucket';
export const MONGO_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/notes_test';

export function testConfig(overrides = {}) {
  return loadConfig({
    PORT: '0',
    MONGODB_URI: MONGO_URI,
    JWT_SECRET: 'test-secret-test-secret-test-secret',
    ADMIN_EMAILS: 'admin@example.com',
    AWS_REGION: 'us-east-1',
    S3_BUCKET_NAME: BUCKET,
    AWS_ACCESS_KEY_ID: 'S3RVER',
    AWS_SECRET_ACCESS_KEY: 'S3RVER',
    S3_ENDPOINT: 'http://127.0.0.1:4569',
    MAX_FILE_SIZE_MB: '2',
    ...overrides
  });
}

export async function startFakeS3() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver-'));
  const server = new S3rver({
    port: 4569,
    address: '127.0.0.1',
    silent: true,
    directory: dir,
    configureBuckets: [{ name: BUCKET, configs: [] }]
  });
  await server.run();
  return { server, dir, close: () => server.close() };
}

export function buildApp(cfgOverrides = {}) {
  const config = testConfig(cfgOverrides);
  const storage = createStorage(config.aws, config.presignExpires);
  return { app: createApp({ config, storage, quiet: true }), config, storage };
}

/** A tiny but genuine PDF; `label` makes each file unique (different SHA-256). */
export function makePdf(label = 'one') {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`
  );
}
