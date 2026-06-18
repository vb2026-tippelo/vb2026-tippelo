const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';
const HEADERS = { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST };

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  try {
    // Összes meccs lekérése (group + ko)
    const [groupResp, koResp] = await Promise.all([
      fetch(`https://${WC_HOST}/wc/draw?stage=group`, {headers: HEADERS}),
      fetch(`https://${WC_HOST}/wc/draw?stage=ko`, {headers: HEADERS}),
    ]);
    const groupData = groupResp.ok ? await groupResp.json() : {data:[]};
    const koData = koResp.ok ? await koResp.json() : {data:[]};
    const allMatches = [...(groupData.data||[]), ...(koData.data||[])];

    // Csak a matchId-vel rendelkező meccsek
    const withId = allMatches.filter(m => m.matchId);
    console.log(`Összesen ${withId.length} meccs matchId-vel`);

    // Helyszín lekérése párhuzamosan (10-es kötegekben)
    const venues = {};
    const chunkSize = 10;
    for(let i = 0; i < withId.length; i += chunkSize) {
      const chunk = withId.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(async m => {
        try {
          const r = await fetch(`https://${WC_HOST}/wc/match/${m.matchId}/detail`, {headers: HEADERS});
          if(!r.ok) return null;
          const d = await r.json();
          return {home: m.home, away: m.away, venue: d.data?.venue || '', matchId: m.matchId};
        } catch(e) { return null; }
      }));
      results.filter(Boolean).forEach(r => {
        if(r.venue) venues[r.matchId] = {venue: r.venue, home: r.home, away: r.away};
      });
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({success: true, count: Object.keys(venues).length, venues})
    };
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
