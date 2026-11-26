import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/errors.js';

/** Reads "Authorization: Bearer <token>", verifies it, and puts the user in req.user. */
export function requireAuth(config) {
  return asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Please log in first.', 'NO_TOKEN');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError(401, 'Your session has expired. Please log in again.', 'BAD_TOKEN');
    }
    const user = await User.findById(payload.sub);
    if (!user) throw new AppError(401, 'This account no longer exists. Please register again.', 'NO_USER');
    req.user = user;
    next();
  });
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(new AppError(403, 'Only an admin can do this.', 'FORBIDDEN'));
  next();
}
