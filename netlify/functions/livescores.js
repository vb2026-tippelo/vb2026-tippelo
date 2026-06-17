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

function getDateStr(offsetDays=0){
  const d = new Date(Date.now() + offsetDays*86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function fetchSportAPI(){
  const headers = {'x-rapidapi-key':RAPIDAPI_KEY,'x-rapidapi-host':SPORTAPI_HOST};
  const today = getDateStr(0);
  const yesterday = getDateStr(-1);

  // 3 endpoint párhuzamosan: live + mai + tegnapi
  const [liveResp, todayResp, yestResp] = await Promise.all([
    fetch(`https://${SPORTAPI_HOST}/api/v1/sport/football/events/live`, {headers}),
    fetch(`https://${SPORTAPI_HOST}/api/v1/sport/football/scheduled-events/${today}`, {headers}),
    fetch(`https://${SPORTAPI_HOST}/api/v1/sport/football/scheduled-events/${yesterday}`, {headers}),
  ]);

  const [liveData, todayData, yestData] = await Promise.all([
    liveResp.ok ? liveResp.json() : {events:[]},
    todayResp.ok ? todayResp.json() : {events:[]},
    yestResp.ok ? yestResp.json() : {events:[]},
  ]);

  const isWC = e => e.tournament?.uniqueTournament?.id === WC_TOURNAMENT_ID;
  const eventMap = {};

  // Live felül mindent
  [...(yestData.events||[]), ...(todayData.events||[]), ...(liveData.events||[])]
    .filter(isWC)
    .forEach(e => { eventMap[e.id] = e; });

  const matches = Object.values(eventMap).map(e => {
    const h = e.homeScore?.current ?? 0;
    const a = e.awayScore?.current ?? 0;
    const statusType = e.status?.type;
    const statusDesc = e.status?.description;
    return {
      home: mapTeam(e.homeTeam?.name),
      away: mapTeam(e.awayTeam?.name),
      homeEn: e.homeTeam?.name,
      awayEn: e.awayTeam?.name,
      h, a, status: statusType, desc: statusDesc,
      live: statusType === 'inprogress',
      finished: statusType === 'finished' || ['Ended','AP','AET','Penalties'].includes(statusDesc),
      id: e.id
    };
  });

  console.log(`WC matches: ${matches.length}, live: ${matches.filter(m=>m.live).length}, finished: ${matches.filter(m=>m.finished).length}`);
  return { matches };
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
        source: 'sportapi',
        wcCount: result.matches.length
      })
    };
  } catch(err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
