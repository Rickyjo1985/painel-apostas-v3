const PSW = "SenhaSegura123";
let apostas = JSON.parse(localStorage.getItem('banca_data')) || [];
let fltCasa = "todas", idEdicao = null, baseJogos = [];

function verificarSenha() {
    if (document.getElementById("password").value === PSW) {
        document.getElementById("login-box").style.display = "none";
        document.getElementById("private-dashboard").style.display = "block";
        document.body.style.alignItems = "flex-start";
        atualizarPainel(); carregarJogosAutomaticos();
    } else { document.getElementById("error-msg").innerText = "Senha Incorreta."; }
}

function mudarSeparador(tab) {
    document.querySelectorAll(".main-nav .nav-link").forEach(b => b.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
    document.getElementById("view-gestor").style.display = tab === 'gestor' ? "block" : "none";
    document.getElementById("view-jogos").style.display = tab === 'jogos' ? "block" : "none";
}

function alternarTipoAposta(t) {
    const c = document.getElementById("jogos-formulario-container");
    document.getElementById("btn-add-jogo").style.display = t === 'simples' ? "none" : "block";
    c.innerHTML = t === 'simples' ? 
        `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo / Mercado" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div>` :
        `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 1" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div><div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 2" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width:80px;" oninput="calcularOddTotalMultipla()" required></div>`;
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
    e.preventDefault(); let sub = [];
    document.querySelectorAll(".input-evento").forEach((inp, idx) => {
        sub.push({ nome: inp.value, odd: parseFloat(document.querySelectorAll(".input-odd")[idx].value) || 1 });
    });
    apostas.push({
        id: Date.now(), casa: document.getElementById("form-casa").value, tipo: document.getElementById("form-tipo").value,
        jogos: sub, valor: parseFloat(document.getElementById("form-valor").value),
        odd: parseFloat(document.getElementById("form-odd-total").value) || 1, estado: document.getElementById("form-estado").value
    });
    localStorage.setItem('banca_data', JSON.stringify(apostas));
    document.getElementById("bet-form").reset(); alternarTipoAposta('simples'); atualizarPainel();
}
