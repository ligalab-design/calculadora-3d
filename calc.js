// Lógica de cálculo da calculadora de impressão 3D — sem dependência de tela.

/** Converte texto ("1,5", "2.3", " 10 ") em número não negativo; inválido vira 0. */
export function num(v) {
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Arredonda um preço para cima, para um valor comercial.
 * modo "90": termina em ,90 · "inteiro": real cheio · qualquer outro: não arredonda.
 */
export function arredondar(valor, modo) {
  if (!(valor > 0)) return 0;
  const c = Math.round(valor * 100); // em centavos, para não errar por ponto flutuante
  if (modo === "90") return (Math.ceil((c - 90) / 100) * 100 + 90) / 100;
  if (modo === "inteiro") return Math.ceil(c / 100);
  return valor;
}

/**
 * Calcula custos e preço de venda.
 * Entradas (texto ou número): fils[{g, kg}], h, m, qtd, falha (%), extra (R$),
 * mo (min), vh (R$/h), lucro (%), taxa (%), w (W), kwh (R$/kWh),
 * pimp (R$), vida (h), manut (R$/h), precoFinal (R$, opcional — preço definido à mão),
 * arred ("90" | "inteiro", opcional — arredondamento do preço sugerido).
 */
export function calcular(s) {
  const fils = Array.isArray(s.fils) ? s.fils : [];
  const horas = num(s.h) + num(s.m) / 60;
  const qtd = Math.max(1, Math.round(num(s.qtd)) || 1);

  const peso = fils.reduce((t, f) => t + num(f.g), 0);
  const cFil = fils.reduce((t, f) => t + (num(f.g) / 1000) * num(f.kg), 0);

  const kwh = (num(s.w) / 1000) * horas;
  const cEn = kwh * num(s.kwh);

  const maqH = (num(s.vida) ? num(s.pimp) / num(s.vida) : 0) + num(s.manut);
  const cMaq = maqH * horas;

  // Falha incide sobre o que se perde numa impressão ruim: filamento, energia e máquina.
  const cFalha = ((cFil + cEn + cMaq) * num(s.falha)) / 100;
  const cMo = (num(s.mo) / 60) * num(s.vh);
  const cExtra = num(s.extra);

  const total = cFil + cEn + cMaq + cFalha + cMo + cExtra;
  const un = total / qtd;

  // A taxa é cobrada sobre o preço final, então o preço é "inflado" para cobri-la.
  const taxa = Math.min(num(s.taxa), 95) / 100;
  const precoBruto = (un * (1 + num(s.lucro) / 100)) / (1 - taxa);
  const preco = arredondar(precoBruto, s.arred);
  const lucro = preco * (1 - taxa) - un;

  // Preço final: o sugerido, ou o que a pessoa digitou. Lucro e margem reais saem dele.
  const pf = num(s.precoFinal);
  const precoFinal = pf > 0 ? pf : preco;
  const lucroFinal = precoFinal * (1 - taxa) - un;
  const margemFinal = un > 0 ? (lucroFinal / un) * 100 : 0;

  return { horas, qtd, peso, cFil, kwh, cEn, maqH, cMaq, cFalha, cMo, cExtra, total, un, taxa, precoBruto, preco, lucro, precoFinal, lucroFinal, margemFinal };
}

/**
 * Preço por peça num lote de `n` peças.
 * Filamento, energia, máquina, falhas e extras crescem com a quantidade;
 * a mão de obra (preparo) é considerada a mesma para o lote inteiro e se dilui.
 */
export function precoLote(s, n) {
  const r = calcular(s);
  const N = Math.max(1, Math.round(num(n)) || 1);
  const un = (r.total - r.cMo) / r.qtd + r.cMo / N;
  // Em centavos inteiros, para o total bater com o valor por peça mostrado.
  const preco = Math.round(arredondar((un * (1 + num(s.lucro) / 100)) / (1 - r.taxa), s.arred) * 100) / 100;
  return { n: N, un, preco, total: preco * N };
}

/** Tabela de preços por quantidade, com o desconto em % sobre a primeira linha. */
export function tabelaQuantidade(s, qtds = [1, 5, 10, 50]) {
  const linhas = qtds.map((n) => precoLote(s, n));
  const base = linhas.length ? linhas[0].preco : 0;
  return linhas.map((l) => ({ ...l, desconto: base > 0 ? (1 - l.preco / base) * 100 : 0 }));
}
