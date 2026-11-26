// Integration tests: real Express app + real MongoDB driver + real AWS SDK v3 calls over HTTP
// (against a local S3-compatible server). Run with:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { connectDb, disconnectDb } from '../src/db.js';
import { Note } from '../src/models/Note.js';
import { User } from '../src/models/User.js';
import { parseS3Key } from '../src/services/s3Sync.js';
import { startFakeS3, buildApp, makePdf, BUCKET, MONGO_URI } from './helpers.js';

let s3;
let api; // the supertest agent for the "first server run"
let student, other, admin;
let noteId;

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const upload = (token, { pdf = makePdf('one'), name = 'unit1.pdf', type = 'application/pdf', fields = {} } = {}) => {
  const body = { title: 'Unit 1 Notes', subject: 'cloud computing', semester: '5', category: 'Notes', ...fields };
  let r = request(api).post('/api/notes').set(bearer(token));
  for (const [k, v] of Object.entries(body)) r = r.field(k, v);
  return r.attach('file', pdf, { filename: name, contentType: type });
};

before(async () => {
  s3 = await startFakeS3();
  await connectDb(MONGO_URI);
  await Note.deleteMany({});
  await User.deleteMany({});
  api = buildApp().app;
});

after(async () => {
  await Note.deleteMany({});
  await User.deleteMany({});
  await disconnectDb();
  await s3.close();
});

test('health: MongoDB and S3 both reachable', async () => {
  const r = await request(api).get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.mongodb.ok, true);
  assert.equal(r.body.s3.ok, true);
});

test('register + login, admin role only for ADMIN_EMAILS', async () => {
  const a = await request(api).post('/api/auth/register').send({ name: 'Asha', email: 'asha@example.com', password: 'password123' });
  assert.equal(a.status, 201);
  assert.equal(a.body.user.role, 'student');
  assert.equal(a.body.user.passwordHash, undefined);
  student = a.body.token;

  const b = await request(api).post('/api/auth/register').send({ name: 'Ravi', email: 'ravi@example.com', password: 'password123' });
  other = b.body.token;
  const c = await request(api).post('/api/auth/register').send({ name: 'Admin', email: 'admin@example.com', password: 'password123' });
  assert.equal(c.body.user.role, 'admin');
  admin = c.body.token;

  const dup = await request(api).post('/api/auth/register').send({ name: 'Asha', email: 'ASHA@example.com', password: 'password123' });
  assert.equal(dup.status, 409);
  const bad = await request(api).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password' });
  assert.equal(bad.status, 401);
  const ok = await request(api).post('/api/auth/login').send({ email: 'asha@example.com', password: 'password123' });
  assert.equal(ok.status, 200);
  const weak = await request(api).post('/api/auth/register').send({ name: 'X Y', email: 'x@example.com', password: 'short' });
  assert.equal(weak.status, 400);
});

test('notes API needs a login', async () => {
  assert.equal((await request(api).get('/api/notes')).status, 401);
  assert.equal((await request(api).get('/api/notes').set(bearer('garbage'))).status, 401);
});

test('upload validation: non-PDF, fake PDF, missing fields, oversize', async () => {
  const txt = await upload(student, { pdf: Buffer.from('hello'), name: 'a.txt', type: 'text/plain' });
  assert.equal(txt.status, 400);
  const fake = await upload(student, { pdf: Buffer.from('this is not a pdf at all'), name: 'fake.pdf' });
  assert.equal(fake.status, 400);
  assert.equal(fake.body.code, 'NOT_PDF');
  const noTitle = await upload(student, { fields: { title: '' } });
  assert.equal(noTitle.status, 400);
  const badSem = await upload(student, { fields: { semester: '12' } });
  assert.equal(badSem.status, 400);
  const big = await upload(student, { pdf: Buffer.concat([makePdf('big'), Buffer.alloc(3 * 1024 * 1024)]), name: 'big.pdf' });
  assert.equal(big.status, 413);
  assert.equal(await Note.countDocuments(), 0, 'rejected uploads must not create records');
});

test('upload stores file in S3 AND metadata in MongoDB, linked by s3Key', async () => {
  const r = await upload(student);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  noteId = r.body.note.id;
  assert.equal(r.body.note.subject, 'Cloud Computing');
  assert.equal(r.body.note.uploader, 'Asha');

  const doc = await Note.findById(noteId);
  assert.match(doc.s3Key, /^Semester-5\/cloud computing\/[0-9a-f]{8}-unit1\.pdf$/);
  const { storage } = buildApp();
  const head = await storage.headObject(doc.s3Key);
  assert.equal(head.exists, true);
  assert.equal(head.size, makePdf('one').length);
  assert.equal(doc.sizeBytes, head.size);
});

test('duplicate file is rejected', async () => {
  const r = await upload(student);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DUPLICATE');
});

test('browse, search, filter, sort, pagination', async () => {
  await upload(other, { pdf: makePdf('two'), name: 'dbms.pdf', fields: { title: 'DBMS Normalization', subject: 'DBMS', semester: '4', category: 'Assignments' } });

  const all = await request(api).get('/api/notes').set(bearer(student));
  assert.equal(all.body.total, 2);
  assert.equal((await request(api).get('/api/notes?search=normal').set(bearer(student))).body.total, 1);
  assert.equal((await request(api).get('/api/notes?search=CLOUD').set(bearer(student))).body.total, 1);
  assert.equal((await request(api).get('/api/notes?semester=4').set(bearer(student))).body.notes[0].subject, 'DBMS');
  assert.equal((await request(api).get('/api/notes?subject=cloud%20computing').set(bearer(student))).body.total, 1);
  assert.equal((await request(api).get('/api/notes?category=Assignments').set(bearer(student))).body.total, 1);
  assert.equal((await request(api).get('/api/notes?mine=1').set(bearer(student))).body.total, 1);
  assert.equal((await request(api).get('/api/notes?limit=1&page=2').set(bearer(student))).body.notes.length, 1);
  assert.equal((await request(api).get('/api/notes?semester=99').set(bearer(student))).status, 400);
  assert.equal((await request(api).get('/api/notes?search=.*(').set(bearer(student))).status, 200, 'regex chars are escaped');

  const meta = await request(api).get('/api/notes/meta').set(bearer(student));
  assert.deepEqual(meta.body.subjects, ['Cloud Computing', 'DBMS']);
  assert.deepEqual(meta.body.semesters, [4, 5]);
});

test('view + download: temporary signed URL really returns the same bytes', async () => {
  const dl = await request(api).get(`/api/notes/${noteId}/url?mode=download`).set(bearer(other));
  assert.equal(dl.status, 200);
  assert.match(dl.body.url, /X-Amz-Signature=/);
  const res = await fetch(dl.body.url);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), makePdf('one'));

  const view = await request(api).get(`/api/notes/${noteId}/url?mode=view`).set(bearer(other));
  const res2 = await fetch(view.body.url);
  assert.match(res2.headers.get('content-disposition'), /^inline/);

  const doc = await Note.findById(noteId);
  assert.equal(doc.downloadCount, 1);
  assert.equal(doc.viewCount, 1);
});

test('stats for the dashboard', async () => {
  const r = await request(api).get('/api/notes/stats').set(bearer(student));
  assert.equal(r.body.totalNotes, 2);
  assert.equal(r.body.myNotes, 1);
  assert.equal(r.body.totalDownloads, 1);
  assert.equal(r.body.popular[0].id, noteId);
});

test('restart: a brand-new server instance still lists and serves the same notes', async () => {
  const restarted = buildApp().app; // simulates stopping and starting "npm start"
  const list = await request(restarted).get('/api/notes').set(bearer(student));
  assert.equal(list.body.total, 2);
  const dl = await request(restarted).get(`/api/notes/${noteId}/url`).set(bearer(student));
  const res = await fetch(dl.body.url);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), makePdf('one'));
});

test('missing S3 object is reported clearly (not a crash)', async () => {
  const r = await upload(student, { pdf: makePdf('ghost'), name: 'ghost.pdf', fields: { title: 'Ghost note' } });
  const doc = await Note.findById(r.body.note.id);
  const { storage } = buildApp();
  await storage.deleteObject(doc.s3Key); // someone deleted it in the AWS console
  const res = await request(api).get(`/api/notes/${doc.id}/url`).set(bearer(student));
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'S3_OBJECT_MISSING');
});

test('admin: report finds broken record + untracked S3 file; sync imports it; cleanup removes broken', async () => {
  // upload straight to S3 like the AWS console would (no MongoDB record)
  const raw = new S3Client({ region: 'us-east-1', endpoint: 'http://127.0.0.1:4569', forcePathStyle: true, credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' } });
  await raw.send(new PutObjectCommand({ Bucket: BUCKET, Key: 'Semester-1/cloud computing/Cloud_Computing_Foundations_Unit_2.pdf', Body: makePdf('console'), ContentType: 'application/pdf' }));
  await raw.send(new PutObjectCommand({ Bucket: BUCKET, Key: 'random-file.pdf', Body: makePdf('random') }));

  assert.equal((await request(api).get('/api/admin/s3-report').set(bearer(student))).status, 403);
  const rep = await request(api).get('/api/admin/s3-report').set(bearer(admin));
  assert.equal(rep.status, 200);
  assert.equal(rep.body.inS3NotInDb.length, 2);
  assert.equal(rep.body.inDbNotInS3.length, 1);

  const sync = await request(api).post('/api/admin/sync-s3').set(bearer(admin));
  assert.equal(sync.body.imported.length, 1);
  assert.equal(sync.body.skipped.length, 1);
  const imported = await Note.findOne({ s3Key: 'Semester-1/cloud computing/Cloud_Computing_Foundations_Unit_2.pdf' });
  assert.equal(imported.semester, 1);
  assert.equal(imported.subject, 'Cloud Computing');
  assert.equal(imported.title, 'Cloud Computing Foundations Unit 2');
  assert.equal(imported.source, 's3-import');

  const dl = await request(api).get(`/api/notes/${imported.id}/url`).set(bearer(student));
  assert.equal(dl.status, 200);
  assert.deepEqual(Buffer.from(await (await fetch(dl.body.url)).arrayBuffer()), makePdf('console'));

  const again = await request(api).post('/api/admin/sync-s3').set(bearer(admin));
  assert.equal(again.body.imported.length, 0, 'sync is idempotent');

  const rm = await request(api).post('/api/admin/remove-broken').set(bearer(admin));
  assert.equal(rm.body.removed.length, 1);
});

test('delete: only owner or admin; removes both S3 object and MongoDB record', async () => {
  const doc = await Note.findById(noteId);
  const { storage } = buildApp();
  assert.equal((await request(api).delete(`/api/notes/${noteId}`).set(bearer(other))).status, 403);
  assert.equal((await storage.headObject(doc.s3Key)).exists, true);

  assert.equal((await request(api).delete(`/api/notes/${noteId}`).set(bearer(student))).status, 200);
  assert.equal((await storage.headObject(doc.s3Key)).exists, false);
  assert.equal(await Note.findById(noteId), null);
  assert.equal((await request(api).delete(`/api/notes/${noteId}`).set(bearer(student))).status, 404);
  assert.equal((await request(api).delete('/api/notes/not-an-id').set(bearer(student))).status, 400);

  const other2 = await Note.findOne({ title: 'DBMS Normalization' });
  assert.equal((await request(api).delete(`/api/notes/${other2.id}`).set(bearer(admin))).status, 200, 'admin may delete any note');
});

test('wrong bucket name: upload fails with a helpful message and leaves NO database record', async () => {
  const badApp = buildApp({ S3_BUCKET_NAME: 'bucket-that-does-not-exist' }).app;

  const before = await Note.countDocuments();
  let r = request(badApp).post('/api/notes').set(bearer(student));
  for (const [k, v] of Object.entries({ title: 'Should fail', subject: 'Test', semester: '1', category: 'Notes' })) r = r.field(k, v);
  r = await r.attach('file', makePdf('x1'), { filename: 'x.pdf', contentType: 'application/pdf' });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'S3_NO_BUCKET');
  assert.match(r.body.error, /bucket-that-does-not-exist/);
  assert.equal(await Note.countDocuments(), before);

  const health = await request(badApp).get('/api/health');
  assert.equal(health.status, 503);
  assert.equal(health.body.status, 'degraded');
});

test('unreachable S3 endpoint: upload fails with a network message', async () => {
  const app2 = buildApp({ S3_ENDPOINT: 'http://127.0.0.1:9' }).app; // nothing listens on port 9
  let r = request(app2).post('/api/notes').set(bearer(student));
  for (const [k, v] of Object.entries({ title: 'Net down', subject: 'Test', semester: '1', category: 'Notes' })) r = r.field(k, v);
  r = await r.attach('file', makePdf('x2'), { filename: 'x.pdf', contentType: 'application/pdf' });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'S3_NETWORK');
});

test('parseS3Key understands both layouts', () => {
  assert.deepEqual(parseS3Key('Semester-1/cloud computing/Cloud_Computing_Foundations_Unit_1_Notes.pdf'), {
    semester: 1, subject: 'Cloud Computing', originalName: 'Cloud_Computing_Foundations_Unit_1_Notes.pdf',
    title: 'Cloud Computing Foundations Unit 1 Notes', category: 'Notes'
  });
  const deep = parseS3Key('Semester-5/Cloud-Computing/Lab-Manuals/lab1.pdf');
  assert.equal(deep.category, 'Lab Manual');
  assert.equal(deep.subject, 'Cloud Computing');
  assert.equal(parseS3Key('Semester-1/'), null);
  assert.equal(parseS3Key('Semester-9/x/y.pdf'), null);
  assert.equal(parseS3Key('Semester-1/x/readme.txt'), null);
});
