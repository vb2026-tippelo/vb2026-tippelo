const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';

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
    const resp = await fetch(`https://${WC_HOST}/wc/draw`, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': WC_HOST
      }
    });
    if(!resp.ok) throw new Error(`API error: ${resp.status}`);
    const json = await resp.json();

    const matches = (json.data || [])
      .filter(m => m.scoreHome !== null || LIVE_STATUSES.has(m.status))
      .map(m => ({
        home: mapTeam(m.home),
        away: mapTeam(m.away),
        h: m.scoreHome ?? 0,
        a: m.scoreAway ?? 0,
        status: m.statusText,
        minute: m.minute || '',
        live: LIVE_STATUSES.has(m.status),
        finished: FINISHED_STATUSES.has(m.status),
        kickoff: m.kickoff,
      }));

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        matches,
        updatedAt: new Date().toISOString(),
        source: 'wc2026api',
        wcCount: matches.length
      })
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
