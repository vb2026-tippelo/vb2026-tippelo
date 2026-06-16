exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'A FOOTBALL_DATA_KEY nincs beállítva a Netlify Environment variables-ben.' })
    };
  }

  try {
    const resp = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': apiKey }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: 'A football-data.org hibát adott vissza.', status: resp.status, detail: text })
      };
    }

    const data = await resp.json();
    const matches = (data.matches || []).map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      home: (m.homeTeam && m.homeTeam.name) || '',
      away: (m.awayTeam && m.awayTeam.name) || '',
      homeScore: m.score && m.score.fullTime ? m.score.fullTime.home : null,
      awayScore: m.score && m.score.fullTime ? m.score.fullTime.away : null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ matches })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(e) })
    };
  }
};
