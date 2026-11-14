// Lógica de cálculo da calculadora de impressão 3D — sem dependência de tela.

/** Converte texto ("1,5", "2.3", " 10 ") em número não negativo; inválido vira 0. */
export function num(v) {
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Calcula custos e preço de venda.
 * Entradas (texto ou número): fils[{g, kg}], h, m, qtd, falha (%), extra (R$),
 * mo (min), vh (R$/h), lucro (%), taxa (%), w (W), kwh (R$/kWh),
 * pimp (R$), vida (h), manut (R$/h).
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
  const preco = (un * (1 + num(s.lucro) / 100)) / (1 - taxa);
  const lucro = preco * (1 - taxa) - un;

  return { horas, qtd, peso, cFil, kwh, cEn, maqH, cMaq, cFalha, cMo, cExtra, total, un, taxa, preco, lucro };
}
