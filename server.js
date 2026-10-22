const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ACCOUNT_FILE = path.join(__dirname, 'data', 'admin.json');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Simple JSON storage ----------
const DEFAULT_DB = {
  settings: {
    companyName: 'MRCARS Ltd',
    phone: '+250 787 615 702',
    whatsapp: '250787615702',
    address: 'KG 17 Avenue, Gasabo District, City of Kigali',
    mapUrl: 'https://maps.google.com/?q=KG+17+Avenue+Kigali',
    intro: 'Every car below is in our showroom now. Open one for its photos and details, then ask us on WhatsApp.',
    updatedAt: new Date().toISOString(),
  },
  cars: [],
};

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) saveDb(DEFAULT_DB);
  const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  db.settings = { ...DEFAULT_DB.settings, ...db.settings };
  db.cars = db.cars || [];
  return db;
}

function saveDb(db) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function touch(db) {
  db.settings.updatedAt = new Date().toISOString();
}

// ---------- Auth (cookie token kept in memory) ----------
const sessions = new Set();

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function requireAdmin(req, res, next) {
  const token = getCookie(req, 'mrcars_admin');
  if (token && sessions.has(token)) return next();
  res.status(401).json({ error: 'Not logged in' });
}

// ---------- Admin account (email + hashed password in data/admin.json) ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(password, account) {
  const { hash } = hashPassword(password, account.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.hash, 'hex'));
}

function loadAccount() {
  if (!fs.existsSync(ACCOUNT_FILE)) return null;
  return JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
}

function saveAccount(email, password) {
  const account = { email: String(email).trim().toLowerCase(), ...hashPassword(password), updatedAt: new Date().toISOString() };
  fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2));
  return account;
}

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const passwordProblem = (p) => (String(p || '').length < 8 ? 'Password must be at least 8 characters.' : null);

// Slow down password guessing: 5 failed tries per IP, then a 15 minute wait.
const failures = new Map();
function tooManyTries(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60 * 1000) { failures.delete(ip); return false; }
  return f.count >= 5;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

// ---------- Uploads ----------
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(file, () => {});
}

// ---------- Car helpers ----------
function toNumber(v, fallback = 0) {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : fallback;
}

function carFromBody(body, existing = {}) {
  return {
    ...existing,
    name: String(body.name ?? existing.name ?? '').trim(),
    year: String(body.year ?? existing.year ?? '').trim(),
    category: String(body.category ?? existing.category ?? 'Other').trim() || 'Other',
    condition: body.condition === 'New' ? 'New' : 'Used',
    mileage: toNumber(body.mileage, existing.mileage ?? 0),
    colour: String(body.colour ?? existing.colour ?? '').trim(),
    colourHex: /^#[0-9a-f]{6}$/i.test(body.colourHex || '') ? body.colourHex : existing.colourHex || '#ffffff',
    price: toNumber(body.price, existing.price ?? 0),
    priceFrom: body.priceFrom === 'true' || body.priceFrom === 'on' || body.priceFrom === true,
    quantity: Math.max(0, Math.round(toNumber(body.quantity, existing.quantity ?? 1))),
    description: String(body.description ?? existing.description ?? '').trim(),
    published: !(body.published === 'false' || body.published === false),
    featured: body.featured === 'true' || body.featured === 'on' || body.featured === true,
  };
}

// Build the final photo list from the "order" field the dashboard sends:
// existing URLs are kept, "new:N" points at the Nth uploaded file.
function orderedImages(body, files, oldImages = []) {
  const uploaded = (files || []).map((f) => '/uploads/' + f.filename);
  let order;
  try { order = JSON.parse(body.order || 'null'); } catch { order = null; }
  if (!Array.isArray(order)) return [...oldImages, ...uploaded];
  const result = [];
  for (const item of order) {
    const m = /^new:(\d+)$/.exec(item);
    if (m && uploaded[m[1]]) result.push(uploaded[m[1]]);
    else if (oldImages.includes(item)) result.push(item);
  }
  // Clean up files that are no longer used
  oldImages.filter((u) => !result.includes(u)).forEach(removeUpload);
  uploaded.filter((u) => !result.includes(u)).forEach(removeUpload);
  return result;
}

// ---------- App ----------
const app = express();
// Behind nginx: read the real visitor IP from X-Forwarded-For (used by the login limit).
if (process.env.TRUST_PROXY) app.set('trust proxy', 'loopback');
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// Public API
app.get('/api/catalogue', (req, res) => {
  const db = loadDb();
  res.json({
    settings: db.settings,
    // Only cars that are published, in stock and have at least one photo
    cars: db.cars.filter((c) => c.published && c.quantity > 0 && c.images?.length > 0),
  });
});

// Auth
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (tooManyTries(ip)) return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
  const account = loadAccount();
  if (!account) return res.status(503).json({ error: 'No admin account yet. Run: npm run set-admin -- <email> <password>' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const ok = email === account.email && checkPassword(req.body?.password || '', account);
  if (!ok) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  // Mark the cookie Secure when the visitor came in over HTTPS (keeps plain-HTTP access by IP working).
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `mrcars_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 12}${secure}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(getCookie(req, 'mrcars_admin'));
  res.setHeader('Set-Cookie', 'mrcars_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAdmin, (req, res) => res.json({ ok: true, email: loadAccount()?.email }));

// Change login email and/or password (current password required)
app.put('/api/admin/account', requireAdmin, (req, res) => {
  const account = loadAccount();
  const { currentPassword, email, newPassword } = req.body || {};
  if (!checkPassword(currentPassword || '', account)) return res.status(400).json({ error: 'Your current password is not correct.' });
  const nextEmail = email ? String(email).trim() : account.email;
  if (!validEmail(nextEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (newPassword && passwordProblem(newPassword)) return res.status(400).json({ error: passwordProblem(newPassword) });
  const updated = newPassword
    ? saveAccount(nextEmail, newPassword)
    : (fs.writeFileSync(ACCOUNT_FILE, JSON.stringify({ ...account, email: nextEmail.toLowerCase(), updatedAt: new Date().toISOString() }, null, 2)), loadAccount());
  if (newPassword) {
    // Sign out every other device
    const mine = getCookie(req, 'mrcars_admin');
    for (const t of [...sessions]) if (t !== mine) sessions.delete(t);
  }
  res.json({ ok: true, email: updated.email });
});

// Admin API
app.get('/api/admin/cars', requireAdmin, (req, res) => {
  const db = loadDb();
  res.json({ settings: db.settings, cars: db.cars });
});

app.post('/api/admin/cars', requireAdmin, upload.array('images', 20), (req, res) => {
  const db = loadDb();
  const car = carFromBody(req.body);
  if (!car.name) return res.status(400).json({ error: 'Car name is required' });
  car.id = crypto.randomUUID();
  car.images = orderedImages(req.body, req.files);
  car.createdAt = new Date().toISOString();
  db.cars.unshift(car);
  touch(db);
  saveDb(db);
  res.json(car);
});

app.put('/api/admin/cars/:id', requireAdmin, upload.array('images', 20), (req, res) => {
  const db = loadDb();
  const idx = db.cars.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Car not found' });
  const old = db.cars[idx];
  const car = carFromBody(req.body, old);
  if (!car.name) return res.status(400).json({ error: 'Car name is required' });

  car.images = orderedImages(req.body, req.files, old.images || []);
  car.updatedAt = new Date().toISOString();
  db.cars[idx] = car;
  touch(db);
  saveDb(db);
  res.json(car);
});

app.patch('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const db = loadDb();
  const car = db.cars.find((c) => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  if (typeof req.body.published === 'boolean') car.published = req.body.published;
  if (req.body.quantity !== undefined) car.quantity = Math.max(0, Math.round(toNumber(req.body.quantity, car.quantity)));
  touch(db);
  saveDb(db);
  res.json(car);
});

app.delete('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const db = loadDb();
  const car = db.cars.find((c) => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  (car.images || []).forEach(removeUpload);
  db.cars = db.cars.filter((c) => c.id !== req.params.id);
  touch(db);
  saveDb(db);
  res.json({ ok: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const db = loadDb();
  const fields = ['companyName', 'phone', 'whatsapp', 'address', 'mapUrl', 'intro'];
  for (const f of fields) if (typeof req.body[f] === 'string') db.settings[f] = req.body[f].trim();
  db.settings.whatsapp = db.settings.whatsapp.replace(/\D/g, '');
  touch(db);
  saveDb(db);
  res.json(db.settings);
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`MRCARS Ltd running at http://localhost:${PORT}`);
  console.log(`Admin dashboard:    http://localhost:${PORT}/admin`);
  if (!loadAccount()) console.log('No admin account yet. Create one with: npm run set-admin -- <email> <password>');
});
