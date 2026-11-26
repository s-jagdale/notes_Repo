import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from './errors.js';

export const CATEGORIES = ['Notes', 'Assignments', 'Lab Manual', 'Question Papers', 'Reference', 'Other'];
export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** "cloud   computing" -> "Cloud Computing"; keeps words that already have capitals (DBMS, OS). */
export function normalizeSubject(value) {
  return str(value)
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateRegister(body = {}) {
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 2 || name.length > 60) throw new AppError(400, 'Name must be 2 to 60 characters.', 'VALIDATION');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    throw new AppError(400, 'Please enter a valid e-mail address.', 'VALIDATION');
  if (password.length < 8 || password.length > 72)
    throw new AppError(400, 'Password must be 8 to 72 characters.', 'VALIDATION');
  return { name, email, password };
}

export function validateLogin(body = {}) {
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) throw new AppError(400, 'E-mail and password are required.', 'VALIDATION');
  return { email, password };
}

export function validateNoteFields(body = {}) {
  const title = str(body.title).replace(/\s+/g, ' ');
  const subject = normalizeSubject(body.subject);
  const description = str(body.description);
  const category = str(body.category) || 'Notes';
  const semester = Number(body.semester);

  if (title.length < 3 || title.length > 120) throw new AppError(400, 'Title must be 3 to 120 characters.', 'VALIDATION');
  if (subject.length < 2 || subject.length > 60) throw new AppError(400, 'Subject must be 2 to 60 characters.', 'VALIDATION');
  if (!Number.isInteger(semester) || semester < 1 || semester > 8)
    throw new AppError(400, 'Semester must be a number from 1 to 8.', 'VALIDATION');
  if (!CATEGORIES.includes(category))
    throw new AppError(400, `Category must be one of: ${CATEGORIES.join(', ')}.`, 'VALIDATION');
  if (description.length > 500) throw new AppError(400, 'Description can be at most 500 characters.', 'VALIDATION');
  return { title, subject, description, category, semester };
}

/** Browsers send file names as latin1; convert back so Hindi/accents survive. */
export function decodeFileName(name = 'notes.pdf') {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

export function safeFileName(name) {
  const base = path.basename(name || 'notes.pdf').replace(/\.pdf$/i, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '').slice(0, 100);
  return `${cleaned || 'notes'}.pdf`;
}

/** Folder name used inside S3. Matches your existing console layout: "cloud computing". */
export function subjectFolder(subject) {
  return (
    subject
      .toLowerCase()
      .replace(/[^a-z0-9 _-]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'general'
  );
}

/** Semester-3/cloud computing/1a2b3c4d-Unit_1.pdf */
export function buildS3Key({ semester, subject, originalName }) {
  const unique = crypto.randomUUID().slice(0, 8);
  return `Semester-${semester}/${subjectFolder(subject)}/${unique}-${safeFileName(originalName)}`;
}
