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
function signToken(payload) {
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  return p + '.' + sig;
}
function verifyPw(plain, stored) {
  if (!stored) return false;
  const s = String(stored);
  if (!s.startsWith('h1$')) return plain === s;       // legacy plaintext
  const parts = s.split('$');                          // h1$salt$hash
  const h = crypto.createHash('sha256').update(parts[1] + '|' + plain).digest('hex');
  return h === parts[2];
}
function hashPw(plain) {
  const salt = crypto.randomBytes(12).toString('hex');
  return 'h1$' + salt + '$' + crypto.createHash('sha256').update(salt + '|' + plain).digest('hex');
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
  const un = (body.un || '').trim();
  const pw = body.pw || '';
  if (!un || !pw) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'missing' }) };

  try {
    const ref = admin.firestore().collection('vb2026data').doc('wc_u');
    const snap = await ref.get();
    const users = snap.exists ? JSON.parse(snap.data().value) : [];
    const u = users.find(x => x.un === un);
    if (!u || !verifyPw(pw, u.pw)) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'wrong' }) };
    }
    // auto-migrate legacy plaintext -> hash, server-side
    if (!String(u.pw).startsWith('h1$')) {
      u.pw = hashPw(pw);
      const nu = users.map(x => x.id === u.id ? u : x);
      try { await ref.set({ value: JSON.stringify(nu) }); } catch (_) {}
    }
    const token = signToken({ uid: u.id, adm: !!u.isAdmin, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    const { pw: _drop, ...safeUser } = u;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token, user: safeUser }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
