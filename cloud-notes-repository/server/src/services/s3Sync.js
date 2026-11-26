// Keeps MongoDB and S3 "in step". This is the fix for files that exist in S3 but never showed up in the app.
import { Note } from '../models/Note.js';
import { CATEGORIES, normalizeSubject } from '../utils/validators.js';

const CATEGORY_FOLDERS = new Map(CATEGORIES.map((c) => [c.toLowerCase().replace(/\s+/g, '-'), c]));

function guessCategory(text) {
  const t = text.toLowerCase();
  if (/assign/.test(t)) return 'Assignments';
  if (/lab|manual|practical/.test(t)) return 'Lab Manual';
  if (/question|paper|pyq|exam/.test(t)) return 'Question Papers';
  if (/reference|book/.test(t)) return 'Reference';
  return 'Notes';
}

/**
 * Understands keys such as
 *   Semester-1/cloud computing/Cloud_Computing_Foundations_Unit_2.pdf
 *   Semester-5/Cloud-Computing/Notes/unit-1.pdf
 * Returns null when the key does not follow the layout (it is then reported, not imported).
 */
export function parseS3Key(key) {
  if (key.endsWith('/')) return null; // a "folder" placeholder
  const parts = key.split('/');
  if (parts.length < 3 || parts.length > 4) return null;
  const sem = /^semester[-_ ]?([1-8])$/i.exec(parts[0]);
  if (!sem) return null;
  const file = parts[parts.length - 1];
  if (!/\.pdf$/i.test(file)) return null;

  const subject = normalizeSubject(parts[1].replace(/[-_]+/g, ' '));
  const folderCategory = parts.length === 4 ? CATEGORY_FOLDERS.get(parts[2].toLowerCase().replace(/\s+/g, '-')) : null;
  const title = file.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    semester: Number(sem[1]),
    subject,
    originalName: file,
    title: title.slice(0, 120) || file,
    category: folderCategory || guessCategory(`${parts[2]} ${file}`)
  };
}

/** Compare the bucket with the database. */
export async function buildReport(storage) {
  const [objects, notes] = await Promise.all([storage.listAll(''), Note.find({}).select('s3Key title').lean()]);
  const dbKeys = new Set(notes.map((n) => n.s3Key));
  const s3Keys = new Set(objects.map((o) => o.key));

  const inS3NotInDb = objects.filter((o) => !o.key.endsWith('/') && !dbKeys.has(o.key));
  const inDbNotInS3 = notes.filter((n) => !s3Keys.has(n.s3Key));
  return {
    s3ObjectCount: objects.filter((o) => !o.key.endsWith('/')).length,
    dbNoteCount: notes.length,
    inS3NotInDb,
    inDbNotInS3: inDbNotInS3.map((n) => ({ id: String(n._id), title: n.title, s3Key: n.s3Key }))
  };
}

/** Create a Note record for every PDF that is in S3 but not in MongoDB. */
export async function importMissing(storage, { uploaderName = 'S3 import' } = {}) {
  const report = await buildReport(storage);
  const imported = [];
  const skipped = [];
  for (const obj of report.inS3NotInDb) {
    const info = parseS3Key(obj.key);
    if (!info) {
      skipped.push({ key: obj.key, reason: 'Does not match Semester-N/Subject/file.pdf' });
      continue;
    }
    const note = await Note.create({
      ...info,
      description: '',
      s3Key: obj.key,
      sizeBytes: obj.size,
      uploadedBy: null,
      uploaderName,
      source: 's3-import',
      createdAt: obj.lastModified // keep the real upload date from S3
    });
    imported.push({ id: String(note._id), key: obj.key, title: note.title });
  }
  return { imported, skipped, brokenRecords: report.inDbNotInS3 };
}

/** Delete database records whose S3 object no longer exists. */
export async function removeBrokenRecords(storage) {
  const report = await buildReport(storage);
  const ids = report.inDbNotInS3.map((n) => n.id);
  if (ids.length) await Note.deleteMany({ _id: { $in: ids } });
  return { removed: report.inDbNotInS3 };
}
