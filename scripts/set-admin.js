// Create or reset the dashboard login.
// Usage: npm run set-admin -- <email> <password>
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run set-admin -- <email> <password>');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('That does not look like a valid email address.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const file = path.join(__dirname, '..', 'data', 'admin.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ email: email.trim().toLowerCase(), salt, hash, updatedAt: new Date().toISOString() }, null, 2));
console.log(`Admin login set for ${email.trim().toLowerCase()}`);
