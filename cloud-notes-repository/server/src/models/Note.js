import mongoose from 'mongoose';
import { CATEGORIES } from '../utils/validators.js';

// One document = ONE note = metadata only. The PDF itself lives in S3 and is found via "s3Key".
const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    subject: { type: String, required: true, trim: true, maxlength: 60, index: true },
    semester: { type: Number, required: true, min: 1, max: 8, index: true },
    category: { type: String, enum: CATEGORIES, default: 'Notes', index: true },

    originalName: { type: String, required: true },
    // THE LINK between MongoDB and S3. Must match the object key in the bucket exactly.
    s3Key: { type: String, required: true, unique: true },
    sizeBytes: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/pdf' },
    contentHash: { type: String, index: true }, // SHA-256 of the file, used to block duplicates

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploaderName: { type: String, default: 'Unknown' }, // copy of the name, so lists need no join
    source: { type: String, enum: ['upload', 's3-import'], default: 'upload' },

    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

noteSchema.index({ createdAt: -1 });

export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);
