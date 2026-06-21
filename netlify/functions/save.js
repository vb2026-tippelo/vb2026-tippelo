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

// Beépített kezdési idők (a kliens menetrendjéből generálva) — a tippzár forrása.
const KICKOFFS = {"1":"2026-06-11T19:00:00Z","2":"2026-06-12T02:00:00Z","3":"2026-06-19T01:00:00Z","4":"2026-06-18T16:00:00Z","5":"2026-06-25T01:00:00Z","6":"2026-06-25T01:00:00Z","7":"2026-06-12T19:00:00Z","8":"2026-06-13T19:00:00Z","9":"2026-06-18T22:00:00Z","10":"2026-06-18T19:00:00Z","11":"2026-06-24T19:00:00Z","12":"2026-06-24T19:00:00Z","13":"2026-06-13T22:00:00Z","14":"2026-06-14T01:00:00Z","15":"2026-06-20T01:00:00Z","16":"2026-06-19T22:00:00Z","17":"2026-06-24T22:00:00Z","18":"2026-06-24T22:00:00Z","19":"2026-06-13T01:00:00Z","20":"2026-06-14T04:00:00Z","21":"2026-06-19T19:00:00Z","22":"2026-06-20T04:00:00Z","23":"2026-06-26T02:00:00Z","24":"2026-06-26T02:00:00Z","25":"2026-06-14T17:00:00Z","26":"2026-06-14T23:00:00Z","27":"2026-06-20T20:00:00Z","28":"2026-06-21T00:00:00Z","29":"2026-06-25T20:00:00Z","30":"2026-06-25T20:00:00Z","31":"2026-06-14T20:00:00Z","32":"2026-06-15T02:00:00Z","33":"2026-06-20T17:00:00Z","34":"2026-06-21T04:00:00Z","35":"2026-06-25T23:00:00Z","36":"2026-06-25T23:00:00Z","37":"2026-06-15T19:00:00Z","38":"2026-06-16T01:00:00Z","39":"2026-06-21T19:00:00Z","40":"2026-06-22T01:00:00Z","41":"2026-06-27T03:00:00Z","42":"2026-06-27T03:00:00Z","43":"2026-06-15T16:00:00Z","44":"2026-06-15T22:00:00Z","45":"2026-06-21T16:00:00Z","46":"2026-06-21T22:00:00Z","47":"2026-06-27T00:00:00Z","48":"2026-06-27T00:00:00Z","49":"2026-06-16T19:00:00Z","50":"2026-06-16T22:00:00Z","51":"2026-06-22T21:00:00Z","52":"2026-06-23T00:00:00Z","53":"2026-06-26T19:00:00Z","54":"2026-06-26T19:00:00Z","55":"2026-06-17T01:00:00Z","56":"2026-06-17T04:00:00Z","57":"2026-06-22T17:00:00Z","58":"2026-06-23T03:00:00Z","59":"2026-06-28T02:00:00Z","60":"2026-06-28T02:00:00Z","61":"2026-06-17T17:00:00Z","62":"2026-06-18T02:00:00Z","63":"2026-06-23T17:00:00Z","64":"2026-06-24T02:00:00Z","65":"2026-06-27T23:30:00Z","66":"2026-06-27T23:30:00Z","67":"2026-06-17T20:00:00Z","68":"2026-06-17T23:00:00Z","69":"2026-06-23T20:00:00Z","70":"2026-06-23T23:00:00Z","71":"2026-06-27T21:00:00Z","72":"2026-06-27T21:00:00Z","73":"2026-06-28T19:00:00Z","74":"2026-06-29T17:00:00Z","75":"2026-06-29T20:30:00Z","76":"2026-06-30T01:00:00Z","77":"2026-06-30T17:00:00Z","78":"2026-06-30T21:00:00Z","79":"2026-07-01T01:00:00Z","80":"2026-07-01T16:00:00Z","81":"2026-07-01T20:00:00Z","82":"2026-07-02T00:00:00Z","83":"2026-07-02T19:00:00Z","84":"2026-07-02T23:00:00Z","85":"2026-07-03T03:00:00Z","86":"2026-07-03T18:00:00Z","87":"2026-07-03T22:00:00Z","88":"2026-07-04T01:30:00Z","89":"2026-07-04T17:00:00Z","90":"2026-07-04T21:00:00Z","91":"2026-07-05T20:00:00Z","92":"2026-07-06T00:00:00Z","93":"2026-07-06T19:00:00Z","94":"2026-07-07T00:00:00Z","95":"2026-07-07T16:00:00Z","96":"2026-07-07T20:00:00Z","97":"2026-07-09T20:00:00Z","98":"2026-07-10T19:00:00Z","99":"2026-07-11T21:00:00Z","100":"2026-07-12T01:00:00Z","101":"2026-07-14T19:00:00Z","102":"2026-07-15T19:00:00Z","103":"2026-07-18T21:00:00Z","104":"2026-07-19T19:00:00Z"};
const LOCK_MS = 5 * 60 * 1000; // tipp 5 perccel kezdés elott zár

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
function buildWrite(key, uid, isAdmin, rawValue, newVal, curVal, kickoffs) {
  if (isAdmin) return rawValue;                 // admin: tetszoleges iras
  if (key.startsWith('wc_import')) return null;
  if (ADMIN_ONLY.has(key)) return null;
  if (MEMBER_OK.has(key)) return rawValue;

  if (key === 'wc_t') {                          // tippek: csak sajat ${uid}_ kulcsok + kezdes elotti zar
    const cur = (curVal && typeof curVal === 'object') ? curVal : {};
    const nw = (newVal && typeof newVal === 'object') ? newVal : {};
    const ko = kickoffs || {};
    const out = {};
    for (const k of Object.keys(cur)) { if (!k.startsWith(uid + '_')) out[k] = cur[k]; }
    for (const k of Object.keys(nw)) {
      if (!k.startsWith(uid + '_')) continue;
      const mid = k.slice(uid.length + 1);
      const kt = ko[mid];
      const lockMs = kt ? new Date(kt).getTime() - LOCK_MS : Infinity;
      if (Date.now() >= lockMs) {
        // a meccs zárt: a megkesett valtoztatast eldobjuk, a regi tipp marad (ha volt)
        if (Object.prototype.hasOwnProperty.call(cur, k)) out[k] = cur[k];
      } else {
        out[k] = nw[k];
      }
    }
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
    }
    const out = curVal.map(u => u.id === uid ? merged : u);
    return JSON.stringify(out);
  }

  return null;                                    // ismeretlen kulcs nem-adminnak: tiltva
}

async function readDoc(coll, k) {
  const s = await coll.doc(k).get();
  if (!s.exists) return null;
  try { return JSON.parse(s.data().value); } catch (_) { return null; }
}

// Fiók önkéntes torlése: a sajat adatok eltavolitasa minden dokumentumbol
async function selfDelete(uid) {
  const coll = admin.firestore().collection('vb2026data');
  const u = await readDoc(coll, 'wc_u');
  if (Array.isArray(u)) await coll.doc('wc_u').set({ value: JSON.stringify(u.filter(x => x.id !== uid)) });
  const t = await readDoc(coll, 'wc_t');
  if (t && typeof t === 'object') { for (const k of Object.keys(t)) if (k.startsWith(uid + '_')) delete t[k]; await coll.doc('wc_t').set({ value: JSON.stringify(t) }); }
  const p = await readDoc(coll, 'wc_predict');
  if (p && typeof p === 'object') { delete p[uid]; await coll.doc('wc_predict').set({ value: JSON.stringify(p) }); }
  const sp = await readDoc(coll, 'wc_sp');
  if (sp && typeof sp === 'object') { delete sp[uid + '_w']; delete sp[uid + '_t']; await coll.doc('wc_sp').set({ value: JSON.stringify(sp) }); }
  const lg = await readDoc(coll, 'wc_lg');
  if (Array.isArray(lg)) await coll.doc('wc_lg').set({ value: JSON.stringify(lg.map(l => ({ ...l, members: (l.members || []).filter(m => m !== uid) }))) });
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

  // Fiók-torlés
  if (body.action === 'selfdelete') {
    try { await selfDelete(payload.uid); return { statusCode: 200, headers, body: JSON.stringify({ ok: true, deleted: true }) }; }
    catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) }; }
  }

  const key = body.key;
  if (typeof key !== 'string' || !/^wc_[a-zA-Z0-9_]+$/.test(key)) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'key' }) };
  if (typeof body.value !== 'string') return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'value' }) };
  if (body.value.length > 1048576) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'size' }) };

  let newVal;
  try { newVal = JSON.parse(body.value); } catch (_) { return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'badvalue' }) }; }

  const isAdmin = !!payload.adm;
  const needCur = !isAdmin && (key === 'wc_u' || key === 'wc_t' || key === 'wc_predict');

  try {
    const coll = admin.firestore().collection('vb2026data');
    const ref = coll.doc(key);
    let curVal = null;
    if (needCur) {
      const snap = await ref.get();
      if (snap.exists) { try { curVal = JSON.parse(snap.data().value); } catch (_) { curVal = null; } }
    }
    // tippeknel: admin-felulirt kezdesi idok (wc_ko) figyelembe vetele a beepitett mellett
    let kickoffs = KICKOFFS;
    if (!isAdmin && key === 'wc_t') {
      const ov = await readDoc(coll, 'wc_ko');
      if (ov && typeof ov === 'object') kickoffs = { ...KICKOFFS, ...ov };
    }
    const toWrite = buildWrite(key, payload.uid, isAdmin, body.value, newVal, curVal, kickoffs);
    if (toWrite === null) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'forbidden' }) };
    await ref.set({ value: toWrite });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
