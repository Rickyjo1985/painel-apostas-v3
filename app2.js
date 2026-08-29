let idApostaEmEdicao = null;

function adicionarAposta(e) {
    e.preventDefault();
    let subJogos = [];
    document.querySelectorAll(".input-evento").forEach((inp, idx) => {
        const o = parseFloat(document.querySelectorAll(".input-odd")[idx].value) || 1;
        subJogos.push({ nome: inp.value, odd: o });
    });
    
    apostas.push({
        id: Date.now(),
        casa: document.getElementById("form-casa").value,
        tipo: document.getElementById("form-tipo").value,
        jogos: subJogos,
        valor: parseFloat(document.getElementById("form-valor").value),
        odd: parseFloat(document.getElementById("form-odd-total").value),
        estado: document.getElementById("form-estado").value
    });
    localStorage.setItem('banca_data', JSON.stringify(apostas));
    document.getElementById("bet-form").reset(); alternarTipoAposta('simples'); atualizarPainel();
}

function mudarEstadoAposta(id, state) {
    apostas = apostas.map(a => { if (a.id === id) a.estado = state; return a; });
    localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function eliminarAposta(id) {
    apostas = apostas.filter(a => a.id !== id);
    localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function filtrarPorCasa(c) {
    fltCasa = c; document.querySelectorAll(".house-filters .btn-filter").forEach(b => b.classList.remove("active"));
    document.getElementById(`filter-${c.toLowerCase()}`).classList.add("active"); atualizarPainel();
}

// Abre a janela modal com os campos editáveis de cada jogo individual do boletim
function abrirDetalhesAposta(id) {
    idApostaEmEdicao = id;
    const aposta = apostas.find(a => a.id === id);
    if (!aposta) return;

    document.getElementById("modal-titulo").innerText = `🔎 Ajustar Boletim - ${aposta.casa}`;
    document.getElementById("modal-banca-valor").value = aposta.valor;
    
    const container = document.getElementById("modal-jogos-list");
    container.innerHTML = "";

    aposta.jogos.forEach((jogo, index) => {
        const div = document.createElement("div");
        div.className = "multi-game-row";
        div.style.margin = "10px 0";
        div.innerHTML = `
            <input type="text" class="modal-input-nome" value="${jogo.nome}" style="margin:0;" required>
            <input type="number" class="modal-input-odd" step="0.01" value="${jogo.odd}" style="width:75px; margin:0;" oninput="recalcularOddModal()" required>
        `;
        container.appendChild(div);
    });

    recalcularOddModal();
    document.getElementById("detalhes-modal").style.display = "flex";
}

function recalcularOddModal() {
    const odds = document.querySelectorAll(".modal-input-odd");
    const valorBanca = parseFloat(document.getElementById("modal-banca-valor").value) || 0;
    let totalOdd = 1;
    odds.forEach(i => { const v = parseFloat(i.value) || 1; totalOdd *= v; });
    
    document.getElementById("modal-total-odd").innerText = totalOdd.toFixed(2);
    document.getElementById("modal-total-retorno").innerText = `${(valorBanca * totalOdd).toFixed(2)} €`;
}

function guardarEdicaoModal() {
    const nomes = document.querySelectorAll(".modal-input-nome");
    const odds = document.querySelectorAll(".modal-input-odd");
    let novosJogos = [];
    let novaOddTotal = 1;

    nomes.forEach((inp, idx) => {
        const oVal = parseFloat(odds[idx].value) || 1;
        novaOddTotal *= oVal;
        novosJogos.push({ nome: inp.value, odd: oVal });
    });

    apostas = apostas.map(a => {
        if (a.id === idApostaEmEdicao) {
            a.valor = parseFloat(document.getElementById("modal-banca-valor").value) || 0;
            a.jogos = novosJogos;
            a.odd = novaOddTotal;
        }
        return a;
    });

    localStorage.setItem('banca_data', JSON.stringify(apostas));
    fecharModal();
    atualizarPainel();
}

function fecharModal() { document.getElementById("detalhes-modal").style.display = "none"; }

function atualizarPainel() {
    const tbody = document.getElementById("table-body"); tbody.innerHTML = "";
    let tInv = 0, lLiq = 0, pends = 0;
    
    apostas.forEach(a => {
        if (fltCasa !== "todas" && a.casa !== fltCasa) return;
        tInv += a.valor; let rb = a.valor * a.odd;
        if (a.estado === 'ganha') lLiq += (rb - a.valor); else if (a.estado === 'perdida') lLiq -= a.valor; else pends++;
        
        const textoResumo = a.jogos.length === 1 ? a.jogos[0].nome : `Aposta Múltipla (${a.jogos.length} Jogos)`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><b>${a.casa}</b><br><small>${a.tipo}</small></td>
            <td><div style="max-width:260px; font-weight:bold; color:#2d3748;">${textoResumo}</div></td>
            <td>${a.valor.toFixed(2)}€</td>
            <td>${a.odd.toFixed(2)}</td>
            <td>${rb.toFixed(2)}€</td>
            <td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)"><option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option><option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option><option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option></select></td>
            <td style="white-space:nowrap;">
                <button class="btn-view" onclick="abrirDetalhesAposta(${a.id})">👁️ Detalhes</button>
                <button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button>
            </td>
        `;
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
