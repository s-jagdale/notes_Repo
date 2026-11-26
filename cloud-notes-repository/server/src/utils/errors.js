// A small error class that carries an HTTP status code and a machine-readable code.
export class AppError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

// Express 4 does not catch errors thrown inside async handlers by itself; this wrapper does.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
