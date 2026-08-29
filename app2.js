function adicionarAposta(e) {
    e.preventDefault();
    let lista = [];
    document.querySelectorAll(".input-evento").forEach((inp, idx) => {
        const o = parseFloat(document.querySelectorAll(".input-odd")[idx].value) || 1;
        lista.push(`${inp.value} (${o.toFixed(2)})`);
    });
    apostas.push({
        id: Date.now(), casa: document.getElementById("form-casa").value, tipo: document.getElementById("form-tipo").value,
        evento: lista.join(" + "), valor: parseFloat(document.getElementById("form-valor").value),
        odd: parseFloat(document.getElementById("form-odd-total").value), estado: document.getElementById("form-estado").value
    });
    localStorage.setItem('banca_data', JSON.stringify(apostas));
    document.getElementById("bet-form").reset(); alternarTipoAposta('simples'); atualizarPainel();
}

function mudarEstadoAposta(id, state) {
    apostas = apostas.map(a => { if (a.id === id) a.estado = state; return a; });
    localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function editarTextoEvento(id, novoTexto) {
    apostas = apostas.map(a => { if (a.id === id) a.evento = novoTexto; return a; });
    localStorage.setItem('banca_data', JSON.stringify(apostas));
}

function eliminarAposta(id) {
    apostas = apostas.filter(a => a.id !== id);
    localStorage.setItem('banca_data', JSON.stringify(apostas)); atualizarPainel();
}

function filtrarPorCasa(c) {
    fltCasa = c; document.querySelectorAll(".house-filters .btn-filter").forEach(b => b.classList.remove("active"));
    document.getElementById(`filter-${c.toLowerCase()}`).classList.add("active"); atualizarPainel();
}

function atualizarPainel() {
    const tbody = document.getElementById("table-body"); tbody.innerHTML = "";
    let tInv = 0, lLiq = 0, pends = 0;
    apostas.forEach(a => {
        if (fltCasa !== "todas" && a.casa !== fltCasa) return;
        tInv += a.valor; let rb = a.valor * a.odd;
        if (a.estado === 'ganha') lLiq += (rb - a.valor); else if (a.estado === 'perdida') lLiq -= a.valor; else pends++;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><b>${a.casa}</b><br><small>${a.tipo}</small></td>
            <td>
                <input type="text" value="${a.evento}" 
                    onchange="editarTextoEvento(${a.id}, this.value)" 
                    style="margin:0; padding:4px; font-weight:bold; background:transparent; border:1px solid transparent; width:100%; max-width:300px;" 
                    onfocus="this.style.background='#fff'; this.style.borderColor='#ccc'" 
                    onblur="this.style.background='transparent'; this.style.borderColor='transparent'">
            </td>
            <td>${a.valor.toFixed(2)}€</td><td>${a.odd.toFixed(2)}</td><td>${rb.toFixed(2)}€</td>
            <td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)"><option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option><option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option><option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option></select></td>
            <td><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>
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
