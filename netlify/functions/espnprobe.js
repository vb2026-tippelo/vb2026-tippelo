// IDEIGLENES diagnosztika: egy elo VB-meccs ESPN summary-szerkezetet mutatja meg,
// hogy pontosan lassuk a felallas/statisztika/gollovo mezoneveket.
const SB='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
function ymd(d){return d.toISOString().slice(0,10).replace(/-/g,'');}
exports.handler = async function(event){
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store'};
  const qp=(event&&event.queryStringParameters)||{};
  try{
    const now=new Date();
    const y=new Date(now.getTime()-36*3600*1000), t=new Date(now.getTime()+24*3600*1000);
    const sbResp=await fetch(`${SB}?dates=${ymd(y)}-${ymd(t)}&limit=100`,{headers:{accept:'application/json'}});
    const sb=await sbResp.json();
    const events=(sb.events||[]);
    // valasszuk az elso ELO meccset, vagy ha nincs, az elso befejezettet, kulonben az elsot
    let ev=events.find(e=>{const s=e.competitions&&e.competitions[0]&&e.competitions[0].status&&e.competitions[0].status.type;return s&&s.state==='in';})
      || events.find(e=>{const s=e.competitions&&e.competitions[0]&&e.competitions[0].status&&e.competitions[0].status.type;return s&&s.state==='post';})
      || events[0];
    if(!ev) return {statusCode:200,headers,body:JSON.stringify({note:'nincs esemeny',count:events.length},null,2)};
    const id=ev.id;
    const sumResp=await fetch(`${SUM}?event=${id}`,{headers:{accept:'application/json'}});
    const sum=await sumResp.json();

    // Strukturalt, ROVID kep a mezonevekrol:
    const out={ eventId:id, eventName:ev.name, topKeys:Object.keys(sum) };

    // ROSTERS (felallas)
    if(sum.rosters){
      out.rostersCount=sum.rosters.length;
      const r0=sum.rosters[0]||{};
      out.roster0_keys=Object.keys(r0);
      out.roster0_homeAway=r0.homeAway;
      out.roster0_formation=r0.formation;
      out.roster0_team=r0.team&&r0.team.displayName;
      const list=r0.roster||r0.entries||r0.athletes||[];
      out.roster0_listLen=list.length;
      out.roster0_player0=list[0]||null; // teljes elso jatekos objektum
      out.roster0_player_starterFlags=list.slice(0,14).map(p=>({n:(p.athlete&&p.athlete.displayName)||p.displayName,starter:p.starter,pos:p.position&&(p.position.abbreviation||p.position.name),jersey:p.jersey}));
    } else out.rosters='NINCS';

    // BOXSCORE (statisztika)
    if(sum.boxscore){
      out.boxscore_keys=Object.keys(sum.boxscore);
      const tm=(sum.boxscore.teams&&sum.boxscore.teams[0])||{};
      out.box_team0_keys=Object.keys(tm);
      const stats=tm.statistics||[];
      out.box_team0_statsLen=stats.length;
      out.box_team0_stats=stats.slice(0,40).map(s=>({name:s.name,label:s.label,displayValue:s.displayValue}));
    } else out.boxscore='NINCS';

    // GOL/ESEMENYEK (gollovo) — tobb lehetseges hely
    out.hasKeyEvents=!!sum.keyEvents; out.hasPlays=!!sum.plays; out.hasCommentary=!!sum.commentary;
    const kev=sum.keyEvents||sum.plays||[];
    out.keyEvent0=kev[0]||null;
    out.goalSample=(kev.filter(e=>JSON.stringify(e).toLowerCase().includes('goal')).slice(0,2));

    // scoringPlays a header-ben?
    if(sum.scoringPlays) out.scoringPlays0=sum.scoringPlays[0];
    if(sum.leaders) out.leaders0=sum.leaders[0];

    return {statusCode:200,headers,body:JSON.stringify(out,null,2)};
  }catch(err){
    return {statusCode:500,headers,body:JSON.stringify({error:err.message},null,2)};
  }
};
