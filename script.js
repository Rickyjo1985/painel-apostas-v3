const PALAVRA_PASSE_CORRETA = "SenhaSegura123";
let apostas = JSON.parse(localStorage.getItem('minhas_apostas_multibanca')) || [];
let casaFiltroAtual = "todas";

function verificarSenha() {
    const input = document.getElementById("password").value;
    const erro = document.getElementById("error-msg");
    
    if (input === PALAVRA_PASSE_CORRETA) {
        document.getElementById("login-box").style.display = "none";
        document.getElementById("private-dashboard").style.display = "block";
        document.body.style.alignItems = "flex-start";
        atualizarPainel();
    } else {
        erro.innerText = "Palavra-passe incorreta.";
    }
}

function adicionarAposta(event) {
    event.preventDefault();
    const novaAposta = {
        id: Date.now(),
        casa: document.getElementById("form-casa").value,
        evento: document.getElementById("form-evento").value,
        valor: parseFloat(document.getElementById("form-valor").value),
        odd: parseFloat(document.getElementById("form-odd").value),
        estado: document.getElementById("form-estado").value
    };
    apostas.push(novaAposta);
    localStorage.setItem('minhas_apostas_multibanca', JSON.stringify(apostas));
    document.getElementById("bet-form").reset();
    atualizarPainel();
}

function mudarEstadoAposta(id, novoEstado) {
    apostas = apostas.map(a => {
        if (a.id === id) a.estado = novoEstado;
        return a;
    });
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
    else if (casa === 'Betclic') document.getElementById("filter-betclic").classList.add("active");
    else if (casa === 'Betano') document.getElementById("filter-betano").classList.add("active");
    else if (casa === 'Placard') document.getElementById("filter-placard").classList.add("active");

    atualizarPainel();
}

function atualizarPainel() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    let totalInvestido = 0, lucroLiquido = 0, pendentes = 0;

    apostas.forEach(a => {
        if (casaFiltroAtual !== "todas" && a.casa !== casaFiltroAtual) return;

        totalInvestido += a.valor;
        let retornoBruto = a.valor * a.odd;
        
        if (a.estado === 'ganha') lucroLiquido += (retornoBruto - a.valor);
        else if (a.estado === 'perdida') lucroLiquido -= a.valor;
        else pendentes++;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span style="font-weight:bold; color:var(--primary);">${a.casa}</span></td>
            <td><strong>${a.evento}</strong></td>
            <td>${a.valor.toFixed(2)} €</td>
            <td>${a.odd.toFixed(2)}</td>
            <td>${retornoBruto.toFixed(2)} €</td>
            <td>
                <select class="table-select" onchange="mudarEstadoAposta(${a.id}, this.value)">
                    <option value="pendente" ${a.estado === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="ganha" ${a.estado === 'ganha' ? 'selected' : ''}>Ganha</option>
                    <option value="perdida" ${a.estado === 'perdida' ? 'selected' : ''}>Perdida</option>
                </select>
            </td>
            <td><button class="btn-delete" onclick="eliminarAposta(${a.id})">×</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("stat-investido").innerText = `${totalInvestido.toFixed(2)} €`;
    const cardLucro = document.getElementById("stat-lucro");
    cardLucro.innerText = `${lucroLiquido >= 0 ? '+' : ''}${lucroLiquido.toFixed(2)} €`;
    cardLucro.style.color = lucroLiquido >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById("stat-pendentes").innerText = `${pendentes} Ativa(s)`;

    const meta = 500;
    let percentagem = (lucroLiquido / meta) * 100;
    if (percentagem < 0) percentagem = 0;
    if (percentagem > 100) percentagem = 100;
    
    const chartFill = document.getElementById("chart-fill");
    chartFill.style.width = `${percentagem}%`;
    chartFill.style.backgroundColor = lucroLiquido >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById("chart-text").innerText = `${percentagem.toFixed(0)}% (${lucroLiquido.toFixed(2)} € / ${meta} €)`;
}

function sair() {
    document.getElementById("password").value = "";
    document.getElementById("login-box").style.display = "block";
    document.getElementById("private-dashboard").style.display = "none";
    document.body.style.alignItems = "center";
}
