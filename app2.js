async function carregarJogosAutomaticos() {
    const container = document.getElementById("games-container");
    container.innerHTML = "<p style='color:#666; padding:20px;'>🔄 A atualizar calendário da semana...</p>";
    try {
        const res = await fetch('https://allorigins.win' + encodeURIComponent('https://githubusercontent.com'));
        if (!res.ok) throw new Error();
        const proxy = await res.json(); const dados = JSON.parse(proxy.contents);
        baseJogos = []; const hoje = new Date(); const opcoes = { day: 'numeric', month: 'short' };
        
        if (dados.rounds && dados.rounds.length > 0) {
            let todas = [];
            dados.rounds.forEach(r => { if(r.matches) todas = todas.concat(r.matches); });
            todas.slice(0, 15).forEach((m, idx) => {
                let dataAlvo = new Date(); dataAlvo.setDate(hoje.getDate() + (idx % 3));
                let strData = dataAlvo.toLocaleDateString('pt-PT', opcoes);
                let cat = idx % 3 === 0 ? 'hoje' : (idx % 3 === 1 ? 'amanha' : 'fds');
                let oddF = (1.38 + ((idx % 5) * 0.14));
                baseJogos.push({
                    id: idx, categoria: cat, top6: idx < 6,
                    data: cat === 'hoje' ? `Hoje, ${strData}` : (cat === 'amanha' ? `Amanhã, ${strData}` : `Fim de Semana, ${strData}`),
                    liga: 'Campeonato Oficial', equipas: `${m.team1} vs ${m.team2}`,
                    dica: oddF < 1.60 ? 'Vitória Casa (1X)' : 'Mais de 1.5 Golos', odd: oddF
                });
            });
        }
        renderizarJogos('hoje');
    } catch (e) {
        const hj = new Date(); const strHj = hj.toLocaleDateString('pt-PT', {day:'numeric', month:'short'});
        baseJogos = [
            { id: 81, categoria: 'hoje', data: `Hoje, ${strHj}`, liga: 'Liga Portugal', equipas: 'Arouca vs FC Porto', dica: 'Mais de 1.5 Golos', odd: 1.30, top6: true },
            { id: 82, categoria: 'hoje', data: `Hoje, ${strHj}`, liga: 'Premier League', equipas: 'Manchester United vs Ipswich Town', dica: 'Vitória Man. United', odd: 1.38, top6: true }
        ];
        renderizarJogos('hoje');
    }
}

function mudarEstadoAposta(id, state) {
    apostas = apostas.map(a => { if (a.id === id) a.estado = state; return a; });
    localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function eliminarAposta(id) {
    apostas = apostas.filter(a => a.id !== id); localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function filtrarPorCasa(c) {
    fltCasa = c; document.querySelectorAll(".house-filters .btn-filter").forEach(b => b.classList.remove("active"));
    document.getElementById(`filter-${c.toLowerCase()}`).classList.add("active"); atualizarPainel();
}

function abrirDetalhesAposta(id) {
    idEdicao = id; const a = apostas.find(x => x.id === id); if (!a) return;
    document.getElementById("modal-titulo").innerText = `🔎 Ajustar Boletim - ${a.casa}`;
    document.getElementById("modal-banca-valor").value = a.valor;
    const c = document.getElementById("modal-jogos-list"); c.innerHTML = "";
    a.jogos.forEach(j => {
        const d = document.createElement("div"); d.className = "multi-game-row"; d.style.margin = "10px 0";
        d.innerHTML = `<input type="text" class="modal-input-nome" value="${j.nome}" required><input type="number" class="modal-input-odd" step="0.01" value="${j.odd}" style="width:75px;" oninput="recalcularOddModal()" required>`;
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
        tInv += a.valor; let rb = a.valor * a.odd;
        if (a.estado === 'ganha') lLiq += (rb - a.valor); else if (a.estado === 'perdida') lLiq -= a.valor; else pends++;
        const resumo = a.jogos && a.jogos.length > 1 ? `Múltipla (${a.jogos.length} Jogos)` : (a.jogos && a.jogos.length === 1 ? a.jogos.nome : "Aposta");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td><b>${a.casa}</b><br><small>${a.tipo}</small></td><td><div style="max-width:260px;font-weight:bold;">${resumo}</div></td><td>${a.valor.toFixed(2)}€</td><td>${a.odd.toFixed(2)}</td><td>${rb.toFixed(2)}€</td><td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)"><option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option><option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option><option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option></select></td><td><button class="btn-view" onclick="abrirDetalhesAposta(${a.id})">👁️</button><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>`;
        tbody.appendChild(tr);
    });
    document.getElementById("stat-investido").innerText = `${tInv.toFixed(2)} €`;
    const cl = document.getElementById("stat-lucro"); cl.innerText = `${lLiq >= 0 ? '+' : ''}${lLiq.toFixed(2)} €`;
    cl.style.color = lLiq >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById("stat-pendentes").innerText = `${pends} Ativa(s)`;
    let pct = Math.max(0, Math.min(100, (lLiq / 500) * 100));
    document.getElementById("chart-fill").style.width = `${pct}%`;
    document.getElementById("chart-text").innerText = `${pct.toFixed(0)}% (${lLiq.toFixed(2)}€ / 500€)`;
}

function filtrarJogos(cat) {
    document.querySelectorAll(".game-filters .btn-filter").forEach(b => b.classList.remove("active"));
    document.getElementById(`gfilter-${cat}`).classList.add("active"); renderizarJogos(cat);
}

function renderizarJogos(flt) {
    const c = document.getElementById("games-container"); c.innerHTML = "";
    baseJogos.forEach(j => {
        if (flt === 'top6' && !j.top6) return; if (flt !== 'top6' && j.categoria !== flt) return;
        const card = document.createElement("div"); card.className = `game-card ${j.top6 ? 'top6' : ''}`;
        card.innerHTML = `<div><div class="game-meta"><span>⚽ ${j.liga}</span><span>${j.data}</span></div><div class="game-title">${j.equipas}</div><div class="suggestion-box"><small>🎯 Sugestão:</small><div style="font-weight:bold;margin:2px 0;">${j.dica}</div><span>Odd: ${j.odd.toFixed(2)}</span></div></div><button class="btn-import" onclick="importarParaFormulario('${j.equipas} (${j.dica})', ${j.odd})">⚡ Importar</button>`;
        c.appendChild(card);
    });
}

function importarParaFormulario(ev, o) {
    mudarSeparador('gestor');
    if (document.getElementById("form-tipo").value === 'simples') {
        document.querySelector(".input-evento").value = ev; document.querySelector(".input-odd").value = o;
    } else {
        const rows = document.querySelectorAll(".multi-game-row"); let p = false;
        for (let i = 0; i < rows.length; i++) {
            const eInp = rows[i].querySelector(".input-evento"); const oInp = rows[i].querySelector(".input-odd");
            if (!eInp.value) { eInp.value = ev; oInp.value = o; p = true; break; }
        }
        if (!p) {
            adicionarLinhaJogoForm(); const r = document.querySelectorAll(".multi-game-row");
            r[r.length - 1].querySelector(".input-evento").value = ev; r[r.length - 1].querySelector(".input-odd").value = o;
        }
    }
    calcularOddTotalMultipla(); document.getElementById("form-valor").focus();
}

function sair() {
    document.getElementById("password").value = "";
    document.getElementById("login-box").style.display = "block";
    document.getElementById("private-dashboard").style.display = "none";
    document.body.style.alignItems = "center";
}
