const crypto = require('crypto');
const admin = require('firebase-admin');

let SECRET = null, initError = null;
try {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  SECRET = crypto.createHash('sha256').update(svc.private_key).digest();
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }
} catch (e) { initError = e.message; }

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const i = token.indexOf('.');
  const p = token.slice(0, i), sig = token.slice(i + 1);
  const expSig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  const a = Buffer.from(sig), b = Buffer.from(expSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); }
  catch (_) { return null; }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

const ADMIN_ONLY = new Set(['wc_r', 'wc_sp', 'wc_asp', 'wc_mt', 'wc_ko', 'wc_venues', 'wc_ids', 'wc_sched_ver']);
const MEMBER_OK = new Set(['wc_lg']);
const SAFE_USER_FIELDS = ['dn', 'av', 'pw', 'googleId', 'googleEmail', 'provider'];

// returns the JSON string to write, or null if forbidden
function buildWrite(key, uid, isAdmin, rawValue, newVal, curVal) {
  if (isAdmin) return rawValue;                 // admin: tetszoleges iras
  if (key.startsWith('wc_import')) return null;
  if (ADMIN_ONLY.has(key)) return null;
  if (MEMBER_OK.has(key)) return rawValue;

  if (key === 'wc_t') {                          // tippek: csak sajat ${uid}_ kulcsok
    const cur = (curVal && typeof curVal === 'object') ? curVal : {};
    const nw = (newVal && typeof newVal === 'object') ? newVal : {};
    const out = {};
    for (const k of Object.keys(cur)) { if (!k.startsWith(uid + '_')) out[k] = cur[k]; }
    for (const k of Object.keys(nw)) { if (k.startsWith(uid + '_')) out[k] = nw[k]; }
    return JSON.stringify(out);
  }

  if (key === 'wc_predict') {                    // csoport-tippek: csak sajat uid kulcs
    const cur = (curVal && typeof curVal === 'object') ? curVal : {};
    const nw = (newVal && typeof newVal === 'object') ? newVal : {};
    const out = { ...cur };
    if (Object.prototype.hasOwnProperty.call(nw, uid)) out[uid] = nw[uid];
    else delete out[uid];
    return JSON.stringify(out);
  }

  if (key === 'wc_u') {                           // userlista: csak sajat slice, nincs jogosultsag-emeles
    if (!Array.isArray(curVal) || !Array.isArray(newVal)) return null;
    const cMe = curVal.find(u => u.id === uid);
    const nMe = newVal.find(u => u.id === uid);
    if (!cMe || !nMe) return null;
    const merged = { ...cMe };                    // id, un, isAdmin a regibol marad
    for (const f of SAFE_USER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(nMe, f)) merged[f] = nMe[f];
      else if (Object.prototype.hasOwnProperty.call(merged, f) && (f === 'googleId' || f === 'googleEmail' || f === 'provider')) {
        // engedjuk az ilyen mezok torlését is (pl. unlink), de a fő mezőket nem
      }
    }
    const out = curVal.map(u => u.id === uid ? merged : u);
    return JSON.stringify(out);
  }

  return null;                                    // ismeretlen kulcs nem-adminnak: tiltva
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'method' }) };
  if (initError) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'init: ' + initError }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'json' }) }; }

  const payload = verifyToken(body.token);
  if (!payload) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'auth' }) };

  const key = body.key;
  if (typeof key !== 'string' || !/^wc_[a-zA-Z0-9_]+$/.test(key)) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'key' }) };
  if (typeof body.value !== 'string') return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'value' }) };
  if (body.value.length > 1048576) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'size' }) };

  let newVal;
  try { newVal = JSON.parse(body.value); } catch (_) { return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'badvalue' }) }; }

  const isAdmin = !!payload.adm;
  const needCur = !isAdmin && (key === 'wc_u' || key === 'wc_t' || key === 'wc_predict');

  try {
    const ref = admin.firestore().collection('vb2026data').doc(key);
    let curVal = null;
    if (needCur) {
      const snap = await ref.get();
      if (snap.exists) { try { curVal = JSON.parse(snap.data().value); } catch (_) { curVal = null; } }
    }
    const toWrite = buildWrite(key, payload.uid, isAdmin, body.value, newVal, curVal);
    if (toWrite === null) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'forbidden' }) };
    await ref.set({ value: toWrite });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
