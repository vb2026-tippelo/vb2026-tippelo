const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';
const HEADERS = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST };

const EN_TEAM = {
  'Mexico':'Mexikó','South Africa':'Dél-Afrika','South Korea':'Dél-Korea',
  'Czechia':'Csehország','Czech Republic':'Csehország','Canada':'Kanada',
  'Bosnia and Herzegovina':'Bosznia-Hercegovina','Bosnia & Herzegovina':'Bosznia-Hercegovina',
  'Qatar':'Katar','Switzerland':'Svájc','Brazil':'Brazília','Morocco':'Marokkó',
  'Haiti':'Haiti','Scotland':'Skócia','USA':'USA','United States':'USA',
  'Paraguay':'Paraguay','Australia':'Ausztrália','Türkiye':'Törökország','Turkey':'Törökország',
  'Germany':'Németország','Curaçao':'Curaçao','Curacao':'Curaçao',
  "Ivory Coast":'Elefántcsontpart',"Côte d'Ivoire":'Elefántcsontpart',
  'Ecuador':'Ecuador','Netherlands':'Hollandia','Japan':'Japán','Sweden':'Svédország',
  'Tunisia':'Tunézia','Belgium':'Belgium','Egypt':'Egyiptom','Iran':'Irán',
  'New Zealand':'Új-Zéland','Spain':'Spanyolország','Cape Verde':'Zöld-foki-sz.',
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
  if (!s || s === '0') return '';
  return s.includes('\'') ? s : s + '\'';
}

// --- robusztus gol-kinyeres: tobbfele mezonevet es "2-0" string format is kezel ---
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

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  const qp = (event && event.queryStringParameters) || {};
  try {
    const [groupResp, koResp, liveResp] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/live`, {headers: HEADERS}),
    ]);

    const groupData = groupResp.ok ? await groupResp.json() : {data:[]};
    const koData = koResp.ok ? await koResp.json() : {data:[]};
    const liveData = liveResp.ok ? await liveResp.json() : {data:[]};

    // DIAGNOSZTIKA: ?raw=live -> a /wc/live nyers elso nehany eleme, hogy lassuk a valodi mezoneveket
    if (qp.raw === 'live') {
      return { statusCode: 200, headers, body: JSON.stringify({
        liveCount: (liveData.data || []).length,
        sample: (liveData.data || []).slice(0, 6)
      }, null, 2) };
    }

    // Live meccsek: matchId → info + csapatnév → info
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
      // Csapatnév alapú index (mindkét irányban)
      const hKey = (m.home||'').toLowerCase().trim();
      const aKey = (m.away||'').toLowerCase().trim();
      if (hKey && aKey) {
        liveByTeams[`${hKey}|${aKey}`] = info;
        liveByTeams[`${aKey}|${hKey}`] = info;
      }
    });

    const allRaw = [...(groupData.data||[]), ...(koData.data||[])];

    const matches = allRaw
      .filter(m => m.matchId || m.scoreHome !== null || LIVE_STATUSES.has(m.status))
      .map(m => {
        // Live info keresés: matchId alapján először, utána csapatnév alapján
        let liveInfo = (m.matchId && liveById[m.matchId]) || null;
        if (!liveInfo) {
          const hKey = (m.home||'').toLowerCase().trim();
          const aKey = (m.away||'').toLowerCase().trim();
          liveInfo = liveByTeams[`${hKey}|${aKey}`] || null;
        }

        const isFinished = FINISHED_STATUSES.has(m.status);
        // Ha a meccs egyaltalan szerepel a /wc/live feedben, elonek tekintjuk (kiveve ha mar befejezett),
        // hogy ne essunk vissza a lassabb /wc/draw vegpont elavult allasara.
        const isLive = !isFinished && (LIVE_STATUSES.has(m.status) || (liveInfo && LIVE_STATUSES.has(liveInfo.status)) || !!liveInfo);
        // Mindig a friss live-feed allast reszesitjuk elonyben, ha van ervenyes ertek.
        const scoreH = (liveInfo && liveInfo.scoreHome != null) ? liveInfo.scoreHome : (m.scoreHome ?? 0);
        const scoreA = (liveInfo && liveInfo.scoreAway != null) ? liveInfo.scoreAway : (m.scoreAway ?? 0);

        return {
          home: mapTeam(m.home),
          away: mapTeam(m.away),
          homeEn: m.home,
          awayEn: m.away,
          h: scoreH,
          a: scoreA,
          status: m.statusText,
          minute: liveInfo?.minute || '',
          live: isLive,
          finished: isFinished,
          scheduled: m.status === 1,
          kickoff: m.kickoff,
          matchId: liveInfo?.matchId || m.matchId || null,
        };
      });

    console.log(`Live meccsek: ${Object.keys(liveById).length}, draw total: ${allRaw.length}`);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        matches,
        updatedAt: new Date().toISOString(),
        source: 'wc2026api',
        wcCount: matches.length,
        liveCount: matches.filter(m => m.live).length,
      })
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
