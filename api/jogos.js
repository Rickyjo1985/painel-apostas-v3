
const CACHE_TTL_MS = 30 * 60 * 1000;
const TOP_LIMIT = 5;
const MAX_CANDIDATES = 8;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const PRIORITY_LEAGUES = new Map([
  [94,{name:"Liga Portugal",weight:1.05}],
  [39,{name:"Premier League",weight:1.00}],
  [140,{name:"La Liga",weight:1.00}],
  [135,{name:"Serie A",weight:1.00}],
  [78,{name:"Bundesliga",weight:1.00}],
  [61,{name:"Ligue 1",weight:1.00}],
  [2,{name:"Champions League",weight:1.05}],
  [3,{name:"Europa League",weight:1.00}],
  [848,{name:"Conference League",weight:.95}],
  [203,{name:"Süper Lig",weight:.90}],
  [71,{name:"Brasileirão Série A",weight:.90}],
  [128,{name:"Liga Argentina",weight:.88}],
  [253,{name:"MLS",weight:.85}]
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
  const n=Number(String(v).replace("%","").trim());
  return Number.isFinite(n)?n:null;
}
function cacheGet(key){
  const x=cache.get(key);
  return x && Date.now()-x.time<CACHE_TTL_MS ? x.value : null;
}
async function cached(key,fn,force=false){
  if(!force){
    const hit=cacheGet(key);
    if(hit!==null) return hit;
  }
  const value=await fn();
  cache.set(key,{time:Date.now(),value});
  return value;
}
async function apiFetch(path,params={}){
  const key=String(process.env.APIFOOTBALL_KEY||"").trim();
  if(!key) throw new Error("APIFOOTBALL_KEY não está disponível neste deployment.");
  const url=new URL(`https://v3.football.api-sports.io${path}`);
  for(const [k,v] of Object.entries(params)) if(v!=null) url.searchParams.set(k,String(v));
  const res=await fetch(url,{headers:{"x-apisports-key":key,"Accept":"application/json"},cache:"no-store"});
  const text=await res.text();
  let data={};
  try{ data=text?JSON.parse(text):{}; }catch{ throw new Error(`Resposta inválida da API-Football (HTTP ${res.status}).`); }
  if(!res.ok || (data.errors && Object.keys(data.errors).length)){
    const e=JSON.stringify(data.errors||{http:res.status});
    if(res.status===401||res.status===403||/missing application key|invalid.*key|unauthorized/i.test(e))
      throw new Error("A API-Football recusou a chave. Confirma APIFOOTBALL_KEY e faz Redeploy.");
    throw new Error(`API-Football: ${e}`);
  }
  return Array.isArray(data.response)?data.response:[];
}
async function optionalApi(path,params,fallback=[],force=false){
  try{ return await apiFetch(path,params); }
  catch(err){ console.warn(`API opcional falhou ${path}:`,err.message); return fallback; }
}

function historyFeatures(fixtures,teamId){
  const rows=(fixtures||[]).filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null)
    .sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date)).slice(0,10);
  const gf=[],ga=[],o15=[],o25=[],btts=[],wins=[],clean=[],recent=[];
  for(const f of rows){
    const homeId=f.teams?.home?.id, awayId=f.teams?.away?.id;
    if(homeId!==teamId && awayId!==teamId) continue;
    const hg=num(f.goals.home),ag=num(f.goals.away);
    if(hg==null||ag==null) continue;
    const isHome=homeId===teamId, scored=isHome?hg:ag, conceded=isHome?ag:hg;
    const won=isHome?hg>ag:ag>hg;
    gf.push(scored); ga.push(conceded);
    o15.push(hg+ag>=2); o25.push(hg+ag>=3); btts.push(hg>0&&ag>0);
    wins.push(won); clean.push(conceded===0);
    recent.push(won?"W":hg===ag?"D":"L");
  }
  return {
    n:gf.length,gf,ga,o15,o25,btts,wins,clean,recent,
    avgGF:avg(gf),avgGA:avg(ga),winRate:pct(wins),o15Rate:pct(o15),o25Rate:pct(o25),bttsRate:pct(btts)
  };
}
function h2hFeatures(rows){
  const v=(rows||[]).filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null).slice(0,10);
  return {n:v.length,o15:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=2)),
    o25:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=3)),
    btts:pct(v.map(f=>Number(f.goals.home)>0&&Number(f.goals.away)>0))};
}
function predictionData(row){
  const x=row?.predictions||row||{}, q=x.percent||{}, goals=x.goals||{}, winner=x.winner||{};
  let home=percent(q.home),draw=percent(q.draw),away=percent(q.away);
  if([home,draw,away].every(v=>v!=null)){
    const sum=home+draw+away;
    if(sum>0 && Math.abs(sum-100)>0.5){home=home/sum*100;draw=draw/sum*100;away=away/sum*100;}
  }
  return {
    home,draw,away,advice:x.advice||null,underOver:x.under_over||null,
    homeGoals:num(goals.home),awayGoals:num(goals.away),winnerId:num(winner.id),winnerName:winner.name||null,
    winOrDraw:x.win_or_draw===true, available:[home,draw,away].some(v=>v!=null)
  };
}
function standingsMap(rows){
  const map=new Map();
  const groups=Array.isArray(rows)?rows:[];
  for(const group of groups){
    const list=group?.league?.standings||[];
    for(const table of list){
      for(const s of table||[]){
        const id=s.team?.id;
        if(id!=null) map.set(Number(id),{
          rank:num(s.rank),points:num(s.points),form:s.form||null,goalsDiff:num(s.goalsDiff),
          played:num(s.all?.played),wins:num(s.all?.win),draws:num(s.all?.draw),losses:num(s.all?.lose),
          homePlayed:num(s.home?.played),homeWins:num(s.home?.win),awayPlayed:num(s.away?.played),awayWins:num(s.away?.win)
        });
      }
    }
  }
  return map;
}
function formStringRate(form){
  if(!form) return null;
  const s=String(form).toUpperCase().replace(/[^WDL]/g,"");
  return s.length ? 100*(s.split("").filter(x=>x==="W").length/s.length) : null;
}
function marketReason(label,h,a,h2,p,standH,standA){
  const bits=[];
  const add=(text)=>{if(text)bits.push(text);};
  if(label.includes("1,5") && h.o15Rate!=null && a.o15Rate!=null)
    add(`${Math.round(h.o15Rate)}% dos últimos ${h.n} jogos da casa/equipa da casa e ${Math.round(a.o15Rate)}% dos últimos ${a.n} jogos da visitante tiveram +1,5`);
  if(label.includes("2,5") && h.o25Rate!=null && a.o25Rate!=null)
    add(`${Math.round(h.o25Rate)}% vs ${Math.round(a.o25Rate)}% tiveram +2,5 nos últimos jogos`);
  if(label.includes("Ambas") && h.bttsRate!=null && a.bttsRate!=null)
    add(`BTTS apareceu em ${Math.round(h.bttsRate)}% e ${Math.round(a.bttsRate)}% dos últimos jogos`);
  if(label.includes("casa ou empate") && p.home!=null && p.draw!=null)
    add(`a previsão API estima ${Math.round(p.home)}% casa + ${Math.round(p.draw)}% empate`);
  if(label.includes("fora ou empate") && p.away!=null && p.draw!=null)
    add(`a previsão API estima ${Math.round(p.away)}% fora + ${Math.round(p.draw)}% empate`);
  if(label.includes("Vitória da equipa da casa") && p.home!=null) add(`a previsão API atribui ${Math.round(p.home)}% à vitória da casa`);
  if(label.includes("Vitória da equipa visitante") && p.away!=null) add(`a previsão API atribui ${Math.round(p.away)}% à vitória visitante`);
  if(standH?.rank && standA?.rank) add(`classificação: ${standH.rank}º vs ${standA.rank}º`);
  if(h2.n>=3) add(`H2H: ${h2.n} encontros analisados, +1,5 em ${Math.round(h2.o15??0)}%`);
  if(p.homeGoals!=null&&p.awayGoals!=null) add(`golos previstos: ${p.homeGoals.toFixed(1)}–${p.awayGoals.toFixed(1)}`);
  return bits.slice(0,3).join("; ") || "Sinais estatísticos disponíveis, mas sem detalhe suficiente para uma explicação numérica.";
}
function buildMarkets(h,a,h2,p){
  const hg= h.avgGF, ag=a.avgGF, hc=h.avgGA, ac=a.avgGA;
  const totalPred=p.homeGoals!=null&&p.awayGoals!=null?p.homeGoals+p.awayGoals:null;
  const over15=clamp(.28*(h.o15Rate??50)+.28*(a.o15Rate??50)+.12*clamp(((hg??1.25)+(ag??1.25))*28,0,100)+.10*clamp(((hc??1.25)+(ac??1.25))*25,0,100)+.10*(h2.o15??50)+.12*(totalPred!=null?clamp((totalPred-0.8)*55):50));
  const over25=clamp(.25*(h.o25Rate??50)+.25*(a.o25Rate??50)+.15*clamp(((hg??1.25)+(ag??1.25))*25,0,100)+.10*clamp(((hc??1.25)+(ac??1.25))*22,0,100)+.10*(h2.o25??50)+.15*(totalPred!=null?clamp((totalPred-1.2)*55):50));
  const btts=clamp(.30*(h.bttsRate??50)+.30*(a.bttsRate??50)+.10*clamp((hg??1.25)*30,0,100)+.10*clamp((ag??1.25)*30,0,100)+.08*(h2.btts??50)+.12*(totalPred!=null?clamp(Math.min(p.homeGoals,p.awayGoals)*70):50));
  const home=clamp(p.home??h.winRate??50), away=clamp(p.away??a.winRate??50), draw=clamp(p.draw??25);
  const dataN=h.n+a.n+h2.n+(p.available?3:0);
  const cap=dataN>=18?94:dataN>=10?88:dataN>=5?82:74;
  const raw=[
    {market:"over15",label:"Mais de 1,5 golos",confidence:over15},
    {market:"over25",label:"Mais de 2,5 golos",confidence:over25},
    {market:"btts",label:"Ambas marcam",confidence:btts},
    {market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:(home+draw)*.96},
    {market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:(away+draw)*.96},
    {market:"homeWin",label:"Vitória da equipa da casa",confidence:home},
    {market:"awayWin",label:"Vitória da equipa visitante",confidence:away}
  ];
  return raw.map(m=>({...m,confidence:Math.round(clamp(Math.min(m.confidence,cap)))}))
    .sort((x,y)=>y.confidence-x.confidence);
}
function scoreGame(h,a,h2,p,sh,sa,leagueWeight){
  const pred=[p.home,p.draw,p.away].filter(v=>v!=null);
  const predStrength=pred.length?Math.max(...pred):50;
  const form=avg([h.winRate,a.winRate].filter(v=>v!=null))??50;
  const goal=avg([h.o15Rate,a.o15Rate].filter(v=>v!=null))??50;
  const h2v=h2.n?(h2.o15??50):50;
  const table=sh?.rank&&sa?.rank?clamp(50+(sa.rank-sh.rank)*4):50;
  const dataSignals=[h.n>0,a.n>0,h2.n>0,p.available,sh?.rank!=null,sa?.rank!=null].filter(Boolean).length;
  const completeness=dataSignals/6*100;
  return Math.round(clamp((.30*predStrength+.22*form+.20*goal+.10*h2v+.08*table+.10*completeness)*leagueWeight));
}
function quality(h,a,h2,p,sh,sa){
  const signals=[h.n>=5,a.n>=5,h2.n>=2,p.available,sh?.rank!=null,sa?.rank!=null].filter(Boolean).length;
  if(signals>=5)return "high";
  if(signals>=3)return "medium";
  return "low";
}
function leagueInfo(f){
  const id=f.league?.id;
  if(PRIORITY_LEAGUES.has(id))return PRIORITY_LEAGUES.get(id);
  const name=f.league?.name||"Outra competição";
  if(BLOCKED.test(name))return null;
  return {name,weight:.82};
}

export default async function handler(req,res){
  try{
    const date=dateInLisbon(), force=String(req?.query?.force||"")==="1";
    const result=await cached(`v145:${date}`,async()=>{
      const fixtures=await apiFetch("/fixtures",{date,timezone:"Europe/Lisbon"});
      const upcoming=fixtures.filter(f=>["NS","TBD"].includes(f.fixture?.status?.short)&&!BLOCKED.test(f.league?.name||""));
      const candidates=upcoming.map(f=>({f,league:leagueInfo(f)})).filter(x=>x.league)
        .sort((a,b)=>(b.league.weight-a.league.weight)||(new Date(a.f.fixture.date)-new Date(b.f.fixture.date))).slice(0,MAX_CANDIDATES);
      const out=[],failures=[];
      let analyzedCount=0;
      // Standings are fetched once per competition/season and reused for both teams.
      const standingCache=new Map();
      for(const {f,league} of candidates){
        try{
          analyzedCount++;
          const hid=f.teams.home.id,aid=f.teams.away.id;
          const sk=`${f.league.id}:${f.league.season}`;
          let standings=[];
          if(!standingCache.has(sk)){
            standings=await cached(`v145:stand:${sk}`,()=>optionalApi("/standings",{league:f.league.id,season:f.league.season},[],force),force);
            standingCache.set(sk,standingsMap(standings));
          }
          const sm=standingCache.get(sk);
          const [hf,af,hh,pr]=await Promise.all([
            cached(`v145:h:${hid}`,()=>optionalApi("/fixtures",{team:hid,last:10,timezone:"Europe/Lisbon"},[],force),force),
            cached(`v145:a:${aid}`,()=>optionalApi("/fixtures",{team:aid,last:10,timezone:"Europe/Lisbon"},[],force),force),
            cached(`v145:h2h:${hid}-${aid}`,()=>optionalApi("/fixtures/headtohead",{h2h:`${hid}-${aid}`,last:10},[],force),force),
            cached(`v145:p:${f.fixture.id}`,()=>optionalApi("/predictions",{fixture:f.fixture.id},[],force),force)
          ]);
          const h=historyFeatures(hf,hid),a=historyFeatures(af,aid),h2=h2hFeatures(hh),p=predictionData(pr[0]);
          const sh=sm.get(Number(hid))||null,sa=sm.get(Number(aid))||null;
          const markets=buildMarkets(h,a,h2,p);
          const score=scoreGame(h,a,h2,p,sh,sa,league.weight);
          const best={...markets[0],reason:marketReason(markets[0].label,h,a,h2,p,sh,sa)};
          const suggestions=markets.slice(0,4).map(m=>({...m,reason:marketReason(m.label,h,a,h2,p,sh,sa)}));
          out.push({
            id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:league.name,
            time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(new Date(f.fixture.date)),
            kickoff:f.fixture.date,score,suggestion:best,suggestions,dataQuality:quality(h,a,h2,p,sh,sa), dataPoints:{historyHome:h.n,historyAway:a.n,h2h:h2.n,prediction:p.available,standingsHome:sh?.rank!=null,standingsAway:sa?.rank!=null},
            metrics:{
              form:`${h.winRate!=null?Math.round(h.winRate):"—"}% / ${a.winRate!=null?Math.round(a.winRate):"—"}%`,
              goals:`${h.o15Rate!=null?Math.round(h.o15Rate):"—"}% / ${a.o15Rate!=null?Math.round(a.o15Rate):"—"}% +1.5`,
              h2h:h2.n?`${h2.n} jogos · +1,5 ${Math.round(h2.o15??0)}%`:"—",
              prediction:p.available?`${Math.round(p.home??0)}% / ${Math.round(p.draw??0)}% / ${Math.round(p.away??0)}%`:"—",
              table:sh?.rank&&sa?.rank?`${sh.rank}º / ${sa.rank}º`:"—"
            },
            evidence:{
              homeForm:h.winRate,awayForm:a.winRate,homeGF:h.avgGF,awayGF:a.avgGF,
              homeGA:h.avgGA,awayGA:a.avgGA,homeO15:h.o15Rate,awayO15:a.o15Rate,
              homeBTTS:h.bttsRate,awayBTTS:a.bttsRate,h2hO15:h2.o15,h2hBTTS:h2.btts,
              predictionHome:p.home,predictionDraw:p.draw,predictionAway:p.away,
              predictedGoals:[p.homeGoals,p.awayGoals],homeRank:sh?.rank,awayRank:sa?.rank
            },
            predictionAdvice:p.advice||null
          });
        }catch(err){ failures.push({fixture:f.fixture.id,error:err.message}); console.warn("Candidato ignorado",f.fixture.id,err.message); }
      }
      return {fixturesFound:fixtures.length,candidates:candidates.length,analyzedCount,failures:failures.length,games:out.sort((a,b)=>b.score-a.score).slice(0,TOP_LIMIT)};
    },force);
    res.status(200).json({ok:true,version:"1.4.6",date,dateLabel:labelDate(date),fixturesFound:result.fixturesFound,candidates:result.candidates,analyzed:result.analyzedCount,selected:result.games.length,games:result.games,diagnostics:{optionalFailures:result.failures},cached:!force});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."}); }
}
