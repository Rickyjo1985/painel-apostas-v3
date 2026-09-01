const PSW = "Rickyjo1985";
let apostas = JSON.parse(localStorage.getItem('banca_data')) || [];
let fltCasa = "todas", idEdicao = null, baseJogos = [], ultimoDiagnostico = null;

const MIN_SCORE = 50;
const TOP_LIMIT = 5;
function clamp(n, a=0, b=100) { return Math.max(a, Math.min(b, Number(n) || 0)); }
const HIST_KEY = "painel_v14_historico";
const QUOTA_GUARD_KEY = "painel_v1422_quota_guard";
const QUOTA_LIMIT_DEFAULT = 100;
const LAB_KEY = "painel_v1423_laboratorio";
let laboratorioSugestoes = JSON.parse(localStorage.getItem(LAB_KEY) || "[]");
let historicoSugestoes = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function getQuotaGuard() {
  try {
    const raw = localStorage.getItem(QUOTA_GUARD_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.day !== utcDayKey()) {
      localStorage.removeItem(QUOTA_GUARD_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(QUOTA_GUARD_KEY);
    return null;
  }
}
function setQuotaGuard(remaining = 0, limit = QUOTA_LIMIT_DEFAULT, reason = "limite diário atingido") {
  const data = { day: utcDayKey(), remaining: Number(remaining) || 0, limit: Number(limit) || QUOTA_LIMIT_DEFAULT, reason, savedAt: new Date().toISOString() };
  localStorage.setItem(QUOTA_GUARD_KEY, JSON.stringify(data));
  return data;
}
function clearQuotaGuard() {
  localStorage.removeItem(QUOTA_GUARD_KEY);
}
function isDailyQuotaError(message) {
  return /request limit for the day|limit for the day|daily limit|quota.*(day|daily)|reached.*limit.*day|limite diário|quota diária/i.test(String(message || ""));
}
function quotaResetText() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const hours = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 3600000));
  return `A quota diária é renovada após o próximo reset UTC (aprox. ${hours}h).`;
}

function verificarSenha() {
  if (document.getElementById("password").value === PSW) {
    document.getElementById("login-box").style.display = "none";
    document.getElementById("private-dashboard").style.display = "block";
    document.body.style.alignItems = "flex-start";
    atualizarPainel();
    carregarMelhoresJogos();
  } else {
    document.getElementById("error-msg").innerText = "Senha Incorreta.";
  }
}
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.activeElement?.id === "password") verificarSenha();
});

function mudarSeparador(tab) {
  document.querySelectorAll(".main-nav .nav-link").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.getElementById("view-gestor").style.display = tab === 'gestor' ? "block" : "none";
  document.getElementById("view-jogos").style.display = tab === 'jogos' ? "block" : "none";
  if (tab === 'jogos' && !baseJogos.length) carregarMelhoresJogos();
}

function alternarTipoAposta(t) {
  const c = document.getElementById("jogos-formulario-container");
  document.getElementById("btn-add-jogo").style.display = t === 'simples' ? "none" : "block";
  c.innerHTML = t === 'simples'
    ? `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo / Mercado" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div>`
    : `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 1" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div>
       <div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 2" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div>`;
  document.getElementById("form-odd-total").value = "";
}
function adicionarLinhaJogoForm() {
  const c = document.getElementById("jogos-formulario-container");
  const d = document.createElement("div"); d.className = "multi-game-row";
  d.innerHTML = `<input type="text" class="input-evento" placeholder="Jogo ${c.children.length + 1}" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required>`;
  c.appendChild(d);
}
function calcularOddTotalMultipla() {
  let t = 1, tem = false;
  document.querySelectorAll(".input-odd").forEach(i => { const v = parseFloat(i.value); if (!isNaN(v) && v > 0) { t *= v; tem = true; } });
  document.getElementById("form-odd-total").value = tem ? t.toFixed(2) : "";
}
function adicionarAposta(e) {
  e.preventDefault();
  let sub = [];
  document.querySelectorAll(".input-evento").forEach((inp, idx) => {
    sub.push({ nome: inp.value, odd: parseFloat(document.querySelectorAll(".input-odd")[idx].value) || 1 });
  });
  apostas.push({
    id: Date.now(), casa: document.getElementById("form-casa").value, tipo: document.getElementById("form-tipo").value,
    jogos: sub, valor: parseFloat(document.getElementById("form-valor").value) || 0,
    odd: parseFloat(document.getElementById("form-odd-total").value) || 1, estado: document.getElementById("form-estado").value
  });
  localStorage.setItem('banca_data', JSON.stringify(apostas));
  document.getElementById("bet-form").reset(); alternarTipoAposta('simples'); atualizarPainel();
}

async function carregarMelhoresJogos(force = false) {
  const status = document.getElementById("games-status");
  const container = document.getElementById("games-container");
  const btn = document.getElementById("btn-refresh-games");
  const guard = getQuotaGuard();
  if (guard) {
    status.className = "games-status quota-box";
    status.innerHTML = `🛑 <b>API-Football atingiu a quota diária.</b><br><small>O painel não fará novos pedidos para proteger a quota. ${quotaResetText()}</small>`;
    if (btn) { btn.disabled = true; btn.title = "Quota diária da API atingida"; }
    renderizarDiagnostico();
    renderizarJogos();
    return;
  }
  status.className = "games-status loading";
  status.innerText = "A analisar os jogos reais de hoje…";
  container.innerHTML = "";
  if (btn) btn.disabled = true;
  try {
    const q = force ? "?force=1" : "";
    const response = await fetch(`/api/jogos${q}`, { cache: "no-store" });
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      const short = String(raw || "Resposta vazia do servidor.")
        .replace(/<[^>]*>/g, " ")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 240);
      throw new Error(`O servidor não devolveu JSON. ${short}`);
    }
    if (!response.ok) throw new Error(data.error || "Não foi possível obter os jogos.");
    ultimoDiagnostico = data.diagnostics || null;
    baseJogos = calibrarJogos(data.games || []);
    document.getElementById("games-date").innerText = `${data.dateLabel || "Hoje"} · ${data.analyzed || 0} jogos analisados · ${data.selected ?? (data.games || []).length} melhores opções`;
    const quotaRemaining = Number(data.diagnostics?.quotaRemaining);
    const quotaLimit = Number(data.diagnostics?.quotaLimit) || QUOTA_LIMIT_DEFAULT;
    if (Number.isFinite(quotaRemaining) && quotaRemaining <= 0) setQuotaGuard(0, quotaLimit, "quota diária esgotada");
    else clearQuotaGuard();
    status.className = "games-status success";
    const remaining = Number.isFinite(quotaRemaining) ? ` · quota restante: ${quotaRemaining}` : "";
    status.innerText = baseJogos.length
      ? `Foram seleccionadas ${baseJogos.length} das melhores oportunidades com pelo menos 3 sinais reais. A confiança é uma estimativa estatística; o Score mede a força e a concordância dos sinais, não uma garantia de resultado.${remaining}`
      : ((data.analyzed || 0) > 0 ? `Foram analisados ${data.analyzed} jogos, mas nenhum reuniu pelo menos 3 sinais reais. O modelo não vai recomendar apostas com dados insuficientes.${remaining}` : "Não foram encontrados jogos pré-jogo nas competições disponíveis.");
    renderizarJogos();
    renderizarDiagnostico();
  } catch (err) {
    console.error(err);
    baseJogos = [];
    if (isDailyQuotaError(err.message)) {
      const guardData = setQuotaGuard(err.remaining ?? 0, err.limit ?? QUOTA_LIMIT_DEFAULT, "quota diária atingida");
      status.className = "games-status quota-box";
      status.innerHTML = `🛑 <b>API-Football atingiu o limite diário.</b><br><small>Pedidos restantes: ${guardData.remaining}/${guardData.limit}. ${quotaResetText()} O histórico e a calibração continuam disponíveis sem chamar a API.</small>`;
    } else {
      status.className = "games-status error-box";
      status.innerHTML = `⚠️ ${escapeHtml(err.message)}<br><small>Se a mensagem indicar limite diário, não é necessário alterar a <b>APIFOOTBALL_KEY</b>. Caso contrário, confirma a variável nas Environment Variables da Vercel.</small>`;
    }
    renderizarHistorico();
    renderizarCalibracao();
  } finally {
    if (btn && !getQuotaGuard()) { btn.disabled = false; btn.title = "Actualizar jogos e análise"; }
  }
}

function diagIcon(status) {
  if (status === "OK") return "🟢";
  if (status === "vazio") return "🟡";
  if (status === "não coberto") return "⚪";
  if (status === "não testado") return "⚪";
  return "🔴";
}
function renderizarDiagnostico() {
  const box = document.getElementById("games-diagnostics");
  if (!box) return;
  const d = ultimoDiagnostico;
  if (!d) { box.innerHTML = ""; box.style.display = "none"; return; }
  const rows = (d.competitions || []).slice(0, 8);
  const quota = d.quotaRemaining != null ? `${d.quotaRemaining}${d.quotaLimit ? ` / ${d.quotaLimit}` : ""}` : "—";
  const renderEndpoint = (label, item) => {
    if (!item) return `<div class="diag-row"><span>${label}</span><span>—</span></div>`;
    const reason = item.reason ? ` · ${escapeHtml(item.reason)}` : "";
    return `<div class="diag-row"><span>${diagIcon(item.status)} ${label}</span><span><b>${escapeHtml(item.status || "—")}</b>${item.results != null ? ` · ${item.results}` : ""}${reason}</span></div>`;
  };
  box.style.display = "block";
  box.innerHTML = `
    <div class="diagnostic-panel">
      <div class="diagnostic-head"><div><b>🔎 Diagnóstico da API</b><small>Não altera o Score. Serve apenas para identificar onde os dados estão a faltar.</small></div><span class="diag-quota">Quota: ${quota}</span></div>
      <div class="diagnostic-summary">
        <span>Fixtures: <b>${d.fixtures?.results ?? "—"}</b></span>
        <span>Competições: <b>${d.competitions?.length ?? 0}</b></span>
        <span>Erros: <b>${d.optionalErrors?.length ?? 0}</b></span>
      </div>
      <div class="diagnostic-list">
        ${rows.map((c, idx) => {
          const e=c.endpointDiagnostics||{};
          return `<details ${idx===0 ? "open" : ""} class="diagnostic-game">
            <summary><b>${escapeHtml(c.league || "Competição")}</b> · S${escapeHtml(String(c.season || "—"))} · ${escapeHtml(String(c.dataQuality || "—"))} · ${c.evidenceCount ?? 0}/6 sinais</summary>
            <div class="diag-grid">
              ${renderEndpoint("Leagues / season", e.leagues)}
              ${renderEndpoint("Standings", e.standings)}
              ${renderEndpoint("Forma casa", e.fixturesHome)}
              ${renderEndpoint("Forma casa fallback", e.fixturesHomeFallback)}
              ${renderEndpoint("Forma fora", e.fixturesAway)}
              ${renderEndpoint("Forma fora fallback", e.fixturesAwayFallback)}
              ${renderEndpoint("H2H", e.h2h)}
              ${renderEndpoint("Predictions", e.predictions)}
              ${renderEndpoint("Team stats casa", e.teamStatsHome)}
              ${renderEndpoint("Team stats fora", e.teamStatsAway)}
            </div>
          </details>`;
        }).join("")}
      </div>
    </div>`;
}

function nivelScore(score) {
  if (score >= 82) return { cls:"excellent", label:"FORTE", icon:"🟢" };
  if (score >= 72) return { cls:"very-good", label:"BOA", icon:"🟡" };
  if (score >= 60) return { cls:"interesting", label:"MODERADA", icon:"🟠" };
  return { cls:"interesting", label:"FRACA", icon:"🔴" };
}

function resultadoBinario(x) { return x.resultado === "ganha" ? 1 : 0; }

function historicoMercado(market) {
  const rows = historicoSugestoes.filter(x => x.market === market && x.resultado !== "pendente");
  const wins = rows.filter(x => x.resultado === "ganha").length;
  const avgConfidence = rows.length
    ? rows.reduce((sum, x) => sum + clamp(x.confidence ?? x.rawConfidence ?? 50), 0) / rows.length
    : null;
  const brier = rows.length
    ? rows.reduce((sum, x) => {
        const p = clamp(x.confidence ?? x.rawConfidence ?? 50) / 100;
        return sum + Math.pow(p - resultadoBinario(x), 2);
      }, 0) / rows.length
    : null;
  return {
    n: rows.length,
    wins,
    rate: rows.length ? wins / rows.length * 100 : null,
    avgConfidence,
    brier,
    gap: rows.length ? (wins / rows.length * 100) - avgConfidence : null
  };
}

function faixaScore(score) {
  const s = Number(score) || 0;
  if (s >= 80) return "80+";
  if (s >= 70) return "70-79";
  if (s >= 60) return "60-69";
  if (s >= 50) return "50-59";
  return "<50";
}

function historicoFaixa(market, score) {
  const faixa = faixaScore(score);
  const rows = historicoSugestoes.filter(x =>
    x.market === market &&
    (x.scoreBucket || faixaScore(x.score)) === faixa &&
    x.resultado !== "pendente"
  );
  const wins = rows.filter(x => x.resultado === "ganha").length;
  const avgConfidence = rows.length
    ? rows.reduce((sum, x) => sum + clamp(x.confidence ?? x.rawConfidence ?? 50), 0) / rows.length
    : null;
  return {
    n: rows.length,
    wins,
    rate: rows.length ? wins / rows.length * 100 : null,
    faixa,
    avgConfidence,
    gap: rows.length ? (wins / rows.length * 100) - avgConfidence : null
  };
}

function calibrarConfianca(raw, market, score) {
  const h = historicoMercado(market);
  const hb = historicoFaixa(market, score);
  let confidence = Math.round(clamp(raw));
  let source = "inicial";
  let sample = 0;
  let rate = null;
  let gap = null;

  // A calibração adaptativa só entra com evidência real suficiente.
  // Preferimos mercado + faixa; depois mercado; por fim não ajustamos.
  if (hb.n >= 5) {
    const weight = Math.min(1, hb.n / 20);
    const empirical = 50 + (hb.rate - 50) * weight;
    confidence = Math.round(clamp(.65 * confidence + .35 * empirical));
    source = `score ${hb.faixa}`;
    sample = hb.n;
    rate = hb.rate;
    gap = hb.gap;
  } else if (h.n >= 5) {
    const weight = Math.min(1, h.n / 20);
    const empirical = 50 + (h.rate - 50) * weight;
    confidence = Math.round(clamp(.78 * confidence + .22 * empirical));
    source = "mercado";
    sample = h.n;
    rate = h.rate;
    gap = h.gap;
  }

  confidence = Math.min(confidence, Math.min(95, Math.round(score + 12)));
  return { confidence, sample, rate, source, bucket: hb.faixa, gap };
}

function calibrarScore(rawScore, calibration) {
  const score = clamp(rawScore);
  if (!calibration || calibration.sample < 5 || calibration.gap == null) return Math.round(score);

  // Ajuste progressivo: quanto maior a amostra, maior a influência do erro real.
  // Limitamos a correcção para evitar que poucos resultados dominem o ranking.
  const sampleWeight = Math.min(1, calibration.sample / 20);
  const adjustment = calibration.gap * 0.35 * sampleWeight;
  return Math.round(clamp(score + adjustment, 0, 100));
}

function calibrarJogos(games) {
  return (games || []).map(j => {
    const rawScore = j.rawScore ?? j.score;
    const c = calibrarConfianca(j.suggestion.confidence, j.suggestion.market, rawScore);
    const calibratedScore = j.suggestion.market === "none" ? 0 : calibrarScore(rawScore, c);
    return {
      ...j,
      rawScore,
      rawConfidence:j.suggestion.confidence,
      score:calibratedScore,
      suggestion:{...j.suggestion, confidence:c.confidence, calibrationSample:c.sample, calibrationRate:c.rate, calibrationSource:c.source, calibrationBucket:c.bucket, calibrationGap:c.gap}
    };
  }).sort((a,b)=>b.score-a.score);
}

function guardarSugestao(id) {
  const j = baseJogos.find(x => String(x.id) === String(id));
  if (!j) return;
  if (historicoSugestoes.some(x => String(x.id) === String(id))) {
    alert("Esta sugestão já está no histórico.");
    return;
  }
  historicoSugestoes.unshift({
    id:j.id, date:j.kickoff?.slice(0,10) || new Date().toISOString().slice(0,10),
    kickoff:j.kickoff, home:j.home, away:j.away, league:j.league,
    market:j.suggestion.market, label:j.suggestion.label, reason:j.suggestion.reason,
    confidence:j.suggestion.confidence, rawConfidence:j.rawConfidence ?? j.suggestion.confidence,
    score:j.score, rawScore:j.rawScore ?? j.score, scoreBucket:faixaScore(j.score),
    metrics:j.metrics || {}, dataPoints:j.dataPoints || {}, coverage:j.coverage || {},
    evidenceCount:j.evidenceCount ?? null, dataQuality:j.dataQuality || "unknown",
    resultado:"pendente", savedAt:new Date().toISOString()
  });
  localStorage.setItem(HIST_KEY, JSON.stringify(historicoSugestoes));
  renderizarJogos();
  alert("Sugestão guardada no histórico.");
}

function atualizarResultado(id, resultado) {
  historicoSugestoes = historicoSugestoes.map(x => String(x.id) === String(id) ? {...x, resultado, resolvedAt:new Date().toISOString()} : x);
  localStorage.setItem(HIST_KEY, JSON.stringify(historicoSugestoes));
  renderizarHistorico();
  renderizarCalibracao();
  baseJogos = calibrarJogos(baseJogos);
  renderizarJogos();
}

function reabrirResultado(id) {
  historicoSugestoes = historicoSugestoes.map(x => String(x.id) === String(id) ? {...x, resultado:"pendente", resolvedAt:null} : x);
  localStorage.setItem(HIST_KEY, JSON.stringify(historicoSugestoes));
  renderizarHistorico();
  renderizarCalibracao();
  baseJogos = calibrarJogos(baseJogos);
  renderizarJogos();
}

function removerHistorico(id) {
  historicoSugestoes = historicoSugestoes.filter(x => String(x.id) !== String(id));
  localStorage.setItem(HIST_KEY, JSON.stringify(historicoSugestoes));
  renderizarHistorico();
  renderizarCalibracao();
}

function mostrarSubAbaJogos(tab) {
  const panels = {
    oportunidades: "games-opportunities",
    historico: "games-history",
    estatisticas: "games-calibration",
    laboratorio: "games-lab"
  };
  const buttons = {
    oportunidades: "history-tab-opportunities",
    historico: "history-tab-historico",
    estatisticas: "history-tab-estatisticas",
    laboratorio: "history-tab-laboratorio"
  };

  Object.entries(panels).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tab ? "block" : "none";
  });
  Object.entries(buttons).forEach(([key, id]) => {
    const b = document.getElementById(id);
    if (b) b.classList.toggle("active", key === tab);
  });

  if (tab === "oportunidades") renderizarJogos();
  if (tab === "historico") renderizarHistorico();
  if (tab === "estatisticas") renderizarCalibracao();
  if (tab === "laboratorio") renderizarLaboratorio();
}

function gerarDadosLaboratorio() {
  const hoje = new Date();
  const mercados = [
    "Dupla possibilidade: casa ou empate", "Dupla possibilidade: fora ou empate",
    "Mais de 1,5 golos", "Vitória da equipa da casa", "Dupla possibilidade: casa ou empate",
    "Mais de 1,5 golos", "Dupla possibilidade: fora ou empate", "Vitória da equipa da casa",
    "Dupla possibilidade: casa ou empate", "Mais de 1,5 golos", "Dupla possibilidade: fora ou empate", "Vitória da equipa da casa"
  ];
  const scores = [82,79,76,73,71,68,66,63,61,58,55,52];
  const confidences = [84,80,78,75,73,70,68,65,63,60,58,55];
  const results = ["ganha","ganha","ganha","perdida","ganha","ganha","perdida","ganha","perdida","ganha","perdida","ganha"];
  laboratorioSugestoes = scores.map((score,i)=>({
    id:`lab-${hoje.getTime()}-${i}`, date:hoje.toISOString().slice(0,10),
    kickoff:new Date(hoje.getTime()-(i+1)*3600000).toISOString(),
    home:["Benfica","Barcelona","Sporting","Real Madrid","Porto","Braga","Arsenal","Inter","PSV","Ajax","Roma","Lyon"][i],
    away:["Estoril","Rayo Vallecano","Arouca","Getafe","Rio Ave","Boavista","Chelsea","Milan","Feyenoord","Utrecht","Lazio","Nice"][i],
    league:"Laboratório V1.4.25", market:mercados[i], label:mercados[i], reason:"Resultado de teste para validar Histórico e calibração.",
    confidence:confidences[i], rawConfidence:confidences[i], score, rawScore:score, scoreBucket:faixaScore(score),
    resultado:results[i], savedAt:hoje.toISOString(), resolvedAt:hoje.toISOString(), laboratorio:true
  }));
  localStorage.setItem(LAB_KEY, JSON.stringify(laboratorioSugestoes));
  renderizarLaboratorio();
}
function limparLaboratorio() {
  if(!confirm("Apagar todos os dados de teste do Laboratório V1.4.23?")) return;
  laboratorioSugestoes=[]; localStorage.removeItem(LAB_KEY); renderizarLaboratorio();
}
function atualizarResultadoLaboratorio(id, resultado) {
  laboratorioSugestoes=laboratorioSugestoes.map(x=>String(x.id)===String(id)?{...x,resultado,resolvedAt:resultado==="pendente"?null:new Date().toISOString()}:x);
  localStorage.setItem(LAB_KEY,JSON.stringify(laboratorioSugestoes)); renderizarLaboratorio();
}
function renderizarLaboratorio() {
  const c=document.getElementById("games-lab"); if(!c) return;
  const resolved=laboratorioSugestoes.filter(x=>x.resultado!=="pendente");
  const wins=resolved.filter(x=>x.resultado==="ganha").length;
  const avg=resolved.length?Math.round(resolved.reduce((s,x)=>s+x.confidence,0)/resolved.length):null;
  const rate=resolved.length?Math.round(wins/resolved.length*100):null;
  const gap=rate==null?null:rate-avg;
  const status=resolved.length>=5?"🟢 Amostra de teste suficiente":"🟡 Gere os dados de teste para começar";
  c.innerHTML=`<div class="lab-panel">
    <div class="lab-head"><div><h3>🧪 Laboratório V1.4.25</h3><p>Ambiente isolado para testar Histórico, resultados e calibração <b>sem fazer pedidos à API-Football</b>. Os dados daqui não entram no histórico real.</p></div><span class="lab-badge">🚫 API: 0 pedidos</span></div>
    <div class="lab-actions"><button class="btn-lab" onclick="gerarDadosLaboratorio()">🧪 Gerar 12 resultados de teste</button><button class="btn-lab-secondary" onclick="limparLaboratorio()">🗑 Limpar laboratório</button></div>
    <div class="history-summary"><div><strong>${laboratorioSugestoes.length}</strong><small>Dados de teste</small></div><div><strong>${resolved.length}</strong><small>Avaliados</small></div><div><strong>${rate==null?"—":rate+"%"}</strong><small>Acerto teste</small></div><div><strong>${gap==null?"—":(gap>0?"+":"")+gap+" pp"}</strong><small>Real − previsto</small></div></div>
    <div class="calibration-status"><b>${status}</b><span>${resolved.length?`Confiança média ${avg}% · ${gap==null?"—":`diferença ${gap>0?"+":""}${gap} pp`}`:"Nenhum resultado de teste criado."}</span></div>
    ${laboratorioSugestoes.length?`<div class="lab-list">${laboratorioSugestoes.map(x=>`<div class="lab-row"><div><b>${escapeHtml(x.home)} vs ${escapeHtml(x.away)}</b><small>${escapeHtml(x.label)} · Score ${x.score} · Confiança ${x.confidence}% · ${escapeHtml(x.scoreBucket)}</small></div><div class="history-actions"><button class="result-btn ${x.resultado==="ganha"?"selected":""}" onclick="atualizarResultadoLaboratorio('${jsQuote(x.id)}','ganha')">✓ Ganha</button><button class="result-btn ${x.resultado==="perdida"?"selected":""}" onclick="atualizarResultadoLaboratorio('${jsQuote(x.id)}','perdida')">✕ Perdida</button><button class="result-btn ${x.resultado==="pendente"?"selected":""}" onclick="atualizarResultadoLaboratorio('${jsQuote(x.id)}','pendente')">⏳ Pendente</button></div></div>`).join("")}</div>`:`<div class="history-empty">Clica em <b>Gerar 12 resultados de teste</b>. Nada será enviado para a API.</div>`}
    <div class="calibration-help"><b>Teste recomendado:</b> gera os dados, altera 2 ou 3 resultados, confirma os valores e recarrega a página. O laboratório deve manter os dados e continuar sem consumir quota.</div>
  </div>`;
}

function renderizarJogos() {
  const c = document.getElementById("games-container");
  c.innerHTML = "";
  if (!baseJogos.length) return;
  baseJogos.forEach((j, index) => {
    const n = nivelScore(j.score);
    const confidence = Math.round(Math.min(95, Math.max(0, j.suggestion.confidence)));
    const confidenceLabel = j.suggestion.market === "none" ? "Força da evidência" : "Confiança estimada";
    const alternatives = (j.suggestions || []).filter(s => s.market !== j.suggestion.market).slice(0,2);
    const saved = historicoSugestoes.some(x => String(x.id) === String(j.id));
    const derivedEvidence = [
      Number(j.dataPoints?.historyHome || 0) >= 5,
      Number(j.dataPoints?.historyAway || 0) >= 5,
      Number(j.dataPoints?.h2h || 0) >= 2,
      j.dataPoints?.prediction === true,
      j.dataPoints?.standingsHome === true,
      j.dataPoints?.standingsAway === true
    ].filter(Boolean).length;
    const signalCount = Number.isFinite(Number(j.evidenceCount)) ? Number(j.evidenceCount) : derivedEvidence;
    const card = document.createElement("div");
    card.className = `game-card opportunity-card ${n.cls}`;
    const calibration = j.suggestion.calibrationSample >= 5
      ? `<span>📐 Score adaptado pelo histórico: ${j.rawScore ?? j.score} → ${j.score} · ${escapeHtml(j.suggestion.calibrationSource || "histórico")} · ${j.suggestion.calibrationSample} resultados (${Math.round(j.suggestion.calibrationRate)}% acerto${j.suggestion.calibrationGap==null?"":`, ${j.suggestion.calibrationGap>0?"+":""}${Math.round(j.suggestion.calibrationGap)} pp`})</span>`
      : `<span>📐 Calibração inicial${j.suggestion.calibrationSample ? ` · ${j.suggestion.calibrationSample}/5 resultados` : ""}</span>`;
    card.innerHTML = `
      <div>
        <div class="rank-line"><span class="rank-badge">#${index + 1}</span><span class="score-badge">Score ${j.score}/100</span><span class="level-badge">${n.icon} ${n.label}</span></div>
        <div class="game-meta"><span>⚽ ${escapeHtml(j.league)}</span><span>🕐 ${escapeHtml(j.time)}</span></div>
        <div class="game-title">${escapeHtml(j.home)} <span>vs</span> ${escapeHtml(j.away)}</div>
        <div class="confidence-line"><span>${confidenceLabel}</span><strong>${confidence}%</strong></div>
        <div class="confidence-bar"><span style="width:${Math.min(confidence,100)}%"></span></div>
        <div class="suggestion-box">
          <small>${j.suggestion.market === "none" ? "🧭 Decisão do modelo" : "🎯 Sugestão principal"}</small>
          <div class="main-suggestion">${escapeHtml(j.suggestion.label)}</div>
          <div class="reason">${escapeHtml(j.suggestion.reason)}</div>
        </div>
        <div class="analysis-mini">
          <span>📈 Forma ${j.metrics?.form ?? "—"}</span>
          <span>⚽ +1.5 ${j.metrics?.goals ?? "—"}</span>
          <span>🤝 H2H ${j.metrics?.h2h ?? "—"}</span>
          <span>🤖 API ${j.metrics?.prediction ?? "—"}</span>
          <span>🏆 Tabela ${j.metrics?.table ?? "—"}</span>
          <span>📡 ${escapeHtml(j.coverage?.label ?? "Cobertura básica")} · S${escapeHtml(String(j.coverage?.season ?? "—"))}</span>
        </div>
        <div class="evidence-detail">
          ${j.evidence?.homeGF != null || j.evidence?.awayGF != null ? `<span>⚽ Média golos: ${j.evidence.homeGF != null ? j.evidence.homeGF.toFixed(2) : "—"} / ${j.evidence.awayGF != null ? j.evidence.awayGF.toFixed(2) : "—"}</span>` : ""}
          ${j.evidence?.homeBTTS != null || j.evidence?.awayBTTS != null ? `<span>🎯 BTTS: ${j.evidence.homeBTTS != null ? Math.round(j.evidence.homeBTTS) : "—"}% / ${j.evidence.awayBTTS != null ? Math.round(j.evidence.awayBTTS) : "—"}%</span>` : ""}
        </div>
        <div class="calibration-note">${calibration}</div>
        ${alternatives.length ? `<div class="alternatives"><small>Outras leituras</small>${alternatives.map(s => `<div>• ${escapeHtml(s.label)} <b>${Math.round(s.confidence)}%</b></div>`).join("")}</div>` : ""}
      </div>
      <div class="card-footer">
        <span class="data-note">${j.suggestion.market === "none" ? "⛔ Sem vantagem clara" : (j.dataQuality === "high" ? "✓ Dados fortes" : j.dataQuality === "medium" ? "✓ Dados razoáveis" : j.dataQuality === "low" ? "⚠ Dados limitados" : "⛔ Dados insuficientes")} · ${signalCount}/6 sinais</span>
        <div class="card-actions">
          <button class="btn-import" onclick="importarParaFormulario('${jsQuote(`${j.home} vs ${j.away} (${j.suggestion.label})`)}', 1)" ${j.suggestion.market === "none" ? "disabled" : ""}>⚡ Registar</button>
          <button class="btn-history" onclick="guardarSugestao('${jsQuote(j.id)}')" ${saved ? "disabled" : ""}>${saved ? "✓ Guardada" : "📚 Guardar"}</button>
        </div>
      </div>`;
    c.appendChild(card);
  });
}

function renderizarHistorico() {
  const c=document.getElementById("games-history");
  if(!c) return;
  if(!historicoSugestoes.length){
    c.innerHTML=`<div class="history-empty">📚 Ainda não tens sugestões guardadas. Guarda uma oportunidade para começares a medir a precisão do modelo.</div>`;
    return;
  }
  const total=historicoSugestoes.length, resolved=historicoSugestoes.filter(x=>x.resultado!=="pendente");
  const wins=resolved.filter(x=>x.resultado==="ganha").length;
  c.innerHTML=`
    <div class="history-summary">
      <div><strong>${total}</strong><small>Sugestões guardadas</small></div>
      <div><strong>${resolved.length}</strong><small>Resultados avaliados</small></div>
      <div><strong>${resolved.length ? Math.round(wins/resolved.length*100) : "—"}%</strong><small>Taxa de acerto</small></div>
    </div>
    <div class="history-list">
      ${historicoSugestoes.map(x=>`
        <div class="history-row">
          <div>
            <b>${escapeHtml(x.home)} vs ${escapeHtml(x.away)}</b>
            <small>${escapeHtml(x.league)} · ${escapeHtml(x.label)} · Score ${x.score} · Confiança ${x.confidence}% · Faixa ${escapeHtml(x.scoreBucket || faixaScore(x.score))}</small>
            <small>Guardada: ${new Date(x.savedAt).toLocaleDateString("pt-PT")}${x.resolvedAt ? ` · Resultado: ${new Date(x.resolvedAt).toLocaleDateString("pt-PT")}` : ""}</small>
          </div>
          <div class="history-actions">
            <button class="result-btn ${x.resultado==="ganha"?"selected":""}" onclick="atualizarResultado('${jsQuote(x.id)}','ganha')">✓ Ganha</button>
            <button class="result-btn ${x.resultado==="perdida"?"selected":""}" onclick="atualizarResultado('${jsQuote(x.id)}','perdida')">✕ Perdida</button>
            ${x.resultado==="pendente" ? `<span class="pending-badge">⏳ Pendente</span>` : `<button class="result-btn" onclick="reabrirResultado('${jsQuote(x.id)}')">↩ Pendente</button>`}
            <button class="delete-history" onclick="removerHistorico('${jsQuote(x.id)}')">×</button>
          </div>
        </div>`).join("")}
    </div>`;
}

function renderizarCalibracao() {
  const c=document.getElementById("games-calibration");
  if(!c) return;
  const resolved=historicoSugestoes.filter(x=>x.resultado!=="pendente");
  const byMarket={};
  resolved.forEach(x=>{
    if(!byMarket[x.market]) byMarket[x.market]=[];
    byMarket[x.market].push(x);
  });
  const rows=Object.entries(byMarket).sort((a,b)=>b[1].length-a[1].length);
  const overall=resolved.length ? Math.round(resolved.filter(x=>x.resultado==="ganha").length/resolved.length*100) : null;
  const avgPred=resolved.length ? Math.round(resolved.reduce((s,x)=>s+clamp(x.confidence ?? x.rawConfidence ?? 50),0)/resolved.length) : null;
  const gap=overall==null || avgPred==null ? null : overall-avgPred;
  const gapLabel = gap==null ? "—" : Math.abs(gap)<=5 ? "🟢 Bem calibrado" : gap>0 ? "🟡 Conservador" : "🟠 Sobreconfiante";

  const bucketRows=["80+","70-79","60-69","50-59","<50"].map(bucket=>{
    const items=resolved.filter(x=>(x.scoreBucket||faixaScore(x.score))===bucket);
    const wins=items.filter(x=>x.resultado==="ganha").length;
    const rate=items.length?Math.round(wins/items.length*100):null;
    const pred=items.length?Math.round(items.reduce((s,x)=>s+clamp(x.confidence ?? x.rawConfidence ?? 50),0)/items.length):null;
    const diff=rate==null||pred==null?null:rate-pred;
    return {bucket,n:items.length,rate,pred,diff};
  });

  // V1.4.25 — quadro de auditoria do ajuste adaptativo.
  // Mostra exactamente como o histórico pode alterar o Score, sem usar o laboratório.
  const auditGroups={};
  resolved.forEach(x=>{
    const market=x.market || "—";
    const bucket=x.scoreBucket || faixaScore(x.score);
    const key=market+"||"+bucket;
    if(!auditGroups[key]) auditGroups[key]={market,bucket,items:[]};
    auditGroups[key].items.push(x);
  });
  const auditRows=Object.values(auditGroups).sort((a,b)=>b.items.length-a.items.length).slice(0,12).map(g=>{
    const items=g.items;
    const wins=items.filter(x=>x.resultado==="ganha").length;
    const rate=Math.round(wins/items.length*100);
    const avgConf=Math.round(items.reduce((s,x)=>s+clamp(x.confidence ?? x.rawConfidence ?? 50),0)/items.length);
    const avgRaw=Math.round(items.reduce((s,x)=>s+clamp(x.rawScore ?? x.score ?? 0),0)/items.length);
    const gapLocal=rate-avgConf;
    const weight=Math.min(1,items.length/20);
    const adjustment=Math.round(gapLocal*0.35*weight*10)/10;
    const preview=Math.round(clamp(avgRaw+adjustment,0,100));
    const state=items.length>=5 ? "🟢 Activo" : "⚪ A recolher";
    return {market:g.market,bucket:g.bucket,n:items.length,rate,avgConf,avgRaw,adjustment,preview,state};
  });

  const globalAdjustment = gap==null || resolved.length<5 ? 0 : Math.round(gap*0.35*Math.min(1,resolved.length/20)*10)/10;
  const adaptiveState = resolved.length < 5 ? "Calibração ainda não activa" : "Calibração adaptativa activa";
  const adaptiveDetail = resolved.length < 5
    ? `Faltam ${5-resolved.length} resultados reais avaliados para permitir qualquer ajuste.`
    : `Ajuste global de referência: ${globalAdjustment>0?"+":""}${globalAdjustment} pontos · amostra real: ${resolved.length}`;

  c.innerHTML=`
    <div class="calibration-panel">
      <h3>📊 Calibração real do modelo</h3>
      <p>A confiança é comparada com os resultados reais. A calibração adaptativa só pode alterar o Score após <b>5 resultados reais avaliados</b>. O Laboratório é ignorado.</p>
      <div class="history-summary">
        <div><strong>${overall==null?"—":overall+"%"}</strong><small>Acerto real</small></div>
        <div><strong>${avgPred==null?"—":avgPred+"%"}</strong><small>Confiança média prevista</small></div>
        <div><strong>${gap==null?"—":(gap>0?"+":"")+gap+" pp"}</strong><small>Diferença real − prevista</small></div>
        <div><strong>${resolved.length}</strong><small>Resultados avaliados</small></div>
      </div>
      <div class="calibration-status"><b>${gapLabel}</b><span>${resolved.length<5?`Ainda faltam ${5-resolved.length} resultados para activar a calibração.`:"Amostra mínima global atingida; cada mercado/faixa continua a exigir a sua própria amostra."}</span></div>

      <div class="adaptive-calibration-box">
        <div><b>🧠 ${adaptiveState}</b><small>${adaptiveDetail}</small></div>
        <span class="adaptive-badge">${resolved.length<5?"SEM AJUSTE":"AJUSTE CONTROLADO"}</span>
      </div>

      <h4 class="calibration-subtitle">🎯 Auditoria do Score adaptativo</h4>
      <p class="calibration-explain">O valor <b>Original</b> é o Score guardado na previsão. <b>Calibrado</b> é uma prévia do Score após aplicar a diferença real, com peso progressivo pela dimensão da amostra. Nenhum ajuste é aplicado ao histórico retroactivamente.</p>
      ${auditRows.length ? `<div class="calibration-table adaptive-table"><div class="ct-head"><span>Mercado / faixa</span><span>Amostra</span><span>Real / previsto</span><span>Score</span></div>${auditRows.map(r=>`
        <div class="ct-row"><span><b>${escapeHtml(r.market)}</b><small>${escapeHtml(r.bucket)} · ${r.state}</small></span><span>${r.n}</span><span>${r.rate}% / ${r.avgConf}%<small>${r.adjustment>0?"+":""}${r.adjustment} pts</small></span><span>${r.avgRaw} → <b>${r.preview}</b></span></div>`).join("")}</div>` : `<div class="history-empty">Ainda não há resultados reais avaliados para auditar o ajuste do Score.</div>`}

      ${rows.length ? `<h4 class="calibration-subtitle">📚 Desempenho por mercado</h4><div class="calibration-table"><div class="ct-head"><span>Mercado</span><span>Amostra</span><span>Acerto</span><span>Estado</span></div>${rows.map(([market,items])=>{
        const wins=items.filter(x=>x.resultado==="ganha").length, rate=Math.round(wins/items.length*100);
        const avg=Math.round(items.reduce((s,x)=>s+clamp(x.confidence ?? x.rawConfidence ?? 50),0)/items.length);
        const diff=rate-avg;
        const buckets={};
        items.forEach(x=>{ const b=x.scoreBucket||faixaScore(x.score); if(!buckets[b]) buckets[b]=[]; buckets[b].push(x); });
        const faixaInfo=Object.entries(buckets).sort((a,b)=>b[1].length-a[1].length).map(([b,v])=>`${b}: ${v.length}`).join(" · ");
        return `<div class="ct-row"><span>${escapeHtml(market)}<small>${escapeHtml(faixaInfo)} · média prevista ${avg}% · ${diff>0?"+":""}${diff} pp</small></span><span>${items.length}</span><span>${rate}%</span><span>${items.length>=5?"🟢 Calibrável":"⚪ A recolher dados"}</span></div>`;
      }).join("")}</div>` : ""}

      <h4 class="calibration-subtitle">📈 Precisão por faixa de Score</h4>
      <div class="calibration-table"><div class="ct-head"><span>Faixa</span><span>Amostra</span><span>Real / previsto</span><span>Estado</span></div>${bucketRows.map(r=>`
        <div class="ct-row"><span><b>${r.bucket}</b></span><span>${r.n}</span><span>${r.rate==null?"—":`${r.rate}% / ${r.pred}% (${r.diff>0?"+":""}${r.diff} pp)`}</span><span>${r.n>=5?"🟢 Amostra útil":`⚪ ${r.n}/5`}</span></div>`).join("")}</div>
      <div class="calibration-help"><b>Como ler:</b> <span>valores negativos indicam sobreconfiança; positivos indicam que o modelo estava conservador. O ajuste do Score é deliberadamente pequeno e progressivo para evitar que uma amostra curta distorça o ranking.</span></div>
    </div>`;
}

function jsQuote(s) { return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " "); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function mudarEstadoAposta(id, state) {
  apostas = apostas.map(a => { if (a.id === id) a.estado = state; return a; });
  localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}
function eliminarAposta(id) {
  apostas = apostas.filter(a => a.id !== id); localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}
function filtrarPorCasa(c) {
  fltCasa = c;
  document.querySelectorAll(".house-filters .btn-filter").forEach(b => b.classList.remove("active"));
  document.getElementById(`filter-${c.toLowerCase()}`).classList.add("active");
  atualizarPainel();
}
function abrirDetalhesAposta(id) {
  idEdicao = id; const a = apostas.find(x => x.id === id); if (!a) return;
  document.getElementById("modal-titulo").innerText = `🔎 Ajustar Boletim - ${a.casa}`;
  document.getElementById("modal-banca-valor").value = a.valor;
  const c = document.getElementById("modal-jogos-list"); c.innerHTML = "";
  a.jogos.forEach(j => {
    const d = document.createElement("div"); d.className = "multi-game-row"; d.style.margin = "10px 0";
    d.innerHTML = `<input type="text" class="modal-input-nome" value="${escapeHtml(j.nome)}" required><input type="number" class="modal-input-odd" step="0.01" value="${j.odd}" style="width:75px;" oninput="recalcularOddModal()" required>`;
    c.appendChild(d);
  });
  recalcularOddModal(); document.getElementById("detalhes-modal").style.display = "flex";
}
function recalcularOddModal() {
  let t = 1, v = parseFloat(document.getElementById("modal-banca-valor").value) || 0;
  document.querySelectorAll(".modal-input-odd").forEach(i => { t *= (parseFloat(i.value) || 1); });
  document.getElementById("modal-total-odd").innerText = t.toFixed(2);
  document.getElementById("modal-total-retorno").innerText = `${(v * t).toFixed(2)} €`;
}
function guardarEdicaoModal() {
  let sub = [], t = 1;
  document.querySelectorAll(".modal-input-nome").forEach((inp, idx) => {
    let o = parseFloat(document.querySelectorAll(".modal-input-odd")[idx].value) || 1; t *= o;
    sub.push({ nome: inp.value, odd: o });
  });
  apostas = apostas.map(a => {
    if (a.id === idEdicao) { a.valor = parseFloat(document.getElementById("modal-banca-valor").value) || 0; a.jogos = sub; a.odd = t; }
    return a;
  });
  localStorage.setItem('banca_data', JSON.stringify(apostas)); fecharModal(); atualizarPainel();
}
function fecharModal() { document.getElementById("detalhes-modal").style.display = "none"; }

function atualizarPainel() {
  const tbody = document.getElementById("table-body"); tbody.innerHTML = "";
  let tInv = 0, lLiq = 0, pends = 0;
  apostas.forEach(a => {
    if (fltCasa !== "todas" && a.casa !== fltCasa) return;
    tInv += a.valor;
    const rb = a.valor * a.odd;
    if (a.estado === 'ganha') lLiq += (rb - a.valor);
    else if (a.estado === 'perdida') lLiq -= a.valor;
    else pends++;
    const resumo = a.jogos && a.jogos.length > 1 ? `Múltipla (${a.jogos.length} Jogos)` : (a.jogos && a.jogos.length === 1 ? a.jogos[0].nome : "Aposta");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>${escapeHtml(a.casa)}</b><br><small>${escapeHtml(a.tipo)}</small></td>
      <td><div style="max-width:260px;font-weight:bold;">${escapeHtml(resumo)}</div></td>
      <td>${a.valor.toFixed(2)}€</td><td>${a.odd.toFixed(2)}</td><td>${rb.toFixed(2)}€</td>
      <td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)">
        <option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option>
        <option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option>
        <option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option>
      </select></td>
      <td><button class="btn-view" onclick="abrirDetalhesAposta(${a.id})">👁️</button><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("stat-investido").innerText = `${tInv.toFixed(2)} €`;
  const cl = document.getElementById("stat-lucro"); cl.innerText = `${lLiq >= 0 ? '+' : ''}${lLiq.toFixed(2)} €`;
  cl.style.color = lLiq >= 0 ? "var(--success)" : "var(--danger)";
  document.getElementById("stat-pendentes").innerText = `${pends} Ativa(s)`;
  const pct = Math.max(0, Math.min(100, (lLiq / 500) * 100));
  document.getElementById("chart-fill").style.width = `${pct}%`;
  document.getElementById("chart-text").innerText = `${pct.toFixed(0)}% (${lLiq.toFixed(2)}€ / 500€)`;
}
function importarParaFormulario(ev, o) {
  mudarSeparador('gestor');
  if (document.getElementById("form-tipo").value === 'simples') {
    document.querySelector(".input-evento").value = ev;
    document.querySelector(".input-odd").value = o;
  } else {
    const rows = document.querySelectorAll(".multi-game-row"); let p = false;
    for (let i = 0; i < rows.length; i++) {
      const eInp = rows[i].querySelector(".input-evento"), oInp = rows[i].querySelector(".input-odd");
      if (!eInp.value) { eInp.value = ev; oInp.value = o; p = true; break; }
    }
    if (!p) {
      adicionarLinhaJogoForm();
      const r = document.querySelectorAll(".multi-game-row");
      r[r.length - 1].querySelector(".input-evento").value = ev;
      r[r.length - 1].querySelector(".input-odd").value = o;
    }
  }
  calcularOddTotalMultipla();
  document.getElementById("form-valor").focus();
}
function sair() {
  document.getElementById("password").value = "";
  document.getElementById("login-box").style.display = "block";
  document.getElementById("private-dashboard").style.display = "none";
  document.body.style.alignItems = "center";
}
