const PALAVRA_PASSE_CORRETA = "Rickyjo1985";
let apostas = JSON.parse(localStorage.getItem('minhas_apostas_multibanca')) || [];
let casaFiltroAtual = "todas";

// Base de Dados de Jogos e Sugestões Analisadas (Agosto 2026)
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
    const erro = document.getElementById("error-msg");
    if (input === PALAVRA_PASSE_CORRETA) {
        document.getElementById("login-box").style.display = "none";
        document.getElementById("private-dashboard").style.display = "block";
        document.body.style.alignItems = "flex-start";
        atualizarPainel();
        renderizarJogos('hoje'); // Inicia mostrando os jogos de Hoje
    } else {
        erro.innerText = "Palavra-passe incorreta.";
    }
}

// Alternar Janela Principal (Abas)
function mudarSeparador(tab) {
    document.querySelectorAll(".main-nav .nav-link").forEach(b => b.classList.remove("active"));
    if (tab === 'gestor') {
        document.getElementById("tab-gestor").classList.add("active");
        document.getElementById("view-gestor").style.display = "block";
        document.getElementById("view-jogos").style.display = "none";
    } else {
        document.getElementById("tab-jogos").classList.add("active");
        document.getElementById("view-gestor").style.display = "none";
        document.getElementById("view-jogos").style.display = "block";
    }
}

// Filtros do Separador de Jogos
function filtrarJogos(categoria) {
    document.querySelectorAll(".game-filters .btn-filter").forEach(b => b.classList.remove("active"));
    document.getElementById(`gfilter-${categoria}`).classList.add("active");
    renderizarJogos(categoria);
}

// Constrói os Cartões Visuais de Sugestões
function renderizarJogos(filtro) {
    const container = document.getElementById("games-container");
    container.innerHTML = "";

    baseJogos.forEach(j => {
        if (filtro === 'top6' && !j.top6) return;
        if (filtro !== 'top6' && j.categoria !== filtro) return;

        const card = document.createElement("div");
        card.className = `game-card ${j.top6 ? 'top6' : ''}`;
        card.innerHTML = `
            <div>
                <div class="game-meta">
                    <span>⚽ ${j.liga}</span>
                    <span>${j.data}</span>
                </div>
                <div class="game-title">${j.equipas}</div>
                <div class="suggestion-box">
                    <small style="color:#666;">🎯 Sugestão:</small>
                    <div style="font-weight:bold; color:var(--dark); margin:2px 0;">${j.dica}</div>
                    <span style="background:var(--primary); color:white; padding:2px 6px; font-size:11px; border-radius:4px; font-weight:bold;">Odd: ${j.odd.toFixed(2)}</span>
                </div>
            </div>
            <button class="btn-import" onclick="importarParaFormulario('${j.equipas} - ${j.dica}', ${j.odd})">⚡ Importar Odd</button>
        `;
        container.appendChild(card);
    });
}

// Função Avançada: Cola a Dica automaticamente no Formulário de Registo e muda de aba
function importarParaFormulario(evento, odd) {
    mudarSeparador('gestor');
    document.getElementById("form-evento").value = evento;
    document.getElementById("form-odd").value = odd;
    document.getElementById("form-valor").focus();
}

// --- Funções Originais de Gestão Multibanca ---
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
    document.getElementById("chart-text").innerText = `${percentagem.toFixed(0)}% (${lucroLiquido.toFixed(2)}€ / ${meta}€)`;
}

function sair() {
    document.getElementById("password").value = "";
    document.getElementById("login-box").style.display = "block";
    document.getElementById("private-dashboard").style.display = "none";
    document.body.style.alignItems = "center";
}
