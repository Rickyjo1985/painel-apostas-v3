function alternarTipoAposta(tipo) {
    const container = document.getElementById("jogos-formulario-container");
    const btnAdd = document.getElementById("btn-add-jogo");
    if (tipo === 'simples') {
        btnAdd.style.display = "none";
        container.innerHTML = `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo / Mercado" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div>`;
    } else {
        btnAdd.style.display = "block";
        container.innerHTML = `<div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 1" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div><div class="multi-game-row"><input type="text" class="input-evento" placeholder="Jogo 2" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required></div>`;
    }
    document.getElementById("form-odd-total").value = "";
}

function adicionarLinhaJogoForm() {
    const container = document.getElementById("jogos-formulario-container");
    const num = container.children.length + 1;
    const div = document.createElement("div");
    div.className = "multi-game-row";
    div.innerHTML = `<input type="text" class="input-evento" placeholder="Jogo ${num}" required><input type="number" class="input-odd" step="0.01" placeholder="Odd" style="width: 80px;" oninput="calcularOddTotalMultipla()" required>`;
    container.appendChild(div);
}

function calcularOddTotalMultipla() {
    const odds = document.querySelectorAll(".input-odd");
    let total = 1, tem = false;
    odds.forEach(i => { const val = parseFloat(i.value); if (!isNaN(val) && val > 0) { total *= val; tem = true; } });
    document.getElementById("form-odd-total").value = tem ? total.toFixed(2) : "";
}

function adicionarAposta(event) {
    event.preventDefault();
    const evs = document.querySelectorAll(".input-evento");
    const odds = document.querySelectorAll(".input-odd");
    let lista = [];
    evs.forEach((inp, idx) => { const oVal = parseFloat(odds[idx].value) || 1; lista.push(`${inp.value} (${oVal.toFixed(2)})`); });

    apostas.push({
        id: Date.now(),
        casa: document.getElementById("form-casa").value,
        tipo: document.getElementById("form-tipo").value,
        evento: lista.join(" + "),
        valor: parseFloat(document.getElementById("form-valor").value),
        odd: parseFloat(document.getElementById("form-odd-total").value),
        estado: document.getElementById("form-estado").value
    });
    localStorage.setItem('minhas_apostas_multibanca', JSON.stringify(apostas));
    document.getElementById("bet-form").reset();
    alternarTipoAposta('simples');
    atualizarPainel();
}
