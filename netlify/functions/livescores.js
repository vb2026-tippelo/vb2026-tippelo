// VB 2026 elo eredmenyek — KIZAROLAG ESPN (rejtett, ingyenes, kulcs nelkuli scoreboard API).
// Kieseses (KO) meccseknel automatikusan kiszamolja a 90 perces allast, a tovabbjutot,
// es a modot (hosszabbitas / tizenegyesek) a summary keyEvents-bol — kezi lepes nelkul.
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
const KO_START = Date.parse('2026-06-28T00:00:00Z'); // R32 kezdete

const EN_TEAM = {
  'Mexico':'Mexikó','South Africa':'Dél-Afrika','South Korea':'Dél-Korea','Korea Republic':'Dél-Korea',
  'Czechia':'Csehország','Czech Republic':'Csehország','Canada':'Kanada',
  'Bosnia and Herzegovina':'Bosznia-Hercegovina','Bosnia & Herzegovina':'Bosznia-Hercegovina',
  'Qatar':'Katar','Switzerland':'Svájc','Brazil':'Brazília','Morocco':'Marokkó',
  'Haiti':'Haiti','Scotland':'Skócia','USA':'USA','United States':'USA',
  'Paraguay':'Paraguay','Australia':'Ausztrália','Türkiye':'Törökország','Turkey':'Törökország',
  'Germany':'Németország','Curaçao':'Curaçao','Curacao':'Curaçao',
  "Ivory Coast":'Elefántcsontpart',"Côte d'Ivoire":'Elefántcsontpart',
  'Ecuador':'Ecuador','Netherlands':'Hollandia','Japan':'Japán','Sweden':'Svédország',
  'Tunisia':'Tunézia','Belgium':'Belgium','Egypt':'Egyiptom','Iran':'Irán','IR Iran':'Irán',
  'New Zealand':'Új-Zéland','Spain':'Spanyolország','Cape Verde':'Zöld-foki-sz.','Cabo Verde':'Zöld-foki-sz.',
  'Saudi Arabia':'Szaúd-Arábia','Uruguay':'Uruguay','France':'Franciaország',
  'Senegal':'Szenegál','Iraq':'Irak','Norway':'Norvégia','Argentina':'Argentína',
  'Algeria':'Algéria','Austria':'Ausztria','Jordan':'Jordánia','Portugal':'Portugália',
  'DR Congo':'DR Kongó','D.R. Congo':'DR Kongó','Democratic Republic of Congo':'DR Kongó','Congo DR':'DR Kongó',
  'Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
  'Bosnia-Herzegovina':'Bosznia-Hercegovina',
  "Cote d'Ivoire":'Elefántcsontpart',
  'United States of America':'USA',
  'Croatia':'Horvátország','Ghana':'Ghána','Panama':'Panama'
};
const mapTeam = en => EN_TEAM[en] || en;

function fmtMinute(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s || s === '0' || s === "0'") return '';
  return s.includes("'") ? s : s + "'";
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function ymd(d){ return d.toISOString().slice(0,10).replace(/-/g,''); }
function espnUrl(){
  const now = new Date();
  const y = new Date(now.getTime() - 36*3600*1000);
  const t = new Date(now.getTime() + 24*3600*1000);
  return `${ESPN_BASE}?dates=${ymd(y)}-${ymd(t)}&limit=100`;
}

function isOwnGoal(ev){
  const tt=(ev.type&&(ev.type.type||'')).toString().toLowerCase();
  const txt=(ev.text||'').toString().toLowerCase();
  return tt.includes('own')||txt.includes('own goal');
}

// Kieseses meccs reszletei a summary keyEvents-bol: 90 perces allas, h.u./tizenegyes, 11-es allas, tovabbjuto.
// Visszaad ESPN hazai/vendeg orientacioban (a kliens a flip-pel forgatja). null ha nem sikerult.
async function koDetail(eventId, homeEn, awayEn, sbWinner){
  try{
    const r=await fetch(`${SUMMARY_BASE}?event=${eventId}`,{headers:{accept:'application/json'}});
    if(!r.ok) return null;
    const sum=await r.json();
    const kev=sum.keyEvents||[];
    if(!kev.length) return null;
    const hk=(homeEn||'').toLowerCase().trim(), ak=(awayEn||'').toLowerCase().trim();
    const reg={h:0,a:0}, et={h:0,a:0}, pen={h:0,a:0};
    kev.forEach(ev=>{
      if(ev.scoringPlay!==true) return;
      const tn=((ev.team&&ev.team.displayName)||'').toLowerCase().trim();
      let side = tn===hk?'h':(tn===ak?'a':null);
      if(!side) return;
      if(isOwnGoal(ev)) side = side==='h'?'a':'h'; // ongol az ellenfel javara
      if(ev.shootout===true){ pen[side]++; return; }
      const period=(ev.period&&ev.period.number)||0;
      if(period>=3) et[side]++; else reg[side]++;
    });
    const hasPen=(pen.h+pen.a)>0, hasET=(et.h+et.a)>0;
    const via = hasPen?'pen':(hasET?'aet':null);
    const totH=reg.h+et.h, totA=reg.a+et.a;
    let advSide = (sbWinner==='home'||sbWinner==='away') ? sbWinner : null;
    if(!advSide){
      if(hasPen) advSide = pen.h>pen.a?'home':(pen.a>pen.h?'away':null);
      else advSide = totH>totA?'home':(totA>totH?'away':null);
    }
    return { reg90h:reg.h, reg90a:reg.a, via, advSide,
      penH: hasPen?pen.h:null, penA: hasPen?pen.a:null };
  }catch(_){ return null; }
}

// Visszaad: { "hazai|vendeg": {... + eventId, winner, statusDetail, koDate} }
function parseEspn(json){
  const out = {};
  const events = (json && json.events) || [];
  events.forEach(ev => {
    const comp = (ev.competitions && ev.competitions[0]) || null;
    if (!comp) return;
    const st = (comp.status && comp.status.type) || {};
    const state = st.state;
    const isLive = state === 'in';
    const isFinished = state === 'post' || st.completed === true;
    const cs = comp.competitors || [];
    const homeC = cs.find(c => c.homeAway === 'home');
    const awayC = cs.find(c => c.homeAway === 'away');
    if (!homeC || !awayC) return;
    const homeEn = ((homeC.team && (homeC.team.displayName || homeC.team.name)) || '').trim();
    const awayEn = ((awayC.team && (awayC.team.displayName || awayC.team.name)) || '').trim();
    const hn = mapTeam(homeEn), an = mapTeam(awayEn);
    if (!hn || !an) return;
    const winner = homeC.winner===true ? 'home' : (awayC.winner===true ? 'away' : null);
    const statusDetail = (st.detail || st.shortDetail || st.description || '').toString();
    out[`${hn.toLowerCase().trim()}|${an.toLowerCase().trim()}`] = {
      home: hn, away: an, homeEn, awayEn,
      scoreHome: num(homeC.score), scoreAway: num(awayC.score),
      isLive, isFinished,
      minute: isLive ? fmtMinute(comp.status && comp.status.displayClock) : '',
      eventId: ev.id, koDate: Date.parse(ev.date||'')||0, winner, statusDetail
    };
  });
  return out;
}

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'};
  const qp = (event && event.queryStringParameters) || {};
  try {
    const resp = await fetch(espnUrl(), { headers: { 'accept': 'application/json' } });
    const json = resp && resp.ok ? await resp.json() : { events: [] };
    const espnByTeams = parseEspn(json);
    const now = Date.now();

    if (qp.raw === 'unmapped') {
      const seen={};
      (json.events||[]).forEach(ev=>{
        const comp=(ev.competitions&&ev.competitions[0]); if(!comp)return;
        (comp.competitors||[]).forEach(c=>{
          const en=((c.team&&(c.team.displayName||c.team.name))||'').trim();
          if(en && EN_TEAM[en]===undefined) seen[en]=(seen[en]||0)+1;
        });
      });
      return { statusCode: 200, headers, body: JSON.stringify({ unmapped:Object.keys(seen), note:'Ezek az ESPN-nevek NINCSENEK a terkepben - HU forditas nelkul maradnak, igy nem parosulnak a menetrendhez. Ures tomb = minden rendben.' }, null, 2) };
    }
    if (qp.raw === 'espn') {
      return { statusCode: 200, headers, body: JSON.stringify({ espnEvents:(json.events||[]).length, parsed: espnByTeams }, null, 2) };
    }

    let matches = Object.values(espnByTeams)
      .filter(e => e.isLive || e.isFinished)
      .map(e => ({
        home: e.home, away: e.away, homeEn: e.homeEn, awayEn: e.awayEn,
        h: e.scoreHome ?? 0, a: e.scoreAway ?? 0,
        status: '', minute: e.minute || '',
        live: e.isLive, finished: e.isFinished, scheduled: false,
        kickoff: null, matchId: null, src: 'espn',
        _eventId: e.eventId, _winner: e.winner, _statusDetail: e.statusDetail, _koDate: e.koDate
      }));

    // Kieseses, befejezett meccsek: 90 perces allas + tovabbjuto + mod automatikus kiszamitasa.
    // Csak a frissen befejezetteknel (kezdes utan max 6 ora), hogy keves summary-hivas legyen.
    const koTargets = matches.filter(m => m.finished && m._koDate >= KO_START && (now - m._koDate) < 6*3600*1000);
    await Promise.all(koTargets.map(async m => {
      const d = await koDetail(m._eventId, m.homeEn, m.awayEn, m._winner);
      if (d){
        if (d.reg90h!=null && d.reg90a!=null){ m.h = d.reg90h; m.a = d.reg90a; } // 90 perces allas a pontozashoz
        m.adv = d.advSide || null;       // 'home'/'away' (ESPN orientacio)
        m.via = d.via || null;           // 'aet' | 'pen' | null
        m.penH = d.penH; m.penA = d.penA;
      } else if (m._winner) {
        m.adv = m._winner; // ha a summary nem jott ossze, legalabb a tovabbjuto a winner-jelzobol
      }
      // GUARD: kieseses meccs CSAK eldontott tovabbjutoval "kesz". adv nelkul (dontetlen 90p-allas,
      // ET/tizenegyes folyamatban, vagy hianyos ESPN-adat) NE vegleguljon, kulonben a kliens
      // dontetlenkent rogzitene es az agrajz elakadna a kesobbi ET/buntето gyoztest sem atveve.
      if (!m.adv) { m.finished = false; m.live = true; }
    }));

    // takaritsuk a belso mezoket
    matches = matches.map(m => { const {_eventId,_winner,_statusDetail,_koDate,homeEn,awayEn,...rest}=m; return rest; });

    if (qp.raw === 'ko') {
      // Diagnosztika: befejezett KO-meccsek nyers szerkezete a holnapi hitelesiteshez.
      const dbg = await Promise.all(Object.values(espnByTeams)
        .filter(e => e.isFinished && e.koDate >= KO_START && (now - e.koDate) < 24*3600*1000)
        .map(async e => {
          let raw=null;
          try{ const r=await fetch(`${SUMMARY_BASE}?event=${e.eventId}`,{headers:{accept:'application/json'}}); if(r.ok){ const s=await r.json(); raw=(s.keyEvents||[]).filter(x=>x.scoringPlay).map(x=>({team:x.team&&x.team.displayName,period:x.period&&x.period.number,shootout:x.shootout,type:x.type&&x.type.type,text:x.text})); } }catch(_){}
          const d=await koDetail(e.eventId,e.homeEn,e.awayEn,e.winner);
          return { match:`${e.home}-${e.away}`, sbScore:`${e.scoreHome}-${e.scoreAway}`, winner:e.winner, statusDetail:e.statusDetail, computed:d, scoringPlays:raw };
        }));
      return { statusCode: 200, headers, body: JSON.stringify({ koFinished: dbg }, null, 2) };
    }

    if (qp.raw === 'out') {
      return { statusCode: 200, headers, body: JSON.stringify({
        liveCount: matches.filter(m => m.live).length,
        live: matches.filter(m => m.live).map(m => ({ home:m.home, away:m.away, h:m.h, a:m.a, minute:m.minute })),
        koFinished: matches.filter(m => m.adv).map(m => ({ home:m.home, away:m.away, score:`${m.h}-${m.a}`, adv:m.adv, via:m.via, pen:m.penH!=null?`${m.penH}-${m.penA}`:null }))
      }, null, 2) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      matches, updatedAt: new Date().toISOString(), source: 'espn',
      wcCount: matches.length, liveCount: matches.filter(m => m.live).length,
      espnCount: Object.keys(espnByTeams).length,
    }) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
