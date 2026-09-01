const CACHE_TTL_MS = 30 * 60 * 1000;
const TOP_LIMIT = 5;
const MAX_PREDICTIONS = 5;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const PRIORITY_LEAGUES = new Map([
  [94,{name:"Liga Portugal",weight:1.08}], [39,{name:"Premier League",weight:1.06}],
  [140,{name:"La Liga",weight:1.06}], [135,{name:"Serie A",weight:1.06}],
  [78,{name:"Bundesliga",weight:1.06}], [61,{name:"Ligue 1",weight:1.04}],
  [2,{name:"Champions League",weight:1.08}], [3,{name:"Europa League",weight:1.04}],
  [848,{name:"Conference League",weight:1.00}], [203,{name:"Süper Lig",weight:.94}],
  [71,{name:"Brasileirão Série A",weight:.94}], [128,{name:"Liga Argentina",weight:.92}],
  [253,{name:"MLS",weight:.90}]
]);
const BLOCKED = /\b(women|feminino|female|u17|u18|u19|u20|u21|youth|juvenil|reserve|reserves|b team|sub-17|sub-19)\b/i;

function dateInLisbon(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function labelDate(date){
  return new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",weekday:"long",day:"numeric",month:"long"}).format(new Date(`${date}T12:00:00Z`));
}
function clamp(n,a=0,b=100){ return Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):a)); }
function avg(a){ return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; }
function pct(a){ return a.length ? 100*a.filter(Boolean).length/a.length : null; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function percent(v){
  if(v==null) return null;
  if(typeof v==='number') return v>=0&&v<=100?v:null;
  const n=Number(String(v).replace("%","").trim().replace(",","."));
  return Number.isFinite(n)&&n>=0&&n<=100?n:null;
}
function predictionGoals(v){
  if(v==null) return null;
  if(typeof v==='number') return v>=0&&v<=10?v:null;
  const s=String(v).trim().replace(",",".");
  const direct=Number(s);
  if(Number.isFinite(direct)&&direct>=0&&direct<=10) return direct;
  const m=s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if(m){ const a=Number(m[1]),b=Number(m[2]); if(a>=0&&b>=0&&a<=10&&b<=10)return (a+b)/2; }
  return null;
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function cacheGet(key,ttl=CACHE_TTL_MS){ const x=cache.get(key); return x&&Date.now()-x.time<ttl?x.value:null; }
async function cached(key,fn,force=false,ttl=CACHE_TTL_MS){
  if(!force){const hit=cacheGet(key,ttl);if(hit!==null)return hit;}
  const value=await fn(); cache.set(key,{time:Date.now(),value}); return value;
}

async function apiFetch(path,params={}){
  const key=String(process.env.APIFOOTBALL_KEY||"").trim();
  if(!key) throw new Error("APIFOOTBALL_KEY não está disponível neste deployment.");
  const url=new URL(`https://v3.football.api-sports.io${path}`);
  for(const [k,v] of Object.entries(params)) if(v!=null) url.searchParams.set(k,String(v));
  const res=await fetch(url,{headers:{"x-apisports-key":key,"Accept":"application/json"},cache:"no-store"});
  const text=await res.text(); let data={};
  try{ data=text?JSON.parse(text):{}; }catch{ throw new Error(`Resposta inválida da API-Football (HTTP ${res.status}).`); }
  const remaining=res.headers.get("x-ratelimit-requests-remaining")||res.headers.get("X-RateLimit-Remaining");
  const limit=res.headers.get("x-ratelimit-requests-limit")||res.headers.get("X-RateLimit-Limit");
  if(!res.ok || (data.errors && Object.keys(data.errors).length)){
    const e=JSON.stringify(data.errors||{http:res.status}); const err=new Error(`API-Football: ${e}`);
    err.status=res.status; err.remaining=remaining; err.limit=limit; throw err;
  }
  return {response:Array.isArray(data.response)?data.response:[],remaining,limit,results:num(data.results)||0};
}
async function optionalApi(path,params,force=false,ttl=CACHE_TTL_MS){
  try{ const x=await cached(`v1411:${path}:${JSON.stringify(params)}`,()=>apiFetch(path,params),force,ttl); return {ok:true,...x,error:null}; }
  catch(err){ return {ok:false,response:[],remaining:err.remaining||null,limit:err.limit||null,error:err.message,status:err.status||null}; }
}
function leagueInfo(f){
  const id=f.league?.id; if(PRIORITY_LEAGUES.has(id))return PRIORITY_LEAGUES.get(id);
  const name=f.league?.name||"Outra competição"; if(BLOCKED.test(name))return null; return {name,weight:.82};
}

function firstPercent(obj,keys){ for(const k of keys){const v=percent(obj?.[k]);if(v!=null)return v;} return null; }
function extractComparison(cmp){
  const form=cmp?.form||{};
  const attack=cmp?.att||cmp?.attack||{};
  const defense=cmp?.def||cmp?.defense||{};
  const h2h=cmp?.h2h||{};
  const homeForm=firstPercent(form,["home"]),awayForm=firstPercent(form,["away"]);
  const homeAttack=firstPercent(attack,["home"]),awayAttack=firstPercent(attack,["away"]);
  const homeDefense=firstPercent(defense,["home"]),awayDefense=firstPercent(defense,["away"]);
  const homeH2H=firstPercent(h2h,["home"]),awayH2H=firstPercent(h2h,["away"]);
  return {homeForm,awayForm,homeAttack,awayAttack,homeDefense,awayDefense,homeH2H,awayH2H,raw:cmp||null};
}
function predictionData(row){
  const x=row?.predictions||row||{}, q=x.percent||{}, goals=x.goals||{};
  let home=percent(q.home),draw=percent(q.draw),away=percent(q.away);
  if([home,draw,away].every(v=>v!=null)){
    const sum=home+draw+away;
    if(sum>0&&Math.abs(sum-100)>0.5){home=home/sum*100;draw=draw/sum*100;away=away/sum*100;}
  }
  const homeGoals=predictionGoals(goals.home),awayGoals=predictionGoals(goals.away);
  const comparison=extractComparison(row?.comparison||x.comparison);
  const underOver=String(x.under_over||"");
  const over15=/over\s*1\.5/i.test(underOver);
  const over25=/over\s*2\.5/i.test(underOver);
  const btts=typeof x.win_or_draw==='boolean'?null:null;
  const available=[home,draw,away].some(v=>v!=null);
  return {home,draw,away,homeGoals,awayGoals,advice:x.advice||null,underOver,over15,over25,btts,available,comparison,h2hRows:Array.isArray(row?.h2h)?row.h2h:[]};
}
function historyFromPrediction(row,teamId){
  const rows=Array.isArray(row?.h2h)?row.h2h:[];
  return rows.filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null).slice(0,10);
}
function historyFeatures(rows,teamId){
  const gf=[],ga=[],o15=[],o25=[],btts=[],wins=[];
  for(const f of rows||[]){
    const hid=f.teams?.home?.id,aid=f.teams?.away?.id;if(hid!==teamId&&aid!==teamId)continue;
    const hg=num(f.goals?.home),ag=num(f.goals?.away);if(hg==null||ag==null)continue;
    const isHome=hid===teamId,scored=isHome?hg:ag,conceded=isHome?ag:hg;
    gf.push(scored);ga.push(conceded);o15.push(hg+ag>=2);o25.push(hg+ag>=3);btts.push(hg>0&&ag>0);wins.push(isHome?hg>ag:ag>hg);
  }
  return {n:gf.length,avgGF:avg(gf),avgGA:avg(ga),winRate:pct(wins),o15Rate:pct(o15),o25Rate:pct(o25),bttsRate:pct(btts)};
}
function h2hFeatures(rows){
  const v=(rows||[]).filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null).slice(0,10);
  return {n:v.length,o15:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=2)),o25:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=3)),btts:pct(v.map(f=>Number(f.goals.home)>0&&Number(f.goals.away)>0))};
}
function marketReason(label,h,a,h2,p){
  const bits=[]; const add=t=>{if(t)bits.push(t);};
  if(label.includes("1,5")&&h.o15Rate!=null&&a.o15Rate!=null)add(`+1,5 em ${Math.round(h.o15Rate)}% vs ${Math.round(a.o15Rate)}%`);
  if(label.includes("2,5")&&h.o25Rate!=null&&a.o25Rate!=null)add(`+2,5 em ${Math.round(h.o25Rate)}% vs ${Math.round(a.o25Rate)}%`);
  if(label.includes("casa ou empate")&&p.home!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.home)}% casa + ${Math.round(p.draw)}% empate`);
  if(label.includes("fora ou empate")&&p.away!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.away)}% fora + ${Math.round(p.draw)}% empate`);
  if(label.includes("Vitória da equipa da casa")&&p.home!=null)add(`Prediction: ${Math.round(p.home)}% casa`);
  if(label.includes("Vitória da equipa visitante")&&p.away!=null)add(`Prediction: ${Math.round(p.away)}% fora`);
  if(h2.n>=2)add(`H2H: ${h2.n} jogos`);
  if(p.homeGoals!=null&&p.awayGoals!=null)add(`Golos previstos: ${p.homeGoals.toFixed(1)}–${p.awayGoals.toFixed(1)}`);
  return bits.slice(0,3).join("; ")||"Sem evidência numérica suficiente para justificar esta leitura.";
}
function buildMarkets(h,a,h2,p,evidence){
  const total=p.homeGoals!=null&&p.awayGoals!=null?p.homeGoals+p.awayGoals:null;
  const over15=clamp(.36*(h.o15Rate??50)+.36*(a.o15Rate??50)+.10*(h2.o15??50)+.18*(total!=null?clamp((total-0.8)*55):50));
  const over25=clamp(.34*(h.o25Rate??50)+.34*(a.o25Rate??50)+.12*(h2.o25??50)+.20*(total!=null?clamp((total-1.2)*55):50));
  const home=clamp(p.home??50),away=clamp(p.away??50),draw=clamp(p.draw??25);
  const raw=[
    {market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:(home+draw)*.96},
    {market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:(away+draw)*.96},
    {market:"over15",label:"Mais de 1,5 golos",confidence:over15},
    {market:"over25",label:"Mais de 2,5 golos",confidence:over25},
    {market:"homeWin",label:"Vitória da equipa da casa",confidence:home},
    {market:"awayWin",label:"Vitória da equipa visitante",confidence:away}
  ];
  const cap=evidence>=4?92:evidence===3?84:evidence===2?76:65;
  return raw.map(m=>({...m,confidence:Math.round(clamp(Math.min(m.confidence,cap)))})).sort((x,y)=>y.confidence-x.confidence);
}
function scoreGame(h,a,h2,p,leagueWeight,evidence){
  const pred=Math.max(p.home??0,p.draw??0,p.away??0)||50;
  const form=avg([h.winRate,a.winRate].filter(v=>v!=null))??50;
  const goal=avg([h.o15Rate,a.o15Rate].filter(v=>v!=null))??50;
  const h2v=h2.n?(h2.o15??50):50;
  const comp=p.comparison;
  const compStrength=avg([comp.homeForm,comp.awayForm,comp.homeAttack,comp.awayAttack,comp.homeDefense,comp.awayDefense].filter(v=>v!=null))??50;
  const raw=.38*pred+.22*form+.18*goal+.08*h2v+.14*compStrength;
  const evidenceFactor=evidence>=4?1:evidence===3?.94:evidence===2?.86:evidence===1?.74:.62;
  return Math.round(clamp(raw*leagueWeight*evidenceFactor));
}
function quality(n){ if(n>=4)return "high"; if(n>=3)return "medium"; if(n>=1)return "low"; return "insufficient"; }

function diagnosticFromCall(label,params,call,requested=true){
  if(!requested)return {status:"não testado",ok:false,results:0,reason:"não solicitado para poupar quota",params};
  if(call?.ok&&call.results>0)return {status:"OK",ok:true,results:call.results,reason:`${call.results} resultado(s)`,remaining:call.remaining??null,params};
  if(call?.ok)return {status:"vazio",ok:false,results:0,reason:"HTTP 200, response vazia",remaining:call.remaining??null,params};
  return {status:"erro",ok:false,results:0,reason:call?.error||"erro desconhecido",remaining:call?.remaining??null,params};
}

export default async function handler(req,res){
  try{
    const date=dateInLisbon(), force=String(req?.query?.force||"")==="1";
    const result=await cached(`v1411:${date}`,async()=>{
      const fixtureCall=await apiFetch("/fixtures",{date,timezone:"Europe/Lisbon"});
      const fixtures=fixtureCall.response;
      const upcoming=fixtures.filter(f=>["NS","TBD"].includes(f.fixture?.status?.short)&&!BLOCKED.test(f.league?.name||""));
      const prelim=upcoming.map(f=>({f,league:leagueInfo(f)})).filter(x=>x.league);
      const candidates=prelim.sort((a,b)=>(b.league.weight-a.league.weight)||(new Date(a.f.fixture.date)-new Date(b.f.fixture.date))).slice(0,MAX_PREDICTIONS);
      const out=[], diagnostics={quotaRemaining:fixtureCall.remaining,quotaLimit:fixtureCall.limit,fixtures:{ok:true,results:fixtureCall.results},predictionsRequested:candidates.length,rateLimitStrategy:"máx. 6 chamadas por execução; pedidos sequenciais; sem fan-out de endpoints",competitions:[]};
      let lastRequestAt=Date.now();
      for(let i=0;i<candidates.length;i++){
        const {f,league}=candidates[i];
        const wait=Math.max(0,650-(Date.now()-lastRequestAt)); if(wait) await sleep(wait);
        const pr=await optionalApi("/predictions",{fixture:f.fixture.id},force);
        lastRequestAt=Date.now();
        const row=pr.response?.[0]||null, p=predictionData(row);
        const h2Rows=historyFromPrediction(row,f.teams.home.id), h2=h2hFeatures(h2Rows);
        // Predictions already contain comparison/context from the API, including recent form and H2H.
        // We deliberately do not call separate form/H2H/statistics endpoints in V1.4.11.
        const comp=p.comparison;
        const h={n:0,avgGF:null,avgGA:null,winRate:comp.homeForm,o15Rate:null,o25Rate:null,bttsRate:null};
        const a={n:0,avgGF:null,avgGA:null,winRate:comp.awayForm,o15Rate:null,o25Rate:null,bttsRate:null};
        const evidence=[p.available,comp.homeForm!=null&&comp.awayForm!=null,comp.homeAttack!=null&&comp.awayAttack!=null,comp.homeDefense!=null&&comp.awayDefense!=null,h2.n>=2||comp.homeH2H!=null].filter(Boolean).length;
        const markets=buildMarkets(h,a,h2,p,evidence);
        const score=scoreGame(h,a,h2,p,league.weight,evidence);
        const best={...markets[0],reason:marketReason(markets[0].label,h,a,h2,p)};
        const suggestions=markets.slice(0,4).map(m=>({...m,reason:marketReason(m.label,h,a,h2,p)}));
        const cdiag={fixture:f.fixture.id,leagueId:f.league.id,league:league.name,season:f.league.season,evidenceCount:evidence,quality:quality(evidence),prediction:diagnosticFromCall("predictions",{fixture:f.fixture.id},pr)};
        diagnostics.competitions.push(cdiag);
        out.push({
          id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:league.name,
          time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(new Date(f.fixture.date)),kickoff:f.fixture.date,
          score,suggestion:best,suggestions,dataQuality:quality(evidence),evidenceCount:evidence,
          coverage:{season:f.league.season,predictions:pr.ok,label:pr.ok?"Prediction + comparação API":"Sem Prediction"},
          dataPoints:{historyHome:comp.homeForm!=null?5:0,historyAway:comp.awayForm!=null?5:0,h2h:h2.n,prediction:p.available,standingsHome:false,standingsAway:false},
          endpointDiagnostics:{predictions:cdiag.prediction,formCasa:{status:comp.homeForm!=null?"OK":"vazio",ok:comp.homeForm!=null,results:comp.homeForm!=null?1:0,reason:comp.homeForm!=null?"comparison.form da Prediction":"não disponível na Prediction"},formFora:{status:comp.awayForm!=null?"OK":"vazio",ok:comp.awayForm!=null,results:comp.awayForm!=null?1:0,reason:comp.awayForm!=null?"comparison.form da Prediction":"não disponível na Prediction"},h2h:{status:h2.n||comp.homeH2H!=null?"OK":"vazio",ok:h2.n>0||comp.homeH2H!=null,results:h2.n,reason:h2.n?`${h2.n} H2H na Prediction`:comp.homeH2H!=null?"comparação H2H na Prediction":"não disponível"},standings:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão para respeitar o limite/minuto"},teamStatsHome:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão; Prediction já fornece comparação"},teamStatsAway:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão; Prediction já fornece comparação"}},
          metrics:{form:`${comp.homeForm!=null?Math.round(comp.homeForm):"—"}% / ${comp.awayForm!=null?Math.round(comp.awayForm):"—"}%`,goals:`${p.homeGoals!=null?p.homeGoals.toFixed(1):"—"} / ${p.awayGoals!=null?p.awayGoals.toFixed(1):"—"}`,api:`${p.home!=null?Math.round(p.home):"—"}% / ${p.draw!=null?Math.round(p.draw):"—"}% / ${p.away!=null?Math.round(p.away):"—"}%`,table:"—",h2h:h2.n||"—",comparison:`${comp.homeAttack!=null?Math.round(comp.homeAttack):"—"}% / ${comp.awayAttack!=null?Math.round(comp.awayAttack):"—"}% ataque`}
        });
      }
      out.sort((a,b)=>(b.evidenceCount*10+b.score)-(a.evidenceCount*10+a.score));
      const recommendable=out.filter(g=>g.evidenceCount>=3), games=recommendable.slice(0,TOP_LIMIT);
      return {fixturesFound:fixtures.length,candidates:candidates.length,analyzedCount:out.length,failures:out.length-candidates.length+0,recommendable:recommendable.length,games,all:out,diagnostics};
    },force);
    res.status(200).json({ok:true,version:"1.4.11",date,dateLabel:labelDate(date),fixturesFound:result.fixturesFound,candidates:result.candidates,analyzed:result.analyzedCount,recommendable:result.recommendable,selected:result.games.length,games:result.games,diagnostics:result.diagnostics,cached:!force});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."}); }
}
