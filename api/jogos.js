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
  try{ const x=await cached(`v1415:${path}:${JSON.stringify(params)}`,()=>apiFetch(path,params),force,ttl); return {ok:true,...x,error:null}; }
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
function signalSupport(p,comp){
  const supports=[];
  const push=(ok,txt)=>{if(ok)supports.push(txt);};
  const advice=String(p.advice||"").toLowerCase();
  push(comp.homeForm!=null&&comp.awayForm!=null&&comp.homeForm>=comp.awayForm+4,"forma");
  push(comp.homeAttack!=null&&comp.awayAttack!=null&&comp.homeAttack>=comp.awayAttack+4,"ataque");
  push(comp.homeDefense!=null&&comp.awayDefense!=null&&comp.homeDefense>=comp.awayDefense+4,"defesa");
  push(comp.homeH2H!=null&&comp.awayH2H!=null&&comp.homeH2H>=comp.awayH2H+4,"H2H");
  push(/home|casa|win or draw|vitoria.*casa|vitória.*casa/.test(advice),"advice");
  return supports;
}
function signalSupportAway(p,comp){
  const supports=[];
  const push=(ok,txt)=>{if(ok)supports.push(txt);};
  const advice=String(p.advice||"").toLowerCase();
  push(comp.awayForm!=null&&comp.homeForm!=null&&comp.awayForm>=comp.homeForm+4,"forma");
  push(comp.awayAttack!=null&&comp.homeAttack!=null&&comp.awayAttack>=comp.homeAttack+4,"ataque");
  push(comp.awayDefense!=null&&comp.homeDefense!=null&&comp.awayDefense>=comp.homeDefense+4,"defesa");
  push(comp.awayH2H!=null&&comp.homeH2H!=null&&comp.awayH2H>=comp.homeH2H+4,"H2H");
  push(/away|fora|win or draw/.test(advice),"advice");
  return supports;
}
function predictionValid(p){
  return p.home!=null&&p.draw!=null&&p.away!=null&&Math.abs((p.home+p.draw+p.away)-100)<=1.5;
}
function goalSignal(p,h,a,h2){
  const total=p.homeGoals!=null&&p.awayGoals!=null?p.homeGoals+p.awayGoals:null;
  const over15History=avg([h.o15Rate,a.o15Rate,h2.o15].filter(v=>v!=null));
  const over25History=avg([h.o25Rate,a.o25Rate,h2.o25].filter(v=>v!=null));
  const underOver=String(p.underOver||"").toLowerCase();
  let over15=null,over25=null;
  if(total!=null){
    over15=clamp(50+(total-1.5)*28);
    over25=clamp(50+(total-2.5)*24);
  }
  if(/over\s*1\.5/.test(underOver)) over15=Math.max(over15??0,70);
  if(/over\s*2\.5/.test(underOver)) over25=Math.max(over25??0,68);
  if(over15History!=null) over15=over15==null?over15History:0.65*over15+0.35*over15History;
  if(over25History!=null) over25=over25==null?over25History:0.65*over25+0.35*over25History;
  return {over15,over25,total};
}
function marketReason(label,h,a,h2,p){
  const bits=[]; const add=t=>{if(t)bits.push(t);};
  const isDoubleHome=label.includes("casa ou empate");
  const isDoubleAway=label.includes("fora ou empate");
  const isHomeWin=label.includes("Vitória da equipa da casa");
  const isAwayWin=label.includes("Vitória da equipa visitante");
  const isHome=isDoubleHome||isHomeWin;
  const isAway=isDoubleAway||isAwayWin;

  // Para dupla possibilidade, a Prediction deve ser avaliada pelo par
  // (casa+empate ou fora+empate), e não apenas pela probabilidade de vitória.
  // Isto evita chamar "alinhados" a um cenário como 50% fora + 50% empate
  // quando a casa também tem 50%.
  let predSide=null, otherSide=null;
  let predDirectional=false;
  if(isDoubleHome && p.home!=null && p.draw!=null && p.away!=null){
    predSide=p.home+p.draw; otherSide=p.away;
    // Para dupla casa/empate, 50% casa + 50% empate é uma Prediction
    // forte para o par, mas não é uma vantagem direcional para a casa.
    predDirectional = p.home >= p.draw + 5;
  } else if(isDoubleAway && p.away!=null && p.draw!=null && p.home!=null){
    predSide=p.away+p.draw; otherSide=p.home;
    // Para dupla fora/empate, 50% fora + 50% empate é uma Prediction
    // forte para o par, mas não é uma vantagem direcional para fora.
    predDirectional = p.away >= p.draw + 5;
  } else if(isHomeWin && p.home!=null && p.away!=null && p.draw!=null){
    predSide=p.home; otherSide=Math.max(p.away,p.draw);
    predDirectional = p.home >= Math.max(p.away,p.draw) + 5;
  } else if(isAwayWin && p.away!=null && p.home!=null && p.draw!=null){
    predSide=p.away; otherSide=Math.max(p.home,p.draw);
    predDirectional = p.away >= Math.max(p.home,p.draw) + 5;
  }
  const predClear=predSide!=null && otherSide!=null ? predSide >= otherSide + 5 : false;

  const formSide=isHome && h.winRate!=null && a.winRate!=null ? h.winRate : isAway && h.winRate!=null && a.winRate!=null ? a.winRate : null;
  const formOther=isHome && h.winRate!=null && a.winRate!=null ? a.winRate : isAway && h.winRate!=null && a.winRate!=null ? h.winRate : null;
  const formClear=formSide!=null && formOther!=null ? formSide >= formOther + 4 : false;
  const formContradicts=formSide!=null && formOther!=null ? formOther >= formSide + 4 : false;

  if((label.includes("1,5")||label.includes("2,5"))&&p.homeGoals!=null&&p.awayGoals!=null)add(`Golos previstos: ${(p.homeGoals+p.awayGoals).toFixed(1)}`);
  if(label.includes("casa ou empate")&&p.home!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.home)}% casa + ${Math.round(p.draw)}% empate`);
  if(label.includes("fora ou empate")&&p.away!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.away)}% fora + ${Math.round(p.draw)}% empate`);
  if(isHomeWin&&p.home!=null)add(`Prediction: ${Math.round(p.home)}% casa`);
  if(isAwayWin&&p.away!=null)add(`Prediction: ${Math.round(p.away)}% fora`);
  if(h2.n>=2)add(`H2H: ${h2.n} jogos`);
  if(formSide!=null&&formOther!=null&&(isHome||isAway))add(`Forma: ${Math.round(formSide)}% vs ${Math.round(formOther)}%`);

  if((isHome||isAway) && predDirectional && formClear) add("Prediction + forma alinhadas");
  else if((isHome||isAway) && predDirectional && formContradicts) add("Prediction favorece este lado; forma favorece o adversário");
  else if((isHome||isAway) && formClear && !predDirectional) add("Forma favorece este lado; Prediction equilibrada");
  else if((isHome||isAway) && predDirectional && !formClear) add("Prediction favorece este lado; forma sem vantagem clara");
  else if((isHome||isAway) && !predDirectional && formContradicts) add("Prediction equilibrada; forma favorece o adversário");
  else if((isHome||isAway) && !predDirectional && !formClear && !formContradicts) add("Prediction equilibrada; forma sem vantagem clara");

  return bits.slice(0,3).join("; ")||"Sem evidência suficiente para uma recomendação forte.";
}
function marketStrength(m,p,comp){
  const side = m.market.includes("Away") || m.market === "awayWin" ? "away" : m.market.includes("Home") || m.market === "homeWin" ? "home" : null;
  if(!side || !p) return 0;
  const formDiff = comp.homeForm!=null&&comp.awayForm!=null ? (side==="home" ? comp.homeForm-comp.awayForm : comp.awayForm-comp.homeForm) : 0;
  const attackDiff = comp.homeAttack!=null&&comp.awayAttack!=null ? (side==="home" ? comp.homeAttack-comp.awayAttack : comp.awayAttack-comp.homeAttack) : 0;
  const defenseDiff = comp.homeDefense!=null&&comp.awayDefense!=null ? (side==="home" ? comp.homeDefense-comp.awayDefense : comp.awayDefense-comp.homeDefense) : 0;
  const h2hDiff = comp.homeH2H!=null&&comp.awayH2H!=null ? (side==="home" ? comp.homeH2H-comp.awayH2H : comp.awayH2H-comp.homeH2H) : 0;
  return [formDiff,attackDiff,defenseDiff,h2hDiff].filter(v=>v>=4).length;
}
function buildMarkets(h,a,h2,p,evidence){
  const validPred=predictionValid(p);
  const comp=p.comparison||{};
  const goals=goalSignal(p,h,a,h2);
  const home=validPred?p.home:null, away=validPred?p.away:null, draw=validPred?p.draw:null;
  const markets=[];
  const homeSupport=signalSupport(p,comp);
  const awaySupport=signalSupportAway(p,comp);
  const homeDirectional=marketStrength({market:"doubleHome"},p,comp);
  const awayDirectional=marketStrength({market:"doubleAway"},p,comp);
  const degenerate=validPred&&[home,draw,away].some(v=>v<=1);

  if(validPred){
    const dcHome=home+draw, dcAway=away+draw;
    // A double chance is not considered strong merely because home+draw is large.
    // It needs at least one independent directional signal for the selected side,
    // unless the prediction itself gives that side a clear edge.
    if(dcHome>=70 && (home>=55 || homeDirectional>=1) && (!degenerate || homeDirectional>=2)) {
      const conf=dcHome + Math.min(8,homeDirectional*2) - (homeDirectional===0?8:0);
      markets.push({market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:Math.round(clamp(conf)),support:homeSupport});
    }
    if(dcAway>=70 && (away>=55 || awayDirectional>=1) && (!degenerate || awayDirectional>=2)) {
      const conf=dcAway + Math.min(8,awayDirectional*2) - (awayDirectional===0?8:0);
      markets.push({market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:Math.round(clamp(conf)),support:awaySupport});
    }
    if(home>=57 && home-Math.max(away,draw)>=10 && homeDirectional>=1 && !degenerate) {
      markets.push({market:"homeWin",label:"Vitória da equipa da casa",confidence:Math.round(clamp(home+Math.min(8,homeDirectional*2))),support:homeSupport});
    }
    if(away>=57 && away-Math.max(home,draw)>=10 && awayDirectional>=1 && !degenerate) {
      markets.push({market:"awayWin",label:"Vitória da equipa visitante",confidence:Math.round(clamp(away+Math.min(8,awayDirectional*2))),support:awaySupport});
    }
  }
  if(goals.over15!=null && goals.over15>=66 && (p.homeGoals!=null||h2.n>=2)) markets.push({market:"over15",label:"Mais de 1,5 golos",confidence:Math.round(clamp(goals.over15)),support:["golos"]});
  if(goals.over25!=null && goals.over25>=66 && p.homeGoals!=null) markets.push({market:"over25",label:"Mais de 2,5 golos",confidence:Math.round(clamp(goals.over25)),support:["golos"]});
  const cap=evidence>=5?92:evidence===4?88:evidence===3?82:evidence===2?74:62;
  return markets.map(m=>({...m,confidence:Math.round(clamp(Math.min(m.confidence,cap)))})).sort((x,y)=>y.confidence-x.confidence);
}
function marketAgreement(best,p,comp,h2){
  if(!best || best.market==="none") return 0;
  if(best.market==="over15" || best.market==="over25"){
    const vals=[];
    if(best.market==="over15" && p.homeGoals!=null&&p.awayGoals!=null) vals.push(p.homeGoals+p.awayGoals>=1.9);
    if(best.market==="over25" && p.homeGoals!=null&&p.awayGoals!=null) vals.push(p.homeGoals+p.awayGoals>=2.9);
    if(best.market==="over15" && h2.o15!=null) vals.push(h2.o15>=60);
    if(best.market==="over25" && h2.o25!=null) vals.push(h2.o25>=55);
    return vals.length ? 50 + (vals.filter(Boolean).length/vals.length)*45 : 50;
  }
  const side=best.market.includes("Home")||best.market==="homeWin"?"home":best.market.includes("Away")||best.market==="awayWin"?"away":null;
  if(!side) return 50;
  const diffs=[];
  if(comp.homeForm!=null&&comp.awayForm!=null) diffs.push(side==="home"?comp.homeForm-comp.awayForm:comp.awayForm-comp.homeForm);
  if(comp.homeAttack!=null&&comp.awayAttack!=null) diffs.push(side==="home"?comp.homeAttack-comp.awayAttack:comp.awayAttack-comp.homeAttack);
  if(comp.homeDefense!=null&&comp.awayDefense!=null) diffs.push(side==="home"?comp.homeDefense-comp.awayDefense:comp.awayDefense-comp.homeDefense);
  if(comp.homeH2H!=null&&comp.awayH2H!=null) diffs.push(side==="home"?comp.homeH2H-comp.awayH2H:comp.awayH2H-comp.homeH2H);
  if(!diffs.length) return 50;
  const positive=diffs.filter(v=>v>=4).length, negative=diffs.filter(v=>v<=-4).length;
  return Math.round(clamp(50 + positive*12 - negative*16));
}
function scoreGame(h,a,h2,p,leagueWeight,evidence,best){
  if(!best)return 0;
  const comp=p.comparison||{};
  const agreement=marketAgreement(best,p,comp,h2);
  const support=Array.isArray(best.support)?best.support.length:0;
  const evidenceFactor=evidence>=5?1:evidence===4?.96:evidence===3?.91:evidence===2?.82:.65;
  const predictionConfidence=clamp(best.confidence);
  const supportBonus=Math.min(8,support*2);
  const raw=.58*predictionConfidence+.24*agreement+.10*(evidence*16.67)+.08*(50+supportBonus);
  return Math.round(clamp(raw*leagueWeight*evidenceFactor));
}

function quality(n){ if(n>=5)return "high"; if(n>=3)return "medium"; if(n>=1)return "low"; return "insufficient"; }

function diagnosticFromCall(label,params,call,requested=true){
  if(!requested)return {status:"não testado",ok:false,results:0,reason:"não solicitado para poupar quota",params};
  if(call?.ok&&call.results>0)return {status:"OK",ok:true,results:call.results,reason:`${call.results} resultado(s)`,remaining:call.remaining??null,params};
  if(call?.ok)return {status:"vazio",ok:false,results:0,reason:"HTTP 200, response vazia",remaining:call.remaining??null,params};
  return {status:"erro",ok:false,results:0,reason:call?.error||"erro desconhecido",remaining:call?.remaining??null,params};
}

export default async function handler(req,res){
  try{
    const date=dateInLisbon(), force=String(req?.query?.force||"")==="1";
    const result=await cached(`v1415:${date}`,async()=>{
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
        const bestMarket=markets[0]||null;
        const score=scoreGame(h,a,h2,p,league.weight,evidence,bestMarket);
        const best=bestMarket
          ? {...bestMarket,reason:marketReason(bestMarket.label,h,a,h2,p)}
          : {market:"none",label:"Sem recomendação forte",confidence:0,support:[],reason:"Os sinais disponíveis não mostram vantagem estatística clara e concordante."};
        const suggestions=markets.slice(0,4).map(m=>({...m,reason:marketReason(m.label,h,a,h2,p)}));
        const cdiag={fixture:f.fixture.id,leagueId:f.league.id,league:league.name,season:f.league.season,evidenceCount:evidence,quality:quality(evidence),prediction:diagnosticFromCall("predictions",{fixture:f.fixture.id},pr)};
        diagnostics.competitions.push(cdiag);
        out.push({
          id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:league.name,
          time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(new Date(f.fixture.date)),kickoff:f.fixture.date,
          score,suggestion:best,suggestions,dataQuality:quality(evidence),evidenceCount:evidence,
          coverage:{season:f.league.season,predictions:pr.ok,label:pr.ok?(bestMarket?((bestMarket.support||[]).length>0?"Prediction + evidência complementar":"Prediction isolada"):"Prediction sem vantagem clara"):"Sem Prediction"},
          dataPoints:{historyHome:comp.homeForm!=null?5:0,historyAway:comp.awayForm!=null?5:0,h2h:h2.n,prediction:p.available,standingsHome:false,standingsAway:false},
          endpointDiagnostics:{predictions:cdiag.prediction,formCasa:{status:comp.homeForm!=null?"OK":"vazio",ok:comp.homeForm!=null,results:comp.homeForm!=null?1:0,reason:comp.homeForm!=null?"comparison.form da Prediction":"não disponível na Prediction"},formFora:{status:comp.awayForm!=null?"OK":"vazio",ok:comp.awayForm!=null,results:comp.awayForm!=null?1:0,reason:comp.awayForm!=null?"comparison.form da Prediction":"não disponível na Prediction"},h2h:{status:h2.n||comp.homeH2H!=null?"OK":"vazio",ok:h2.n>0||comp.homeH2H!=null,results:h2.n,reason:h2.n?`${h2.n} H2H na Prediction`:comp.homeH2H!=null?"comparação H2H na Prediction":"não disponível"},standings:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão para respeitar o limite/minuto"},teamStatsHome:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão; Prediction já fornece comparação"},teamStatsAway:{status:"não testado",ok:false,results:0,reason:"não chamado nesta versão; Prediction já fornece comparação"}},
          metrics:{form:`${comp.homeForm!=null?Math.round(comp.homeForm):"—"}% / ${comp.awayForm!=null?Math.round(comp.awayForm):"—"}%`,goals:`${p.homeGoals!=null?p.homeGoals.toFixed(1):"—"} / ${p.awayGoals!=null?p.awayGoals.toFixed(1):"—"}`,api:`${p.home!=null?Math.round(p.home):"—"}% / ${p.draw!=null?Math.round(p.draw):"—"}% / ${p.away!=null?Math.round(p.away):"—"}%`,table:"—",h2h:h2.n||"—",comparison:`${comp.homeAttack!=null?Math.round(comp.homeAttack):"—"}% / ${comp.awayAttack!=null?Math.round(comp.awayAttack):"—"}% ataque`}
        });
      }
      out.sort((a,b)=>(b.evidenceCount*10+b.score)-(a.evidenceCount*10+a.score));
      const recommendable=out.filter(g=>g.evidenceCount>=3 && g.suggestion.market!=="none" && g.score>=50), games=recommendable.slice(0,TOP_LIMIT);
      return {fixturesFound:fixtures.length,candidates:candidates.length,analyzedCount:out.length,failures:out.length-candidates.length+0,recommendable:recommendable.length,games,all:out,diagnostics};
    },force);
    res.status(200).json({ok:true,version:"1.4.18",date,dateLabel:labelDate(date),fixturesFound:result.fixturesFound,candidates:result.candidates,analyzed:result.analyzedCount,recommendable:result.recommendable,selected:result.games.length,games:result.games,diagnostics:result.diagnostics,cached:!force});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."}); }
}
