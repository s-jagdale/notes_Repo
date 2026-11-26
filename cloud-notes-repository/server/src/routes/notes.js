import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import multer from 'multer';
import { Note } from '../models/Note.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import {
  CATEGORIES,
  SEMESTERS,
  validateNoteFields,
  decodeFileName,
  buildS3Key,
  escapeRegex
} from '../utils/validators.js';
import { requireAuth } from '../middleware/auth.js';

function toDto(note, user) {
  const isOwner = note.uploadedBy && String(note.uploadedBy) === String(user._id);
  return {
    id: String(note._id),
    title: note.title,
    description: note.description,
    subject: note.subject,
    semester: note.semester,
    category: note.category,
    originalName: note.originalName,
    sizeBytes: note.sizeBytes,
    uploader: note.uploaderName,
    source: note.source,
    downloadCount: note.downloadCount,
    viewCount: note.viewCount,
    createdAt: note.createdAt,
    canDelete: user.role === 'admin' || Boolean(isOwner),
    ...(user.role === 'admin' ? { s3Key: note.s3Key } : {})
  };
}

async function findNoteOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'Invalid note id.', 'BAD_ID');
  const note = await Note.findById(id);
  if (!note) throw new AppError(404, 'Note not found. It may have been deleted.', 'NOTE_NOT_FOUND');
  return note;
}

export function notesRouter({ config, storage }) {
  const router = Router();
  router.use(requireAuth(config));

  // Files are kept in memory only long enough to forward them to S3 (max size from .env).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const isPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
      cb(isPdf ? null : new AppError(400, 'Only PDF files are allowed.', 'NOT_PDF'), isPdf);
    }
  });

  // ---------- Browse / search / filter ----------
  router.get('/', asyncHandler(async (req, res) => {
    const { search = '', semester, subject, category, sort = 'recent', mine } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);

    const query = {};
    if (String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim().slice(0, 80)), 'i');
      query.$or = [{ title: rx }, { subject: rx }, { description: rx }, { originalName: rx }];
    }
    if (semester) {
      if (!SEMESTERS.includes(Number(semester))) throw new AppError(400, 'Invalid semester filter.', 'VALIDATION');
      query.semester = Number(semester);
    }
    if (subject) query.subject = new RegExp(`^${escapeRegex(String(subject).trim())}$`, 'i');
    if (category) {
      if (!CATEGORIES.includes(category)) throw new AppError(400, 'Invalid category filter.', 'VALIDATION');
      query.category = category;
    }
    if (mine === '1') query.uploadedBy = req.user._id;

    const sorts = { recent: { createdAt: -1 }, popular: { downloadCount: -1, createdAt: -1 }, title: { title: 1 } };
    const [total, notes] = await Promise.all([
      Note.countDocuments(query),
      Note.find(query).sort(sorts[sort] || sorts.recent).skip((page - 1) * limit).limit(limit)
    ]);
    res.json({ notes: notes.map((n) => toDto(n, req.user)), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  }));

  // Values for the filter drop-downs (real data from the database)
  router.get('/meta', asyncHandler(async (_req, res) => {
    const [subjects, semesters] = await Promise.all([Note.distinct('subject'), Note.distinct('semester')]);
    res.json({
      subjects: subjects.sort((a, b) => a.localeCompare(b)),
      semesters: semesters.sort((a, b) => a - b),
      categories: CATEGORIES,
      maxFileMb: config.maxFileMb
    });
  }));

  // Dashboard numbers
  router.get('/stats', asyncHandler(async (req, res) => {
    const [totalNotes, myNotes, downloadsAgg, bySemester, recent, popular] = await Promise.all([
      Note.countDocuments({}),
      Note.countDocuments({ uploadedBy: req.user._id }),
      Note.aggregate([{ $group: { _id: null, total: { $sum: '$downloadCount' } } }]),
      Note.aggregate([{ $group: { _id: '$semester', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Note.find({}).sort({ createdAt: -1 }).limit(5),
      Note.find({ downloadCount: { $gt: 0 } }).sort({ downloadCount: -1 }).limit(5)
    ]);
    res.json({
      totalNotes,
      myNotes,
      totalDownloads: downloadsAgg[0]?.total || 0,
      bySemester: bySemester.map((s) => ({ semester: s._id, count: s.count })),
      recent: recent.map((n) => toDto(n, req.user)),
      popular: popular.map((n) => toDto(n, req.user))
    });
  }));

  // ---------- Upload: browser -> backend -> S3 -> MongoDB ----------
  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Please choose a PDF file to upload.', 'NO_FILE');
    const fields = validateNoteFields(req.body);
    const buffer = req.file.buffer;

    // Check the real content, not just the file name: every PDF starts with "%PDF-".
    if (buffer.length === 0 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-')
      throw new AppError(400, 'This file is not a valid PDF.', 'NOT_PDF');

    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const duplicate = await Note.findOne({ contentHash });
    if (duplicate) throw new AppError(409, `This exact file is already in the repository as "${duplicate.title}".`, 'DUPLICATE');

    const originalName = decodeFileName(req.file.originalname);
    const s3Key = buildS3Key({ semester: fields.semester, subject: fields.subject, originalName });

    // STEP 1: put the file in S3
    await storage.putObject({ key: s3Key, body: buffer, contentType: 'application/pdf' });

    // STEP 2: confirm S3 really has it (same size) BEFORE saving anything in MongoDB
    const head = await storage.headObject(s3Key);
    if (!head.exists || head.size !== buffer.length) {
      await storage.deleteObject(s3Key).catch(() => {});
      throw new AppError(502, 'The upload could not be verified in S3, so nothing was saved. Please try again.', 'S3_VERIFY_FAILED');
    }

    // STEP 3: save metadata + s3Key. If this fails, remove the S3 file so nothing is left orphaned.
    let note;
    try {
      note = await Note.create({
        ...fields,
        originalName,
        s3Key,
        sizeBytes: buffer.length,
        contentHash,
        uploadedBy: req.user._id,
        uploaderName: req.user.name,
        source: 'upload'
      });
    } catch (err) {
      await storage.deleteObject(s3Key).catch(() => {});
      throw err;
    }
    res.status(201).json({ note: toDto(note, req.user) });
  }));

  // ---------- View / download: backend creates a temporary signed S3 link ----------
  router.get('/:id/url', asyncHandler(async (req, res) => {
    const mode = req.query.mode === 'view' ? 'view' : 'download';
    const note = await findNoteOr404(req.params.id);

    const head = await storage.headObject(note.s3Key);
    if (!head.exists)
      throw new AppError(404, 'The file for this note is missing from S3 (it may have been deleted in the AWS console). Ask an admin to clean up the record.', 'S3_OBJECT_MISSING');

    const url = await storage.getTemporaryUrl({
      key: note.s3Key,
      fileName: note.originalName,
      disposition: mode === 'view' ? 'inline' : 'attachment'
    });
    await Note.updateOne({ _id: note._id }, { $inc: mode === 'view' ? { viewCount: 1 } : { downloadCount: 1 } });
    res.json({ url, fileName: note.originalName, expiresInSeconds: config.presignExpires });
  }));

  // ---------- Delete: owner or admin ----------
  router.delete('/:id', asyncHandler(async (req, res) => {
    const note = await findNoteOr404(req.params.id);
    const isOwner = note.uploadedBy && String(note.uploadedBy) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin')
      throw new AppError(403, 'You can only delete notes that you uploaded.', 'FORBIDDEN');

    // S3 first: if this fails, the record stays and the note remains correctly linked.
    await storage.deleteObject(note.s3Key);
    await note.deleteOne();
    res.json({ message: 'Note deleted.' });
  }));

  return router;
}
