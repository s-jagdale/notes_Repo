import multer from 'multer';

export function notFound(_req, res) {
  res.status(404).json({ error: 'API route not found.', code: 'NOT_FOUND' });
}

// Last middleware: every error ends up here and becomes a clean JSON reply.
export function errorHandler(maxFileMb) {
  // eslint-disable-next-line no-unused-vars
  return (err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: `File is too large. Maximum size is ${maxFileMb} MB.`, code: 'FILE_TOO_LARGE' });
      return res.status(400).json({ error: `Upload problem: ${err.message}`, code: 'UPLOAD_ERROR' });
    }
    if (err?.name === 'ValidationError')
      return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(' '), code: 'VALIDATION' });
    if (err?.name === 'CastError') return res.status(400).json({ error: 'Invalid ID.', code: 'BAD_ID' });
    if (err?.code === 11000) return res.status(409).json({ error: 'That record already exists.', code: 'DUPLICATE' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.', code: 'BAD_JSON' });
    if (/Mongo|buffering timed out/i.test(`${err?.name} ${err?.message}`))
      return res.status(503).json({ error: 'The database is not reachable right now. Try again in a moment.', code: 'DB_DOWN' });

    if (err?.status && err?.code) return res.status(err.status).json({ error: err.message, code: err.code });

    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected server error. See the server terminal for details.', code: 'SERVER_ERROR' });
  };
}
