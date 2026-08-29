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
