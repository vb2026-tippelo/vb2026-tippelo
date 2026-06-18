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

function mapTeam(en){ return EN_TEAM[en] || en; }

const LIVE_STATUSES = new Set([2,6,7,8,9,10,37,38]);
const FINISHED_STATUSES = new Set([3,43]);

exports.handler = async function(event, context) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  try {
    // Lekérjük a csoport + KO meccseket + élő percszámot párhuzamosan
    const [groupResp, koResp, liveResp] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/live`, {headers: HEADERS}),
    ]);

    const groupData = groupResp.ok ? await groupResp.json() : {data:[]};
    const koData = koResp.ok ? await koResp.json() : {data:[]};
    const liveData = liveResp.ok ? await liveResp.json() : {data:[]};

    // Percszám matchId alapján
    const minuteMap = {};
    (liveData.data || []).forEach(m => { minuteMap[m.matchId] = m.minute || ''; });

    // Összes meccs feldolgozása (csoport + KO)
    const allRaw = [...(groupData.data||[]), ...(koData.data||[])];
    const matches = allRaw
      .filter(m => m.scoreHome !== null || LIVE_STATUSES.has(m.status))
      .map(m => ({
        home: mapTeam(m.home),
        away: mapTeam(m.away),
        homeEn: m.home,
        awayEn: m.away,
        h: m.scoreHome ?? 0,
        a: m.scoreAway ?? 0,
        status: m.statusText,
        minute: minuteMap[m.matchId] || '',
        live: LIVE_STATUSES.has(m.status),
        finished: FINISHED_STATUSES.has(m.status),
        kickoff: m.kickoff,
        matchId: m.matchId || null,
        stage: m.round ? 'ko' : 'group',
      }));

    const liveCount = matches.filter(m => m.live).length;
    const finishedCount = matches.filter(m => m.finished).length;
    console.log(`Meccsek: ${matches.length} (élő: ${liveCount}, befejezett: ${finishedCount})`);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        matches, updatedAt: new Date().toISOString(),
        source: 'wc2026api', wcCount: matches.length
      })
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
