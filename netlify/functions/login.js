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
function verifyPw(plain, stored) { if (!stored) return false; const s = String(stored); if (!s.startsWith('h1$')) return plain === s; const parts = s.split('$'); const h = crypto.createHash('sha256').update(parts[1] + '|' + plain).digest('hex'); return h === parts[2]; }
function hashPw(plain) { const salt = crypto.randomBytes(12).toString('hex'); return 'h1$' + salt + '$' + crypto.createHash('sha256').update(salt + '|' + plain).digest('hex'); }


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
  const pw = body.pw || '';
  if (!un || !pw) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'missing' }) };

  try {
    const db = admin.firestore();
    const ip = getIp(event);
    if (await hit(db, 'lip:' + ip, 600000) > 30) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'ratelimit' }) };
    const ref = db.collection('vb2026data').doc('wc_u');
    const snap = await ref.get();
    const users = snap.exists ? JSON.parse(snap.data().value) : [];
    const u = users.find(x => x.un === un);
    if (!u || !verifyPw(pw, u.pw)) {
      const fails = await hit(db, 'luf:' + un, 900000);
      if (fails > 10) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'locked' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'wrong' }) };
    }
    if (!String(u.pw).startsWith('h1$')) {
      u.pw = hashPw(pw);
      const nu = users.map(x => x.id === u.id ? u : x);
      try { await ref.set({ value: JSON.stringify(nu) }); } catch (_) {}
    }
    const token = signToken({ uid: u.id, adm: !!u.isAdmin, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    const { pw: _drop, ...safeUser } = u;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token, user: safeUser }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
};
