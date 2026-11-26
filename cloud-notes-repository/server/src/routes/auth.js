import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { validateRegister, validateLogin } from '../utils/validators.js';
import { requireAuth } from '../middleware/auth.js';

const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

export function authRouter(config) {
  const router = Router();
  const sign = (u) => jwt.sign({ sub: String(u._id), role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  // Slows down password-guessing attacks.
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes.', code: 'RATE_LIMIT' } });

  router.post('/register', limiter, asyncHandler(async (req, res) => {
    const { name, email, password } = validateRegister(req.body);
    if (await User.findOne({ email })) throw new AppError(409, 'An account with this e-mail already exists.', 'EMAIL_TAKEN');
    const passwordHash = await bcrypt.hash(password, 10);
    const role = config.adminEmails.includes(email) ? 'admin' : 'student';
    const user = await User.create({ name, email, passwordHash, role });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  }));

  router.post('/login', limiter, asyncHandler(async (req, res) => {
    const { email, password } = validateLogin(req.body);
    const user = await User.findOne({ email });
    // Same message for "no such user" and "wrong password" so attackers learn nothing.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new AppError(401, 'Incorrect e-mail or password.', 'BAD_LOGIN');
    res.json({ token: sign(user), user: publicUser(user) });
  }));

  router.get('/me', requireAuth(config), (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}
