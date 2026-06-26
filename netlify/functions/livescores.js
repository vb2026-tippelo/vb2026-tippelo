const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';
const HEADERS = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST };
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
const tkey = en => mapTeam((en||'').trim()).toLowerCase().trim();

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
function pick(...vs) {
  for (const v of vs) { const n = num(v); if (n !== null) return n; }
  return null;
}
function liveScores(m) {
  let sh = pick(m.scoreHome, m.homeScore, m.home_score, m.scoreH, m.goalsHome, m.homeGoals, m.hScore, m.hg, m.h);
  let sa = pick(m.scoreAway, m.awayScore, m.away_score, m.scoreA, m.goalsAway, m.awayGoals, m.aScore, m.ag, m.a);
  const sc = m.score != null ? m.score : (m.result != null ? m.result : m.scoreStr);
  if ((sh === null || sa === null) && sc != null) {
    if (typeof sc === 'object') {
      sh = sh != null ? sh : pick(sc.home, sc.h, sc.fullTime && sc.fullTime.home, sc.current && sc.current.home, sc.live && sc.live.home);
      sa = sa != null ? sa : pick(sc.away, sc.a, sc.fullTime && sc.fullTime.away, sc.current && sc.current.away, sc.live && sc.live.away);
    } else if (typeof sc === 'string') {
      const mm = sc.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (mm) { sh = sh != null ? sh : Number(mm[1]); sa = sa != null ? sa : Number(mm[2]); }
    }
  }
  return { sh, sa };
}

const LIVE_STATUSES = new Set([2,6,7,8,9,10,37,38]);
const FINISHED_STATUSES = new Set([3,43]);

function ymd(d){ return d.toISOString().slice(0,10).replace(/-/g,''); }
function espnUrl(){
  const now = new Date();
  const y = new Date(now.getTime() - 36*3600*1000);
  const t = new Date(now.getTime() + 24*3600*1000);
  return `${ESPN_BASE}?dates=${ymd(y)}-${ymd(t)}&limit=100`;
}
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
    const hn = mapTeam(((homeC.team && (homeC.team.displayName || homeC.team.name)) || '').trim());
    const an = mapTeam(((awayC.team && (awayC.team.displayName || awayC.team.name)) || '').trim());
    if (!hn || !an) return;
    const info = {
      home: hn, away: an,
      scoreHome: num(homeC.score),
      scoreAway: num(awayC.score),
      isLive, isFinished,
      minute: isLive ? fmtMinute(comp.status && comp.status.displayClock) : ''
    };
    out[`${hn.toLowerCase().trim()}|${an.toLowerCase().trim()}`] = info;
  });
  return out;
}

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  const qp = (event && event.queryStringParameters) || {};
  try {
    const [groupResp, koResp, liveResp, espnResp] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, {headers: HEADERS}).catch(()=>null),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, {headers: HEADERS}).catch(()=>null),
      fetch(`https://${WC_HOST}/wc/live`, {headers: HEADERS}).catch(()=>null),
      fetch(espnUrl(), {headers:{'accept':'application/json'}}).catch(()=>null),
    ]);

    const groupData = groupResp && groupResp.ok ? await groupResp.json() : {data:[]};
    const koData = koResp && koResp.ok ? await koResp.json() : {data:[]};
    const liveData = liveResp && liveResp.ok ? await liveResp.json() : {data:[]};
    const espnData = espnResp && espnResp.ok ? await espnResp.json() : {events:[]};

    const espnByTeams = parseEspn(espnData);

    if (qp.raw === 'live') {
      return { statusCode: 200, headers, body: JSON.stringify({
        liveCount: (liveData.data || []).length,
        sample: (liveData.data || []).slice(0, 6)
      }, null, 2) };
    }
    if (qp.raw === 'espn') {
      return { statusCode: 200, headers, body: JSON.stringify({
        espnEvents: (espnData.events || []).length,
        parsed: espnByTeams
      }, null, 2) };
    }

    const liveById = {};
    const liveByTeams = {};
    (liveData.data || []).forEach(m => {
      const ls = liveScores(m);
      const info = {
        minute: fmtMinute(m.minute != null ? m.minute : (m.time != null ? m.time : m.elapsed)),
        scoreHome: ls.sh,
        scoreAway: ls.sa,
        status: m.status,
        matchId: m.matchId,
      };
      if (m.matchId) liveById[m.matchId] = info;
      const hKey = (m.home||'').toLowerCase().trim();
      const aKey = (m.away||'').toLowerCase().trim();
      if (hKey && aKey) {
        liveByTeams[`${hKey}|${aKey}`] = info;
        liveByTeams[`${aKey}|${hKey}`] = info;
      }
    });

    const allRaw = [...(groupData.data||[]), ...(koData.data||[])];

    const matches = allRaw
      .filter(m => {
        const hk = tkey(m.home), ak = tkey(m.away);
        return m.matchId || m.scoreHome !== null || LIVE_STATUSES.has(m.status)
          || espnByTeams[`${hk}|${ak}`] || espnByTeams[`${ak}|${hk}`];
      })
      .map(m => {
        const hk = tkey(m.home), ak = tkey(m.away);
        let espn = espnByTeams[`${hk}|${ak}`]; let espnFlip = false;
        if (!espn) { espn = espnByTeams[`${ak}|${hk}`]; if (espn) espnFlip = true; }

        let liveInfo = (m.matchId && liveById[m.matchId]) || null;
        if (!liveInfo) {
          liveInfo = liveByTeams[`${(m.home||'').toLowerCase().trim()}|${(m.away||'').toLowerCase().trim()}`] || null;
        }

        let isLive, isFinished, scoreH, scoreA, minute;

        if (espn && (espn.scoreHome != null || espn.scoreAway != null)) {
          scoreH = espnFlip ? (espn.scoreAway ?? 0) : (espn.scoreHome ?? 0);
          scoreA = espnFlip ? (espn.scoreHome ?? 0) : (espn.scoreAway ?? 0);
          isLive = espn.isLive;
          isFinished = espn.isFinished;
          minute = espn.minute || '';
        } else {
          isFinished = FINISHED_STATUSES.has(m.status);
          isLive = !isFinished && (LIVE_STATUSES.has(m.status) || (liveInfo && LIVE_STATUSES.has(liveInfo.status)) || !!liveInfo);
          scoreH = (liveInfo && liveInfo.scoreHome != null) ? liveInfo.scoreHome : (m.scoreHome ?? 0);
          scoreA = (liveInfo && liveInfo.scoreAway != null) ? liveInfo.scoreAway : (m.scoreAway ?? 0);
          minute = liveInfo?.minute || '';
        }

        return {
          home: mapTeam(m.home),
          away: mapTeam(m.away),
          homeEn: m.home,
          awayEn: m.away,
          h: scoreH,
          a: scoreA,
          status: m.statusText,
          minute,
          live: isLive,
          finished: isFinished,
          scheduled: m.status === 1 && !isLive && !isFinished,
          kickoff: m.kickoff,
          matchId: (liveInfo && liveInfo.matchId) || m.matchId || null,
          src: (espn && (espn.scoreHome != null || espn.scoreAway != null)) ? 'espn' : (liveInfo ? 'rapidlive' : 'draw'),
        };
      });

    // ESPN-kiegeszites: az olyan ELO/befejezett ESPN meccsek, amik nem szerepelnek a draw-ban,
    // igy az ESPN onmagaban is eleg a pontos eredmenyhez (a draw esetleges hianya nem szamit).
    const emitted = new Set();
    matches.forEach(mm => {
      const h = (mm.home||'').toLowerCase().trim(), a = (mm.away||'').toLowerCase().trim();
      emitted.add(`${h}|${a}`); emitted.add(`${a}|${h}`);
    });
    Object.values(espnByTeams).forEach(e => {
      const hk = e.home.toLowerCase().trim(), ak = e.away.toLowerCase().trim();
      if (emitted.has(`${hk}|${ak}`)) return;
      if (e.scoreHome == null && e.scoreAway == null) return;
      matches.push({
        home: e.home, away: e.away, homeEn: e.home, awayEn: e.away,
        h: e.scoreHome ?? 0, a: e.scoreAway ?? 0,
        status: '', minute: e.minute || '',
        live: e.isLive, finished: e.isFinished, scheduled: false,
        kickoff: null, matchId: null, src: 'espn-only',
      });
      emitted.add(`${hk}|${ak}`); emitted.add(`${ak}|${hk}`);
    });

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
        source: 'espn+wc2026api',
        wcCount: matches.length,
        liveCount: matches.filter(m => m.live).length,
        espnCount: Object.keys(espnByTeams).length,
      })
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};

