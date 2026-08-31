
const CACHE_TTL_MS = 30 * 60 * 1000;
const TOP_LIMIT = 5;
const MIN_SCORE = 50;
const MAX_CANDIDATES = 8;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const PRIORITY_LEAGUES = new Map([
  [94,  { name:"Liga Portugal", weight:1.05 }],
  [39,  { name:"Premier League", weight:1.00 }],
  [140, { name:"La Liga", weight:1.00 }],
  [135, { name:"Serie A", weight:1.00 }],
  [78,  { name:"Bundesliga", weight:1.00 }],
  [61,  { name:"Ligue 1", weight:1.00 }],
  [2,   { name:"Champions League", weight:1.05 }],
  [3,   { name:"Europa League", weight:1.00 }],
  [848, { name:"Conference League", weight:0.95 }],
  [203, { name:"Süper Lig", weight:0.90 }],
  [71,  { name:"Brasileirão Série A", weight:0.90 }],
  [128, { name:"Liga Argentina", weight:0.88 }],
  [253, { name:"MLS", weight:0.85 }]
]);

const BLOCKED_COMPETITION_RE = /\b(women|feminino|female|u17|u18|u19|u20|u21|youth|juvenil|reserve|reserves|b team|sub-17|sub-19)\b/i;

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
function cacheGet(key){
  const x=cache.get(key);
  return x && Date.now()-x.time<CACHE_TTL_MS ? x.value : null;
}
async function cached(key, fn, force=false){
  if(!force){
    const hit=cacheGet(key);
    if(hit!==null) return hit;
  }
  const value=await fn();
  cache.set(key,{time:Date.now(),value});
  return value;
}

async function apiFetch(path, params={}) {
  const key=String(process.env.APIFOOTBALL_KEY||"").trim();
  if(!key) throw new Error("APIFOOTBALL_KEY não está disponível neste deployment.");

  const url=new URL(`https://v3.football.api-sports.io${path}`);
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));

  const res=await fetch(url,{
    headers:{"x-apisports-key":key,"Accept":"application/json"},
    cache:"no-store"
  });
  const text=await res.text();

  let data={};
  try { data=text?JSON.parse(text):{}; }
  catch { throw new Error(`Resposta inválida da API-Football (HTTP ${res.status}).`); }

  if(!res.ok || (data.errors && Object.keys(data.errors).length)){
    const e=JSON.stringify(data.errors||{http:res.status});
    if(res.status===401||res.status===403||/missing application key|invalid.*key|unauthorized/i.test(e)){
      throw new Error("A API-Football recusou a chave. Confirma APIFOOTBALL_KEY e faz Redeploy.");
    }
    throw new Error(`API-Football: ${e}`);
  }
  return Array.isArray(data.response)?data.response:[];
}

async function optionalApi(path, params, fallback=[]){
  try { return await apiFetch(path,params); }
  catch(err) {
    console.warn(`API opcional falhou ${path}:`, err.message);
    return fallback;
  }
}

function historyFeatures(fixtures, teamId){
  const rows=(fixtures||[])
    .filter(f=>f.goals?.home!=null&&f.goals?.away!=null)
    .sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date))
    .slice(0,10);

  const gf=[],ga=[],o15=[],o25=[],btts=[],wins=[],clean=[];
  for(const f of rows){
    const isHome=f.teams.home.id===teamId;
    const hg=num(f.goals.home), ag=num(f.goals.away);
    if(hg==null||ag==null) continue;
    const scored=isHome?hg:ag;
    const conceded=isHome?ag:hg;
    gf.push(scored);
    ga.push(conceded);
    o15.push(hg+ag>=2);
    o25.push(hg+ag>=3);
    btts.push(hg>0&&ag>0);
    wins.push(isHome?hg>ag:ag>hg);
    clean.push(conceded===0);
  }
  return {n:gf.length,gf,ga,o15,o25,btts,wins,clean};
}

function h2hFeatures(rows){
  const v=(rows||[])
    .filter(f=>f.goals?.home!=null&&f.goals?.away!=null)
    .slice(0,10);

  return {
    n:v.length,
    o15:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=2)),
    o25:pct(v.map(f=>Number(f.goals.home)+Number(f.goals.away)>=3)),
    btts:pct(v.map(f=>Number(f.goals.home)>0&&Number(f.goals.away)>0))
  };
}

function predictionData(row){
  const x=row?.predictions || row || {};
  const percentObj=x.percent || {};
  const goals=x.goals || {};
  const winner=x.winner || {};

  let home=percent(percentObj.home);
  let draw=percent(percentObj.draw);
  let away=percent(percentObj.away);

  // A API pode devolver percentagens incompletas/não normalizadas.
  // Normalizamos apenas quando temos os três valores para evitar
  // transformar "50/50/50" numa falsa confiança de 100%.
  const probs=[home,draw,away];
  if(probs.every(v=>v!=null)){
    const sum=probs.reduce((s,v)=>s+v,0);
    if(sum>0 && (sum>100.5 || sum<99.5)){
      home=home/sum*100;
      draw=draw/sum*100;
      away=away/sum*100;
    }
  }

  return {
    home, draw, away,
    over:typeof x.under_over==="string" ? /over/i.test(x.under_over) : null,
    underOver:x.under_over || null,
    advice:x.advice||null,
    homeGoals:num(goals.home),
    awayGoals:num(goals.away),
    winnerId:num(winner.id),
    winnerName:winner.name||null,
    winOrDraw:x.win_or_draw===true
  };
}

function meanOr(a,b,fallback=50){
  const vals=[a,b].filter(x=>x!=null);
  return vals.length?avg(vals):fallback;
}

function buildMarkets(h,a,h2,p){
  const h15=pct(h.o15), a15=pct(a.o15);
  const h25=pct(h.o25), a25=pct(a.o25);
  const hb=pct(h.btts), ab=pct(a.btts);
  const hg=avg(h.gf), ag=avg(a.gf);
  const hc=avg(h.ga), ac=avg(a.ga);

  const avgScored=meanOr(hg,ag,1.25);
  const avgConceded=meanOr(hc,ac,1.25);
  const totalGoalsPred=(p.homeGoals!=null&&p.awayGoals!=null)
    ? p.homeGoals+p.awayGoals : null;

  const predictedOver15 = totalGoalsPred!=null ? clamp((totalGoalsPred-0.8)*55,0,100) : 50;
  const predictedOver25 = totalGoalsPred!=null ? clamp((totalGoalsPred-1.2)*55,0,100) : 50;

  const over15=clamp(
    .27*(h15??50)+
    .27*(a15??50)+
    .16*clamp(avgScored*35,0,100)+
    .10*clamp(avgConceded*30,0,100)+
    .10*(h2.o15??50)+
    .10*predictedOver15
  );

  const over25=clamp(
    .25*(h25??50)+
    .25*(a25??50)+
    .15*clamp(avgScored*32,0,100)+
    .10*clamp(avgConceded*25,0,100)+
    .10*(h2.o25??50)+
    .15*predictedOver25
  );

  const btts=clamp(
    .30*(hb??50)+
    .30*(ab??50)+
    .12*clamp(avgScored*30,0,100)+
    .10*clamp(avgConceded*30,0,100)+
    .08*(h2.btts??50)+
    .10*clamp((p.homeGoals!=null&&p.awayGoals!=null)
      ? Math.min(p.homeGoals,p.awayGoals)*70 : 50,0,100)
  );

  // Confiança é uma estimativa de evidência, não uma garantia.
  // Sem previsão real, não usamos 50% artificiais como se fossem probabilidade.
  const formHome=pct(h.wins), formAway=pct(a.wins);
  const home=clamp(p.home!=null ? p.home : (formHome!=null ? formHome : 50));
  const away=clamp(p.away!=null ? p.away : (formAway!=null ? formAway : 50));
  const draw=clamp(p.draw!=null ? p.draw : 25);

  // As duplas possibilidades só podem chegar a 100 quando a evidência
  // combinada realmente o justificar. Com dados fracos, aplicamos uma
  // penalização de qualidade para evitar falsas certezas.
  const dataN=h.n+a.n+h2.n;
  const qualityFactor = dataN>=12 ? 1 : dataN>=6 ? 0.92 : dataN>=2 ? 0.82 : 0.72;
  const home1x=clamp((home+draw)*qualityFactor);
  const awayX2=clamp((away+draw)*qualityFactor);

  const markets=[
    {market:"over15",label:"Mais de 1,5 golos",confidence:over15,
      reason:"Forma recente, produção de golos e previsão apontam para pelo menos dois golos."},
    {market:"over25",label:"Mais de 2,5 golos",confidence:over25,
      reason:"Há sinais combinados de frequência de 3+ golos e tendência ofensiva."},
    {market:"btts",label:"Ambas marcam",confidence:btts,
      reason:"As duas equipas apresentam sinais de marcar e conceder golos."},
    {market:"doubleHome",label:"Dupla possibilidade: casa ou empate",confidence:home1x,
      reason:"A previsão e os resultados recentes favorecem a equipa da casa ou o empate."},
    {market:"doubleAway",label:"Dupla possibilidade: fora ou empate",confidence:awayX2,
      reason:"A previsão e os resultados recentes favorecem a equipa visitante ou o empate."},
    {market:"homeWin",label:"Vitória da equipa da casa",confidence:home,
      reason:"A previsão disponível e a forma recente dão vantagem à equipa da casa."},
    {market:"awayWin",label:"Vitória da equipa visitante",confidence:away,
      reason:"A previsão disponível e a forma recente dão vantagem à equipa visitante."}
  ];

  const dataN=h.n+a.n+h2.n;
  const evidenceCap = dataN>=12 ? 96 : dataN>=6 ? 90 : dataN>=2 ? 82 : 72;
  markets.forEach(m => { m.confidence = Math.round(clamp(Math.min(m.confidence, evidenceCap))); });
  return markets.sort((x,y)=>y.confidence-x.confidence);
}

function scoreGame(h,a,h2,p,leagueWeight){
  const predictionValues=[p.home,p.draw,p.away].filter(x=>x!=null);
  const predictionStrength=predictionValues.length
    ? Math.max(...predictionValues, Math.min(100,(p.home??0)+(p.draw??0)), Math.min(100,(p.away??0)+(p.draw??0)))
    : 50;

  const form=meanOr(pct(h.wins),pct(a.wins));
  const goalTrend=meanOr(pct(h.o15),pct(a.o15));
  const h2h=h2.n ? (h2.o15??50) : 50;

  const available=[
    h.n>0,a.n>0,h2.n>0,
    p.home!=null,p.draw!=null,p.away!=null,
    p.homeGoals!=null,p.awayGoals!=null
  ].filter(Boolean).length;

  const completeness=available/8*100;

  const raw=
    .30*predictionStrength+
    .23*form+
    .22*goalTrend+
    .15*h2h+
    .10*completeness;

  return Math.round(clamp(raw*leagueWeight));
}

function quality(h,a,h2,p){
  const n=h.n+a.n;
  const pred=[p.home,p.draw,p.away].some(x=>x!=null);
  if(n>=14 && h2.n>=3 && pred) return "high";
  if(n>=6 || h2.n>=1 || pred) return "medium";
  return "low";
}

function leagueInfo(f){
  const id=f.league?.id;
  if(PRIORITY_LEAGUES.has(id)) return PRIORITY_LEAGUES.get(id);

  const name=f.league?.name || "Outra competição";
  if(BLOCKED_COMPETITION_RE.test(name)) return null;

  // Competições não prioritárias entram apenas como fallback, com peso inferior.
  return {name,weight:0.82};
}

export default async function handler(req,res){
  try{
    const date=dateInLisbon();
    const force=String(req?.query?.force||"")==="1";

    const result=await cached(`v13:${date}`,async()=>{
      const fixtures=await apiFetch("/fixtures",{date,timezone:"Europe/Lisbon"});

      const upcoming=fixtures.filter(f=>{
        const status=f.fixture?.status?.short;
        return ["NS","TBD"].includes(status) &&
          !BLOCKED_COMPETITION_RE.test(f.league?.name||"");
      });

      let candidates=upcoming
        .map(f=>({f,league:leagueInfo(f)}))
        .filter(x=>x.league)
        .sort((a,b)=>
          (b.league.weight-a.league.weight) ||
          (new Date(a.f.fixture.date)-new Date(b.f.fixture.date))
        )
        .slice(0,MAX_CANDIDATES);

      const out=[];
      const failures=[];

      for(const {f,league} of candidates){
        try{
          const hid=f.teams.home.id;
          const aid=f.teams.away.id;

          // Cada fonte é opcional. Um erro numa delas NÃO elimina o jogo.
          const [hf,af,hh,pr]=await Promise.all([
            cached(`v13:h:${hid}`,()=>optionalApi("/fixtures",{team:hid,last:10})),
            cached(`v13:a:${aid}`,()=>optionalApi("/fixtures",{team:aid,last:10})),
            cached(`v13:h2h:${hid}-${aid}`,()=>optionalApi("/fixtures/headtohead",{h2h:`${hid}-${aid}`,last:10})),
            cached(`v13:p:${f.fixture.id}`,()=>optionalApi("/predictions",{fixture:f.fixture.id}))
          ]);

          const h=historyFeatures(hf,hid);
          const a=historyFeatures(af,aid);
          const h2=h2hFeatures(hh);
          const p=predictionData(pr[0]);

          const markets=buildMarkets(h,a,h2,p);
          const score=scoreGame(h,a,h2,p,league.weight);
          const q=quality(h,a,h2,p);

          // Mantemos os melhores mesmo com dados incompletos.
          if(score<MIN_SCORE) continue;

          const best=markets[0];

          out.push({
            id:f.fixture.id,
            home:f.teams.home.name,
            away:f.teams.away.name,
            league:league.name,
            time:new Intl.DateTimeFormat("pt-PT",{
              timeZone:"Europe/Lisbon",
              hour:"2-digit",
              minute:"2-digit"
            }).format(new Date(f.fixture.date)),
            kickoff:f.fixture.date,
            score,
            suggestion:best,
            suggestions:markets.slice(0,4),
            dataQuality:q,
            metrics:{
              form:`${Math.round(meanOr(pct(h.wins),pct(a.wins)))}%`,
              goals:`${Math.round(meanOr(pct(h.o15),pct(a.o15)))}% +1.5`,
              h2h:h2.n?`${h2.n} jogos`:"—",
              prediction:[p.home,p.draw,p.away].some(x=>x!=null)?"✓":"—"
            },
            predictionAdvice:p.advice||null
          });
        }catch(err){
          failures.push({fixture:f.fixture.id,error:err.message});
          console.warn("Candidato ignorado",f.fixture.id,err.message);
        }
      }

      return {
        fixturesFound:fixtures.length,
        candidates:candidates.length,
        failures:failures.length,
        games:out.sort((a,b)=>b.score-a.score).slice(0,TOP_LIMIT)
      };
    },force);

    res.status(200).json({
      ok:true,
      version:"1.3.1",
      date,
      dateLabel:labelDate(date),
      fixturesFound:result.fixturesFound,
      candidates:result.candidates,
      analyzed:result.candidates,
      selected:result.games.length,
      games:result.games,
      diagnostics:{optionalFailures:result.failures},
      cached:!force
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ok:false,error:e.message||"Erro ao analisar jogos."});
  }
}
