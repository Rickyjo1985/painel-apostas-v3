const PSW = "SenhaSegura123";
let apostas = JSON.parse(localStorage.getItem('banca_data')) || [];
let fltCasa = "todas";

const baseJogos = [
    { id: 1, categoria: 'hoje', data: 'Sábado, 29 Ago', liga: 'Liga Portugal', equipas: 'Ac. Viseu vs FC Porto', dica: 'Vitória do FC Porto', odd: 1.45, top6: true },
    { id: 2, categoria: 'hoje', data: 'Sábado, 29 Ago', liga: 'Premier League', equipas: 'Liverpool vs Nottingham Forest', dica: 'Mais de 2.5 Golos', odd: 1.55, top6: true },
    { id: 3, categoria: 'hoje', data: 'Sábado, 29 Ago', liga: 'Liga Portugal', equipas: 'Alverca vs Santa Clara', dica: 'Ambas Marcam: Não', odd: 1.72, top6: false },
    { id: 4, categoria: 'amanha', data: 'Domingo, 30 Ago', liga: 'La Liga', equipas: 'Real Madrid vs Málaga', dica: 'Real Madrid Handicap -1', odd: 1.60, top6: true },
    { id: 5, categoria: 'amanha', data: 'Domingo, 30 Ago', liga: 'Premier League', equipas: 'Man. United vs Ipswich', dica: 'Vitória do Man. United', odd: 1.38, top6: true },
    { id: 6, categoria: 'fds', data: 'Domingo, 30 Ago', liga: 'Serie A', equipas: 'Juventus vs Parma', dica: 'Menos de 3.5 Golos', odd: 1.40, top6: false },
    { id: 7, categoria: 'top6', data: 'Sexta-Feira, 28 Ago', liga: 'Bundesliga', equipas: 'Bayern vs Stuttgart', dica: 'Ambas Marcam: Sim', odd: 1.50, top6: true },
    { id: 8, categoria: 'top6', data: 'Sexta-Feira, 28 Ago', liga: 'Premier League', equipas: 'Crystal Palace vs Man. City', dica: 'Vitória do Man. City', odd: 1.42, top6: true }
];

function verificarSenha() {
    const input = document.getElementById("password").value;
    if (input === PSW) {
        document.getElementById("login-box").style.display = "none";
        document.getElementById("private-dashboard").style.display = "block";
        document.body.style.alignItems = "flex-start";
        atualizarPainel(); renderizarJogos('hoje');
    } else { document.getElementById("error-msg").innerText = "Palavra-passe incorreta."; }
}

function mudarSeparador(tab) {
    document.querySelectorAll(".main-nav .nav-link").forEach(b => b.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
    document.getElementById("view-gestor").style.display = tab === 'gestor' ? "block" : "none";
    document.getElementById("view-jogos").style.display = tab === 'jogos' ? "block" : "none";
}

function alternarTipoAposta(tipo) {
    const c = document.getElementById("jogos-formulario-container");
    const btn = document.getElementById("btn-add-jogo");
    btn.style.display = tipo === 'simples' ? "none" : "block";
    c.innerHTML = tipo === 'simples' ? 
        `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo / Mercado" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div>` :
        `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 1" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div><div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 2" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div>`;
    document.getElementById("form-odd-total").value = "";
}

function adicionarLinhaJogoForm() {
    const c = document.getElementById("jogos-formulario-container");
    const d = document.createElement("div"); d.className = "multi-game-row";
    d.innerHTML = `<input type="text" class="input-evento" placeholder="Jogo ${c.children.length + 1}" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required>`;
    c.appendChild(d);
}

function calcularOddTotalMultipla() {
    let t = 1, tem = false;
    document.querySelectorAll(".input-odd").forEach(i => { const v = parseFloat(i.value); if (!isNaN(v) && v > 0) { t *= v; tem = true; } });
    document.getElementById("form-odd-total").value = tem ? t.toFixed(2) : "";
}

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
        tr.innerHTML = `<td><b>${a.casa}</b><br><small>${a.tipo}</small></td><td><div style="max-width:300px;word-wrap:break-word;">${a.evento}</div></td><td>${a.valor.toFixed(2)}€</td><td>${a.odd.toFixed(2)}</td><td>${rb.toFixed(2)}€</td><td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)"><option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option><option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option><option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option></select></td><td><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>`;
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
