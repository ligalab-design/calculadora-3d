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
  arred: "nenhum", precoFinal: "", nomePeca: "Vaso", dims: "120 × 80 × 45 mm", cores: "Preto",
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

// ---------- Clientes e pedidos ----------
import { STATUS, VENDIDO, novoCliente, valoresPedido, filtrarHistorico, resumoVendas } from "../dados.js";

test("novoCliente: limpa espaços e usa nome padrão", () => {
  assert.deepEqual(novoCliente({ nome: " Ana ", contato: " 61 99999-0000 " }, "c1"), { id: "c1", nome: "Ana", contato: "61 99999-0000" });
  assert.equal(novoCliente({}, "c2").nome, "Cliente sem nome");
});

test("STATUS: fluxo completo, e orçado não conta como venda", () => {
  assert.deepEqual(STATUS.map(([s]) => s), ["orcado", "aprovado", "producao", "pronto", "entregue"]);
  assert.equal(VENDIDO.includes("orcado"), false);
  assert.equal(VENDIDO.length, 4);
});

test("baixarEstoque: fator multiplica o consumo do pedido", () => {
  assert.equal(baixarEstoque(rolos, [{ rolo: "a", g: "40" }], 5)[0].resto, 100);
  assert.equal(baixarEstoque(rolos, [{ rolo: "a", g: "40" }], 0)[0].resto, 260);
});

test("entradaHistorico: guarda cliente, situação, quantidade do pedido e valores por peça", () => {
  const e = entradaHistorico(st, calcular(st), {
    id: "p1", data: "2026-11-15T01:30:00.000Z", dia: "2026-11-14", nome: "Vaso",
    cliente: "c1", clienteNome: "Ana", status: "aprovado", vendidas: "10", preco: 8, un: 5.5,
  });
  assert.equal(e.dia, "2026-11-14");
  assert.equal(e.cliente, "c1");
  assert.equal(e.clienteNome, "Ana");
  assert.equal(e.status, "aprovado");
  assert.equal(e.vendidas, 10);
  assert.equal(e.preco, 8);
  assert.equal(e.un, 5.5);
  assert.equal(e.taxa, 0);
});

test("entradaHistorico: padrões — orçado, quantidade da mesa, dia tirado da data", () => {
  const e = entradaHistorico(st, calcular(st), { id: "p2", data: "2026-11-14T12:00:00.000Z", nome: "Vaso", status: "inventado" });
  assert.equal(e.status, "orcado");
  assert.equal(e.vendidas, 2);
  assert.equal(e.dia, "2026-11-14");
  assert.equal(e.cliente, "");
});

const ped = (o) => ({ id: "x", nome: "Peça", dia: "2026-11-10", status: "pago", qtd: 1, vendidas: 1, peso: 100, un: 10, taxa: 0, preco: 15, cliente: "", clienteNome: "", ...o });

test("valoresPedido: receita, lucro e filamento pela quantidade do pedido", () => {
  const v = valoresPedido(ped({ qtd: 2, vendidas: 10, peso: 100, un: 6, preco: 9 }));
  assert.equal(v.pecas, 10);
  perto(v.receita, 90);
  perto(v.lucro, 30);
  perto(v.filamento, 500);
});

test("valoresPedido: desconta a taxa de venda do lucro", () => {
  perto(valoresPedido(ped({ preco: 20, un: 12, taxa: 0.1 })).lucro, 6);
});

test("valoresPedido: registro antigo (sem vendidas, taxa nem situação) usa a quantidade da mesa", () => {
  const v = valoresPedido({ qtd: 2, peso: 100, un: 6, preco: 9 });
  assert.equal(v.pecas, 2);
  perto(v.receita, 18);
  perto(v.lucro, 6);
  perto(v.filamento, 100);
});

const hist = [
  ped({ id: "1", nome: "Vaso geométrico", clienteNome: "Ana", cliente: "c1", dia: "2026-11-10", status: "pago", preco: 30, un: 20 }),
  ped({ id: "2", nome: "Suporte de fone", clienteNome: "João", cliente: "c2", dia: "2026-11-02", status: "entregue", preco: 50, un: 30, vendidas: 2 }),
  ped({ id: "3", nome: "Chaveiro", clienteNome: "Ana", cliente: "c1", dia: "2026-10-20", status: "orcado", preco: 10, un: 4, vendidas: 50 }),
  ped({ id: "4", nome: "Organizador", clienteNome: "", cliente: "", dia: "2026-10-05", status: "producao", preco: 40, un: 25 }),
];
const ids = (l) => l.map((e) => e.id).join("");

test("filtrarHistorico: sem filtros devolve tudo", () => {
  assert.equal(ids(filtrarHistorico(hist)), "1234");
  assert.equal(ids(filtrarHistorico(hist, {})), "1234");
  assert.deepEqual(filtrarHistorico(undefined), []);
});

test("filtrarHistorico: texto busca na peça e no cliente, sem diferenciar acentos e maiúsculas", () => {
  assert.equal(ids(filtrarHistorico(hist, { texto: "geometrico" })), "1");
  assert.equal(ids(filtrarHistorico(hist, { texto: "JOAO" })), "2");
  assert.equal(ids(filtrarHistorico(hist, { texto: " ana " })), "13");
  assert.equal(ids(filtrarHistorico(hist, { texto: "inexistente" })), "");
});

test("filtrarHistorico: por situação, cliente e período (inclusive nas pontas)", () => {
  assert.equal(ids(filtrarHistorico(hist, { status: "orcado" })), "3");
  assert.equal(ids(filtrarHistorico(hist, { cliente: "c1" })), "13");
  assert.equal(ids(filtrarHistorico(hist, { de: "2026-11-01", ate: "2026-11-30" })), "12");
  assert.equal(ids(filtrarHistorico(hist, { de: "2026-10-20" })), "123");
  assert.equal(ids(filtrarHistorico(hist, { ate: "2026-10-20" })), "34");
});

test("filtrarHistorico: filtros combinados", () => {
  assert.equal(ids(filtrarHistorico(hist, { cliente: "c1", status: "entregue", pago: "sim", texto: "vaso" })), "1");
  assert.equal(ids(filtrarHistorico(hist, { cliente: "c1", status: "producao" })), "");
});

test("filtrarHistorico: registro antigo sem situação conta como orçado e usa a data ISO", () => {
  const antigo = [{ id: "9", nome: "Antiga", data: "2026-09-03T15:00:00.000Z" }];
  assert.equal(ids(filtrarHistorico(antigo, { status: "orcado" })), "9");
  assert.equal(ids(filtrarHistorico(antigo, { de: "2026-09-01", ate: "2026-09-30" })), "9");
  assert.equal(ids(filtrarHistorico(antigo, { status: "entregue" })), "");
});

test("resumoVendas: soma por mês, mais recente primeiro, sem contar orçados", () => {
  const r = resumoVendas(hist);
  assert.deepEqual(r.meses.map((m) => m.mes), ["2026-11", "2026-10"]);
  const nov = r.meses[0], out = r.meses[1];
  assert.equal(nov.pedidos, 2);
  assert.equal(nov.pecas, 3);
  perto(nov.receita, 130);
  perto(nov.lucro, 50);
  perto(nov.filamento, 300);
  perto(nov.aReceber, 100);
  assert.equal(out.pedidos, 1);
  perto(out.receita, 40);
  perto(out.aReceber, 40);
});

test("resumoVendas: total geral e a receber", () => {
  const { total } = resumoVendas(hist);
  assert.equal(total.pedidos, 3);
  assert.equal(total.pecas, 4);
  perto(total.receita, 170);
  perto(total.lucro, 65);
  perto(total.aReceber, 140);
});

test("resumoVendas: sem vendas devolve zeros", () => {
  const r = resumoVendas([]);
  assert.deepEqual(r.meses, []);
  assert.deepEqual(r.total, { pedidos: 0, pecas: 0, receita: 0, lucro: 0, filamento: 0, aReceber: 0 });
  assert.deepEqual(resumoVendas([ped({ status: "orcado" })]).meses, []);
});

// ---------- Duplicar pedido ----------
import { atualizarPeca } from "../dados.js";

const snapAntigo = {
  fils: [{ rolo: "a", mat: "PLA", g: "100", kg: "99,00" }, { rolo: "", mat: "PETG", g: "20", kg: "110" }, { rolo: "sumiu", mat: "TPU", g: "5", kg: "150" }],
  h: "2", m: "0", qtd: "1", mo: "15", lucro: "50", precoFinal: "45", nomePeca: "Vaso",
};

test("atualizarPeca: margem padrão, sem preço manual, e mantém peso, tempo e mão de obra", () => {
  const p = atualizarPeca(snapAntigo, { lucro: "100", precos: {}, rolos: [] });
  assert.equal(p.lucro, "100");
  assert.equal(p.precoFinal, "");
  assert.equal(p.h, "2");
  assert.equal(p.mo, "15");
  assert.equal(p.nomePeca, "Vaso");
  assert.deepEqual(p.fils.map((f) => f.g), ["100", "20", "5"]);
});

test("atualizarPeca: filamento de rolo usa o preço atual do rolo", () => {
  const p = atualizarPeca(snapAntigo, { lucro: "100", precos: { PLA: "130" }, rolos: [{ id: "a", mat: "PLA", peso: 1000, preco: 140 }] });
  assert.equal(p.fils[0].rolo, "a");
  assert.equal(p.fils[0].kg, "140,00");
});

test("atualizarPeca: filamento genérico usa o preço padrão do material; rolo excluído vira genérico", () => {
  const p = atualizarPeca(snapAntigo, { lucro: "100", precos: { PLA: "130", PETG: "135", TPU: "180" }, rolos: [] });
  assert.deepEqual(p.fils.map((f) => [f.rolo, f.kg]), [["", "130"], ["", "135"], ["", "180"]]);
});

test("atualizarPeca: material sem preço padrão mantém o preço que tinha", () => {
  const p = atualizarPeca(snapAntigo, { lucro: "100", precos: { PLA: "" }, rolos: [] });
  assert.equal(p.fils[0].kg, "99,00");
  assert.equal(p.fils[1].kg, "110");
});

test("atualizarPeca: não altera o pedido original e o preço sugerido reflete os valores novos", () => {
  const original = JSON.parse(JSON.stringify(snapAntigo));
  const p = atualizarPeca(snapAntigo, { lucro: "100", precos: { PLA: "130", PETG: "130", TPU: "170" }, rolos: [] });
  assert.deepEqual(snapAntigo, original);
  const zero = { falha: "0", extra: "0", vh: "0", taxa: "0", w: "0", kwh: "0", pimp: "0", vida: "0", manut: "0" };
  const antes = calcular({ ...zero, ...snapAntigo, precoFinal: "" }), depois = calcular({ ...zero, ...p });
  perto(antes.preco, (9.9 + 2.2 + 0.75) * 1.5);
  perto(depois.preco, (13 + 2.6 + 0.85) * 2);
  perto(depois.precoFinal, depois.preco);
});

test("textoOrcamento: inclui dimensões e cores logo depois da peça", () => {
  const t = textoOrcamento({ cliente: "Ana", peca: "Vaso", dims: "120 × 80 × 45 mm", cores: "Preto, Branco", qtd: 1, unit: 30, prazo: "5", validade: "7", obs: "" });
  assert.match(t, /Peça: Vaso\nDimensões: 120 × 80 × 45 mm\nCores: Preto, Branco\nQuantidade: 1/);
});

test("textoOrcamento: uma cor só usa o singular; campos vazios não aparecem", () => {
  assert.match(textoOrcamento({ peca: "Vaso", cores: " Preto ", qtd: 1, unit: 30 }), /\nCor: Preto\n/);
  assert.match(textoOrcamento({ peca: "Vaso", cores: "Preto e Branco", qtd: 1, unit: 30 }), /\nCores: Preto e Branco\n/);
  const t = textoOrcamento({ peca: "Vaso", dims: "  ", cores: "", qtd: 1, unit: 30 });
  assert.doesNotMatch(t, /Dimens|Cor/);
});

test("entradaHistorico: guarda dimensões e cores para reabrir o pedido", () => {
  const e = entradaHistorico(st, calcular(st), { id: "d1", data: "x", nome: "Vaso" });
  assert.equal(e.snap.dims, "120 × 80 × 45 mm");
  assert.equal(e.snap.cores, "Preto");
});

// ---------- Editar e duplicar rolo ----------
import { editarRolo, duplicarRolo } from "../dados.js";

const roloBase = { id: "a", nome: "PLA Preto", mat: "PLA", peso: 1000, preco: 120, resto: 300, mod: 7 };

test("editarRolo: altera nome, material, peso, preço e restante", () => {
  const r = editarRolo(roloBase, { nome: " PETG Azul ", mat: "PETG", peso: "750", preco: "99,90", resto: "640" });
  assert.deepEqual(r, { id: "a", nome: "PETG Azul", mat: "PETG", peso: 750, preco: 99.9, resto: 640, mod: 7 });
  assert.equal(roloBase.nome, "PLA Preto"); // não altera o original
  perto(precoKg(r), 133.2);
});

test("editarRolo: campos vazios ou inválidos mantêm o valor anterior", () => {
  const r = editarRolo(roloBase, { nome: "  ", mat: "", peso: "abc", preco: "", resto: "" });
  assert.deepEqual(r, roloBase);
  assert.deepEqual(editarRolo(roloBase, {}), roloBase);
});

test("editarRolo: restante zero e preço zero são aceitos quando digitados", () => {
  const r = editarRolo(roloBase, { resto: "0", preco: "0" });
  assert.equal(r.resto, 0);
  assert.equal(r.preco, 0);
});

test("editarRolo: mudar o peso do rolo não mexe no restante", () => {
  assert.equal(editarRolo(roloBase, { peso: "500" }).resto, 300);
});

test("duplicarRolo: copia os dados, com novo id, rolo cheio e sem a marca de alteração", () => {
  const r = duplicarRolo(roloBase, "b");
  assert.deepEqual(r, { id: "b", nome: "PLA Preto", mat: "PLA", peso: 1000, preco: 120, resto: 1000 });
  assert.equal(roloBase.id, "a");
  assert.equal(roloBase.resto, 300);
});

// ---------- Situação "Pronto", pagamento à parte e consumo de estoque ----------
import { CONSOME, statusDe, pagoDe, vendido, atualizarPedido, consumirEstoque } from "../dados.js";

test("fluxo: Pronto fica entre Em produção e Entregue; Pago não é mais situação", () => {
  const s = STATUS.map(([x]) => x);
  assert.equal(s.indexOf("pronto"), s.indexOf("producao") + 1);
  assert.equal(s.indexOf("entregue"), s.indexOf("pronto") + 1);
  assert.equal(s.includes("pago"), false);
  assert.deepEqual(CONSOME, ["pronto", "entregue"]);
});

test("registro antigo com situação 'pago' conta como entregue e pago", () => {
  const antigo = { status: "pago" };
  assert.equal(statusDe(antigo), "entregue");
  assert.equal(pagoDe(antigo), true);
  assert.equal(statusDe({}), "orcado");
  assert.equal(statusDe({ status: "xyz" }), "orcado");
  assert.equal(pagoDe({ status: "entregue" }), false);
  assert.equal(pagoDe({ status: "pago", pago: false }), false); // a marca explícita vale mais
  assert.equal(pagoDe(undefined), false);
});

test("pagamento independe da situação: pedido pode ser pago antes de produzir", () => {
  const e = entradaHistorico(st, calcular(st), { id: "x", data: "2026-11-14T12:00:00.000Z", nome: "Vaso", status: "orcado", pago: true });
  assert.equal(e.status, "orcado");
  assert.equal(e.pago, true);
  assert.equal(e.consumido, false);
  assert.equal(vendido(e), true); // pago conta como venda mesmo ainda orçado
  assert.equal(vendido({ status: "orcado", pago: false }), false);
  assert.equal(vendido({ status: "pronto" }), true);
});

test("filtrarHistorico: por pagamento e pela situação Pronto", () => {
  const l = [ped({ id: "1", status: "pronto", pago: true }), ped({ id: "2", status: "pronto", pago: false }), ped({ id: "3", status: "orcado", pago: true }), ped({ id: "4", status: "pago", pago: undefined })];
  assert.equal(ids(filtrarHistorico(l, { pago: "sim" })), "134");
  assert.equal(ids(filtrarHistorico(l, { pago: "nao" })), "2");
  assert.equal(ids(filtrarHistorico(l, { status: "pronto" })), "12");
  assert.equal(ids(filtrarHistorico(l, { status: "pronto", pago: "nao" })), "2");
  assert.equal(ids(filtrarHistorico(l, { status: "entregue" })), "4");
});

test("resumoVendas: a receber são as vendas não pagas; pago antecipado entra como venda recebida", () => {
  const l = [
    ped({ id: "1", status: "pronto", pago: false, preco: 30, un: 20 }),
    ped({ id: "2", status: "orcado", pago: true, preco: 50, un: 30 }),
    ped({ id: "3", status: "entregue", pago: true, preco: 10, un: 4 }),
    ped({ id: "4", status: "orcado", pago: false, preco: 999, un: 1 }),
  ];
  const { total } = resumoVendas(l);
  assert.equal(total.pedidos, 3);
  perto(total.receita, 90);
  perto(total.aReceber, 30);
});

const rolosC = [{ id: "a", nome: "PLA Preto", mat: "PLA", peso: 1000, preco: 120, resto: 500 }, { id: "b", nome: "PETG", mat: "PETG", peso: 1000, preco: 130, resto: 1000 }];
const pedC = (o) => ({ id: "p", status: "producao", consumido: false, qtd: 1, vendidas: 1, snap: { fils: [{ rolo: "a", g: "80" }, { rolo: "", g: "20" }] }, ...o });

test("consumirEstoque: só desconta a partir de Pronto", () => {
  for (const s of ["orcado", "aprovado", "producao"]) {
    const r = consumirEstoque(rolosC, pedC({ status: s }));
    assert.equal(r.consumiu, false);
    assert.equal(r.rolos, rolosC);
  }
  for (const s of ["pronto", "entregue"]) {
    const r = consumirEstoque(rolosC, pedC({ status: s }));
    assert.equal(r.consumiu, true);
    assert.equal(r.rolos[0].resto, 420);
    assert.equal(r.rolos[1].resto, 1000);
  }
  assert.equal(rolosC[0].resto, 500); // não altera a lista original
});

test("consumirEstoque: desconta uma única vez", () => {
  const p = pedC({ status: "pronto" });
  const r1 = consumirEstoque(rolosC, p);
  p.consumido = true;
  const r2 = consumirEstoque(r1.rolos, { ...p, status: "entregue" });
  assert.equal(r2.consumiu, false);
  assert.equal(r2.rolos[0].resto, 420);
});

test("consumirEstoque: multiplica pela quantidade do pedido (peças vendidas ÷ peças por mesa)", () => {
  assert.equal(consumirEstoque(rolosC, pedC({ status: "pronto", qtd: 2, vendidas: 10 })).rolos[0].resto, 100);
  assert.equal(consumirEstoque(rolosC, pedC({ status: "pronto", qtd: 1, vendidas: 20 })).rolos[0].resto, 0); // nunca negativo
});

test("consumirEstoque: pedido sem rolo cadastrado marca como consumido sem mexer nos rolos", () => {
  const r = consumirEstoque(rolosC, pedC({ status: "entregue", snap: { fils: [{ rolo: "", g: "80" }] } }));
  assert.equal(r.consumiu, true);
  assert.deepEqual(r.rolos, rolosC);
  assert.equal(consumirEstoque(rolosC, pedC({ status: "pronto", snap: undefined })).consumiu, true);
  assert.equal(consumirEstoque(rolosC, undefined).consumiu, false);
});

test("atualizarPedido: migra situação 'pago' e marca o estoque dos pedidos antigos", () => {
  const comRolo = atualizarPedido({ id: "1", status: "pago", snap: { fils: [{ rolo: "a", g: "10" }] } });
  assert.deepEqual([comRolo.status, comRolo.pago, comRolo.consumido], ["entregue", true, true]);
  const semRolo = atualizarPedido({ id: "2", status: "producao", snap: { fils: [{ rolo: "", g: "10" }] } });
  assert.deepEqual([semRolo.status, semRolo.pago, semRolo.consumido], ["producao", false, false]);
  const novo = atualizarPedido({ id: "3", status: "pronto", pago: true, consumido: false, snap: { fils: [{ rolo: "a", g: "10" }] } });
  assert.deepEqual([novo.status, novo.pago, novo.consumido], ["pronto", true, false]); // marca explícita é respeitada
  assert.equal(atualizarPedido({ id: "4" }).consumido, false);
});

test("atualizarPedido: é estável — aplicar de novo não muda nada", () => {
  const a = atualizarPedido({ id: "1", status: "pago", snap: { fils: [{ rolo: "a", g: "10" }] } });
  assert.deepEqual(atualizarPedido(a), a);
});

// ---------- Sair de "Orçado" exige rolos cadastrados ----------
import { filamentosDefinidos, podeMudarSituacao } from "../dados.js";

const comRolo = [{ rolo: "a", g: "80" }], semRolo = [{ rolo: "", g: "80" }], misto = [{ rolo: "a", g: "80" }, { rolo: "", g: "5" }];

test("filamentosDefinidos: todos os filamentos com peso precisam ser rolos que existem", () => {
  assert.equal(filamentosDefinidos(comRolo, rolosC), true);
  assert.equal(filamentosDefinidos(semRolo, rolosC), false);
  assert.equal(filamentosDefinidos(misto, rolosC), false);
  assert.equal(filamentosDefinidos([{ rolo: "apagado", g: "80" }], rolosC), false);
  assert.equal(filamentosDefinidos([{ rolo: "a", g: "80" }, { rolo: "b", g: "20" }], rolosC), true);
});

test("filamentosDefinidos: linha sem peso é ignorada; sem nenhum filamento não vale", () => {
  assert.equal(filamentosDefinidos([{ rolo: "a", g: "80" }, { rolo: "", g: "" }], rolosC), true);
  assert.equal(filamentosDefinidos([{ rolo: "", g: "0" }], rolosC), false);
  assert.equal(filamentosDefinidos([], rolosC), false);
  assert.equal(filamentosDefinidos(undefined, rolosC), false);
  assert.equal(filamentosDefinidos(comRolo, undefined), false);
});

test("podeMudarSituacao: sair de Orçado exige rolos cadastrados", () => {
  for (const para of ["aprovado", "producao", "pronto", "entregue"]) {
    assert.equal(podeMudarSituacao("orcado", para, semRolo, rolosC), false, para);
    assert.equal(podeMudarSituacao("orcado", para, misto, rolosC), false, para);
    assert.equal(podeMudarSituacao("orcado", para, comRolo, rolosC), true, para);
  }
  assert.equal(podeMudarSituacao(undefined, "aprovado", semRolo, rolosC), false); // pedido novo parte de Orçado
});

test("podeMudarSituacao: ficar ou voltar para Orçado, e mudar entre as outras situações, é sempre permitido", () => {
  assert.equal(podeMudarSituacao("orcado", "orcado", semRolo, rolosC), true);
  assert.equal(podeMudarSituacao("producao", "orcado", semRolo, rolosC), true);
  assert.equal(podeMudarSituacao("producao", "pronto", semRolo, rolosC), true); // já tinha saído do orçamento
  assert.equal(podeMudarSituacao("pago", "pronto", semRolo, rolosC), true);     // registro antigo
});
