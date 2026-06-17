// Netlify Function: livescores.js
// SportAPI (sportapi7.p.rapidapi.com) + football-data.org fallback

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const SPORTAPI_HOST = 'sportapi7.p.rapidapi.com';
const SPORTAPI_URL = 'https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live';

// FIFA World Cup uniqueTournament ID a SportAPI-ban
const WC_TOURNAMENT_ID = 16;

// EN → belső magyar csapatnév mapping
const EN_TEAM = {
  'Mexico': 'Mexikó', 'South Africa': 'Dél-Afrika', 'South Korea': 'Dél-Korea',
  'Czechia': 'Csehország', 'Czech Republic': 'Csehország',
  'Canada': 'Kanada', 'Bosnia and Herzegovina': 'Bosznia-Hercegovina',
  'Bosnia & Herzegovina': 'Bosznia-Hercegovina',
  'Qatar': 'Katar', 'Switzerland': 'Svájc', 'Brazil': 'Brazília',
  'Morocco': 'Marokkó', 'Haiti': 'Haiti', 'Scotland': 'Skócia',
  'USA': 'USA', 'United States': 'USA', 'Paraguay': 'Paraguay',
  'Australia': 'Ausztrália', 'Türkiye': 'Törökország', 'Turkey': 'Törökország',
  'Germany': 'Németország', 'Curaçao': 'Curaçao',
  'Ivory Coast': 'Elefántcsontpart', "Côte d'Ivoire": 'Elefántcsontpart',
  'Ecuador': 'Ecuador', 'Netherlands': 'Hollandia', 'Japan': 'Japán',
  'Sweden': 'Svédország', 'Tunisia': 'Tunézia', 'Belgium': 'Belgium',
  'Egypt': 'Egyiptom', 'Iran': 'Irán', 'New Zealand': 'Új-Zéland',
  'Spain': 'Spanyolország', 'Cape Verde': 'Zöld-foki-sz.',
  'Saudi Arabia': 'Szaúd-Arábia', 'Uruguay': 'Uruguay',
  'France': 'Franciaország', 'Senegal': 'Szenegál', 'Iraq': 'Irak',
  'Norway': 'Norvégia', 'Argentina': 'Argentína', 'Algeria': 'Algéria',
  'Austria': 'Ausztria', 'Jordan': 'Jordánia', 'Portugal': 'Portugália',
  'DR Congo': 'DR Kongó', 'Democratic Republic of Congo': 'DR Kongó',
  'Uzbekistan': 'Üzbegisztán', 'Colombia': 'Kolumbia',
  'England': 'Anglia', 'Croatia': 'Horvátország',
  'Ghana': 'Ghána', 'Panama': 'Panama'
};

function mapTeam(enName) {
  return EN_TEAM[enName] || enName;
}

async function fetchSportAPI() {
  const resp = await fetch(SPORTAPI_URL, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': SPORTAPI_HOST
    }
  });
  if (!resp.ok) throw new Error(`SportAPI HTTP ${resp.status}`);
  const data = await resp.json();

  // Csak VB 2026 meccsek
  const events = (data.events || []).filter(e =>
    e.tournament?.uniqueTournament?.id === WC_TOURNAMENT_ID
  );

  const matches = [];
  const results = {};

  for (const e of events) {
    const homeEn = e.homeTeam?.name;
    const awayEn = e.awayTeam?.name;
    const homeHu = mapTeam(homeEn);
    const awayHu = mapTeam(awayEn);
    const h = e.homeScore?.current ?? 0;
    const a = e.awayScore?.current ?? 0;
    const statusType = e.status?.type; // 'inprogress', 'finished', 'notstarted'
    const statusDesc = e.status?.description; // '1st half', '2nd half', 'Ended'
    const isLive = statusType === 'inprogress';
    const isFinished = statusType === 'finished' || statusDesc === 'Ended' || statusDesc === 'AP' || statusDesc === 'AET';

    matches.push({
      home: homeHu,
      away: awayHu,
      homeEn,
      awayEn,
      h,
      a,
      status: statusType,
      desc: statusDesc,
      live: isLive,
      finished: isFinished,
      id: e.id
    });

    // Ha befejezett: eredmény objektum összeállítása
    if (isFinished) {
      results[`${homeHu}_${awayHu}`] = { homeGoals: h, awayGoals: a };
    }
  }

  return { matches, results, source: 'sportapi' };
}

async function fetchFootballData() {
  const KEY = process.env.FOOTBALLDATA_KEY || 'placeholder';
  const resp = await fetch('https://api.football-data.org/v4/competitions/WC/matches?status=LIVE,IN_PLAY,PAUSED', {
    headers: { 'X-Auth-Token': KEY }
  });
  if (!resp.ok) throw new Error(`football-data HTTP ${resp.status}`);
  const data = await resp.json();
  return data.matches || [];
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // Elsődleges forrás: SportAPI
    const result = await fetchSportAPI();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        matches: result.matches,
        updatedAt: new Date().toISOString(),
        source: result.source,
        wcCount: result.matches.length
      })
    };
  } catch (err) {
    console.error('SportAPI error:', err.message);

    // Fallback: football-data.org
    try {
      const fdMatches = await fetchFootballData();
      const matches = fdMatches.map(m => ({
        home: mapTeam(m.homeTeam.name),
        away: mapTeam(m.awayTeam.name),
        h: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
        a: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
        status: m.status,
        live: ['IN_PLAY', 'PAUSED'].includes(m.status),
        finished: m.status === 'FINISHED'
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          matches,
          updatedAt: new Date().toISOString(),
          source: 'football-data',
          wcCount: matches.length
        })
      };
    } catch (err2) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: err.message, fallbackError: err2.message })
      };
    }
  }
};
