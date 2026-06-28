// Gollovolista — ESPN fifa.world summary keyEvents alapjan. RapidAPI kivezetve.
// Firestore-cache (wc_scorers) meccsenkenti bontasban; a cron loopolja a pending-et.
const admin = require('firebase-admin');

const SB='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
const CACHE_KEY='wc_scorers';
const MAX_PER_RUN=20;

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
  'DR Congo':'DR Kongó','D.R. Congo':'DR Kongó','Democratic Republic of Congo':'DR Kongó','Congo DR':'DR Kongó',
  'Uzbekistan':'Üzbegisztán','Colombia':'Kolumbia','England':'Anglia',
  'Croatia':'Horvátország','Ghana':'Ghána','Panama':'Panama'
};
const mapTeam = en => EN_TEAM[en] || en;

let initError=null;
try{ if(!admin.apps.length){ admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))}); } }catch(e){ initError=e.message; }

function ymd(d){return d.toISOString().slice(0,10).replace(/-/g,'');}
async function sb(from,to){
  try{ const r=await fetch(`${SB}?dates=${from}-${to}&limit=200`,{headers:{accept:'application/json'}}); if(!r.ok)return []; const j=await r.json(); return j.events||[]; }catch(_){ return []; }
}
async function discover(full){
  let evs=[];
  if(full){
    const chunks=[['20260611','20260620'],['20260621','20260630'],['20260701','20260710'],['20260711','20260720']];
    const parts=await Promise.all(chunks.map(c=>sb(c[0],c[1])));
    parts.forEach(p=>{evs=evs.concat(p);});
  }else{
    const now=Date.now();
    evs=await sb(ymd(new Date(now-4*864e5)), ymd(new Date(now+864e5)));
  }
  const map={};
  evs.forEach(e=>{
    const comp=e.competitions&&e.competitions[0];
    const st=comp&&comp.status&&comp.status.type&&comp.status.type.state;
    const totGoals=(comp&&comp.competitors||[]).reduce((s,c)=>s+(parseInt(c.score)||0),0);
    map[e.id]={id:e.id,state:st,goals:totGoals,name:e.name};
  });
  return Object.values(map);
}
function isGoal(ev){
  if(!ev||ev.scoringPlay!==true||ev.shootout===true)return false;
  const tt=(ev.type&&(ev.type.type||'')).toString().toLowerCase();
  const txt=(ev.text||'').toString().toLowerCase();
  if(tt.includes('own')||txt.includes('own goal'))return false; // ongol nem szamit a golszerzonek
  return tt.includes('goal')||tt.includes('penalty');           // gol vagy buntetobol szerzett gol
}
async function matchGoals(eventId){
  const r=await fetch(`${SUM}?event=${eventId}`,{headers:{accept:'application/json'}});
  if(!r.ok)return null;
  const sum=await r.json();
  const sc={};
  (sum.keyEvents||[]).forEach(ev=>{
    if(!isGoal(ev))return;
    const parts=ev.participants||[];
    const scorer=parts[0]&&parts[0].athlete&&parts[0].athlete.displayName;
    if(!scorer)return;
    const teamHU=mapTeam((((ev.team&&ev.team.displayName)||'')).trim());
    const k=scorer+'@@'+teamHU;
    if(!sc[k])sc[k]={name:scorer,team:teamHU,goals:0,assists:0};
    sc[k].goals++;
    const ass=parts[1]&&parts[1].athlete&&parts[1].athlete.displayName;
    if(ass){ const ak=ass+'@@'+teamHU; if(!sc[ak])sc[ak]={name:ass,team:teamHU,goals:0,assists:0}; sc[ak].assists++; }
  });
  return sc;
}

exports.handler = async function(event){
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store'};
  const qp=(event&&event.queryStringParameters)||{};
  const reset=!!qp.reset;
  const doProcess = !!qp.process || reset; // CSAK a cron dolgoz fel; a kliens a Firestore-bol olvas
  try{
    let cache={matches:{},updatedAt:null,src:'espn'};
    let ref=null;
    if(!initError){
      ref=admin.firestore().collection('vb2026data').doc(CACHE_KEY);
      if(!reset){ try{ const snap=await ref.get(); if(snap.exists){ const v=JSON.parse(snap.data().value); if(v&&v.src==='espn'&&v.matches)cache=v; } }catch(_){} }
    }
    const matches=cache.matches||{};
    let updatedAt=cache.updatedAt, pending=0;

    if(doProcess){
      const full = reset || Object.keys(matches).length===0;
      // A felderites MINDIG a teljes tornat nezi (4 konnyu scoreboard-hivas), kulonben a
      // backfill elakadna a regebbi meccseknel. A draga summary-hivasokat a `final`-cache
      // es a MAX_PER_RUN keret vedi. Az elo meccsek final=false -> minden korben frissulnek.
      const discovered=await discover(true);
      const toProcess=discovered.filter(e=>(e.state==='in'||e.state==='post')&&!(matches[e.id]&&matches[e.id].final));
      const batch=toProcess.slice(0,MAX_PER_RUN);
      const res=await Promise.all(batch.map(async e=>{ try{ const sc=await matchGoals(e.id); return {e,sc}; }catch(_){ return null; } }));
      res.forEach(r=>{
        if(!r||!r.sc)return;
        const extracted=Object.values(r.sc).reduce((s,v)=>s+(v.goals||0),0);
        const final = r.e.state==='post' && !((r.e.goals||0)>0 && extracted===0);
        matches[r.e.id]={sc:r.sc, final};
      });
      updatedAt=new Date().toISOString();
      const newCache={matches,updatedAt,src:'espn'};
      if((batch.length||reset||full)&&ref){ try{ await ref.set({value:JSON.stringify(newCache)}); }catch(_){} }
      pending=Math.max(0,toProcess.length-batch.length);
    }

    // Aggregalas a (frissitett vagy gyorsitotarazott) cache-bol — ez gyors, nincs API-hivas.
    const players={};
    Object.values(matches).forEach(md=>{
      const sc=(md&&md.sc)||{};
      Object.keys(sc).forEach(k=>{
        const v=sc[k];
        if(!players[k])players[k]={name:v.name,team:v.team,goals:0,assists:0};
        players[k].goals+=v.goals||0; players[k].assists+=v.assists||0;
      });
    });
    const list=Object.values(players).filter(p=>p.goals>0)
      .sort((a,b)=>b.goals-a.goals||b.assists-a.assists||a.name.localeCompare(b.name));

    return {statusCode:200,headers,body:JSON.stringify({ok:true,scorers:list,updatedAt,processed:Object.keys(matches).length,pending})};
  }catch(e){
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:e.message})};
  }
};
