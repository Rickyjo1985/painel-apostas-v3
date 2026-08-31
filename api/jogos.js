const CACHE_TTL_MS = 30 * 60 * 1000;
const TOP_LIMIT = 5;
const MIN_SCORE = 60;
const MAX_CANDIDATES = 8;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const LEAGUES = new Map([
  [94, { name:"Liga Portugal", weight:1.05 }],
  [39, { name:"Premier League", weight:1.00 }],
  [140,{ name:"La Liga", weight:1.00 }],
  [135,{ name:"Serie A", weight:1.00 }],
  [78, { name:"Bundesliga", weight:1.00 }],
  [61, { name:"Ligue 1", weight:1.00 }],
  [2,  { name:"Champions League", weight:1.05 }],
  [3,  { name:"Europa League", weight:1.00 }],
  [848,{ name:"Conference League", weight:0.95 }]
]);

function dateInLisbon() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Lisbon", year:"numeric", month:"2-digit", day:"2-digit"
  }).format(new Date());
}
function labelDate(date) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone:"Europe/Lisbon", weekday:"long", day:"numeric", month:"long"
  }).format(new Date(`${date}T12:00:00Z`));
}
function clamp(n,a=0,b=100){ return Math.max(a,Math.min(b,n)); }
function avg(a){ return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; }
function pct(a){ return a.length ? 100*a.filter(Boolean).length/a.length : null; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function percent(v){
  if(v==null) return null;
  const n=Number(String(v).replace("%","").trim());
  return Number.isFinite(n)?n:null;
}
function cacheGet(key){ const x=cache.get(key); return x && Date.now()-x.time<CACHE_TTL_MS ? x.value : null; }
async function cached(key, fn, force=false){
  if(!force){ const hit=cacheGet(key); if(hit!==null) return hit; }
  const value=await fn(); cache.set(key,{time:Date.now(),value}); return value;
}

async function apiFetch(path, params={}) {
  const key=String(process.env.APIFOOTBALL_KEY||"").trim();
  if(!key) throw new Error("APIFOOTBALL_KEY não está disponível neste deployment.");
  const url=new URL(`https://v3.football.api-sports.io${path}`);
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
  const res=await fetch(url,{headers:{"x-apisports-key":key,"Accept":"application/json"},cache:"no-store"});
  const text=await res.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{throw new Error(`Resposta inválida da API-Football (HTTP ${res.status}).`);}
  if(!res.ok || (data.errors && Object.keys(data.errors).length)){
    const e=JSON.stringify(data.errors||{http:res.status});
    if(res.status===401||res.status===403||/missing application key|invalid.*key|unauthorized/i.test(e))
      throw new Error("A API-Football recusou a chave. Confirma APIFOOTBALL_KEY e faz Redeploy.");
    throw new Error(`API-Football: ${e}`);
  }
  return Array.isArray(data.response)?data.response:[];
}

function historyFeatures(fixtures, teamId){
  const rows=fixtures.filter(f=>f.goals?.home!=null&&f.goals?.away!=null)
    .sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date)).slice(0,10);
  const gf=[],ga=[],o15=[],o25=[],btts=[],wins=[],clean=[];
  for(const f of rows){
    const home=f.teams.home.id===teamId;
    const hg=num(f.goals.home),ag=num(f.goals.away);
    if(hg==null||ag==null)continue;
    const scored=home?hg:ag, conceded=home?ag:hg;
    gf.push(scored);ga.push(conceded);o15.push(hg+ag>=2);o25.push(hg+ag>=3);
    btts.push(hg>0&&ag>0);wins.push(home?hg>ag:ag>hg);clean.push(conceded===0);
  }
  return {n:gf.length,gf,ga,o15,o25,btts,wins,clean};
}
function h2hFeatures(rows){
  const v=rows.filter(f=>f.goals?.home!=null&&f.goals?.away!=null).slice(0,10);
  return {n:v.length,o15:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=2)),
    o25:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=3)),
    btts:pct(v.map(f=>Number(f.goals.home)>0&&Number(f.goals.away)>0))};
}
function predictionData(p){
  const x=p||{};
  return {
    home:percent(x.percent?.home), draw:percent(x.percent?.draw), away:percent(x.percent?.away),
    over: typeof x.under_over==="string" ? /over/i.test(x.under_over) : null,
    advice:x.advice||null,
    homeGoals:num(x.goals?.home), awayGoals:num(x.goals?.away)
  };
}
function meanOr(a,b,fallback=50){
  const vals=[a,b].filter(x=>x!=null);
  return vals.length?avg(vals):fallback;
}
function buildMarkets(h,a,h2,p){
  const h15=pct(h.o15),a15=pct(a.o15),h25=pct(h.o25),a25=pct(a.o25);
  const hb=pct(h.btts),ab=pct(a.btts);
  const hg=avg(h.gf),ag=avg(a.gf),hc=avg(h.ga),ac=avg(a.ga);
  const totalGoals= [hg,ag,hc,ac].filter(x=>x!=null).length ? avg([hg,ag,hc,ac].filter(x=>x!=null)) : 1.5;
  const pred=p;
  const predTotal=(pred.homeGoals!=null&&pred.awayGoals!=null)?pred.homeGoals+pred.awayGoals:null;

  const over15=clamp(.30*(h15??50)+.30*(a15??50)+.20*clamp(totalGoals*30,0,100)+.10*(h2.o15??50)+.10*(pred.over===true?100:pred.over===false?0:50));
  const over25=clamp(.28*(h25??50)+.28*(a25??50)+.20*clamp(totalGoals*22,0,100)+.10*(h2.o25??50)+.14*(pred.over===true?100:predTotal!=null?clamp((predTotal-1)*45,0,100):50));
  const btts=clamp(.34*(hb??50)+.34*(ab??50)+.12*clamp(meanOr(hc,ac)*28,0,100)+.10*(h2.btts??50)+.10*clamp(meanOr(hg,ag)*28,0,100));
  const home=pred.home??pct(h.wins)??50, away=pred.away??pct(a.wins)??50, draw=pred.draw??25;
  const home1x=clamp(home+draw),awayX2=clamp(away+draw);

  return [
    {market:"over15",label:"Mais de 1,5 golos",confidence:over15,reason:"Boa combinação entre frequência recente de 2+ golos e tendência ofensiva."},
    {market:"over25",label:"Mais de 2,5 golos",confidence:over25,reason:"A frequência de 3+ golos e a projecção ofensiva suportam este mercado."},
    {market:"btts",label:"Ambas marcam",confidence:btts,reason:"As duas equipas mostram sinais de marcar e também conceder golos."},
    {market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:home1x,reason:"A previsão e a forma favorecem a equipa da casa ou o empate."},
    {market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:awayX2,reason:"A previsão e a forma favorecem a equipa visitante ou o empate."},
    {market:"homeWin",label:"Vitória da equipa da casa",confidence:home,reason:"A previsão e o desempenho recente dão vantagem à equipa da casa."},
    {market:"awayWin",label:"Vitória da equipa visitante",confidence:away,reason:"A previsão e o desempenho recente dão vantagem à equipa visitante."}
  ].sort((x,y)=>y.confidence-x.confidence);
}
function scoreGame(h,a,h2,p,leagueWeight){
  const predictionStrength=[p.home,p.draw,p.away].filter(x=>x!=null).length?Math.max(p.home??0,p.away??0,(p.home??0)+(p.draw??0),(p.away??0)+(p.draw??0)):50;
  const form=meanOr(pct(h.wins),pct(a.wins));
  const goalTrend=meanOr(pct(h.o15),pct(a.o15));
  const dataN=[h.n,a.n,h2.n,p.home,p.draw,p.away,p.over,p.homeGoals,p.awayGoals].filter(x=>x!=null).length;
  const completeness=clamp(dataN/9*100);
  const raw=.32*predictionStrength+.23*form+.22*goalTrend+.15*(h2.n>=3?h2.o15??50:50)+.08*completeness;
  return Math.round(clamp(raw*leagueWeight));
}
function quality(h,a,h2,p){
  const n=h.n+a.n;
  if(n>=14 && h2.n>=3 && [p.home,p.draw,p.away].some(x=>x!=null)) return "high";
  if(n>=6 || h2.n>=1 || [p.home,p.draw,p.away].some(x=>x!=null)) return "medium";
  return "low";
}

export default async function handler(req,res){
  try{
    const date=dateInLisbon();
    const force=String(req?.query?.force||"")==="1";
    const games=await cached(`v13:${date}`,async()=>{
      const season=Number(date.slice(0,4));
      const fixtures=await apiFetch("/fixtures",{date,timezone:"Europe/Lisbon"});
      const candidates=fixtures.filter(f=>
        ["NS","TBD"].includes(f.fixture?.status?.short) && LEAGUES.has(f.league?.id)
      ).map(f=>({f,league:LEAGUES.get(f.league.id)}))
       .sort((a,b)=>(b.league.weight-a.league.weight)||new Date(a.f.fixture.date)-new Date(b.f.fixture.date))
       .slice(0,MAX_CANDIDATES);

      const out=[];
      for(const {f,league} of candidates){
        try{
          const hid=f.teams.home.id,aid=f.teams.away.id;
          const [hf,af,hh,pr]=await Promise.all([
            cached(`v13:h:${season}:${hid}`,()=>apiFetch("/fixtures",{team:hid,season,last:10})),
            cached(`v13:a:${season}:${aid}`,()=>apiFetch("/fixtures",{team:aid,season,last:10})),
            cached(`v13:h2h:${hid}-${aid}`,()=>apiFetch("/fixtures/headtohead",{h2h:`${hid}-${aid}`,last:10})),
            cached(`v13:p:${f.fixture.id}`,()=>apiFetch("/predictions",{fixture:f.fixture.id}))
          ]);
          const h=historyFeatures(hf,hid),a=historyFeatures(af,aid),h2=h2hFeatures(hh),p=predictionData(pr[0]);
          const markets=buildMarkets(h,a,h2,p);
          const score=scoreGame(h,a,h2,p,league.weight);
          const q=quality(h,a,h2,p);
          if(score<MIN_SCORE) continue;
          const best=markets[0];
          out.push({
            id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:league.name,
            time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(new Date(f.fixture.date)),
            kickoff:f.fixture.date,score,suggestion:best,suggestions:markets.slice(0,4),dataQuality:q,
            metrics:{
              form:`${Math.round(meanOr(pct(h.wins),pct(a.wins)))}%`,
              goals:`${Math.round(meanOr(pct(h.o15),pct(a.o15)))}% +1.5`,
              h2h:h2.n?`${h2.n} jogos`:"—",
              prediction:[p.home,p.draw,p.away].some(x=>x!=null)?"✓":"—"
            },
            predictionAdvice:p.advice||null
          });
        }catch(err){ console.warn("Candidato ignorado",f.fixture.id,err.message); }
      }
      return out.sort((a,b)=>b.score-a.score).slice(0,TOP_LIMIT);
    },force);
    res.status(200).json({ok:true,version:"1.3",date,dateLabel:labelDate(date),analyzed:games.length,games,cached:!force});
  }catch(e){
    console.error(e);
    res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."});
  }
}
