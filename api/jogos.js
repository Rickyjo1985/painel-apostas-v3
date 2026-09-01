const CACHE_TTL_MS = 30 * 60 * 1000;
const COVERAGE_TTL_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 5;
const MAX_CANDIDATES = 12;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const PRIORITY_LEAGUES = new Map([
  [94,{name:"Liga Portugal",weight:1.08}],
  [39,{name:"Premier League",weight:1.06}],
  [140,{name:"La Liga",weight:1.06}],
  [135,{name:"Serie A",weight:1.06}],
  [78,{name:"Bundesliga",weight:1.06}],
  [61,{name:"Ligue 1",weight:1.04}],
  [2,{name:"Champions League",weight:1.08}],
  [3,{name:"Europa League",weight:1.04}],
  [848,{name:"Conference League",weight:1.00}],
  [203,{name:"Süper Lig",weight:.94}],
  [71,{name:"Brasileirão Série A",weight:.94}],
  [128,{name:"Liga Argentina",weight:.92}],
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
  const n=Number(String(v).replace("%","").trim());
  return Number.isFinite(n)?n:null;
}
function numericPrediction(v){
  if(v==null) return null;
  if(typeof v==='number') return v>=0&&v<=10?v:null;
  const s=String(v).trim().replace(',','.');
  const direct=Number(s);
  if(Number.isFinite(direct)) return direct>=0&&direct<=10?direct:null;
  const m=s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if(m){
    const a=Number(m[1]),b=Number(m[2]);
    if(a>=0&&b>=0&&a<=10&&b<=10) return (a+b)/2;
  }
  return null;
}
function cacheGet(key,ttl=CACHE_TTL_MS){
  const x=cache.get(key);
  return x && Date.now()-x.time<ttl ? x.value : null;
}
async function cached(key,fn,force=false,ttl=CACHE_TTL_MS){
  if(!force){ const hit=cacheGet(key,ttl); if(hit!==null) return hit; }
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
  const remaining=res.headers.get("x-ratelimit-requests-remaining") || res.headers.get("X-RateLimit-Remaining");
  const limit=res.headers.get("x-ratelimit-requests-limit") || res.headers.get("X-RateLimit-Limit");
  if(!res.ok || (data.errors && Object.keys(data.errors).length)){
    const e=JSON.stringify(data.errors||{http:res.status});
    const err=new Error(`API-Football: ${e}`);
    err.status=res.status; err.remaining=remaining; err.limit=limit;
    throw err;
  }
  return {response:Array.isArray(data.response)?data.response:[],remaining,limit,results:num(data.results)||0};
}

async function optionalApi(path,params,force=false,ttl=CACHE_TTL_MS){
  try{
    const x=await cached(`call:${path}:${JSON.stringify(params)}`,()=>apiFetch(path,params),force,ttl);
    return {ok:true,...x,error:null};
  }catch(err){
    console.warn(`API opcional falhou ${path}:`,err.message);
    return {ok:false,response:[],remaining:err.remaining||null,limit:err.limit||null,error:err.message};
  }
}

function extractCoverage(leagueRow){
  const s=leagueRow?.seasons?.[0] || {};
  const c=s.coverage || {};
  return {
    year:num(s.year),
    current:!!s.current,
    start:s.start||null,
    end:s.end||null,
    fixtures:true,
    fixtureEvents:c.fixtures?.events===true,
    fixtureStatistics:c.fixtures?.statistics_fixtures===true || c.fixtures?.statistics===true || c.fixtures?.statistics?.fixtures===true,
    standings:c.standings===true,
    predictions:c.predictions===true,
    odds:c.odds===true,
    players:c.players===true,
    raw:c
  };
}
function chooseSeason(info,requestedSeason,fixtureDate){
  const seasons=Array.isArray(info?.seasons)?info.seasons:[];
  if(!seasons.length) return null;
  const exact=seasons.find(s=>Number(s.year)===Number(requestedSeason));
  if(exact) return exact;
  const active=seasons.find(s=>s.current===true);
  if(active) return active;
  const ts=new Date(fixtureDate).getTime();
  const ranked=seasons.slice().sort((a,b)=>{
    const da=Math.abs(new Date(a.start||`${a.year}-07-01`).getTime()-ts);
    const db=Math.abs(new Date(b.start||`${b.year}-07-01`).getTime()-ts);
    return da-db;
  });
  return ranked[0]||null;
}
function coverageScore(c){
  return [c.standings,c.predictions,c.fixtureStatistics].filter(Boolean).length;
}
function coverageLabel(c){
  const parts=[];
  if(c.standings) parts.push("Tabela");
  if(c.predictions) parts.push("Prediction");
  if(c.fixtureStatistics) parts.push("Stats");
  return parts.length?parts.join(" + "):"Cobertura básica";
}

function historyFeatures(fixtures,teamId){
  const rows=(fixtures||[]).filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null)
    .sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date)).slice(0,10);
  const gf=[],ga=[],o15=[],o25=[],btts=[],wins=[],clean=[];
  for(const f of rows){
    const homeId=f.teams?.home?.id,awayId=f.teams?.away?.id;
    if(homeId!==teamId&&awayId!==teamId) continue;
    const hg=num(f.goals.home),ag=num(f.goals.away);
    if(hg==null||ag==null) continue;
    const isHome=homeId===teamId,scored=isHome?hg:ag,conceded=isHome?ag:hg;
    gf.push(scored);ga.push(conceded);o15.push(hg+ag>=2);o25.push(hg+ag>=3);btts.push(hg>0&&ag>0);wins.push(isHome?hg>ag:ag>hg);clean.push(conceded===0);
  }
  return {n:gf.length,avgGF:avg(gf),avgGA:avg(ga),winRate:pct(wins),o15Rate:pct(o15),o25Rate:pct(o25),bttsRate:pct(btts)};
}
function h2hFeatures(rows){
  const v=(rows||[]).filter(f=>f?.goals?.home!=null&&f?.goals?.away!=null).slice(0,10);
  return {n:v.length,o15:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=2)),o25:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=3)),btts:pct(v.map(f=>Number(f.goals.home)>0&&Number(f.goals.away)>0))};
}
function predictionData(row){
  const x=row?.predictions||row||{},q=x.percent||{},goals=x.goals||{};
  let home=percent(q.home),draw=percent(q.draw),away=percent(q.away);
  if([home,draw,away].every(v=>v!=null)){
    const sum=home+draw+away;
    if(sum>0&&Math.abs(sum-100)>0.5){home=home/sum*100;draw=draw/sum*100;away=away/sum*100;}
  }
  const homeGoals=numericPrediction(goals.home),awayGoals=numericPrediction(goals.away);
  const available=[home,draw,away].every(v=>v!=null);
  return {home,draw,away,homeGoals,awayGoals,rawHomeGoals:goals.home??null,rawAwayGoals:goals.away??null,advice:x.advice||null,available};
}
function standingsMap(rows){
  const map=new Map();
  for(const group of Array.isArray(rows)?rows:[]){
    for(const table of group?.league?.standings||[]){
      for(const s of table||[]){
        const id=s.team?.id;if(id==null)continue;
        map.set(Number(id),{rank:num(s.rank),points:num(s.points),form:s.form||null,played:num(s.all?.played),wins:num(s.all?.win),draws:num(s.all?.draw),losses:num(s.all?.lose),homePlayed:num(s.home?.played),homeWins:num(s.home?.win),awayPlayed:num(s.away?.played),awayWins:num(s.away?.win)});
      }
    }
  }
  return map;
}
function formStringRate(form){
  if(!form)return null;
  const s=String(form).toUpperCase().replace(/[^WDL]/g,"");
  return s.length?100*s.split("").filter(x=>x==="W").length/s.length:null;
}

function marketReason(label,h,a,h2,p,sh,sa){
  const bits=[];
  const add=t=>{if(t)bits.push(t);};
  if(label.includes("1,5")&&h.o15Rate!=null&&a.o15Rate!=null)add(`+1,5 em ${Math.round(h.o15Rate)}% vs ${Math.round(a.o15Rate)}% dos últimos jogos`);
  if(label.includes("2,5")&&h.o25Rate!=null&&a.o25Rate!=null)add(`+2,5 em ${Math.round(h.o25Rate)}% vs ${Math.round(a.o25Rate)}% dos últimos jogos`);
  if(label.includes("Ambas")&&h.bttsRate!=null&&a.bttsRate!=null)add(`BTTS em ${Math.round(h.bttsRate)}% vs ${Math.round(a.bttsRate)}%`);
  if(label.includes("casa ou empate")&&p.home!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.home)}% casa + ${Math.round(p.draw)}% empate`);
  if(label.includes("fora ou empate")&&p.away!=null&&p.draw!=null)add(`Prediction: ${Math.round(p.away)}% fora + ${Math.round(p.draw)}% empate`);
  if(label.includes("Vitória da equipa da casa")&&p.home!=null)add(`Prediction: ${Math.round(p.home)}% casa`);
  if(label.includes("Vitória da equipa visitante")&&p.away!=null)add(`Prediction: ${Math.round(p.away)}% fora`);
  if(sh?.rank&&sa?.rank)add(`Tabela: ${sh.rank}º vs ${sa.rank}º`);
  if(h2.n>=3)add(`H2H: ${h2.n} jogos, +1,5 em ${Math.round(h2.o15??0)}%`);
  if(p.homeGoals!=null&&p.awayGoals!=null)add(`Golos previstos: ${p.homeGoals.toFixed(1)}–${p.awayGoals.toFixed(1)}`);
  return bits.slice(0,3).join("; ")||"Sem evidência numérica suficiente para justificar esta leitura.";
}

function buildMarkets(h,a,h2,p,evidenceCount){
  const hg=h.avgGF,ag=a.avgGF;
  const totalPred=p.homeGoals!=null&&p.awayGoals!=null?p.homeGoals+p.awayGoals:null;
  const baseMissing=evidenceCount<3;
  const over15=clamp(.32*(h.o15Rate??50)+.32*(a.o15Rate??50)+.12*clamp(((hg??1.25)+(ag??1.25))*28,0,100)+.08*(h2.o15??50)+.16*(totalPred!=null?clamp((totalPred-0.8)*55):50));
  const over25=clamp(.28*(h.o25Rate??50)+.28*(a.o25Rate??50)+.16*clamp(((hg??1.25)+(ag??1.25))*25,0,100)+.10*(h2.o25??50)+.18*(totalPred!=null?clamp((totalPred-1.2)*55):50));
  const btts=clamp(.32*(h.bttsRate??50)+.32*(a.bttsRate??50)+.12*clamp((hg??1.25)*30,0,100)+.12*clamp((ag??1.25)*30,0,100)+.08*(h2.btts??50)+.04*(totalPred!=null?clamp(Math.min(p.homeGoals,p.awayGoals)*70):50));
  const home=clamp(p.home??h.winRate??50),away=clamp(p.away??a.winRate??50),draw=clamp(p.draw??25);
  const raw=[
    {market:"over15",label:"Mais de 1,5 golos",confidence:over15},
    {market:"over25",label:"Mais de 2,5 golos",confidence:over25},
    {market:"btts",label:"Ambas marcam",confidence:btts},
    {market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:(home+draw)*.96},
    {market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:(away+draw)*.96},
    {market:"homeWin",label:"Vitória da equipa da casa",confidence:home},
    {market:"awayWin",label:"Vitória da equipa visitante",confidence:away}
  ];
  const cap=evidenceCount>=5?94:evidenceCount===4?88:evidenceCount===3?82:evidenceCount===2?72:62;
  return raw.map(m=>({...m,confidence:Math.round(clamp(Math.min(m.confidence,cap)))})).sort((x,y)=>y.confidence-x.confidence);
}
function scoreGame(h,a,h2,p,sh,sa,leagueWeight,evidenceCount){
  const pred=[p.home,p.draw,p.away].filter(v=>v!=null);
  const predStrength=pred.length?Math.max(...pred):50;
  const form=avg([h.winRate,a.winRate].filter(v=>v!=null))??50;
  const goal=avg([h.o15Rate,a.o15Rate].filter(v=>v!=null))??50;
  const h2v=h2.n?(h2.o15??50):50;
  const table=sh?.rank&&sa?.rank?clamp(50+(sa.rank-sh.rank)*4):50;
  const completeness=clamp(evidenceCount/6*100);
  const raw=.28*predStrength+.22*form+.20*goal+.10*h2v+.10*table+.10*completeness;
  const evidencePenalty=evidenceCount<3?0.78:evidenceCount===3?0.90:evidenceCount===4?0.96:1;
  return Math.round(clamp(raw*leagueWeight*evidencePenalty));
}
function quality(evidenceCount){
  if(evidenceCount>=5)return "high";
  if(evidenceCount>=3)return "medium";
  if(evidenceCount>=1)return "low";
  return "insufficient";
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
    const date=dateInLisbon();
    const force=String(req?.query?.force||"")==="1";
    const result=await cached(`v149:${date}`,async()=>{
      const fixtureCall=await apiFetch("/fixtures",{date,timezone:"Europe/Lisbon"});
      const fixtures=fixtureCall.response;
      const upcoming=fixtures.filter(f=>["NS","TBD"].includes(f.fixture?.status?.short)&&!BLOCKED.test(f.league?.name||""));
      const prelim=upcoming.map(f=>({f,league:leagueInfo(f)})).filter(x=>x.league);

      // Coverage/season is loaded once per competition and cached for a full day.
      const leagueKeys=[...new Set(prelim.map(x=>`${x.f.league.id}:${x.f.league.season}`))];
      const leagueMeta=new Map();
      for(const key of leagueKeys){
        const [leagueId,fixtureSeason]=key.split(":");
        const call=await optionalApi("/leagues",{id:leagueId},false,COVERAGE_TTL_MS);
        const row=call.response?.[0];
        const chosen=chooseSeason(row,fixtureSeason,prelim.find(x=>String(x.f.league.id)===leagueId)?.f.fixture.date);
        const coverage=chosen?extractCoverage({seasons:[chosen]}):{year:num(fixtureSeason),current:false,fixtures:true,fixtureEvents:false,fixtureStatistics:false,standings:false,predictions:false,odds:false,players:false};
        leagueMeta.set(key,{ok:call.ok,coverage,season:chosen?.year??num(fixtureSeason),error:call.error||null});
      }

      const candidates=prelim.map(x=>({...x,meta:leagueMeta.get(`${x.f.league.id}:${x.f.league.season}`)}))
        .sort((a,b)=>{
          const ca=coverageScore(a.meta?.coverage||{}),cb=coverageScore(b.meta?.coverage||{});
          return (cb-ca)||(b.league.weight-a.league.weight)||(new Date(a.f.fixture.date)-new Date(b.f.fixture.date));
        }).slice(0,MAX_CANDIDATES);

      const standingCache=new Map();
      const out=[];
      const failures=[];
      const diagnostics={
        quotaRemaining:fixtureCall.remaining,
        quotaLimit:fixtureCall.limit,
        fixtures:{ok:true,results:fixtureCall.results},
        leagues:{ok:true,requests:leagueKeys.length},
        competitions:[],
        optionalErrors:[]
      };

      for(const {f,league,meta} of candidates){
        try{
          const hid=Number(f.teams.home.id),aid=Number(f.teams.away.id);
          const coverage=meta?.coverage||{};
          const season=meta?.season??f.league.season;
          const leagueId=f.league.id;
          const cdiag={leagueId,league:league.name,season,coverage:coverageLabel(coverage),coverageFlags:{standings:!!coverage.standings,predictions:!!coverage.predictions,fixtureStatistics:!!coverage.fixtureStatistics}};

          let sm=new Map();
          const standKey=`${leagueId}:${season}`;
          if(coverage.standings){
            if(!standingCache.has(standKey)){
              const sc=await optionalApi("/standings",{league:leagueId,season},force);
              standingCache.set(standKey,{map:standingsMap(sc.response),call:sc});
            }
            const st=standingCache.get(standKey);
            sm=st.map;
            if(!st.call.ok) diagnostics.optionalErrors.push({fixture:f.fixture.id,endpoint:"standings",error:st.call.error});
          }

          // Recent fixtures and H2H remain useful even when a competition has no standings/predictions.
          const [hf0,af0,hh,pr]=await Promise.all([
            cached(`v149:h:${hid}:${leagueId}:${season}`,()=>optionalApi("/fixtures",{team:hid,league:leagueId,season,last:10},force),force),
            cached(`v149:a:${aid}:${leagueId}:${season}`,()=>optionalApi("/fixtures",{team:aid,league:leagueId,season,last:10},force),force),
            cached(`v149:h2h:${hid}-${aid}`,()=>optionalApi("/fixtures/headtohead",{h2h:`${hid}-${aid}`,last:10},force),force),
            coverage.predictions !== false ? cached(`v149:p:${f.fixture.id}`,()=>optionalApi("/predictions",{fixture:f.fixture.id},force),force) : Promise.resolve({ok:false,response:[],error:"prediction não coberta para esta competição/época"})
          ]);
          // Some competitions expose team history globally but not when scoped to the current season.
          const hf = hf0.response.length ? hf0 : await cached(`v149:h-fallback:${hid}`,()=>optionalApi("/fixtures",{team:hid,last:10},force),force);
          const af = af0.response.length ? af0 : await cached(`v149:a-fallback:${aid}`,()=>optionalApi("/fixtures",{team:aid,last:10},force),force);

          const h=historyFeatures(hf.response,hid),a=historyFeatures(af.response,aid),h2=h2hFeatures(hh.response),p=predictionData(pr.response?.[0]);
          const sh=sm.get(hid)||null,sa=sm.get(aid)||null;
          if(h.winRate==null) h.winRate=formStringRate(sh?.form) ?? (sh?.homePlayed&&sh?.homeWins!=null?sh.homeWins/sh.homePlayed*100:null);
          if(a.winRate==null) a.winRate=formStringRate(sa?.form) ?? (sa?.awayPlayed&&sa?.awayWins!=null?sa.awayWins/sa.awayPlayed*100:null);

          const evidenceCount=[h.n>=5,a.n>=5,h2.n>=2,p.available,sh?.rank!=null,sa?.rank!=null].filter(Boolean).length;
          const markets=buildMarkets(h,a,h2,p,evidenceCount);
          const score=scoreGame(h,a,h2,p,sh,sa,league.weight,evidenceCount);
          const best={...markets[0],reason:marketReason(markets[0].label,h,a,h2,p,sh,sa)};
          const suggestions=markets.slice(0,4).map(m=>({...m,reason:marketReason(m.label,h,a,h2,p,sh,sa)}));
          const dataQuality=quality(evidenceCount);

          out.push({
            id:f.fixture.id,home:f.teams.home.name,away:f.teams.away.name,league:league.name,
            time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(new Date(f.fixture.date)),
            kickoff:f.fixture.date,score,suggestion:best,suggestions,dataQuality,evidenceCount,
            coverage:{season,standings:!!coverage.standings,predictions:!!coverage.predictions,fixtureStatistics:!!coverage.fixtureStatistics,label:coverageLabel(coverage)},
            dataPoints:{historyHome:h.n,historyAway:a.n,h2h:h2.n,prediction:p.available,standingsHome:sh?.rank!=null,standingsAway:sa?.rank!=null},
            metrics:{
              form:`${h.winRate!=null?Math.round(h.winRate):"—"}% / ${a.winRate!=null?Math.round(a.winRate):"—"}% · ${h.n}/${a.n}`,
              goals:`${h.o15Rate!=null?Math.round(h.o15Rate):"—"}% / ${a.o15Rate!=null?Math.round(a.o15Rate):"—"}% +1.5 · ${h.avgGF!=null?h.avgGF.toFixed(2):"—"}/${a.avgGF!=null?a.avgGF.toFixed(2):"—"} GF`,
              h2h:h2.n?`${h2.n} jogos · +1,5 ${Math.round(h2.o15??0)}%`:"—",
              prediction:p.available?`${Math.round(p.home??0)}% / ${Math.round(p.draw??0)}% / ${Math.round(p.away??0)}%`:"—",
              table:sh?.rank&&sa?.rank?`${sh.rank}º / ${sa.rank}º`:"—"
            },
            evidence:{homeGF:h.avgGF,awayGF:a.avgGF,homeGA:h.avgGA,awayGA:a.avgGA,homeO15:h.o15Rate,awayO15:a.o15Rate,homeBTTS:h.bttsRate,awayBTTS:a.bttsRate,h2hO15:h2.o15,h2hBTTS:h2.btts,predictionHome:p.home,predictionDraw:p.draw,predictionAway:p.away,predictedGoals:[p.homeGoals,p.awayGoals],rawPredictedGoals:[p.rawHomeGoals,p.rawAwayGoals],homeRank:sh?.rank,awayRank:sa?.rank}
          });

          cdiag.evidenceCount=evidenceCount;cdiag.dataQuality=dataQuality;cdiag.sources={historyHome:h.n,historyAway:a.n,h2h:h2.n,prediction:p.available,standingsHome:!!sh,standingsAway:!!sa};
          diagnostics.competitions.push(cdiag);
          for(const [endpoint,call] of [["fixtures-home",hf],["fixtures-away",af],["h2h",hh],["predictions",pr]]){
            if(call?.error) diagnostics.optionalErrors.push({fixture:f.fixture.id,endpoint,error:call.error,remaining:call.remaining??null});
          }
          if(meta && meta.ok===false) diagnostics.optionalErrors.push({fixture:f.fixture.id,endpoint:"leagues",error:meta.error||"sem metadata da competição"});
        }catch(err){
          failures.push({fixture:f.fixture.id,error:err.message});
          diagnostics.optionalErrors.push({fixture:f.fixture.id,endpoint:"candidate",error:err.message});
          console.warn("Candidato ignorado",f.fixture.id,err.message);
        }
      }

      // Prefer games with stronger evidence. Score still matters, but data quality is a first-class criterion.
      out.sort((a,b)=>((b.evidenceCount*8+b.score)-(a.evidenceCount*8+a.score))||(new Date(a.kickoff)-new Date(b.kickoff)));
      const recommendable=out.filter(g=>g.evidenceCount>=3);
      const games=recommendable.slice(0,TOP_LIMIT);
      return {fixturesFound:fixtures.length,candidates:candidates.length,analyzedCount:out.length,failures:failures.length,recommendable:recommendable.length,games,diagnostics};
    },force);

    res.status(200).json({
      ok:true,version:"1.4.9",date,dateLabel:labelDate(date),fixturesFound:result.fixturesFound,
      candidates:result.candidates,analyzed:result.analyzedCount,recommendable:result.recommendable,selected:result.games.length,games:result.games,
      diagnostics:result.diagnostics,cached:!force
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."});
  }
}
