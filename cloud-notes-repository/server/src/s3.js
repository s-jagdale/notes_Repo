// ALL communication with AWS S3 lives in this one file (AWS SDK for JavaScript v3).
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from './utils/errors.js';

/** Translate AWS errors into a clear message that says WHAT to fix. */
export function explainS3Error(err, { bucket, region } = {}) {
  const name = err?.name || err?.Code || '';
  const http = err?.$metadata?.httpStatusCode;
  const msg = String(err?.message || '');

  if (err instanceof AppError) return err;

  if (name === 'NoSuchBucket' || (name === 'NotFound' && err?.$bucketCheck))
    return new AppError(502, `The S3 bucket "${bucket}" was not found. Check S3_BUCKET_NAME in server/.env (exact spelling, name only, no "s3://").`, 'S3_NO_BUCKET');
  if (name === 'InvalidAccessKeyId')
    return new AppError(502, 'AWS rejected AWS_ACCESS_KEY_ID (invalid or deleted key). Create/copy a valid IAM access key into server/.env.', 'S3_BAD_KEY');
  if (name === 'SignatureDoesNotMatch')
    return new AppError(502, 'AWS rejected the signature: AWS_SECRET_ACCESS_KEY does not match the access key ID (or has extra spaces).', 'S3_BAD_SECRET');
  if (name === 'ExpiredToken' || name === 'InvalidToken')
    return new AppError(502, 'The AWS credentials have expired. Use a fresh access key.', 'S3_EXPIRED');
  if (name === 'PermanentRedirect' || name === 'AuthorizationHeaderMalformed' || http === 301 || /region/i.test(msg))
    return new AppError(502, `AWS_REGION ("${region}") does not match the region of the bucket "${bucket}". Open the bucket in the AWS console and copy its region code (for example ap-south-1).`, 'S3_WRONG_REGION');
  if (name === 'AccessDenied' || name === 'Forbidden' || http === 403)
    return new AppError(502, 'AWS denied the request (403). The IAM user needs s3:PutObject, s3:GetObject, s3:DeleteObject on bucket/* and s3:ListBucket on the bucket. NOTE: without s3:ListBucket, a missing file also shows as 403.', 'S3_ACCESS_DENIED');
  if (name === 'CredentialsProviderError' || /Could not load credentials|credential/i.test(msg))
    return new AppError(502, 'No AWS credentials found. Fill AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in server/.env.', 'S3_NO_CREDENTIALS');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|TimeoutError|socket hang up/i.test(`${name} ${msg} ${err?.code}`))
    return new AppError(503, 'Could not reach AWS S3 (network problem). Check your internet connection and the AWS_REGION value.', 'S3_NETWORK');

  console.error('Unexpected S3 error:', name, msg);
  return new AppError(502, `S3 error: ${name || 'Unknown'} - ${msg || 'no details'}`, 'S3_ERROR');
}

export function createStorage(awsCfg, presignExpires = 300) {
  const { region, bucket, accessKeyId, secretAccessKey, endpoint } = awsCfg;
  const client = new S3Client({
    region,
    // Only set for local fake-S3 testing. Empty for real AWS.
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    // If keys are not in .env, the SDK falls back to its default chain (aws configure, etc.)
    ...(accessKeyId ? { credentials: { accessKeyId, secretAccessKey } } : {})
  });
  const ctx = { bucket, region };
  const wrap = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      throw explainS3Error(err, ctx);
    }
  };

  return {
    bucket,
    region,

    /** Store bytes under a key. Returns when S3 has confirmed the write. */
    putObject: ({ key, body, contentType }) =>
      wrap(() => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))),

    /** { exists:false } when the key is not in the bucket, otherwise size and type. */
    headObject: (key) =>
      wrap(async () => {
        try {
          const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          return { exists: true, size: r.ContentLength, contentType: r.ContentType };
        } catch (err) {
          if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
            // HEAD responses have no body, so a missing BUCKET also looks like "NotFound".
            try {
              await client.send(new HeadBucketCommand({ Bucket: bucket }));
            } catch (bucketErr) {
              bucketErr.$bucketCheck = true;
              throw bucketErr;
            }
            return { exists: false };
          }
          throw err;
        }
      }),

    /** Temporary signed link. The bucket stays PRIVATE; the link works only until it expires. */
    getTemporaryUrl: ({ key, fileName, disposition = 'attachment', expiresIn = presignExpires }) =>
      wrap(async () => {
        const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: 'application/pdf',
          ResponseContentDisposition: `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
        });
        return getSignedUrl(client, command, { expiresIn });
      }),

    deleteObject: (key) => wrap(() => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))),

    /** Every object in the bucket (handles >1000 objects through pagination). */
    listAll: (prefix = '') =>
      wrap(async () => {
        const out = [];
        let token;
        do {
          const r = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
          );
          for (const o of r.Contents || []) out.push({ key: o.Key, size: o.Size, lastModified: o.LastModified });
          token = r.IsTruncated ? r.NextContinuationToken : undefined;
        } while (token);
        return out;
      }),

    /** Used by /api/health and "npm run check". */
    checkBucket: () =>
      wrap(async () => {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (err) {
          if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') err.$bucketCheck = true;
          throw err;
        }
        return true;
      })
  };
}
