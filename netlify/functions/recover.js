const crypto = require('crypto');
const admin = require('firebase-admin');

let SECRET = null, initError = null;
try {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  SECRET = crypto.createHash('sha256').update(svc.private_key).digest();
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc) });
} catch (e) { initError = e.message; }

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const i = token.indexOf('.'), p = token.slice(0, i), sig = token.slice(i + 1);
  const expSig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  const a = Buffer.from(sig), b = Buffer.from(expSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let pl; try { pl = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (_) { return null; }
  if (!pl.exp || pl.exp < Date.now()) return null;
  return pl;
}
function hashPw(plain) {
  const salt = crypto.randomBytes(12).toString('hex');
  return 'h1$' + salt + '$' + crypto.createHash('sha256').update(salt + '|' + plain).digest('hex');
}
function genRecCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(10); let s = '';
  for (let i = 0; i < 10; i++) s += A[b[i] % A.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}
function recHash(code) { return crypto.createHash('sha256').update('rec|' + code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex'); }

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'method' }) };
  if (initError) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'init: ' + initError }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'json' }) }; }

  const db = admin.firestore();
  const ref = db.collection('vb2026data').doc('wc_u');

  // 1) GENERATE new recovery code for the logged-in user (requires valid token)
  if (body.action === 'gen') {
    const pl = verifyToken(body.token);
    if (!pl) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'auth' }) };
    const code = genRecCode();
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const users = snap.exists ? JSON.parse(snap.data().value) : [];
        const u = users.find(x => x.id === pl.uid);
        if (!u) throw new Error('nouser');
        u.recHash = recHash(code);
        tx.set(ref, { value: JSON.stringify(users.map(x => x.id === u.id ? u : x)) });
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, recCode: code }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
  }

  // 2) RESET password using username + recovery code
  const un = (body.un || '').trim();
  const code = (body.code || '').trim();
  const newPw = body.newPw || '';
  if (!un || !code) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'missing' }) };
  if (newPw.length < 4) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'pwlen' }) };
  try {
    let done = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const users = snap.exists ? JSON.parse(snap.data().value) : [];
      const u = users.find(x => x.un === un);
      if (!u || !u.recHash || u.recHash !== recHash(code)) return;
      u.pw = hashPw(newPw);
      delete u.recHash; // single-use; user can generate a new one after login
      tx.set(ref, { value: JSON.stringify(users.map(x => x.id === u.id ? u : x)) });
      done = true;
    });
    if (!done) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'badcode' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
};
