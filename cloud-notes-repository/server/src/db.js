import mongoose from 'mongoose';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  // Fail fast (10 s) instead of hanging forever when Atlas cannot be reached.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const isDbConnected = () => mongoose.connection.readyState === 1;

/** Turns scary driver errors into advice a student can act on. */
export function explainMongoError(err) {
  const msg = String(err?.message || err);
  if (/bad auth|authentication failed|AuthenticationFailed/i.test(msg))
    return 'MongoDB rejected the username or password. Check the database user in Atlas > Database Access, and URL-encode special characters in the password (@ becomes %40).';
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(msg))
    return 'The MongoDB host name could not be found. Re-copy the connection string from Atlas (Connect > Drivers) and check your internet connection.';
  if (/ReplicaSetNoPrimary|Server selection timed out|ECONNREFUSED|ETIMEDOUT|MongooseServerSelectionError/i.test(msg))
    return 'Could not reach MongoDB within 10 seconds. In Atlas open Network Access and add your current IP address (or 0.0.0.0/0 for a classroom demo). Also check that the cluster is not paused.';
  if (/Invalid scheme|Invalid connection string|URI/i.test(msg))
    return 'The MONGODB_URI format is invalid. It should look like mongodb+srv://user:password@cluster.xxxxx.mongodb.net/student_notes';
  return `MongoDB error: ${msg}`;
}
