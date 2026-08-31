const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = globalThis.__footballCache || (globalThis.__footballCache = new Map());

const LEAGUES = [
  { id: 94, name: "Liga Portugal", weight: 1.05 },
  { id: 39, name: "Premier League", weight: 1.00 },
  { id: 140, name: "La Liga", weight: 1.00 },
  { id: 135, name: "Serie A", weight: 1.00 },
  { id: 78, name: "Bundesliga", weight: 1.00 },
  { id: 61, name: "Ligue 1", weight: 1.00 },
  { id: 2, name: "Champions League", weight: 1.05 },
  { id: 3, name: "Europa League", weight: 1.00 },
  { id: 848, name: "Conference League", weight: 0.95 }
];

function dateInLisbon() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function labelDate(date) {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
}
async function apiFetch(path, params = {}) {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error("API-Football não configurada. Cria a variável APIFOOTBALL_KEY na Vercel.");
  const url = new URL(`https://v3.football.api-sports.io${path}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "x-apisports-key": key }, cache: "no-store" });
  const data = await res.json();
  if (!res.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error(data.errors ? JSON.stringify(data.errors) : `API respondeu ${res.status}`);
  }
  return data.response || [];
}
function seasonForDate(date) {
  return Number(date.slice(0,4));
}
function clamp(n, a=0, b=100) { return Math.max(a, Math.min(b, n)); }
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }
function pct(arr) { return arr.length ? 100 * arr.filter(Boolean).length / arr.length : null; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function parseFixtureHistory(fixtures, teamId, isHome) {
  const games = fixtures.filter(f => f.teams.home.id === teamId || f.teams.away.id === teamId)
    .sort((a,b) => new Date(b.fixture.date)-new Date(a.fixture.date)).slice(0,10);
  const gf=[], ga=[], over15=[], over25=[], btts=[], wins=[], losses=[];
  for (const f of games) {
    const home = f.teams.home.id === teamId;
    const hg = num(f.goals.home), ag = num(f.goals.away);
    if (hg === null || ag === null) continue;
    const scored = home ? hg : ag, conceded = home ? ag : hg;
    gf.push(scored); ga.push(conceded); over15.push(hg+ag>=2); over25.push(hg+ag>=3); btts.push(hg>0&&ag>0);
    wins.push(home ? hg>ag : ag>hg); losses.push(home ? hg<ag : ag<hg);
  }
  return { games: games.length, gf, ga, over15, over25, btts, wins, losses };
}
function weighted(a,b,bWeight) {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;
  return a * (1-bWeight) + b * bWeight;
}
function parseH2H(fixtures, homeId) {
  const valid = fixtures.filter(f => f.goals?.home != null && f.goals?.away != null).slice(0,10);
  return {
    games: valid.length,
    over15: pct(valid.map(f => (Number(f.goals.home)+Number(f.goals.away)) >= 2)),
    over25: pct(valid.map(f => (Number(f.goals.home)+Number(f.goals.away)) >= 3)),
    btts: pct(valid.map(f => Number(f.goals.home)>0 && Number(f.goals.away)>0))
  };
}
function teamFeatures(h, a) {
  const hGoals = avg(h.gf), aGoals = avg(a.gf), hCon = avg(h.ga), aCon = avg(a.ga);
  return {
    homeOver15: pct(h.over15), awayOver15: pct(a.over15),
    homeOver25: pct(h.over25), awayOver25: pct(a.over25),
    homeBtts: pct(h.btts), awayBtts: pct(a.btts),
    homeWin: pct(h.wins), awayWin: pct(a.wins),
    goalAvg: [hGoals,aGoals].filter(x=>x!==null).length ? avg([hGoals,aGoals].filter(x=>x!==null)) : null,
    concededAvg: [hCon,aCon].filter(x=>x!==null).length ? avg([hCon,aCon].filter(x=>x!==null)) : null,
    combinedGoals: [hGoals,aGoals,hCon,aCon].filter(x=>x!==null).length ? avg([hGoals,aGoals,hCon,aCon].filter(x=>x!==null)) : null
  };
}
function suggestionScores(f, prediction) {
  const homePct = prediction?.percent?.home ? num(String(prediction.percent.home).replace('%','')) : null;
  const drawPct = prediction?.percent?.draw ? num(String(prediction.percent.draw).replace('%','')) : null;
  const awayPct = prediction?.percent?.away ? num(String(prediction.percent.away).replace('%','')) : null;
  const apiOver = prediction?.under_over ? String(prediction.under_over).toLowerCase().includes("over") : false;
  const h15 = f.homeOver15 ?? 50, a15 = f.awayOver15 ?? 50;
  const h25 = f.homeOver25 ?? 50, a25 = f.awayOver25 ?? 50;
  const hb = f.homeBtts ?? 50, ab = f.awayBtts ?? 50;

  const over15 = clamp(0.34*h15 + 0.34*a15 + 0.20*(f.goalAvg ? clamp(f.goalAvg*30,0,100) : 50) + 0.12*(apiOver?100:50));
  const over25 = clamp(0.32*h25 + 0.32*a25 + 0.24*(f.goalAvg ? clamp(f.goalAvg*22,0,100) : 50) + 0.12*(apiOver?100:50));
  const btts = clamp(0.40*hb + 0.40*ab + 0.20*(f.concededAvg ? clamp(f.concededAvg*28,0,100) : 50));
  const home = homePct ?? (f.homeWin ?? 50);
  const away = awayPct ?? (f.awayWin ?? 50);
  const draw = drawPct ?? 25;
  const doubleHome = clamp(home + draw);
  const doubleAway = clamp(away + draw);

  return [
    { market:"over15", label:"Mais de 1,5 golos", confidence:over15, reason:"Frequência recente de +1,5 golos e tendência geral de golos." },
    { market:"over25", label:"Mais de 2,5 golos", confidence:over25, reason:"Médias recentes e frequência de jogos com 3+ golos." },
    { market:"btts", label:"Ambas marcam", confidence:btts, reason:"Frequência de ambas as equipas marcarem e golos sofridos." },
    { market:"doubleHome", label:"Dupla possibilidade: casa ou empate", confidence:doubleHome, reason:"Probabilidade de vitória/empate da equipa da casa." },
    { market:"doubleAway", label:"Dupla possibilidade: fora ou empate", confidence:doubleAway, reason:"Probabilidade de vitória/empate da equipa visitante." },
    { market:"homeWin", label:"Vitória da equipa da casa", confidence:home, reason:"Previsão de resultado e desempenho recente da equipa da casa." },
    { market:"awayWin", label:"Vitória da equipa visitante", confidence:away, reason:"Previsão de resultado e desempenho recente da equipa visitante." }
  ].sort((x,y)=>y.confidence-x.confidence);
}

function scoreFixture(features, suggestions, prediction, leagueWeight, coverage) {
  const top = suggestions[0]?.confidence || 0;
  const dataParts = [
    features.homeOver15, features.awayOver15, features.homeOver25, features.awayOver25,
    features.homeBtts, features.awayBtts, features.homeWin, features.awayWin,
    prediction?.percent?.home, prediction?.percent?.draw, prediction?.percent?.away
  ].filter(v => v !== null && v !== undefined);
  const completeness = clamp(dataParts.length / 10 * 100);
  const consistency = 100 - Math.abs((features.homeWin ?? 50) - (features.awayWin ?? 50)) * 0.35;
  const score = clamp(0.55*top + 0.18*completeness + 0.12*consistency + 0.15*(coverage?100:70)) * leagueWeight;
  return Math.round(clamp(score));
}

async function getJsonCached(key, fn, force=false) {
  const now = Date.now();
  const hit = cache.get(key);
  if (!force && hit && now-hit.time < CACHE_TTL_MS) return hit.value;
  const value = await fn();
  cache.set(key,{time:now,value});
  return value;
}

export default async function handler(req, res) {
  try {
    const date = dateInLisbon();
    const force = req.query?.force === "1";
    const cacheKey = `opps:${date}`;

    const games = await getJsonCached(cacheKey, async () => {
      const season = seasonForDate(date);

      // Uma única chamada de calendário: depois filtramos as competições que nos interessam.
      // Isto poupa quota face a fazer uma chamada /fixtures por cada liga.
      const fixtures = await apiFetch("/fixtures", {
        date,
        timezone: "Europe/Lisbon"
      });

      const leagueMap = new Map(LEAGUES.map(l => [l.id, l]));
      const selected = fixtures
        .filter(f => (f.fixture?.status?.short === "NS" || f.fixture?.status?.short === "TBD")
          && leagueMap.has(f.league?.id))
        .map(f => ({ f, league: leagueMap.get(f.league.id) }))
        .sort((a,b) => new Date(a.f.fixture.date) - new Date(b.f.fixture.date))
        .slice(0, 16);

      const results = [];

      // Processamento sequencial para respeitar melhor os limites por minuto.
      for (const item of selected) {
        const f = item.f, league = item.league;
        try {
          const homeId = f.teams.home.id, awayId = f.teams.away.id;

          const [homeFixtures, awayFixtures, h2h, prediction] = await Promise.all([
            getJsonCached(`hist:${season}:${homeId}`, () => apiFetch("/fixtures", {team:homeId, season, last:10})),
            getJsonCached(`hist:${season}:${awayId}`, () => apiFetch("/fixtures", {team:awayId, season, last:10})),
            getJsonCached(`h2h:${homeId}:${awayId}`, () => apiFetch("/fixtures/headtohead", {h2h:`${homeId}-${awayId}`, last:10})),
            getJsonCached(`prediction:${f.fixture.id}`, () => apiFetch("/predictions", {fixture:f.fixture.id}))
          ]);

          const h = parseFixtureHistory(homeFixtures, homeId, true);
          const a = parseFixtureHistory(awayFixtures, awayId, false);
          const h2hParsed = parseH2H(h2h, homeId);
          const features = teamFeatures(h,a);
          const pred = prediction[0] || null;

          // O H2H é um sinal complementar; tem peso baixo para não sobrevalorizar
          // confrontos antigos com plantéis diferentes.
          if (h2hParsed.games >= 3) {
            features.homeOver15 = weighted(features.homeOver15, h2hParsed.over15, 0.15);
            features.homeOver25 = weighted(features.homeOver25, h2hParsed.over25, 0.15);
            features.homeBtts = weighted(features.homeBtts, h2hParsed.btts, 0.15);
          }

          const suggestions = suggestionScores(features,pred);
          const score = scoreFixture(features,suggestions,pred,league.weight,true);
          if (score < 65 || !suggestions.length) continue;

          const dataQuality = (h.games>=6 && a.games>=6) ? "high" : (h.games>=3 && a.games>=3) ? "medium" : "low";
          const dt = new Date(f.fixture.date);

          results.push({
            id:f.fixture.id,
            home:f.teams.home.name,
            away:f.teams.away.name,
            league:league.name,
            time:new Intl.DateTimeFormat("pt-PT",{timeZone:"Europe/Lisbon",hour:"2-digit",minute:"2-digit"}).format(dt),
            score,
            suggestion:suggestions[0],
            suggestions:suggestions.slice(0,4),
            dataQuality,
            kickoff:f.fixture.date,
            predictionAdvice:pred?.advice || null
          });
        } catch(e) {
          console.warn("Jogo ignorado:", f.fixture.id, e.message);
        }
      }
      return results.sort((a,b)=>b.score-a.score).slice(0,TOP_LIMIT);
    }, force);

    res.status(200).json({ ok:true, date, dateLabel:labelDate(date), analyzed: games.length, games, cached:!force });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:e.message || "Erro ao analisar jogos." });
  }
}
