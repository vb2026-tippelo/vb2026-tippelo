const { schedule } = require('@netlify/functions');
const admin = require('firebase-admin');

let initError = null;
try {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc) });
} catch (e) { initError = e.message; }

const KEYS = ['wc_u', 'wc_t', 'wc_r', 'wc_lg', 'wc_sp', 'wc_asp', 'wc_predict', 'wc_chat', 'wc_mt', 'wc_ko'];

exports.handler = schedule('@daily', async () => {
  if (initError) return { statusCode: 500, body: 'init: ' + initError };
  try {
    const db = admin.firestore();
    for (const k of KEYS) {
      const snap = await db.collection('vb2026data').doc(k).get();
      if (snap.exists) {
        await db.collection('vb2026data').doc('wc_bak_' + k).set({ value: snap.data().value, _bakAt: Date.now() });
      }
    }
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
});
