const PSW = "Rickyjo1985";
let apostas = JSON.parse(localStorage.getItem('banca_data')) || [];
let fltCasa = "todas", idEdicao = null, baseJogos = [];

const MIN_SCORE = 50;
const TOP_LIMIT = 5;
function clamp(n, a=0, b=100) { return Math.max(a, Math.min(b, Number(n) || 0)); }
const HIST_KEY = "painel_v14_historico";
let historicoSugestoes = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");

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
    baseJogos = calibrarJogos(data.games || []);
    document.getElementById("games-date").innerText = `${data.dateLabel || "Hoje"} · ${data.analyzed || 0} jogos analisados · ${data.selected ?? (data.games || []).length} oportunidades`;
    status.className = "games-status success";
    status.innerText = baseJogos.length
      ? `Foram seleccionadas ${baseJogos.length} das melhores oportunidades do dia. A confiança é uma estimativa estatística, não uma garantia.`
      : ((data.analyzed || 0) > 0 ? "Os jogos foram analisados e ordenados pelo Score. O modelo mostra os melhores disponíveis, mesmo quando os dados são moderados." : "Não foram encontrados jogos pré-jogo nas competições disponíveis.");
    renderizarJogos();
  } catch (err) {
    console.error(err);
    baseJogos = [];
    status.className = "games-status error-box";
    status.innerHTML = `⚠️ ${escapeHtml(err.message)}<br><small>Se ainda não configuraste a API, adiciona <b>APIFOOTBALL_KEY</b> nas Environment Variables da Vercel e faz novo deploy.</small>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function nivelScore(score) {
  if (score >= 85) return { cls:"excellent", label:"FORTE", icon:"🟢" };
  if (score >= 75) return { cls:"very-good", label:"BOA", icon:"🟡" };
  return { cls:"interesting", label:"MODERADA", icon:"🟠" };
}

function historicoMercado(market) {
  const rows = historicoSugestoes.filter(x => x.market === market && x.resultado !== "pendente");
  const wins = rows.filter(x => x.resultado === "ganha").length;
  return { n: rows.length, wins, rate: rows.length ? wins / rows.length * 100 : null };
}

function calibrarConfianca(raw, market) {
  const h = historicoMercado(market);
  // Sem amostra suficiente, não alteramos a previsão.
  if (h.n < 5) return { confidence: Math.round(raw), sample:h.n, rate:h.rate };
  // Shrinkage: a amostra histórica influencia, mas nunca domina o modelo.
  const empirical = 50 + (h.rate - 50) * Math.min(1, h.n / 20);
  return {
    confidence: Math.round(clamp(.75 * raw + .25 * empirical)),
    sample:h.n,
    rate:h.rate
  };
}

function calibrarJogos(games) {
  return (games || []).map(j => {
    const c = calibrarConfianca(j.suggestion.confidence, j.suggestion.market);
    const calibratedScore = Math.round(clamp(.78 * j.score + .22 * c.confidence));
    return {
      ...j,
      rawScore:j.score,
      rawConfidence:j.suggestion.confidence,
      score:calibratedScore,
      suggestion:{...j.suggestion, confidence:c.confidence, calibrationSample:c.sample, calibrationRate:c.rate}
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
    market:j.suggestion.market, label:j.suggestion.label,
    confidence:j.suggestion.confidence, score:j.score,
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

function removerHistorico(id) {
  historicoSugestoes = historicoSugestoes.filter(x => String(x.id) !== String(id));
  localStorage.setItem(HIST_KEY, JSON.stringify(historicoSugestoes));
  renderizarHistorico();
  renderizarCalibracao();
}

function mostrarSubAbaJogos(tab) {
  ["oportunidades","historico","estatisticas"].forEach(x => {
    const el=document.getElementById(`games-${x}`);
    if(el) el.style.display = tab===x ? "block" : "none";
    const b=document.getElementById(`history-tab-${x}`);
    if(b) b.classList.toggle("active", tab===x);
  });
  if(tab==="historico") renderizarHistorico();
  if(tab==="estatisticas") renderizarCalibracao();
}

function renderizarJogos() {
  const c = document.getElementById("games-container");
  c.innerHTML = "";
  if (!baseJogos.length) return;
  baseJogos.forEach((j, index) => {
    const n = nivelScore(j.score);
    const confidence = Math.round(Math.min(96, Math.max(0, j.suggestion.confidence)));
    const alternatives = (j.suggestions || []).filter(s => s.market !== j.suggestion.market).slice(0,2);
    const saved = historicoSugestoes.some(x => String(x.id) === String(j.id));
    const card = document.createElement("div");
    card.className = `game-card opportunity-card ${n.cls}`;
    const calibration = j.suggestion.calibrationSample >= 5
      ? `<span>📐 Calibrado com ${j.suggestion.calibrationSample} resultados (${Math.round(j.suggestion.calibrationRate)}% acerto)</span>`
      : `<span>📐 Calibração inicial${j.suggestion.calibrationSample ? ` · ${j.suggestion.calibrationSample}/5 resultados` : ""}</span>`;
    card.innerHTML = `
      <div>
        <div class="rank-line"><span class="rank-badge">#${index + 1}</span><span class="score-badge">Score ${j.score}/100</span><span class="level-badge">${n.icon} ${n.label}</span></div>
        <div class="game-meta"><span>⚽ ${escapeHtml(j.league)}</span><span>🕐 ${escapeHtml(j.time)}</span></div>
        <div class="game-title">${escapeHtml(j.home)} <span>vs</span> ${escapeHtml(j.away)}</div>
        <div class="confidence-line"><span>Confiança estimada</span><strong>${confidence}%</strong></div>
        <div class="confidence-bar"><span style="width:${Math.min(confidence,100)}%"></span></div>
        <div class="suggestion-box">
          <small>🎯 Sugestão principal</small>
          <div class="main-suggestion">${escapeHtml(j.suggestion.label)}</div>
          <div class="reason">${escapeHtml(j.suggestion.reason)}</div>
        </div>
        <div class="analysis-mini">
          <span>📈 Forma ${j.metrics?.form ?? "—"}</span>
          <span>⚽ +1.5 ${j.metrics?.goals ?? "—"}</span>
          <span>🤝 H2H ${j.metrics?.h2h ?? "—"}</span>
          <span>🤖 API ${j.metrics?.prediction ?? "—"}</span>
          <span>🏆 Tabela ${j.metrics?.table ?? "—"}</span>
        </div>
        <div class="evidence-detail">
          ${j.evidence?.homeGF != null || j.evidence?.awayGF != null ? `<span>⚽ Média golos: ${j.evidence.homeGF != null ? j.evidence.homeGF.toFixed(2) : "—"} / ${j.evidence.awayGF != null ? j.evidence.awayGF.toFixed(2) : "—"}</span>` : ""}
          ${j.evidence?.homeBTTS != null || j.evidence?.awayBTTS != null ? `<span>🎯 BTTS: ${j.evidence.homeBTTS != null ? Math.round(j.evidence.homeBTTS) : "—"}% / ${j.evidence.awayBTTS != null ? Math.round(j.evidence.awayBTTS) : "—"}%</span>` : ""}
        </div>
        <div class="calibration-note">${calibration}</div>
        ${alternatives.length ? `<div class="alternatives"><small>Outras leituras</small>${alternatives.map(s => `<div>• ${escapeHtml(s.label)} <b>${Math.round(s.confidence)}%</b></div>`).join("")}</div>` : ""}
      </div>
      <div class="card-footer">
        <span class="data-note">${j.dataQuality === "high" ? "✓ Dados fortes" : j.dataQuality === "medium" ? "✓ Dados razoáveis" : "⚠ Dados limitados"}</span>
        <div class="card-actions">
          <button class="btn-import" onclick="importarParaFormulario('${jsQuote(`${j.home} vs ${j.away} (${j.suggestion.label})`)}', 1)">⚡ Registar</button>
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
            <small>${escapeHtml(x.league)} · ${escapeHtml(x.label)} · Score ${x.score} · Confiança ${x.confidence}%</small>
          </div>
          <div class="history-actions">
            <button class="result-btn ${x.resultado==="ganha"?"selected":""}" onclick="atualizarResultado('${jsQuote(x.id)}','ganha')">✓ Ganha</button>
            <button class="result-btn ${x.resultado==="perdida"?"selected":""}" onclick="atualizarResultado('${jsQuote(x.id)}','perdida')">✕ Perdida</button>
            ${x.resultado==="pendente" ? `<span class="pending-badge">⏳ Pendente</span>` : ""}
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
  c.innerHTML=`
    <div class="calibration-panel">
      <h3>📊 Calibração do modelo</h3>
      <p>O ajuste só começa a influenciar o Score depois de <b>5 resultados avaliados</b> no mesmo mercado. Antes disso, o modelo mantém o valor original.</p>
      <div class="history-summary">
        <div><strong>${overall==null?"—":overall+"%"}</strong><small>Acerto global</small></div>
        <div><strong>${resolved.length}</strong><small>Resultados</small></div>
        <div><strong>${Object.keys(byMarket).length}</strong><small>Mercados avaliados</small></div>
      </div>
      ${rows.length ? `<div class="calibration-table"><div class="ct-head"><span>Mercado</span><span>Amostra</span><span>Acerto</span><span>Estado</span></div>${rows.map(([market,items])=>{
        const wins=items.filter(x=>x.resultado==="ganha").length, rate=Math.round(wins/items.length*100);
        return `<div class="ct-row"><span>${escapeHtml(items[0].label)}</span><span>${items.length}</span><span>${rate}%</span><span>${items.length>=5?"🟢 A calibrar":"⚪ A recolher dados"}</span></div>`;
      }).join("")}</div>` : `<div class="history-empty">Ainda não há resultados avaliados.</div>`}
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
