const admin = require('firebase-admin');

let initError = null;
let projectId = null;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const svc = JSON.parse(raw);
    projectId = svc.project_id || null;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(svc) });
    }
  }
} catch (e) {
  initError = e.message;
}

exports.handler = async function () {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, step: 'env',
      error: 'FIREBASE_SERVICE_ACCOUNT nincs beallitva a Netlify-on'
    })};
  }
  if (initError) {
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, step: 'init', error: initError
    })};
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection('vb2026data').doc('wc_u').get();
    let userCount = null;
    if (snap.exists) {
      try { userCount = JSON.parse(snap.data().value).length; } catch (_) {}
    }
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true,
      projectId,
      wc_u_exists: snap.exists,
      userCount,
      msg: 'Firestore kapcsolat OK a kulccsal'
    })};
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, step: 'firestore', error: e.message
    })};
  }
};
