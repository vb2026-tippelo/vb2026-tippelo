// VB 2026 elo eredmenyek — KIZAROLAG ESPN (rejtett, ingyenes, kulcs nelkuli scoreboard API).
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

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
  'DR Congo':'DR Kongó','D.R. Congo':'DR Kongó','Democratic Republic of Congo':'DR Kongó',
  'Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
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

// Visszaad: { "hazai|vendeg": {home,away,homeEn,awayEn,scoreHome,scoreAway,isLive,isFinished,minute} } magyar nevekkel kulcsozva
function parseEspn(json){
  const out = {};
  const events = (json && json.events) || [];
  events.forEach(ev => {
    const comp = (ev.competitions && ev.competitions[0]) || null;
    if (!comp) return;
    const st = (comp.status && comp.status.type) || {};
    const state = st.state; // pre / in / post
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
    out[`${hn.toLowerCase().trim()}|${an.toLowerCase().trim()}`] = {
      home: hn, away: an, homeEn, awayEn,
      scoreHome: num(homeC.score),
      scoreAway: num(awayC.score),
      isLive, isFinished,
      minute: isLive ? fmtMinute(comp.status && comp.status.displayClock) : ''
    };
  });
  return out;
}

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  const qp = (event && event.queryStringParameters) || {};
  try {
    const resp = await fetch(espnUrl(), { headers: { 'accept': 'application/json' } });
    const json = resp && resp.ok ? await resp.json() : { events: [] };
    const espnByTeams = parseEspn(json);

    if (qp.raw === 'espn') {
      return { statusCode: 200, headers, body: JSON.stringify({
        espnEvents: (json.events || []).length,
        parsed: espnByTeams
      }, null, 2) };
    }

    // Csak az elo / befejezett meccsek kellenek a kliensnek (csapatnev alapjan parositja a sajat menetrendjehez).
    const matches = Object.values(espnByTeams)
      .filter(e => e.isLive || e.isFinished)
      .map(e => ({
        home: e.home, away: e.away, homeEn: e.homeEn, awayEn: e.awayEn,
        h: e.scoreHome ?? 0, a: e.scoreAway ?? 0,
        status: '', minute: e.minute || '',
        live: e.isLive, finished: e.isFinished, scheduled: false,
        kickoff: null, matchId: null, src: 'espn',
      }));

    if (qp.raw === 'out') {
      return { statusCode: 200, headers, body: JSON.stringify({
        liveCount: matches.filter(m => m.live).length,
        live: matches.filter(m => m.live).map(m => ({ home: m.home, away: m.away, h: m.h, a: m.a, minute: m.minute, src: m.src }))
      }, null, 2) };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        matches,
        updatedAt: new Date().toISOString(),
        source: 'espn',
        wcCount: matches.length,
        liveCount: matches.filter(m => m.live).length,
        espnCount: Object.keys(espnByTeams).length,
      })
    };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
