const PSW = "Rickyjo1985";
let apostas = JSON.parse(localStorage.getItem('banca_data')) || [];
let fltCasa = "todas", idEdicao = null, baseJogos = [];

const MIN_SCORE = 65;
const TOP_LIMIT = 8;

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
    const response = await fetch(`/api/jogos${q}`, { cache: force ? "no-store" : "default" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível obter os jogos.");
    baseJogos = data.games || [];
    document.getElementById("games-date").innerText = `${data.dateLabel || "Hoje"} · ${data.analyzed || 0} jogos analisados`;
    status.className = "games-status success";
    status.innerText = baseJogos.length
      ? `Foram seleccionadas ${baseJogos.length} oportunidades com score ≥ ${MIN_SCORE}.`
      : "Não foram encontradas oportunidades suficientes para hoje. Isto é normal quando há poucos jogos ou poucos dados.";
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

function renderizarJogos() {
  const c = document.getElementById("games-container");
  c.innerHTML = "";
  if (!baseJogos.length) return;
  baseJogos.forEach((j, index) => {
    const level = j.score >= 85 ? "excellent" : j.score >= 75 ? "very-good" : "interesting";
    const confidence = Math.round(j.suggestion.confidence);
    const alternatives = (j.suggestions || []).filter(s => s.market !== j.suggestion.market).slice(0,2);
    const card = document.createElement("div");
    card.className = `game-card opportunity-card ${level}`;
    card.innerHTML = `
      <div>
        <div class="rank-line"><span class="rank-badge">#${index + 1}</span><span class="score-badge">Score ${j.score}/100</span></div>
        <div class="game-meta"><span>⚽ ${escapeHtml(j.league)}</span><span>🕐 ${escapeHtml(j.time)}</span></div>
        <div class="game-title">${escapeHtml(j.home)} <span>vs</span> ${escapeHtml(j.away)}</div>
        <div class="confidence-line"><span>Confiança estimada</span><strong>${confidence}%</strong></div>
        <div class="confidence-bar"><span style="width:${Math.min(confidence,100)}%"></span></div>
        <div class="suggestion-box">
          <small>🎯 Sugestão principal</small>
          <div class="main-suggestion">${escapeHtml(j.suggestion.label)}</div>
          <div class="reason">${escapeHtml(j.suggestion.reason)}</div>
        </div>
        ${alternatives.length ? `<div class="alternatives"><small>Outras leituras</small>${alternatives.map(s => `<div>• ${escapeHtml(s.label)} <b>${Math.round(s.confidence)}%</b></div>`).join("")}</div>` : ""}
      </div>
      <div class="card-footer">
        <span class="data-note">${j.dataQuality === "high" ? "✓ Dados fortes" : j.dataQuality === "medium" ? "✓ Dados suficientes" : "⚠ Dados limitados"}</span>
        <button class="btn-import" onclick="importarParaFormulario('${jsQuote(`${j.home} vs ${j.away} (${j.suggestion.label})`)}', 1)">⚡ Registar</button>
      </div>`;
    c.appendChild(card);
  });
}

function jsQuote(s) { return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " "); }
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
