const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';
const HEADERS = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST };

const EN_TO_HU = {
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

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  try {
    const [groupResp, koResp] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, {headers: HEADERS}),
    ]);
    const groupData = groupResp.ok ? await groupResp.json() : {data:[]};
    const koData = koResp.ok ? await koResp.json() : {data:[]};
    const allMatches = [...(groupData.data||[]), ...(koData.data||[])];

    const result = allMatches
      .filter(m => m.kickoff && m.matchId)
      .map(m => ({
        matchId: m.matchId,
        kickoff: m.kickoff,
        home: EN_TO_HU[m.home] || m.home,
        away: EN_TO_HU[m.away] || m.away,
        homeEn: m.home,
        awayEn: m.away,
      }));

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, count: result.length, matches: result })
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
