// Run:  npm run make-admin -- someone@example.com
// Promotes an already-registered user to admin.
import { config } from '../src/config.js';
import { connectDb, disconnectDb, explainMongoError } from '../src/db.js';
import { User } from '../src/models/User.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- someone@example.com');
  process.exit(1);
}
try {
  await connectDb(config.mongoUri);
  const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
  console.log(user ? `${user.email} is now an admin.` : `No user with e-mail ${email}. Register first.`);
} catch (err) {
  console.error(explainMongoError(err));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
