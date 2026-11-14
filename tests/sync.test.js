import { test } from "node:test";
import assert from "node:assert/strict";
import { CFG_KEYS, documento, aplicar, lerDocumento, mesclar } from "../sync.js";

const doc = (o = {}) => ({ app: "ligalab-calc3d-sync", versao: 1, cfg: {}, cfgMod: 0, rolos: [], clientes: [], hist: [], apagados: {}, ...o });
const ped = (id, mod, extra = {}) => ({ id, mod, nome: "Peça " + id, data: "2026-11-1" + id + "T10:00:00.000Z", status: "orcado", ...extra });
const ids = (l) => l.map((e) => e.id).join("");

// ---------- documento / aplicar ----------

test("documento: leva ajustes e listas, não o rascunho da peça", () => {
  const st = { pimp: "10000", kwh: "1,00", lucro: "50", h: "2", fils: [{ g: "80" }], nomePeca: "Vaso", cli: "c1", orc: { qtd: "3" }, rolos: [{ id: "r" }], clientes: [], hist: [{ id: "p" }], cfgMod: 5 };
  const d = documento(st);
  assert.equal(d.app, "ligalab-calc3d-sync");
  assert.deepEqual(d.cfg, { kwh: "1,00", pimp: "10000" }); // a margem da peça em edição não é ajuste
  assert.equal(d.cfgMod, 5);
  assert.deepEqual(d.rolos, [{ id: "r" }]);
  assert.deepEqual(d.hist, [{ id: "p" }]);
  assert.deepEqual(d.apagados, {});
  for (const k of ["h", "fils", "nomePeca", "cli", "orc"]) assert.equal(k in d, false);
  for (const k of ["h", "fils", "nomePeca"]) assert.equal(CFG_KEYS.includes(k), false);
});

test("documento: é uma cópia — mudar o estado depois não altera o documento", () => {
  const st = { rolos: [{ id: "r", resto: 500 }], clientes: [], hist: [] };
  const d = documento(st);
  st.rolos[0].resto = 1;
  assert.equal(d.rolos[0].resto, 500);
});

test("aplicar: grava ajustes e listas e preserva o rascunho", () => {
  const st = { h: "2", nomePeca: "Vaso", pimp: "6000", rolos: [], clientes: [], hist: [] };
  aplicar(st, doc({ cfg: { pimp: "10000" }, cfgMod: 9, hist: [ped("1", 3)], apagados: { z: 4 } }));
  assert.equal(st.pimp, "10000");
  assert.equal(st.cfgMod, 9);
  assert.equal(st.h, "2");
  assert.equal(st.nomePeca, "Vaso");
  assert.equal(ids(st.hist), "1");
  assert.deepEqual(st.apagados, { z: 4 });
});

test("documento → aplicar: ida e volta mantém os dados", () => {
  const a = { pimp: "10000", kwh: "1,00", cfgMod: 7, rolos: [{ id: "r", mod: 1 }], clientes: [{ id: "c", mod: 2 }], hist: [ped("1", 3)], apagados: { x: 9 } };
  const b = aplicar({}, documento(a));
  assert.deepEqual(documento(b), documento(a));
});

// ---------- lerDocumento ----------

test("lerDocumento: aceita o próprio documento", () => {
  const r = lerDocumento(JSON.stringify(doc({ hist: [ped("1", 1)] })));
  assert.equal(r.ok, true);
  assert.equal(ids(r.doc.hist), "1");
});

test("lerDocumento: recusa texto inválido, outro app e listas corrompidas", () => {
  assert.equal(lerDocumento("não é json").ok, false);
  assert.equal(lerDocumento("null").ok, false);
  assert.equal(lerDocumento(JSON.stringify({ app: "ligalab-calc3d", dados: {} })).ok, false);
  assert.equal(lerDocumento(JSON.stringify(doc({ hist: "x" }))).ok, false);
});

test("lerDocumento: campos ausentes viram vazios", () => {
  const r = lerDocumento(JSON.stringify({ app: "ligalab-calc3d-sync" }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc, doc());
});

// ---------- mesclar ----------

test("mesclar: lados iguais não mudam nada", () => {
  const a = doc({ hist: [ped("1", 1)], cfg: { pimp: "1" }, cfgMod: 2 });
  const m = mesclar(a, JSON.parse(JSON.stringify(a)));
  assert.equal(m.mudouA, false);
  assert.equal(m.mudouB, false);
  assert.deepEqual(m.doc, a);
});

test("mesclar: une pedidos criados em aparelhos diferentes", () => {
  const m = mesclar(doc({ hist: [ped("1", 1)] }), doc({ hist: [ped("2", 1)] }));
  assert.equal(ids(m.doc.hist), "21"); // mais recente primeiro
  assert.equal(m.mudouA, true);
  assert.equal(m.mudouB, true);
});

test("mesclar: só a nuvem tem novidade — muda o local, não a nuvem", () => {
  const m = mesclar(doc({ hist: [ped("1", 1)] }), doc({ hist: [ped("2", 1), ped("1", 1)] }));
  assert.equal(m.mudouA, true);
  assert.equal(m.mudouB, false);
});

test("mesclar: só o local tem novidade — muda a nuvem, não o local", () => {
  const m = mesclar(doc({ hist: [ped("2", 1), ped("1", 1)] }), doc({ hist: [ped("1", 1)] }));
  assert.equal(m.mudouA, false);
  assert.equal(m.mudouB, true);
});

test("mesclar: mesmo item alterado nos dois — vale a alteração mais recente", () => {
  const a = doc({ hist: [ped("1", 5, { status: "aprovado" })] });
  const b = doc({ hist: [ped("1", 9, { status: "pago" })] });
  assert.equal(mesclar(a, b).doc.hist[0].status, "pago");
  assert.equal(mesclar(b, a).doc.hist[0].status, "pago");
});

test("mesclar: item antigo sem marca de alteração perde para o alterado", () => {
  const antigo = { id: "1", nome: "Antigo", data: "2026-11-01T00:00:00.000Z" };
  const m = mesclar(doc({ hist: [antigo] }), doc({ hist: [{ ...antigo, status: "pago", mod: 3 }] }));
  assert.equal(m.doc.hist[0].status, "pago");
});

test("mesclar: exclusão em um aparelho remove do outro", () => {
  const a = doc({ hist: [ped("2", 1)], apagados: { 1: 8 } });
  const b = doc({ hist: [ped("1", 1), ped("2", 1)] });
  const m = mesclar(a, b);
  assert.equal(ids(m.doc.hist), "2");
  assert.deepEqual(m.doc.apagados, { 1: 8 });
  assert.equal(m.mudouA, false);
  assert.equal(m.mudouB, true);
});

test("mesclar: item alterado depois de apagado no outro aparelho é mantido", () => {
  const a = doc({ apagados: { 1: 5 } });
  const b = doc({ hist: [ped("1", 9, { status: "pago" })] });
  assert.equal(ids(mesclar(a, b).doc.hist), "1");
  assert.equal(ids(mesclar(b, a).doc.hist), "1");
});

test("mesclar: exclusões dos dois lados se somam, com a data mais recente", () => {
  const m = mesclar(doc({ apagados: { x: 3, y: 9 } }), doc({ apagados: { y: 4, z: 7 } }));
  assert.deepEqual(m.doc.apagados, { x: 3, y: 9, z: 7 });
});

test("mesclar: clientes e rolos seguem a mesma regra dos pedidos", () => {
  const a = doc({ clientes: [{ id: "c1", nome: "Ana", mod: 1 }], rolos: [{ id: "r1", resto: 900, mod: 4 }] });
  const b = doc({ clientes: [{ id: "c2", nome: "João", mod: 1 }], rolos: [{ id: "r1", resto: 700, mod: 6 }], apagados: { c1: 2 } });
  const m = mesclar(a, b);
  assert.deepEqual(m.doc.clientes.map((c) => c.nome), ["João"]);
  assert.equal(m.doc.rolos[0].resto, 700);
});

test("mesclar: ajustes — vale o conjunto alterado por último; empate fica com o local", () => {
  const a = doc({ cfg: { pimp: "6000", kwh: "0,95" }, cfgMod: 5 });
  const b = doc({ cfg: { pimp: "10000", kwh: "1,00" }, cfgMod: 8 });
  assert.deepEqual(mesclar(a, b).doc.cfg, { pimp: "10000", kwh: "1,00" });
  assert.deepEqual(mesclar(b, a).doc.cfg, { pimp: "10000", kwh: "1,00" });
  assert.equal(mesclar(a, b).doc.cfgMod, 8);
  assert.deepEqual(mesclar(a, { ...b, cfgMod: 5 }).doc.cfg, a.cfg);
});

test("mesclar: nuvem vazia recebe tudo do local sem alterar o local", () => {
  const a = doc({ hist: [ped("1", 1)], clientes: [{ id: "c", mod: 1 }], cfg: { pimp: "1" }, cfgMod: 3 });
  const m = mesclar(a, doc());
  assert.equal(m.mudouA, false);
  assert.equal(m.mudouB, true);
  assert.deepEqual(m.doc, a);
});

test("mesclar: é estável — mesclar o resultado de novo não muda nada", () => {
  const a = doc({ hist: [ped("1", 5), ped("3", 2)], apagados: { 9: 1 }, cfg: { pimp: "1" }, cfgMod: 2 });
  const b = doc({ hist: [ped("2", 4), ped("1", 7, { status: "pago" })], clientes: [{ id: "c", mod: 1 }], cfgMod: 6, cfg: { pimp: "2" } });
  const m = mesclar(a, b);
  const outraVez = mesclar(m.doc, m.doc);
  assert.equal(outraVez.mudouA, false);
  assert.equal(outraVez.mudouB, false);
  assert.deepEqual(outraVez.doc, m.doc);
  // e a ordem dos lados não altera o resultado
  assert.deepEqual(mesclar(b, a).doc, m.doc);
});

test("mesclar: a ordem do resultado é a mesma partindo de qualquer aparelho", () => {
  const a = doc({ clientes: [{ id: "c2", mod: 1 }, { id: "c9", mod: 1 }], rolos: [{ id: "r5", mod: 1 }], hist: [ped("3", 1), ped("1", 1)] });
  const b = doc({ clientes: [{ id: "c1", mod: 1 }, { id: "c5", mod: 1 }], rolos: [{ id: "r2", mod: 1 }], hist: [ped("2", 1)] });
  const ab = mesclar(a, b), ba = mesclar(b, a);
  assert.deepEqual(ab.doc, ba.doc);
  assert.equal(ids(ab.doc.clientes.map((c) => ({ id: c.id.slice(1) }))), "1259");
  assert.equal(ids(ab.doc.hist), "321");
  // depois de um aparelho enviar o resultado, o outro não precisa enviar de novo
  assert.equal(mesclar(a, ab.doc).mudouB, false);
  assert.equal(mesclar(b, ab.doc).mudouB, false);
});

test("padrões para novos pedidos são sincronizados como ajustes", () => {
  const padrao = { lucro: "100", mo: "30", precos: { PLA: "130" } };
  const d = documento({ padrao, cfgMod: 4 });
  assert.deepEqual(d.cfg.padrao, padrao);
  const st = aplicar({ padrao: { lucro: "50" } }, d);
  assert.deepEqual(st.padrao, padrao);
  st.padrao.precos.PLA = "999";
  assert.equal(d.cfg.padrao.precos.PLA, "130"); // aplicar copia, não compartilha
});
