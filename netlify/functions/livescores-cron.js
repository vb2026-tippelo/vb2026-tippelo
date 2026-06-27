// Szerveroldali ELO-EREDMENY iro — percenkent fut, de csak meccs-idoablakban hiv ESPN-t.
// Egyetlen iro: lehuzza a livescores (ESPN) feedet, es a Firestore wc_live_feed doksiba irja.
// A kliensek ezt CSAK olvassak (sG('wc_live_feed',true)) -> nincs kliensenkenti ESPN-hivas
// es nincs percenkenti, sok klienstol erkezo wc_live iras-roham.
const admin = require('firebase-admin');
const { schedule } = require('@netlify/functions');

let initError=null;
try{ if(!admin.apps.length){ admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))}); } }catch(e){ initError=e.message; }

const KICKOFFS = ["2026-06-11T19:00:00Z","2026-06-12T02:00:00Z","2026-06-12T19:00:00Z","2026-06-13T01:00:00Z","2026-06-13T19:00:00Z","2026-06-13T22:00:00Z","2026-06-14T01:00:00Z","2026-06-14T04:00:00Z","2026-06-14T17:00:00Z","2026-06-14T20:00:00Z","2026-06-14T23:00:00Z","2026-06-15T02:00:00Z","2026-06-15T16:00:00Z","2026-06-15T19:00:00Z","2026-06-15T22:00:00Z","2026-06-16T01:00:00Z","2026-06-16T19:00:00Z","2026-06-16T22:00:00Z","2026-06-17T01:00:00Z","2026-06-17T04:00:00Z","2026-06-17T17:00:00Z","2026-06-17T20:00:00Z","2026-06-17T23:00:00Z","2026-06-18T02:00:00Z","2026-06-18T16:00:00Z","2026-06-18T19:00:00Z","2026-06-18T22:00:00Z","2026-06-19T01:00:00Z","2026-06-19T19:00:00Z","2026-06-19T22:00:00Z","2026-06-20T01:00:00Z","2026-06-20T04:00:00Z","2026-06-20T17:00:00Z","2026-06-20T20:00:00Z","2026-06-21T00:00:00Z","2026-06-21T04:00:00Z","2026-06-21T16:00:00Z","2026-06-21T19:00:00Z","2026-06-21T22:00:00Z","2026-06-22T01:00:00Z","2026-06-22T17:00:00Z","2026-06-22T21:00:00Z","2026-06-23T00:00:00Z","2026-06-23T03:00:00Z","2026-06-23T17:00:00Z","2026-06-23T20:00:00Z","2026-06-23T23:00:00Z","2026-06-24T02:00:00Z","2026-06-24T19:00:00Z","2026-06-24T22:00:00Z","2026-06-25T01:00:00Z","2026-06-25T20:00:00Z","2026-06-25T23:00:00Z","2026-06-26T02:00:00Z","2026-06-26T19:00:00Z","2026-06-27T00:00:00Z","2026-06-27T03:00:00Z","2026-06-27T21:00:00Z","2026-06-27T23:30:00Z","2026-06-28T02:00:00Z","2026-06-28T19:00:00Z","2026-06-29T17:00:00Z","2026-06-29T20:30:00Z","2026-06-30T01:00:00Z","2026-06-30T17:00:00Z","2026-06-30T21:00:00Z","2026-07-01T01:00:00Z","2026-07-01T16:00:00Z","2026-07-01T20:00:00Z","2026-07-02T00:00:00Z","2026-07-02T19:00:00Z","2026-07-02T23:00:00Z","2026-07-03T03:00:00Z","2026-07-03T18:00:00Z","2026-07-03T22:00:00Z","2026-07-04T01:30:00Z","2026-07-04T17:00:00Z","2026-07-04T21:00:00Z","2026-07-05T20:00:00Z","2026-07-06T00:00:00Z","2026-07-06T19:00:00Z","2026-07-07T00:00:00Z","2026-07-07T16:00:00Z","2026-07-07T20:00:00Z","2026-07-09T20:00:00Z","2026-07-10T19:00:00Z","2026-07-11T21:00:00Z","2026-07-12T01:00:00Z","2026-07-14T19:00:00Z","2026-07-15T19:00:00Z","2026-07-18T21:00:00Z","2026-07-19T19:00:00Z"];

const PRE_MS = 15 * 60 * 1000;        // 15 perc kezdes elott
const POST_MS = 3.5 * 60 * 60 * 1000; // 3.5 ora kezdes utan (lefujas + hossz. + szetloves + rahagyas)
function inWindow(now){
  for(let i=0;i<KICKOFFS.length;i++){ const ko=Date.parse(KICKOFFS[i]); if(now>=ko-PRE_MS && now<=ko+POST_MS) return true; }
  return false;
}

const handler = async function(){
  const now=Date.now();
  if(!inWindow(now)) return {statusCode:200, body:'skip: nincs meccs-ablak'};
  if(initError)      return {statusCode:200, body:'init hiba: '+initError};
  try{
    const base=(process.env.URL||'https://vb2026-endre.netlify.app')+'/.netlify/functions/livescores';
    const r=await fetch(base+'?t='+now);
    if(!r.ok) return {statusCode:200, body:'livescores http '+r.status};
    const d=await r.json();
    if(!d||!Array.isArray(d.matches)) return {statusCode:200, body:'nincs matches'};
    const ref=admin.firestore().collection('vb2026data').doc('wc_live_feed');
    await ref.set({ value: JSON.stringify({ updatedAt:new Date().toISOString(), matches:d.matches, source:d.source||'espn' }) });
    return {statusCode:200, body:'ok matches='+d.matches.length};
  }catch(e){ return {statusCode:200, body:'hiba: '+e.message}; }
};

exports.handler = schedule('* * * * *', handler);
