import { test } from "node:test";
import assert from "node:assert/strict";
import { num, calcular, arredondar, precoLote, tabelaQuantidade } from "../calc.js";

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} esperado ${b}, veio ${a}`);

const base = {
  fils: [{ g: "100", kg: "120" }],
  h: "2", m: "0", qtd: "1", falha: "0", extra: "0",
  mo: "0", vh: "0", lucro: "0", taxa: "0",
  w: "0", kwh: "0", pimp: "0", vida: "0", manut: "0",
};

test("num: aceita vírgula, ponto e espaços", () => {
  assert.equal(num("1,5"), 1.5);
  assert.equal(num("2.25"), 2.25);
  assert.equal(num(" 10 "), 10);
  assert.equal(num(7), 7);
});

test("num: vazio, texto e negativo viram 0", () => {
  assert.equal(num(""), 0);
  assert.equal(num("abc"), 0);
  assert.equal(num("-3"), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num(null), 0);
});

test("filamento: 100 g a R$ 120/kg custa R$ 12", () => {
  const r = calcular(base);
  perto(r.cFil, 12);
  perto(r.total, 12);
  perto(r.un, 12);
  perto(r.preco, 12);
  perto(r.lucro, 0);
});

test("filamento: soma vários materiais", () => {
  const r = calcular({ ...base, fils: [{ g: "100", kg: "120" }, { g: "50", kg: "200" }, { g: "", kg: "170" }] });
  perto(r.peso, 150);
  perto(r.cFil, 12 + 10);
});

test("tempo: horas e minutos se somam", () => {
  const r = calcular({ ...base, h: "1", m: "30" });
  perto(r.horas, 1.5);
});

test("energia: 150 W por 2 h a R$ 1/kWh = 0,3 kWh e R$ 0,30", () => {
  const r = calcular({ ...base, w: "150", kwh: "1" });
  perto(r.kwh, 0.3);
  perto(r.cEn, 0.3);
});

test("máquina: depreciação + manutenção por hora", () => {
  const r = calcular({ ...base, pimp: "6000", vida: "5000", manut: "0,50" });
  perto(r.maqH, 1.7);
  perto(r.cMaq, 3.4);
});

test("máquina: vida útil zero não divide por zero", () => {
  const r = calcular({ ...base, pimp: "6000", vida: "0", manut: "1" });
  perto(r.maqH, 1);
  assert.ok(Number.isFinite(r.total));
});

test("falha: incide sobre filamento, energia e máquina, não sobre mão de obra e extras", () => {
  const r = calcular({ ...base, w: "1000", kwh: "1", manut: "1", falha: "10", mo: "60", vh: "30", extra: "5" });
  // filamento 12 + energia 2 + máquina 2 = 16 → falha 1,60
  perto(r.cFalha, 1.6);
  perto(r.total, 16 + 1.6 + 30 + 5);
});

test("mão de obra: 30 min a R$ 40/h = R$ 20", () => {
  const r = calcular({ ...base, mo: "30", vh: "40" });
  perto(r.cMo, 20);
});

test("quantidade: divide o custo total pelas peças", () => {
  const r = calcular({ ...base, qtd: "4" });
  perto(r.total, 12);
  perto(r.un, 3);
});

test("quantidade: zero, vazio ou decimal viram pelo menos 1 peça inteira", () => {
  assert.equal(calcular({ ...base, qtd: "0" }).qtd, 1);
  assert.equal(calcular({ ...base, qtd: "" }).qtd, 1);
  assert.equal(calcular({ ...base, qtd: "2,6" }).qtd, 3);
});

test("margem: 50% sobre custo de R$ 12 = preço R$ 18, lucro R$ 6", () => {
  const r = calcular({ ...base, lucro: "50" });
  perto(r.preco, 18);
  perto(r.lucro, 6);
});

test("taxa de venda: preço cobre a taxa e preserva o lucro", () => {
  const r = calcular({ ...base, lucro: "50", taxa: "10" });
  perto(r.preco, 20);            // 18 / 0,9
  perto(r.preco * r.taxa, 2);    // taxa paga
  perto(r.lucro, 6);             // lucro continua 6
});

test("taxa de venda: limitada a 95% para o preço não explodir", () => {
  const r = calcular({ ...base, taxa: "100" });
  perto(r.taxa, 0.95);
  assert.ok(Number.isFinite(r.preco));
});

test("entradas vazias: tudo zero, sem NaN", () => {
  const r = calcular({});
  for (const [k, v] of Object.entries(r)) assert.ok(Number.isFinite(v), `${k} não é número`);
  perto(r.total, 0);
  perto(r.preco, 0);
  assert.equal(r.qtd, 1);
});

test("cenário completo: valores padrão do app", () => {
  const r = calcular({
    fils: [{ g: "80", kg: "120" }], h: "2", m: "30", qtd: "1", falha: "5", extra: "0",
    mo: "10", vh: "30", lucro: "50", taxa: "0",
    w: "150", kwh: "1,00", pimp: "10000", vida: "5000", manut: "0,50",
  });
  perto(r.cFil, 9.6);
  perto(r.cEn, 0.375);
  perto(r.cMaq, 6.25);
  perto(r.cFalha, 0.81125);
  perto(r.cMo, 5);
  perto(r.total, 22.03625);
  perto(r.preco, 33.054375);
});

test("preço final: sem valor digitado, é igual ao sugerido", () => {
  const r = calcular({ ...base, lucro: "50" });
  perto(r.precoFinal, 18);
  perto(r.lucroFinal, 6);
  perto(r.margemFinal, 50);
});

test("preço final: valor digitado substitui o sugerido e recalcula lucro e margem", () => {
  const r = calcular({ ...base, lucro: "50", precoFinal: "24" });
  perto(r.preco, 18);          // sugerido não muda
  perto(r.precoFinal, 24);
  perto(r.lucroFinal, 12);
  perto(r.margemFinal, 100);
});

test("preço final: desconta a taxa de venda do valor digitado", () => {
  const r = calcular({ ...base, taxa: "10", precoFinal: "20" });
  perto(r.lucroFinal, 6);      // 20 × 0,9 − 12
  perto(r.margemFinal, 50);
});

test("preço final: abaixo do custo dá prejuízo (lucro negativo)", () => {
  const r = calcular({ ...base, precoFinal: "9,00" });
  perto(r.lucroFinal, -3);
  perto(r.margemFinal, -25);
});

test("preço final: zero ou vazio volta ao sugerido", () => {
  perto(calcular({ ...base, lucro: "50", precoFinal: "0" }).precoFinal, 18);
  perto(calcular({ ...base, lucro: "50", precoFinal: "" }).precoFinal, 18);
});

// ---------- Arredondamento ----------

test("arredondar: sem modo devolve o mesmo valor", () => {
  assert.equal(arredondar(33.05), 33.05);
  assert.equal(arredondar(33.05, "nenhum"), 33.05);
});

test("arredondar ,90: sobe para o próximo valor terminado em ,90", () => {
  perto(arredondar(33.05, "90"), 33.9);
  perto(arredondar(33.9, "90"), 33.9);
  perto(arredondar(33.91, "90"), 34.9);
  perto(arredondar(0.5, "90"), 0.9);
  perto(arredondar(19.999, "90"), 20.9);
});

test("arredondar inteiro: sobe para o real cheio", () => {
  assert.equal(arredondar(33.05, "inteiro"), 34);
  assert.equal(arredondar(34, "inteiro"), 34);
  assert.equal(arredondar(33.001, "inteiro"), 33);
});

test("arredondar: zero, negativo ou inválido viram 0", () => {
  assert.equal(arredondar(0, "90"), 0);
  assert.equal(arredondar(-5, "inteiro"), 0);
  assert.equal(arredondar(NaN, "90"), 0);
});

test("calcular: arredondamento sobe o preço sugerido e o lucro acompanha", () => {
  const r = calcular({ ...base, lucro: "50", fils: [{ g: "110", kg: "120" }], arred: "90" });
  perto(r.precoBruto, 19.8);
  perto(r.preco, 19.9);
  perto(r.lucro, 19.9 - 13.2);
  perto(r.precoFinal, 19.9);
});

test("calcular: preço definido à mão não é arredondado", () => {
  const r = calcular({ ...base, lucro: "50", arred: "inteiro", precoFinal: "17,35" });
  perto(r.precoFinal, 17.35);
});

// ---------- Preço por quantidade ----------

const lote = { ...base, mo: "60", vh: "30", lucro: "50" }; // filamento 12 + mão de obra 30

test("precoLote: com a mesma quantidade da mesa, bate com o cálculo normal", () => {
  const r = calcular(lote);
  const l = precoLote(lote, 1);
  perto(l.un, r.un);
  perto(l.preco, Math.round(r.preco * 100) / 100);
});

test("precoLote: mão de obra se dilui, custo variável não", () => {
  const l = precoLote(lote, 10);
  perto(l.un, 12 + 3);
  perto(l.preco, 22.5);
  perto(l.total, 225);
});

test("precoLote: considera as peças por mesa no custo variável", () => {
  const l = precoLote({ ...lote, qtd: "4" }, 4); // 12 de filamento para 4 peças
  perto(l.un, 3 + 7.5);
  perto(l.un, calcular({ ...lote, qtd: "4" }).un);
});

test("precoLote: quantidade inválida vira 1", () => {
  assert.equal(precoLote(lote, 0).n, 1);
  assert.equal(precoLote(lote, "").n, 1);
  assert.equal(precoLote(lote, "abc").n, 1);
});

test("tabelaQuantidade: desconto cresce com a quantidade", () => {
  const t = tabelaQuantidade(lote);
  assert.deepEqual(t.map((l) => l.n), [1, 5, 10, 50]);
  perto(t[0].desconto, 0);
  perto(t[0].preco, 63);
  perto(t[1].preco, 27);
  assert.ok(t[1].desconto > 0 && t[2].desconto > t[1].desconto && t[3].desconto > t[2].desconto);
});

test("precoLote: preço por peça em centavos inteiros, e o total bate com ele", () => {
  const l = precoLote({ ...lote, fils: [{ g: "101", kg: "123" }] }, 7);
  perto(l.preco, Math.round(l.preco * 100) / 100);
  perto(l.total, l.preco * 7);
});

test("tabelaQuantidade: sem mão de obra não há desconto", () => {
  const t = tabelaQuantidade(base);
  for (const l of t) perto(l.desconto, 0);
});

test("tabelaQuantidade: aplica o arredondamento em cada linha", () => {
  const t = tabelaQuantidade({ ...lote, arred: "90" }, [1, 10]);
  perto(t[0].preco, 63.9);
  perto(t[1].preco, 22.9);
});

test("tabelaQuantidade: custo zero não gera NaN", () => {
  for (const l of tabelaQuantidade({})) for (const v of Object.values(l)) assert.ok(Number.isFinite(v));
});
