function mudarEstadoAposta(id, novoEstado) {
    apostas = apostas.map(a => { if (a.id === id) a.estado = novoEstado; return a; });
    localStorage.setItem('minhas_apostas_multibanca', JSON.stringify(apostas));
    atualizarPainel();
}

function eliminarAposta(id) {
    apostas = apostas.filter(a => a.id !== id);
    localStorage.setItem('minhas_apostas_multibanca', JSON.stringify(apostas));
    atualizarPainel();
}

function filtrarPorCasa(casa) {
    casaFiltroAtual = casa;
    document.querySelectorAll(".house-filters .btn-filter").forEach(b => b.classList.remove("active"));
    if (casa === 'todas') document.getElementById("filter-todas").classList.add("active");
    else document.getElementById(`filter-${casa.toLowerCase()}`).classList.add("active");
    atualizarPainel();
}

function atualizarPainel() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    let totalInv = 0, lucroLiq = 0, pends = 0;

    apostas.forEach(a => {
        if (casaFiltroAtual !== "todas" && a.casa !== casaFiltroAtual) return;
        totalInv += a.valor;
        let retBruto = a.valor * a.odd;
        if (a.estado === 'ganha') lucroLiq += (retBruto - a.valor);
        else if (a.estado === 'perdida') lucroLiq -= a.valor;
        else pends++;

        const tr = document.createElement("tr");
        tr.innerHTML = `<td><b>${a.casa}</b><br><small style="color:#666;">${a.tipo}</small></td><td><div style="max-width:300px;word-wrap:break-word;">${a.evento}</div></td><td>${a.valor.toFixed(2)} €</td><td>${a.odd.toFixed(2)}</td><td>${retBruto.toFixed(2)} €</td><td><select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)"><option value="pendente" ${a.estado==='pendente'?'selected':''}>Pendente</option><option value="ganha" ${a.estado==='ganha'?'selected':''}>Ganha</option><option value="perdida" ${a.estado==='perdida'?'selected':''}>Perdida</option></select></td><td><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>`;
        tbody.appendChild(tr);
    });

    document.getElementById("stat-investido").innerText = `${totalInv.toFixed(2)} €`;
    const cLucro = document.getElementById("stat-lucro");
    cLucro.innerText = `${lucroLiq >= 0 ? '+' : ''}${lucroLiq.toFixed(2)} €`;
    cLucro.style.color = lucroLiq >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById("stat-pendentes").innerText = `${pends} Ativa(s)`;

    const meta = 500;
    let pct = (lucroLiq / meta) * 100;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
    document.getElementById("chart-fill").style.width = `${pct}%`;
    document.getElementById("chart-text").innerText = `${pct.toFixed(0)}% (${lucroLiq.toFixed(2)}€ / ${meta}€)`;
}

function importarParaFormulario(evento, odd) {
    mudarSeparador('gestor');
    const tipo = document.getElementById("form-tipo").value;
    if (tipo === 'simples') {
        document.querySelector(".input-evento").value = evento;
        document.querySelector(".input-odd").value = odd;
    } else {
        const rows = document.querySelectorAll(".multi-game-row");
        let preenchido = false;
        for (let i = 0; i < rows.length; i++) {
            const evInp = rows[i].querySelector(".input-evento");
            const oddInp = rows[i].querySelector(".input-odd");
            if (!evInp.value) { evInp.value = evento; oddInp.value = odd; preenchido = true; break; }
        }
        if (!preenchido) {
            adicionarLinhaJogoForm();
            const novos = document.querySelectorAll(".multi-game-row");
            const ult = novos[novos.length - 1];
            ult.querySelector(".input-evento").value = evento;
            ult.querySelector(".input-odd").value = odd;
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
