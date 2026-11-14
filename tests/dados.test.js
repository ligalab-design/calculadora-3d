import { test } from "node:test";
import assert from "node:assert/strict";
import { calcular } from "../calc.js";
import {
  PECA_KEYS, precoKg, novoRolo, baixarEstoque, faltaEstoque, estoqueBaixo,
  entradaHistorico, textoOrcamento, montarBackup, lerBackup,
} from "../dados.js";

const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

// ---------- Filamentos e estoque ----------

test("precoKg: R$ 90 por rolo de 750 g = R$ 120/kg", () => {
  perto(precoKg({ peso: 750, preco: 90 }), 120);
  perto(precoKg({ peso: "1000", preco: "129,90" }), 129.9);
});

test("precoKg: rolo sem peso não divide por zero", () => {
  assert.equal(precoKg({ peso: 0, preco: 90 }), 0);
});

test("novoRolo: começa cheio e com valores numéricos", () => {
  const r = novoRolo({ nome: "  PLA Preto ", mat: "PLA", peso: "1000", preco: "119,90" }, "a1");
  assert.deepEqual(r, { id: "a1", nome: "PLA Preto", mat: "PLA", peso: 1000, preco: 119.9, resto: 1000 });
});

test("novoRolo: sem nome e sem peso usa padrões", () => {
  const r = novoRolo({ nome: "", mat: "PETG", peso: "", preco: "" }, "b2");
  assert.equal(r.nome, "PETG sem nome");
  assert.equal(r.peso, 1000);
  assert.equal(r.resto, 1000);
  assert.equal(r.preco, 0);
});

const rolos = [
  { id: "a", nome: "PLA Preto", mat: "PLA", peso: 1000, preco: 120, resto: 300 },
  { id: "b", nome: "PETG Branco", mat: "PETG", peso: 1000, preco: 130, resto: 1000 },
];

test("baixarEstoque: desconta só dos rolos usados e não altera a lista original", () => {
  const novo = baixarEstoque(rolos, [{ rolo: "a", g: "80" }, { rolo: "", g: "50" }]);
  assert.equal(novo[0].resto, 220);
  assert.equal(novo[1].resto, 1000);
  assert.equal(rolos[0].resto, 300);
});

test("baixarEstoque: soma linhas do mesmo rolo e nunca fica negativo", () => {
  const novo = baixarEstoque(rolos, [{ rolo: "a", g: "200" }, { rolo: "a", g: "250" }]);
  assert.equal(novo[0].resto, 0);
});

test("baixarEstoque: rolo que não existe mais é ignorado", () => {
  const novo = baixarEstoque(rolos, [{ rolo: "zzz", g: "100" }]);
  assert.deepEqual(novo, rolos);
});

test("faltaEstoque: avisa quando a impressão pede mais do que resta", () => {
  assert.deepEqual(faltaEstoque(rolos, [{ rolo: "a", g: "350" }, { rolo: "b", g: "100" }]), [
    { id: "a", nome: "PLA Preto", precisa: 350, resto: 300 },
  ]);
  assert.deepEqual(faltaEstoque(rolos, [{ rolo: "a", g: "300" }]), []);
});

test("estoqueBaixo: abaixo de 15% do rolo", () => {
  assert.equal(estoqueBaixo({ peso: 1000, resto: 149 }), true);
  assert.equal(estoqueBaixo({ peso: 1000, resto: 150 }), false);
  assert.equal(estoqueBaixo({ peso: 1000, resto: 0 }), true);
});

// ---------- Histórico ----------

const st = {
  fils: [{ rolo: "a", mat: "PLA", g: "100", kg: "120" }],
  h: "2", m: "0", qtd: "2", falha: "0", extra: "0", mo: "0", vh: "0", lucro: "50", taxa: "0",
  arred: "nenhum", precoFinal: "", nomePeca: "Vaso",
  w: "0", kwh: "0", pimp: "0", vida: "0", manut: "0",
  rolos, hist: [],
};

test("entradaHistorico: guarda resumo e os campos da peça", () => {
  const e = entradaHistorico(st, calcular(st), { id: "h1", data: "2026-11-14T12:00:00.000Z", nome: "Vaso" });
  assert.equal(e.id, "h1");
  assert.equal(e.nome, "Vaso");
  assert.equal(e.qtd, 2);
  perto(e.peso, 100);
  perto(e.un, 6);
  perto(e.total, 12);
  perto(e.preco, 9);
  assert.deepEqual(Object.keys(e.snap).sort(), [...PECA_KEYS].sort());
  assert.equal(e.snap.rolos, undefined);
  assert.equal(e.snap.pimp, undefined);
});

test("entradaHistorico: o registro não muda se o estado mudar depois", () => {
  const s = JSON.parse(JSON.stringify(st));
  const e = entradaHistorico(s, calcular(s), { id: "h2", data: "x", nome: "" });
  s.fils[0].g = "999";
  assert.equal(e.snap.fils[0].g, "100");
  assert.equal(e.nome, "Peça sem nome");
});

test("entradaHistorico: usa o preço final definido à mão", () => {
  const s = { ...st, precoFinal: "15" };
  const e = entradaHistorico(s, calcular(s), { id: "h3", data: "x", nome: "Vaso" });
  perto(e.preco, 15);
});

// ---------- Orçamento ----------

test("textoOrcamento: uma peça mostra só o total", () => {
  const t = textoOrcamento({ cliente: "Ana", peca: "Vaso", qtd: 1, unit: 33.9, prazo: "5", validade: "7", obs: "" });
  assert.match(t, /LIGA LAB\./);
  assert.match(t, /Orçamento para Ana/);
  assert.match(t, /Peça: Vaso/);
  assert.match(t, /Quantidade: 1/);
  assert.match(t, /Total: R\$ 33,90/);
  assert.doesNotMatch(t, /Valor unitário/);
  assert.match(t, /Prazo de produção: 5 dia/);
  assert.match(t, /Validade do orçamento: 7 dia/);
});

test("textoOrcamento: várias peças mostram unitário e total", () => {
  const t = textoOrcamento({ cliente: "", peca: "", qtd: "10", unit: 20, prazo: "", validade: "", obs: "Cor a combinar." });
  assert.match(t, /^\*LIGA LAB\. — Design & Objetos\*\nOrçamento\n/);
  assert.match(t, /Peça: Impressão 3D/);
  assert.match(t, /Valor unitário: R\$ 20,00/);
  assert.match(t, /Total: R\$ 200,00/);
  assert.doesNotMatch(t, /Prazo/);
  assert.doesNotMatch(t, /Validade/);
  assert.match(t, /Cor a combinar\./);
});

test("textoOrcamento: não expõe custos", () => {
  const t = textoOrcamento({ cliente: "Ana", peca: "Vaso", qtd: 2, unit: 30, prazo: "5", validade: "7", obs: "" });
  assert.doesNotMatch(t, /custo|lucro|margem/i);
});

// ---------- Backup ----------

test("backup: exportar e importar devolve os mesmos dados", () => {
  const b = montarBackup(st, "2026-11-14T12:00:00.000Z");
  assert.equal(b.app, "ligalab-calc3d");
  assert.equal(b.exportadoEm, "2026-11-14T12:00:00.000Z");
  const r = lerBackup(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados, st);
});

test("backup: montarBackup copia os dados (não guarda referência)", () => {
  const s = JSON.parse(JSON.stringify(st));
  const b = montarBackup(s, "x");
  s.fils[0].g = "999";
  assert.equal(b.dados.fils[0].g, "100");
});

test("backup: recusa texto que não é JSON", () => {
  const r = lerBackup("isso não é json");
  assert.equal(r.ok, false);
  assert.match(r.erro, /JSON/);
});

test("backup: recusa arquivo de outro aplicativo", () => {
  assert.equal(lerBackup(JSON.stringify({ app: "outro", dados: { fils: [] } })).ok, false);
  assert.equal(lerBackup("null").ok, false);
  assert.equal(lerBackup("[1,2]").ok, false);
});

test("backup: recusa dados incompletos", () => {
  assert.equal(lerBackup(JSON.stringify({ app: "ligalab-calc3d", dados: {} })).ok, false);
  assert.equal(lerBackup(JSON.stringify({ app: "ligalab-calc3d", dados: { fils: [], hist: "x" } })).ok, false);
  assert.equal(lerBackup(JSON.stringify({ app: "ligalab-calc3d" })).ok, false);
});
