const admin = require('firebase-admin');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';
const HEADERS = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST };
const FINISHED = new Set([3, 43]);
const CACHE_KEY = 'wc_scorers';
const MAX_PER_RUN = 25;

const EN_TEAM = {
  'Mexico':'Mexikó','South Africa':'Dél-Afrika','South Korea':'Dél-Korea','Czechia':'Csehország','Czech Republic':'Csehország',
  'Canada':'Kanada','Bosnia and Herzegovina':'Bosznia-Hercegovina','Bosnia & Herzegovina':'Bosznia-Hercegovina','Qatar':'Katar',
  'Switzerland':'Svájc','Brazil':'Brazília','Morocco':'Marokkó','Haiti':'Haiti','Scotland':'Skócia','USA':'USA','United States':'USA',
  'Paraguay':'Paraguay','Australia':'Ausztrália','Türkiye':'Törökország','Turkey':'Törökország','Germany':'Németország',
  'Curaçao':'Curaçao','Curacao':'Curaçao','Ivory Coast':'Elefántcsontpart',"Côte d'Ivoire":'Elefántcsontpart','Ecuador':'Ecuador',
  'Netherlands':'Hollandia','Japan':'Japán','Sweden':'Svédország','Tunisia':'Tunézia','Belgium':'Belgium','Egypt':'Egyiptom',
  'Iran':'Irán','New Zealand':'Új-Zéland','Spain':'Spanyolország','Cape Verde':'Zöld-foki-sz.','Saudi Arabia':'Szaúd-Arábia',
  'Uruguay':'Uruguay','France':'Franciaország','Senegal':'Szenegál','Iraq':'Irak','Norway':'Norvégia','Argentina':'Argentína',
  'Algeria':'Algéria','Austria':'Ausztria','Jordan':'Jordánia','Portugal':'Portugália','DR Congo':'DR Kongó','D.R. Congo':'DR Kongó',
  'Democratic Republic of Congo':'DR Kongó','Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
  'Croatia':'Horvátország','Ghana':'Ghána','Panama':'Panama'
};
const mapTeam = en => EN_TEAM[en] || en;

let initError = null;
try {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
} catch (e) { initError = e.message; }

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const reset = !!(event && event.queryStringParameters && event.queryStringParameters.reset);
  const debug = event && event.queryStringParameters && event.queryStringParameters.debug;

  try {
    // 1) gyorsitotar betoltese (meccsenkenti bontasban)
    let cache = { matches: {}, updatedAt: null };
    let ref = null;
    if (!initError) {
      ref = admin.firestore().collection('vb2026data').doc(CACHE_KEY);
      if (!reset) {
        try { const snap = await ref.get(); if (snap.exists) { const v = JSON.parse(snap.data().value); if (v && v.matches) cache = v; } } catch (_) {}
      }
    }
    const matches = cache.matches || {};   // matchId -> { sc: { key -> {name,team,goals,assists} }, final: bool }

    // 2) meccslista (draw)
    const [gR, kR] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, { headers: HEADERS }),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, { headers: HEADERS }),
    ]);
    const gd = gR.ok ? await gR.json() : { data: [] };
    const kd = kR.ok ? await kR.json() : { data: [] };
    const all = [...(gd.data || []), ...(kd.data || [])];

    // DIAGNOSZTIKA: ?debug=spain  -> nyers statusz + commentary az adott csapat meccseire (a cache-t nem bantja)
    if (debug) {
      const q = String(debug).toLowerCase();
      const hit = all.filter(m => {
        const hen = String(m.home || '').toLowerCase(), aen = String(m.away || '').toLowerCase();
        const hhu = mapTeam(m.home || '').toLowerCase(), ahu = mapTeam(m.away || '').toLowerCase();
        return hen.includes(q) || aen.includes(q) || hhu.includes(q) || ahu.includes(q) || String(m.matchId) === q;
      }).slice(0, 8);
      const out = [];
      for (const m of hit) {
        let incidents = [], cerr = null;
        try {
          const r = await fetch(`https://${WC_HOST}/wc/match/${m.matchId}/commentary`, { headers: HEADERS });
          if (r.ok) { const d = await r.json(); incidents = (d.data && d.data.incidents) || []; }
          else cerr = 'HTTP ' + r.status;
        } catch (e) { cerr = e.message; }
        out.push({
          matchId: m.matchId, status: m.status, finishedByCode: FINISHED.has(m.status),
          home: m.home, away: m.away,
          alreadyProcessed: !!(cache.matches && cache.matches[m.matchId]),
          finalized: !!(cache.matches && cache.matches[m.matchId] && cache.matches[m.matchId].final),
          commentaryError: cerr, incidentCount: incidents.length,
          goalIncidents: incidents.filter(i => i && String(i.type || '').toLowerCase().includes('goal')).map(i => ({ type: i.type, player: i.player, side: i.side })),
          allIncidentTypes: [...new Set(incidents.map(i => i && i.type))]
        });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, debug: true, query: debug, knownStatusCodes: [...FINISHED], matches: out }, null, 2) };
    }

    // melyik meccseket dolgozzuk fel: minden elkezdodott (status != 1) meccs,
    // ami meg nincs veglegesitve. A befejezetteket egyszer (final=true), az eloket
    // minden korben ujra (a golszamuk meg valtozhat).
    const toProcess = all.filter(m => m.matchId && m.status !== 1 && !(matches[m.matchId] && matches[m.matchId].final));
    const batch = toProcess.slice(0, MAX_PER_RUN);

    // 3) kommentar lekerese a meccsekhez
    const results = await Promise.all(batch.map(async m => {
      try {
        const r = await fetch(`https://${WC_HOST}/wc/match/${m.matchId}/commentary`, { headers: HEADERS });
        if (!r.ok) return null;
        const d = await r.json();
        return { m, incidents: (d.data && d.data.incidents) || [] };
      } catch (_) { return null; }
    }));

    // 4) meccsenkenti golok/asszisztok — az adott meccset FELULIRJUK (nincs duplazas)
    results.forEach(res => {
      if (!res) return;
      const { m, incidents } = res;
      // ures/hianyos commentary: ne irjuk felul a meglevot, kesobb ujraprobaljuk
      if (!incidents.length) return;
      const homeHU = mapTeam(m.home), awayHU = mapTeam(m.away);
      const sc = {};
      incidents.forEach(ic => {
        if (!ic || !ic.player) return;
        const ty = String(ic.type || '').toLowerCase().trim();
        if (ty !== 'goal' && ty !== 'assist') return; // ongol ("own goal") es egyeb esemenyek kimaradnak
        const teamHU = ic.side === 'home' ? homeHU : awayHU;
        const key = ic.player + '@@' + teamHU;
        if (!sc[key]) sc[key] = { name: ic.player, team: teamHU, goals: 0, assists: 0 };
        if (ty === 'goal') sc[key].goals++; else sc[key].assists++;
      });
      matches[m.matchId] = { sc, final: FINISHED.has(m.status) };
    });

    // 5) osszesites a meccsekbol
    const players = {};
    Object.values(matches).forEach(md => {
      const sc = (md && md.sc) || {};
      Object.keys(sc).forEach(key => {
        const v = sc[key];
        if (!players[key]) players[key] = { name: v.name, team: v.team, goals: 0, assists: 0 };
        players[key].goals += v.goals || 0;
        players[key].assists += v.assists || 0;
      });
    });

    // 6) mentes
    const newCache = { matches, updatedAt: new Date().toISOString() };
    if ((batch.length || reset) && ref) { try { await ref.set({ value: JSON.stringify(newCache) }); } catch (_) {} }

    // 7) rendezett lista
    const list = Object.values(players)
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));

    const pending = Math.max(0, toProcess.length - batch.length);

    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true,
      scorers: list,
      updatedAt: newCache.updatedAt,
      processed: Object.keys(matches).length,
      pending
    })};
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
