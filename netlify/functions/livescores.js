const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const SPORTAPI_HOST = 'sportapi7.p.rapidapi.com';
const WC_TOURNAMENT_ID = 16;

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
  'DR Congo':'DR Kongó','Democratic Republic of Congo':'DR Kongó',
  'Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
  'Croatia':'Horvátország','Ghana':'Ghána','Panama':'Panama'
};

function mapTeam(en){ return EN_TEAM[en] || en; }

function getToday(){
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function fetchSportAPI(){
  const headers = {'x-rapidapi-key':RAPIDAPI_KEY,'x-rapidapi-host':SPORTAPI_HOST};
  const today = getToday();

  // Két endpoint párhuzamosan
  const [liveResp, schedResp] = await Promise.all([
    fetch(`https://${SPORTAPI_HOST}/api/v1/sport/football/events/live`, {headers}),
    fetch(`https://${SPORTAPI_HOST}/api/v1/sport/football/scheduled-events/${today}`, {headers})
  ]);

  const [liveData, schedData] = await Promise.all([
    liveResp.ok ? liveResp.json() : {events:[]},
    schedResp.ok ? schedResp.json() : {events:[]}
  ]);

  // VB meccsek szűrése mindkét forrásból
  const isWC = e => e.tournament?.uniqueTournament?.id === WC_TOURNAMENT_ID;
  const liveEvents = (liveData.events || []).filter(isWC);
  const schedEvents = (schedData.events || []).filter(isWC);

  // Merge: scheduled felülírja a live-ot ha ott is szerepel (pontosabb adat)
  const eventMap = {};
  liveEvents.forEach(e => { eventMap[e.id] = e; });
  schedEvents.forEach(e => { eventMap[e.id] = e; }); // scheduled wins

  const matches = Object.values(eventMap).map(e => {
    const homeEn = e.homeTeam?.name;
    const awayEn = e.awayTeam?.name;
    const h = e.homeScore?.current ?? 0;
    const a = e.awayScore?.current ?? 0;
    const statusType = e.status?.type;
    const statusDesc = e.status?.description;
    const isLive = statusType === 'inprogress';
    const isFinished = statusType === 'finished' || statusDesc === 'Ended' || statusDesc === 'AP' || statusDesc === 'AET';
    return {
      home: mapTeam(homeEn), away: mapTeam(awayEn),
      homeEn, awayEn, h, a,
      status: statusType, desc: statusDesc,
      live: isLive, finished: isFinished, id: e.id
    };
  });

  return { matches, source: 'sportapi', wcCount: matches.length };
}

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  try {
    const result = await fetchSportAPI();
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        matches: result.matches,
        updatedAt: new Date().toISOString(),
        source: result.source,
        wcCount: result.wcCount
      })
    };
  } catch(err) {
    console.error('SportAPI error:', err.message);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
