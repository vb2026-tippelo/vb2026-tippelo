const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '1a897c26b1msh3a5cd4defcc5714p150cd7jsn31d90b539f03';
const WC_HOST = 'world-cup-2026-live-api.p.rapidapi.com';

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  const matchId = event.queryStringParameters?.matchId;
  if(!matchId) return {statusCode:400, headers, body: JSON.stringify({error:'matchId required'})};
  try {
    const resp = await fetch(`https://${WC_HOST}/wc/match/${matchId}/lineups`, {
      headers: {'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': WC_HOST}
    });
    if(!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    return {statusCode:200, headers, body: JSON.stringify(data)};
  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error: err.message})};
  }
};
