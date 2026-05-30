const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [], orders: [], certificates: [],
      config: {
        priceTHB: Number(process.env.REC_PRICE_THB || 40),
        currency: process.env.CURRENCY || 'THB',
        treasuryRec: Number(process.env.TREASURY_REC || 1000000),
        recSold: 0, recRetired: 0
      },
      seq: { user: 0, order: 0, cert: 127 }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
}
function read() { ensure(); return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
let _cache = null;
function db() { if (!_cache) _cache = read(); return _cache; }
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(_cache, null, 2)); }
function nextId(kind) { const d = db(); d.seq[kind] = (d.seq[kind] || 0) + 1; save(); return d.seq[kind]; }
module.exports = { db, save, nextId, DB_FILE };
