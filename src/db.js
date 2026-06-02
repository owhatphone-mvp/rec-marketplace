// Durable state store.
// - If DATABASE_URL is set (Railway Postgres): state persists in a single JSONB row.
//   Survives redeploys; save() returns a promise you can await in money-critical paths.
// - Else: falls back to JSON file (local dev).
//
// State is held in memory for fast synchronous reads (db()), and every mutation is
// persisted via save(). On boot, init() loads the snapshot (await before listen).

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USE_PG = !!process.env.DATABASE_URL;

function freshState() {
  return {
    users: [], orders: [], certificates: [],
    config: {
      priceTHB: Number(process.env.REC_PRICE_THB || 40),
      currency: process.env.CURRENCY || 'THB',
      treasuryRec: Number(process.env.TREASURY_REC || 1000000),
      recSold: 0, recRetired: 0
    },
    seq: { user: 0, order: 0, cert: 127 }
  };
}

let _state = null;
let _pool = null;
let _writeChain = Promise.resolve(); // serialize writes -> no interleaving / race

// ---------- Postgres backend ----------
async function pgInit() {
  const { Pool } = require('pg');
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  await _pool.query('CREATE TABLE IF NOT EXISTS app_state (id INT, data JSONB)');
  await _pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='app_state_pk') THEN ALTER TABLE app_state ADD CONSTRAINT app_state_pk PRIMARY KEY (id); END IF; END $$;").catch(()=>{});
  const r = await _pool.query('SELECT data FROM app_state WHERE id = 1');
  if (r.rows.length) {
    _state = r.rows[0].data;
    // backfill any new config keys without clobbering existing data
    const f = freshState();
    _state.config = Object.assign({}, f.config, _state.config);
    _state.seq = Object.assign({}, f.seq, _state.seq);
  } else {
    _state = freshState();
    await _pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(_state)]);
  }
}

function pgSave() {
  // chain writes so concurrent saves never interleave; each writes the latest snapshot
  _writeChain = _writeChain.then(() =>
    _pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [JSON.stringify(_state)])
  ).catch(err => { console.error('PG save error:', err.message); });
  return _writeChain;
}

// ---------- JSON file backend (local dev) ----------
function fileInit() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    _state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const f = freshState();
    _state.config = Object.assign({}, f.config, _state.config);
    _state.seq = Object.assign({}, f.seq, _state.seq);
  } else {
    _state = freshState();
    fs.writeFileSync(DB_FILE, JSON.stringify(_state, null, 2));
  }
}
function fileSave() {
  fs.writeFileSync(DB_FILE, JSON.stringify(_state, null, 2));
  return Promise.resolve();
}

// ---------- public API (interface unchanged) ----------
async function init() {
  if (USE_PG) await pgInit(); else fileInit();
  console.log('DB backend:', USE_PG ? 'postgres' : 'json-file');
}
function db() {
  if (!_state) { // safety: lazy file init if init() wasn't awaited (local only)
    if (USE_PG) throw new Error('db.init() must be awaited before use (postgres)');
    fileInit();
  }
  return _state;
}
function save() { return USE_PG ? pgSave() : fileSave(); }
function nextId(kind) { const d = db(); d.seq[kind] = (d.seq[kind] || 0) + 1; save(); return d.seq[kind]; }

module.exports = { init, db, save, nextId, DB_FILE, USE_PG };
