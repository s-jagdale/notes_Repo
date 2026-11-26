// Central place that reads environment variables (from server/.env) and checks them.
import 'dotenv/config';

const env = process.env;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : fallback);

export function loadConfig(source = env) {
  return {
    port: num(source.PORT, 4000),
    clientOrigins: (source.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    mongoUri: (source.MONGODB_URI || '').trim(),
    jwtSecret: source.JWT_SECRET || '',
    jwtExpiresIn: source.JWT_EXPIRES_IN || '7d',
    adminEmails: (source.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    aws: {
      region: (source.AWS_REGION || '').trim(),
      bucket: (source.S3_BUCKET_NAME || '').trim(),
      accessKeyId: (source.AWS_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: (source.AWS_SECRET_ACCESS_KEY || '').trim(),
      endpoint: (source.S3_ENDPOINT || '').trim()
    },
    presignExpires: clamp(num(source.PRESIGNED_URL_EXPIRES_SECONDS, 300), 60, 3600),
    maxFileMb: clamp(num(source.MAX_FILE_SIZE_MB, 20), 1, 100)
  };
}

export const config = loadConfig();

/** Returns a list of human-readable problems. Empty list = configuration looks fine. */
export function validateConfig(cfg) {
  const problems = [];

  if (!cfg.mongoUri) {
    problems.push('MONGODB_URI is missing. Paste your MongoDB Atlas connection string into server/.env.');
  } else if (!/^mongodb(\+srv)?:\/\//.test(cfg.mongoUri)) {
    problems.push('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  } else if (/[<>]/.test(cfg.mongoUri)) {
    problems.push('MONGODB_URI still contains placeholders like <db_password>. Replace them (and remove the < > brackets).');
  }

  if (!cfg.jwtSecret || cfg.jwtSecret.length < 16 || cfg.jwtSecret === 'change-me-to-a-long-random-string') {
    problems.push('JWT_SECRET must be a long random string (16+ characters) and not the example value.');
  }

  if (!cfg.aws.region) problems.push('AWS_REGION is missing (for example ap-south-1 for Mumbai).');

  if (!cfg.aws.bucket) {
    problems.push('S3_BUCKET_NAME is missing.');
  } else if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.aws.bucket)) {
    problems.push(
      `S3_BUCKET_NAME "${cfg.aws.bucket}" is not a valid bucket name. Use only the name (no "s3://", no spaces, lowercase).`
    );
  }

  const hasId = Boolean(cfg.aws.accessKeyId);
  const hasSecret = Boolean(cfg.aws.secretAccessKey);
  if (hasId !== hasSecret) {
    problems.push('Set BOTH AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or neither, to use the AWS default credential chain).');
  }
  return problems;
}
