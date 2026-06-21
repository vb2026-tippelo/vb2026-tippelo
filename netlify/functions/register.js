const crypto = require('crypto');
const admin = require('firebase-admin');

let SECRET = null, initError = null;
try {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  SECRET = crypto.createHash('sha256').update(svc.private_key).digest();
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc) });
} catch (e) { initError = e.message; }

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function signToken(payload) { const p = b64url(JSON.stringify(payload)); return p + '.' + b64url(crypto.createHmac('sha256', SECRET).update(p).digest()); }
function hashPw(plain) { const salt = crypto.randomBytes(12).toString('hex'); return 'h1$' + salt + '$' + crypto.createHash('sha256').update(salt + '|' + plain).digest('hex'); }
function genRecCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(10); let s = ''; for (let i = 0; i < 10; i++) s += A[b[i] % A.length]; return s.slice(0, 5) + '-' + s.slice(5); }
function recHash(code) { return crypto.createHash('sha256').update('rec|' + code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex'); }


function getIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || h['client-ip'] || 'unknown').split(',')[0].trim();
}
async function hit(db, bucket, windowMs) {
  const ref = db.collection('vb2026data').doc('wc_rl');
  let count = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? JSON.parse(snap.data().value) : {};
    const now = Date.now();
    let arr = (data[bucket] || []).filter((t) => now - t < windowMs);
    arr.push(now); data[bucket] = arr; count = arr.length;
    for (const k of Object.keys(data)) { data[k] = (data[k] || []).filter((t) => now - t < 3600000); if (!data[k].length) delete data[k]; }
    tx.set(ref, { value: JSON.stringify(data) });
  });
  return count;
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'method' }) };
  if (initError) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'init: ' + initError }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'json' }) }; }
  const un = (body.un || '').trim();
  const dn = (body.dn || '').trim();
  const pw = body.pw || '';
  if (un.length < 3) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'unlen' }) };
  if (pw.length < 4) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'pwlen' }) };

  try {
    const db = admin.firestore();
    const ip = getIp(event);
    if (await hit(db, 'reg:' + ip, 600000) > 8) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'ratelimit' }) };
    const ref = db.collection('vb2026data').doc('wc_u');
    const recCode = genRecCode();
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const users = snap.exists ? JSON.parse(snap.data().value) : [];
      if (users.find(x => x.un === un)) return { taken: true };
      const nu = { id: 'u' + Date.now(), un, dn: dn || un, pw: hashPw(pw), isAdmin: false, av: '⚽', recHash: recHash(recCode) };
      users.push(nu); tx.set(ref, { value: JSON.stringify(users) });
      return { nu };
    });
    if (out.taken) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'taken' }) };
    const token = signToken({ uid: out.nu.id, adm: false, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    const { pw: _d, recHash: _r, ...safeUser } = out.nu;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token, user: safeUser, recCode }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
};
