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

const BAD = [
  'fasz','faszom','faszfej','geci','picsa','picsába','kurva','kurvára','kurafi','buzi','buzeráns','szar','szaros','szarházi','baszd','baszás','baszni','baszom','bassza','baszott','rohadék','köcsög','kocsog','segg','seggfej','fasszopó','faszszopo','csicska','ribanc','kurvaanyád','anyádat','nigger','néger','negro',
  'fuck','fucker','fucking','motherfucker','shit','bullshit','bitch','asshole','dickhead','cunt','bastard','slut','whore','nigga','faggot','retard','wanker','prick','twat','pussy','cock'
];
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/(.)\1{2,}/g, '$1$1');
}
function hasProfanity(text) {
  const n = normalize(text);
  const collapsed = n.replace(/[^a-z]/g, '');
  const tokens = n.split(/[^a-z]+/).filter(Boolean);
  for (const w of BAD) {
    const bw = normalize(w).replace(/[^a-z]/g, '');
    if (!bw) continue;
    if (tokens.includes(bw)) return true;
    if (bw.length >= 5 && collapsed.includes(bw)) return true;
  }
  return false;
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'method' }) };
  if (initError) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'init: ' + initError }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'json' }) }; }
  const pl = verifyToken(body.token);
  if (!pl) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'auth' }) };

  const lgId = String(body.lgId || '');
  if (!lgId) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'missing' }) };
  const db = admin.firestore();
  const chatRef = db.collection('vb2026data').doc('wc_chat');
  const action = body.action || 'send';

  // DELETE a message (admin any, or author own)
  if (action === 'delete') {
    const msgId = String(body.msgId || '');
    try {
      let ok = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(chatRef);
        const chat = snap.exists ? JSON.parse(snap.data().value) : {};
        const arr = Array.isArray(chat[lgId]) ? chat[lgId] : [];
        const m = arr.find(x => x.id === msgId);
        if (!m) return;
        if (!pl.adm && m.uid !== pl.uid) return;
        chat[lgId] = arr.filter(x => x.id !== msgId);
        tx.set(chatRef, { value: JSON.stringify(chat) });
        ok = true;
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
  }

  // REPORT a message (flag for admin)
  if (action === 'report') {
    const msgId = String(body.msgId || '');
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(chatRef);
        const chat = snap.exists ? JSON.parse(snap.data().value) : {};
        const arr = Array.isArray(chat[lgId]) ? chat[lgId] : [];
        const m = arr.find(x => x.id === msgId);
        if (!m) return;
        m.reports = Array.isArray(m.reports) ? m.reports : [];
        if (!m.reports.includes(pl.uid)) m.reports.push(pl.uid);
        tx.set(chatRef, { value: JSON.stringify(chat) });
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
  }

  // SEND a message
  let text = String(body.text || '').trim();
  if (!text) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'missing' }) };
  if (text.length > 280) text = text.slice(0, 280);
  if (hasProfanity(text)) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'profanity' }) };

  try {
    const lgSnap = await db.collection('vb2026data').doc('wc_lg').get();
    const leagues = lgSnap.exists ? JSON.parse(lgSnap.data().value) : [];
    const lg = leagues.find(l => String(l.id) === lgId);
    if (!lg) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'noleague' }) };
    if (!pl.adm && !(lg.members || []).includes(pl.uid)) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'notmember' }) };

    const uSnap = await db.collection('vb2026data').doc('wc_u').get();
    const users = uSnap.exists ? JSON.parse(uSnap.data().value) : [];
    const me = users.find(u => u.id === pl.uid);
    const dn = me ? (me.dn || me.un) : '?';

    let limited = false;
    const msg = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), uid: pl.uid, dn, text, ts: Date.now() };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(chatRef);
      const chat = snap.exists ? JSON.parse(snap.data().value) : {};
      const arr = Array.isArray(chat[lgId]) ? chat[lgId] : [];
      const now = Date.now();
      const mine = arr.filter(m => m.uid === pl.uid);
      const last = mine[mine.length - 1];
      if ((last && now - last.ts < 3000) || mine.filter(m => now - m.ts < 30000).length >= 6) { limited = true; return; }
      arr.push(msg);
      chat[lgId] = arr.slice(-200);
      tx.set(chatRef, { value: JSON.stringify(chat) });
    });
    if (limited) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'toofast' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, msg }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
};
