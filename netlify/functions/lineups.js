// Felallas (lineups) — ESPN fifa.world summary alapjan. RapidAPI kivezetve.
const EN_TEAM = {
  'Mexico':'Mexikó','South Africa':'Dél-Afrika','South Korea':'Dél-Korea','Korea Republic':'Dél-Korea',
  'Czechia':'Csehország','Czech Republic':'Csehország','Canada':'Kanada',
  'Bosnia and Herzegovina':'Bosznia-Hercegovina','Bosnia & Herzegovina':'Bosznia-Hercegovina',
  'Qatar':'Katar','Switzerland':'Svájc','Brazil':'Brazília','Morocco':'Marokkó',
  'Haiti':'Haiti','Scotland':'Skócia','USA':'USA','United States':'USA',
  'Paraguay':'Paraguay','Australia':'Ausztrália','Türkiye':'Törökország','Turkey':'Törökország',
  'Germany':'Németország','Curaçao':'Curaçao','Curacao':'Curaçao',
  "Ivory Coast":'Elefántcsontpart',"Côte d'Ivoire":'Elefántcsontpart',
  'Ecuador':'Ecuador','Netherlands':'Hollandia','Japan':'Japán','Sweden':'Svédország',
  'Tunisia':'Tunézia','Belgium':'Belgium','Egypt':'Egyiptom','Iran':'Irán','IR Iran':'Irán',
  'New Zealand':'Új-Zéland','Spain':'Spanyolország','Cape Verde':'Zöld-foki-sz.','Cabo Verde':'Zöld-foki-sz.',
  'Saudi Arabia':'Szaúd-Arábia','Uruguay':'Uruguay','France':'Franciaország',
  'Senegal':'Szenegál','Iraq':'Irak','Norway':'Norvégia','Argentina':'Argentína',
  'Algeria':'Algéria','Austria':'Ausztria','Jordan':'Jordánia','Portugal':'Portugália',
  'DR Congo':'DR Kongó','D.R. Congo':'DR Kongó','Democratic Republic of Congo':'DR Kongó',
  'Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
  'Croatia':'Horvátország','Ghana':'Ghána','Panama':'Panama'
};

const SB='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
const mapTeam = en => EN_TEAM[en] || en;
const tkey = s => (s||'').toString().toLowerCase().trim();
function ymd(d){return d.toISOString().slice(0,10).replace(/-/g,'');}

async function findEventId(home, away, date){
  let base = date ? new Date(date+'T12:00:00Z') : new Date();
  if(isNaN(base.getTime())) base = new Date();
  const y=new Date(base.getTime()-36*3600*1000), t=new Date(base.getTime()+36*3600*1000);
  const r=await fetch(`${SB}?dates=${ymd(y)}-${ymd(t)}&limit=100`,{headers:{accept:'application/json'}});
  if(!r.ok) return null;
  const sb=await r.json();
  const hk=tkey(home), ak=tkey(away);
  for(const ev of (sb.events||[])){
    const comp=ev.competitions&&ev.competitions[0]; if(!comp)continue;
    const names=(comp.competitors||[]).map(c=>tkey(mapTeam(((c.team&&(c.team.displayName||c.team.name))||'').trim())));
    if(names.includes(hk)&&names.includes(ak)) return ev.id;
  }
  return null;
}

function parseLineup(rosters, appHome, appAway){
  const out={formation:{home:'',away:''},startingXI:{home:[],away:[]},substitutes:{home:[],away:[]},coaches:{}};
  let matched=0;
  (rosters||[]).forEach(r=>{
    const tn=tkey(mapTeam(((r.team&&(r.team.displayName||r.team.name))||'').trim()));
    let side = tn===tkey(appHome)?'home':(tn===tkey(appAway)?'away':null);
    if(!side) side = r.homeAway==='home'?'home':(r.homeAway==='away'?'away':null);
    if(!side) return;
    matched++;
    out.formation[side]=r.formation||'';
    (r.roster||[]).forEach(p=>{
      const player={number:(p.jersey||'').toString(), name:(p.athlete&&(p.athlete.displayName||p.athlete.fullName))||''};
      if(!player.name) return;
      if(p.starter) out.startingXI[side].push(player);
      else out.substitutes[side].push(player);
    });
  });
  const hasAny = out.startingXI.home.length||out.startingXI.away.length;
  return hasAny ? out : null;
}

exports.handler = async function(event){
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store, max-age=0'};
  const qp=(event&&event.queryStringParameters)||{};
  const home=qp.home, away=qp.away, date=qp.date;
  let eventId=qp.event||null;
  try{
    if(!eventId){
      if(!home||!away) return {statusCode:400,headers,body:JSON.stringify({error:'home & away required'})};
      eventId=await findEventId(home,away,date);
    }
    if(!eventId) return {statusCode:200,headers,body:JSON.stringify({data:null,reason:'no-event'})};
    const sr=await fetch(`${SUM}?event=${eventId}`,{headers:{accept:'application/json'}});
    if(!sr.ok) return {statusCode:200,headers,body:JSON.stringify({data:null,reason:'summary-'+sr.status})};
    const sum=await sr.json();
    if(qp.raw==='1') return {statusCode:200,headers,body:JSON.stringify({eventId,rosters:sum.rosters},null,2)};
    const data=parseLineup(sum.rosters, home, away);
    return {statusCode:200,headers,body:JSON.stringify({data,eventId})};
  }catch(err){
    return {statusCode:200,headers,body:JSON.stringify({data:null,error:err.message})};
  }
};
