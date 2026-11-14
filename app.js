// Tela do app: liga os campos aos cálculos (calc.js), aos dados (dados.js) e à importação (importar.js).
import { num, calcular, tabelaQuantidade, precoLote } from "./calc.js";
import {
  PECA_KEYS, STATUS, precoKg, novoRolo, baixarEstoque, faltaEstoque, estoqueBaixo, novoCliente, atualizarPeca,
  entradaHistorico, valoresPedido, filtrarHistorico, resumoVendas, textoOrcamento, montarBackup, lerBackup,
} from "./dados.js";
import { lerGcode, ler3mf } from "./importar.js";
import { CFG_KEYS, documento, aplicar } from "./sync.js";
import { criarNuvem } from "./nuvem.js";
import { GOOGLE_CLIENT_ID } from "./config.js";

const PRESETS = { PLA: 130, PETG: 130, ASA: 160, TPU: 170, Outro: 150 };
const DEF = {
  h: "2", m: "30", qtd: "1", falha: "5", extra: "0", mo: "30", vh: "30", lucro: "100", taxa: "0", arred: "nenhum",
  w: "150", kwh: "1,00", pimp: "10000", vida: "5000", manut: "0,50", precoFinal: "", nomePeca: "", v: 3,
  cli: "", cliNovo: "", pedStatus: "orcado", editando: "", cfgMod: 0, apagados: {},
  // Padrões aplicados a cada novo pedido (e ao duplicar). Editáveis na aba Calcular.
  padrao: { lucro: "100", mo: "30", precos: { PLA: "130", PETG: "130", ASA: "160", TPU: "170", Outro: "150" } },
  fils: [{ rolo: "", mat: "PLA", g: "80", kg: "130" }], rolos: [], hist: [], clientes: [],
  orc: { qtd: "", prazo: "5", validade: "7", obs: "" },
};
const IDS = ["h", "m", "qtd", "falha", "extra", "mo", "vh", "lucro", "taxa", "arred", "w", "kwh", "pimp", "vida", "manut", "precoFinal", "nomePeca", "cliNovo", "pedStatus"];
const ORC = { orcQtd: "qtd", orcPrazo: "prazo", orcValidade: "validade", orcObs: "obs" };
const TABS = ["calcular", "historico", "resumo", "filamentos", "dados"];
const KEY = "ligalab-calc3d-v1";

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dec = (n, d = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const campo = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const tempo = (horas) => { const min = Math.round(horas * 60); return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaBr = (e) => { const [a, m, d] = String(e.dia || e.data || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : ""; };
const mesBr = (mes) => { const [a, m] = mes.split("-"); return new Date(+a, +m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }); };
const opcoes = (pares, sel) => pares.map(([v, t]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(t)}</option>`).join("");

// ---------- Estado ----------
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
const st = Object.assign(clone(DEF), saved);
// v2: novos valores padrão de impressora e tarifa valem também para quem já tinha dados salvos.
if (!(saved.v >= 2)) { st.pimp = DEF.pimp; st.kwh = DEF.kwh; }
// v3: margem 100%, tempo de trabalho 30 min e PLA a R$ 130/kg passam a valer também na peça em edição.
if (!(saved.v >= 3)) {
  st.padrao = clone(DEF.padrao); st.lucro = DEF.padrao.lucro; st.mo = DEF.padrao.mo;
  if (Array.isArray(st.fils)) st.fils.forEach((f) => { if (f && !f.rolo && f.mat === "PLA" && f.kg === "120") f.kg = DEF.padrao.precos.PLA; });
  st.cfgMod = Date.now();
}
st.v = 3;
normalizar();

function normalizar() {
  if (!Array.isArray(st.fils) || !st.fils.length) st.fils = clone(DEF.fils);
  for (const k of ["rolos", "hist", "clientes"]) if (!Array.isArray(st[k])) st[k] = [];
  st.orc = Object.assign(clone(DEF.orc), st.orc && typeof st.orc === "object" ? st.orc : {});
  st.fils.forEach((f) => { if (!f.rolo || !st.rolos.some((r) => r.id === f.rolo)) f.rolo = ""; });
  if (st.cli !== "novo" && !st.clientes.some((c) => c.id === st.cli)) st.cli = "";
  if (!STATUS.some(([s]) => s === st.pedStatus)) st.pedStatus = "orcado";
  if (!st.apagados || typeof st.apagados !== "object" || Array.isArray(st.apagados)) st.apagados = {};
  const pd = st.padrao && typeof st.padrao === "object" ? st.padrao : {};
  st.padrao = { lucro: String(pd.lucro ?? DEF.padrao.lucro), mo: String(pd.mo ?? DEF.padrao.mo), precos: Object.assign(clone(DEF.padrao.precos), pd.precos && typeof pd.precos === "object" ? pd.precos : {}) };
  if (st.editando && !st.hist.some((h) => h.id === st.editando)) st.editando = "";
}
/** Preço por kg padrão de um material, para filamento sem rolo cadastrado. */
const precoPadrao = (mat) => { const v = st.padrao.precos[mat]; return String(v !== undefined && v !== "" ? v : PRESETS[mat] ?? PRESETS.Outro); };
let nuvem = null, aplicando = false;
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  if (nuvem && !aplicando) nuvem.agendar();
};
// Marcas usadas pela sincronização para juntar dados de aparelhos diferentes.
const toca = (item) => { item.mod = Date.now(); return item; };
const apaga = (id) => { st.apagados[id] = Date.now(); };

/** Botão de ação destrutiva: o primeiro toque pede confirmação, o segundo executa. */
function confirma(btn, fn) {
  if (btn.dataset.c) return fn();
  const t = btn.textContent;
  btn.dataset.c = "1"; btn.textContent = "Confirmar?";
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.c; btn.textContent = t; } }, 3000);
}
function aviso(btn, txt, ms = 1800) {
  const t = btn.dataset.t || (btn.dataset.t = btn.textContent);
  btn.textContent = txt;
  setTimeout(() => { btn.textContent = t; }, ms);
}
async function copiar(txt, btn) {
  try { await navigator.clipboard.writeText(txt); aviso(btn, "Copiado ✓"); }
  catch (e) { aviso(btn, "Não foi possível copiar"); }
}
const msg = (el, txt, ok = true) => { el.hidden = false; el.textContent = txt; el.style.color = ok ? "" : "var(--warn)"; };

// ---------- Abas ----------
function mostrar(tab) {
  if (!TABS.includes(tab)) tab = "calcular";
  document.querySelectorAll("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== tab; });
  document.querySelectorAll("nav [data-tab]").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (tab === "historico") drawHist();
  if (tab === "resumo") drawResumo();
  if (tab === "filamentos") drawRolos();
  if (tab === "dados") drawClientes();
}
document.querySelector("nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  mostrar(b.dataset.tab);
  if (location.hash.slice(1) !== b.dataset.tab) location.hash = b.dataset.tab;
  window.scrollTo(0, 0);
});
window.addEventListener("hashchange", () => mostrar(location.hash.slice(1)));

// ---------- Calcular: filamentos da peça ----------
function drawFils() {
  const box = $("fils"); box.innerHTML = "";
  st.fils.forEach((f, i) => {
    const meus = st.rolos.map((r) => `<option value="r:${esc(r.id)}"${f.rolo === r.id ? " selected" : ""}>${esc(r.nome)} · ${dec(num(r.resto), 0)} g</option>`).join("");
    const gen = Object.keys(PRESETS).map((p) => `<option value="m:${p}"${!f.rolo && p === f.mat ? " selected" : ""}>${p}</option>`).join("");
    const d = document.createElement("div"); d.className = "fil";
    d.innerHTML = `<div><label>Filamento</label><select data-i="${i}" data-k="sel">${meus ? `<optgroup label="Meus rolos">${meus}</optgroup><optgroup label="Genérico">${gen}</optgroup>` : gen}</select></div>
    <div><label>Peso</label><div class="fld"><input inputmode="decimal" data-i="${i}" data-k="g"><span class="u">g</span></div></div>
    <div><label>Preço</label><div class="fld"><input inputmode="decimal" data-i="${i}" data-k="kg"><span class="u">R$/kg</span></div></div>
    <button class="del" type="button" data-del="${i}" aria-label="Remover filamento"${st.fils.length < 2 ? " disabled" : ""}>×</button>`;
    box.appendChild(d);
    d.querySelector('[data-k="g"]').value = f.g;
    d.querySelector('[data-k="kg"]').value = f.kg;
  });
}
$("fils").addEventListener("input", (e) => {
  const t = e.target, i = t.dataset.i, k = t.dataset.k; if (i === undefined) return;
  const f = st.fils[i];
  if (k === "sel") {
    const [tipo, val] = [t.value.slice(0, 1), t.value.slice(2)];
    const rolo = tipo === "r" && st.rolos.find((r) => r.id === val);
    if (rolo) { f.rolo = rolo.id; f.mat = rolo.mat; f.kg = precoKg(rolo).toFixed(2).replace(".", ","); }
    else { f.rolo = ""; f.mat = val; f.kg = precoPadrao(val); }
    drawFils();
  } else f[k] = t.value;
  render();
});
$("fils").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]"); if (!b || st.fils.length < 2) return;
  st.fils.splice(+b.dataset.del, 1); drawFils(); render();
});
$("addFil").onclick = () => { st.fils.push({ rolo: "", mat: "PLA", g: "", kg: precoPadrao("PLA") }); drawFils(); render(); };

$("pedStatus").innerHTML = opcoes(STATUS, st.pedStatus);
IDS.forEach((id) => { $(id).value = st[id] ?? ""; $(id).addEventListener("input", () => { st[id] = $(id).value; if (CFG_KEYS.includes(id)) st.cfgMod = Date.now(); render(); }); });
Object.entries(ORC).forEach(([id, k]) => { $(id).value = st.orc[k] ?? ""; $(id).addEventListener("input", () => { st.orc[k] = $(id).value; drawOrc(); save(); }); });

// ---------- Calcular: importar do fatiador ----------
$("impFile").addEventListener("change", async () => {
  const file = $("impFile").files[0]; if (!file) return;
  let r;
  try {
    if (/\.3mf$/i.test(file.name)) r = await ler3mf(await file.arrayBuffer());
    else {
      // O resumo fica no começo e no fim do .gcode; não é preciso ler o arquivo inteiro.
      const pedaco = 400000;
      const txt = file.size <= pedaco * 2 ? await file.text() : (await file.slice(0, pedaco).text()) + "\n" + (await file.slice(file.size - pedaco).text());
      r = lerGcode(txt);
      if (!r.ok) r.erro = "Não encontrei peso nem tempo neste arquivo. Use o .gcode ou o .gcode.3mf exportado pelo fatiador.";
    }
  } catch (e) { r = { ok: false, erro: "Não foi possível ler o arquivo." }; }
  $("impFile").value = "";
  if (!r.ok) { msg($("impMsg"), r.erro, false); return; }
  if (r.segundos) { const min = Math.round(r.segundos / 60); st.h = String(Math.floor(min / 60)); st.m = String(min % 60); }
  if (r.fils.length) st.fils = r.fils.map((f) => ({ rolo: "", mat: f.mat, g: campo(f.g), kg: precoPadrao(f.mat) }));
  if (!st.nomePeca) st.nomePeca = file.name.replace(/(\.gcode)?\.(3mf|gcode|bgcode)$/i, "");
  carregarCampos();
  const peso = r.fils.reduce((t, f) => t + f.g, 0);
  msg($("impMsg"), `Importado de ${file.name}: ${[peso ? dec(peso) + " g" : "", r.segundos ? tempo(r.segundos / 3600) : ""].filter(Boolean).join(" e ")}. ${r.aviso || ""}${r.fils.length ? " Confira o preço por kg ou escolha o rolo." : " O arquivo não informa o peso; preencha à mão."}`);
});

// ---------- Calcular: resultado ----------
let last = {};
function render() {
  const r = calcular(st);
  const parts = [["Filamento", r.cFil, "--c1"], ["Energia", r.cEn, "--c2"], ["Máquina (desgaste + manutenção)", r.cMaq, "--c3"], ["Mão de obra", r.cMo, "--c4"], ["Falhas + extras", r.cFalha + r.cExtra, "--c5"]];
  const manual = num(st.precoFinal) > 0;
  const taxas = r.taxa ? ` · ${brl(r.precoFinal * r.taxa)} em taxas` : "";
  $("lblPreco").textContent = manual ? "Preço final definido por você" : "Preço de venda por peça";
  $("preco").textContent = brl(r.precoFinal);
  $("precoFinal").placeholder = r.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("usarSug").disabled = !manual;
  $("lucroTxt").textContent = manual
    ? `${r.lucroFinal >= 0 ? "Lucro" : "Prejuízo"} de ${brl(Math.abs(r.lucroFinal))} por peça (${dec(r.margemFinal, 0)}% sobre o custo)${taxas} · sugerido ${brl(r.preco)}`
    : (r.lucro > 0.005 ? `Lucro de ${brl(r.lucro)} por peça${taxas}` : "Sem margem — preço igual ao custo");
  $("custoUn").textContent = brl(r.un);
  $("bar").innerHTML = r.total ? parts.map((p) => `<i style="width:${(p[1] / r.total) * 100}%;background:var(${p[2]})"></i>`).join("") : "";
  $("tb").innerHTML = parts.map((p) => `<tr><td><span class="dot" style="background:var(${p[2]})"></span>${p[0]}</td><td>${brl(p[1])}</td></tr>`).join("") +
    `<tr class="tot"><td>Custo total${r.qtd > 1 ? ` (${r.qtd} peças)` : ""}</td><td>${brl(r.total)}</td></tr>`;
  $("kTempo").textContent = tempo(r.horas);
  $("kPeso").textContent = dec(r.peso) + " g";
  $("kKwh").textContent = dec(r.kwh, 2) + " kWh";
  $("kHora").textContent = brl(r.maqH + (num(st.w) / 1000) * num(st.kwh));

  $("tq").innerHTML = `<tr><th>Qtd.</th><th>Por peça</th><th>Total</th><th>Desc.</th></tr>` +
    tabelaQuantidade(st).map((l) => `<tr><td>${l.n}</td><td>${brl(l.preco)}</td><td>${brl(l.total)}</td><td>${l.desconto > 0.05 ? "−" + dec(l.desconto, 0) + "%" : "—"}</td></tr>`).join("");

  // Pedido: quantidade, preço e custo por peça para essa quantidade.
  const pecas = Math.max(1, Math.round(num(st.orc.qtd)) || r.qtd);
  const lote = precoLote(st, pecas);
  const ped = { pecas, preco: manual ? r.precoFinal : lote.preco, un: lote.un, fator: pecas / r.qtd };
  $("orcQtd").placeholder = String(r.qtd);

  const usoPedido = st.fils.map((f) => ({ rolo: f.rolo, g: num(f.g) * ped.fator }));
  const falta = faltaEstoque(st.rolos, usoPedido);
  $("faltaTxt").hidden = !falta.length;
  $("faltaTxt").textContent = falta.map((f) => `${f.nome}: o pedido usa ${dec(f.precisa, 0)} g e restam ${dec(f.resto, 0)} g.`).join(" ");
  // Editando um pedido salvo: salvar atualiza o mesmo pedido e não desconta estoque de novo.
  const emEdicao = st.hist.find((h) => h.id === st.editando);
  $("salvar").textContent = emEdicao ? "Salvar alterações" : "Salvar pedido";
  $("editBox").hidden = !emEdicao;
  if (emEdicao) $("editBox").textContent = `Editando o pedido “${emEdicao.nome}”. Salvar atualiza esse pedido; para começar outro, toque em “Novo pedido”.`;
  $("baixarBox").hidden = !!emEdicao || !st.fils.some((f) => f.rolo);
  $("cliNovoBox").hidden = st.cli !== "novo";

  last = { parts, r, manual, ped };
  drawOrc();
  save();
}

$("usarSug").onclick = () => { st.precoFinal = ""; $("precoFinal").value = ""; render(); };
$("copy").onclick = () => {
  const { parts, r, manual } = last;
  copiar([`Liga Lab — impressão 3D: ${dec(r.peso)} g, ${tempo(r.horas)}, ${r.qtd} peça(s)`,
    ...parts.map((p) => `${p[0]}: ${brl(p[1])}`), `Custo total: ${brl(r.total)}`, `Custo por peça: ${brl(r.un)}`,
    `Preço de venda por peça: ${brl(r.precoFinal)}${manual ? ` (definido manualmente; sugerido ${brl(r.preco)})` : ""}`].join("\n"), $("copy"));
};
// Novo pedido: limpa a peça e aplica os padrões (margem, tempo de trabalho e preço do PLA).
$("reset").onclick = () => {
  ["h", "m", "extra"].forEach((id) => { st[id] = "0"; });
  st.mo = st.padrao.mo; st.lucro = st.padrao.lucro;
  st.qtd = "1"; st.precoFinal = ""; st.nomePeca = ""; st.orc.qtd = ""; st.pedStatus = "orcado"; st.cli = ""; st.editando = "";
  st.fils = [{ rolo: "", mat: "PLA", g: "", kg: precoPadrao("PLA") }];
  $("impMsg").hidden = true; $("salvarMsg").hidden = true;
  carregarCampos();
};
// Padrões para novos pedidos.
const PD = { pdLucro: ["lucro"], pdMo: ["mo"], pdPLA: ["precos", "PLA"], pdPETG: ["precos", "PETG"], pdASA: ["precos", "ASA"], pdTPU: ["precos", "TPU"], pdOutro: ["precos", "Outro"] };
const pdValor = (c) => (c.length === 1 ? st.padrao[c[0]] : st.padrao[c[0]][c[1]]);
Object.entries(PD).forEach(([id, c]) => {
  $(id).value = pdValor(c) ?? "";
  $(id).addEventListener("input", () => { if (c.length === 1) st.padrao[c[0]] = $(id).value; else st.padrao[c[0]][c[1]] = $(id).value; st.cfgMod = Date.now(); save(); });
});
function carregarCampos() {
  IDS.forEach((id) => { $(id).value = st[id] ?? ""; });
  Object.entries(PD).forEach(([id, c]) => { $(id).value = pdValor(c) ?? ""; });
  Object.entries(ORC).forEach(([id, k]) => { $(id).value = st.orc[k] ?? ""; });
  drawCliSel(); drawFils(); render();
}

// ---------- Cliente do pedido e orçamento ----------
function drawCliSel() {
  $("cliSel").innerHTML = opcoes([["", "Sem cliente"], ...st.clientes.map((c) => [c.id, c.nome]), ["novo", "+ Novo cliente…"]], st.cli);
}
$("cliSel").addEventListener("input", () => { st.cli = $("cliSel").value; render(); if (st.cli === "novo") $("cliNovo").focus(); });
const nomeCliente = () => (st.cli === "novo" ? st.cliNovo.trim() : (st.clientes.find((c) => c.id === st.cli) || {}).nome || "");

function drawOrc() {
  const { ped } = last; if (!ped) return;
  const txt = textoOrcamento({ cliente: nomeCliente(), peca: st.nomePeca, qtd: ped.pecas, unit: ped.preco, prazo: st.orc.prazo, validade: st.orc.validade, obs: st.orc.obs });
  $("orcTxt").value = txt;
  $("orcWa").href = "https://wa.me/?text=" + encodeURIComponent(txt);
}
$("abrirOrc").onclick = () => { const b = $("orcBox"); b.hidden = !b.hidden; if (!b.hidden) { drawOrc(); b.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
$("orcCopy").onclick = () => copiar($("orcTxt").value, $("orcCopy"));

// ---------- Pedidos (histórico) ----------
$("salvar").onclick = () => {
  const { r, ped } = last;
  if (st.cli === "novo") {
    if (st.cliNovo.trim()) { const c = toca(novoCliente({ nome: st.cliNovo }, uid())); st.clientes.push(c); st.cli = c.id; }
    else st.cli = "";
    st.cliNovo = ""; $("cliNovo").value = ""; drawCliSel();
  }
  const agora = new Date(), i = st.hist.findIndex((h) => h.id === st.editando), antigo = st.hist[i];
  const dados = { nome: st.nomePeca, cliente: st.cli, clienteNome: nomeCliente(), status: st.pedStatus, vendidas: ped.pecas, preco: ped.preco, un: ped.un };
  if (antigo) {
    // Edição: atualiza o mesmo pedido, mantendo a data em que foi criado.
    st.hist[i] = toca(entradaHistorico(st, r, { ...dados, id: antigo.id, data: antigo.data, dia: antigo.dia }));
    render(); msg($("salvarMsg"), "Alterações salvas ✓");
    return;
  }
  const novo = toca(entradaHistorico(st, r, { ...dados, id: uid(), data: agora.toISOString(), dia: ymd(agora) }));
  st.hist.unshift(novo);
  st.editando = novo.id; // salvar de novo atualiza este pedido em vez de criar outro
  const baixou = !$("baixarBox").hidden && $("baixar").checked;
  if (baixou) {
    const antes = Object.fromEntries(st.rolos.map((x) => [x.id, x.resto]));
    st.rolos = baixarEstoque(st.rolos, st.fils, ped.fator);
    st.rolos.forEach((x) => { if (x.resto !== antes[x.id]) toca(x); });
    drawFils();
  }
  render();
  msg($("salvarMsg"), baixou ? "Pedido salvo e estoque atualizado ✓" : "Pedido salvo ✓");
};

const filtro = { texto: "", status: "", periodo: "", cliente: "" };
function periodo(p) {
  const h = new Date(), a = h.getFullYear(), m = h.getMonth();
  if (p === "mes") return { de: ymd(new Date(a, m, 1)), ate: ymd(new Date(a, m + 1, 0)) };
  if (p === "anterior") return { de: ymd(new Date(a, m - 1, 1)), ate: ymd(new Date(a, m, 0)) };
  if (p === "ano") return { de: `${a}-01-01`, ate: `${a}-12-31` };
  return {};
}
$("fStatus").innerHTML = opcoes([["", "Todas"], ...STATUS], "");
$("fPeriodo").innerHTML = opcoes([["", "Tudo"], ["mes", "Este mês"], ["anterior", "Mês passado"], ["ano", "Este ano"]], "");
[["fTexto", "texto"], ["fStatus", "status"], ["fPeriodo", "periodo"], ["fCliente", "cliente"]].forEach(([id, k]) => {
  $(id).addEventListener("input", () => { filtro[k] = $(id).value; drawHistList(); });
});
function drawHist() {
  if (filtro.cliente && !st.clientes.some((c) => c.id === filtro.cliente)) filtro.cliente = "";
  $("fCliente").innerHTML = opcoes([["", "Todos"], ...st.clientes.map((c) => [c.id, c.nome])], filtro.cliente);
  drawHistList();
}
function drawHistList() {
  const lista = filtrarHistorico(st.hist, { texto: filtro.texto, status: filtro.status, cliente: filtro.cliente, ...periodo(filtro.periodo) });
  const soma = lista.reduce((t, e) => t + valoresPedido(e).receita, 0);
  $("histTit").textContent = `Pedidos (${st.hist.length})`;
  $("histSoma").textContent = st.hist.length ? `${lista.length === st.hist.length ? "Todos os" : `${lista.length} de`} ${st.hist.length} pedido(s) · ${brl(soma)} no total` : "";
  $("histList").innerHTML = lista.length ? lista.map((e) => {
    const v = valoresPedido(e);
    return `<div class="item">
    <div class="ihead"><b>${esc(e.nome)}</b><span>${brl(v.receita)}</span></div>
    <div class="sub">${e.clienteNome ? esc(e.clienteNome) + " · " : ""}${diaBr(e)} · ${v.pecas} peça(s) × ${brl(num(e.preco))} · lucro ${brl(v.lucro)}</div>
    <div class="sub">${dec(v.filamento)} g de filamento · ${tempo(num(e.horas))} por mesa · custo ${brl(num(e.un))} por peça</div>
    <div class="rrow"><div><label>Situação</label><select data-status="${esc(e.id)}">${opcoes(STATUS, e.status || "orcado")}</select></div>
    <button type="button" data-abrir="${esc(e.id)}">Editar</button></div>
    <div class="acts"><button type="button" data-dup="${esc(e.id)}">Duplicar</button><button type="button" data-excluir="${esc(e.id)}">Excluir</button></div>
  </div>`;
  }).join("") : `<p class="hint" style="margin:0">${st.hist.length ? "Nenhum pedido corresponde aos filtros." : "Nenhum pedido salvo ainda. Na aba Calcular, dê um nome à peça e toque em “Salvar pedido”."}</p>`;
}
$("histList").addEventListener("change", (e) => {
  const id = e.target.dataset.status; if (id === undefined) return;
  const it = st.hist.find((h) => h.id === id); if (!it) return;
  it.status = e.target.value; toca(it); save(); drawHistList();
});
$("histList").addEventListener("click", (e) => {
  const a = e.target.closest("[data-abrir]"), x = e.target.closest("[data-excluir]"), d = e.target.closest("[data-dup]");
  if (d) {
    // Duplicar: novo pedido como orçamento, com o preço sugerido recalculado pelos valores de hoje.
    const it = st.hist.find((h) => h.id === d.dataset.dup); if (!it || !it.snap) return;
    const base = { ...st, ...atualizarPeca(it.snap, { lucro: st.padrao.lucro, precos: st.padrao.precos, rolos: st.rolos }) };
    const r = calcular(base), pecas = Math.max(1, Math.round(num(it.vendidas)) || r.qtd), lote = precoLote(base, pecas), agora = new Date();
    st.hist.unshift(toca(entradaHistorico(base, r, {
      id: uid(), data: agora.toISOString(), dia: ymd(agora), nome: it.nome,
      cliente: st.clientes.some((c) => c.id === it.cliente) ? it.cliente : "", clienteNome: it.clienteNome, status: "orcado", vendidas: pecas, preco: lote.preco, un: lote.un,
    })));
    save(); drawHistList(); window.scrollTo(0, 0);
    return;
  }
  if (a) {
    const it = st.hist.find((h) => h.id === a.dataset.abrir); if (!it || !it.snap) return;
    PECA_KEYS.forEach((k) => { if (it.snap[k] !== undefined) st[k] = clone(it.snap[k]); });
    st.editando = it.id; $("salvarMsg").hidden = true;
    st.cli = it.cliente || ""; st.pedStatus = it.status || "orcado"; st.orc.qtd = it.vendidas ? String(it.vendidas) : ""; st.cfgMod = Date.now();
    normalizar(); carregarCampos(); mostrar("calcular"); location.hash = "calcular"; window.scrollTo(0, 0);
  }
  if (x) confirma(x, () => { st.hist = st.hist.filter((h) => h.id !== x.dataset.excluir); apaga(x.dataset.excluir); normalizar(); render(); drawHistList(); });
});

// ---------- Resumo de vendas ----------
function drawResumo() {
  const { meses, total } = resumoVendas(st.hist);
  const atual = meses.find((m) => m.mes === ymd(new Date()).slice(0, 7)) || { pedidos: 0, pecas: 0, receita: 0, lucro: 0, filamento: 0 };
  $("rsVendido").textContent = brl(atual.receita);
  $("rsSub").textContent = `${atual.pedidos} pedido(s) · ${atual.pecas} peça(s)`;
  $("rsLucro").textContent = brl(atual.lucro);
  $("rsFil").textContent = dec(atual.filamento, 0) + " g";
  $("rsReceber").textContent = brl(total.aReceber);
  $("rsTotal").textContent = brl(total.receita);
  $("rsTab").innerHTML = meses.length
    ? `<tr><th>Mês</th><th>Pedidos</th><th>Vendido</th><th>Lucro</th></tr>` +
      meses.map((m) => `<tr><td>${esc(mesBr(m.mes))}</td><td>${m.pedidos}</td><td>${brl(m.receita)}</td><td>${brl(m.lucro)}</td></tr>`).join("") +
      `<tr class="tot"><td>Total</td><td>${total.pedidos}</td><td>${brl(total.receita)}</td><td>${brl(total.lucro)}</td></tr>`
    : `<tr><td style="border:0">Nenhuma venda ainda. Um pedido entra no resumo quando a situação passa de “Orçado” para “Aprovado” em diante.</td></tr>`;
}

// ---------- Filamentos ----------
$("rMat").innerHTML = Object.keys(PRESETS).map((p) => `<option>${p}</option>`).join("");
$("rAdd").onclick = () => {
  if (!$("rNome").value.trim() && !num($("rPreco").value)) { aviso($("rAdd"), "Preencha nome e preço"); return; }
  st.rolos.push(toca(novoRolo({ nome: $("rNome").value, mat: $("rMat").value, peso: $("rPeso").value, preco: $("rPreco").value }, uid())));
  $("rNome").value = ""; $("rPreco").value = "";
  save(); drawRolos(); drawFils(); render();
  aviso($("rAdd"), "Cadastrado ✓");
};
function drawRolos() {
  $("roloList").innerHTML = st.rolos.length ? st.rolos.map((r) => {
    const pct = num(r.peso) ? Math.min(100, (num(r.resto) / num(r.peso)) * 100) : 0, baixo = estoqueBaixo(r);
    return `<div class="item">
    <div class="ihead"><b>${esc(r.nome)}${baixo ? `<span class="pill">Acabando</span>` : ""}</b><span>${brl(precoKg(r))}/kg</span></div>
    <div class="stock${baixo ? " low" : ""}"><i style="width:${pct}%"></i></div>
    <div class="sub">${esc(r.mat)} · ${dec(num(r.resto), 0)} g de ${dec(num(r.peso), 0)} g · pago ${brl(num(r.preco))}</div>
    <div class="rrow"><div><label>Ajustar peso restante</label><div class="fld"><input inputmode="decimal" data-resto="${esc(r.id)}" value="${esc(campo(num(r.resto)))}"><span class="u">g</span></div></div>
    <button type="button" data-rdel="${esc(r.id)}">Excluir</button></div>
  </div>`;
  }).join("") : `<p class="hint" style="margin:0">Nenhum rolo cadastrado. Cadastre para escolher o filamento pelo nome e acompanhar quanto resta.</p>`;
}
$("roloList").addEventListener("change", (e) => {
  const id = e.target.dataset.resto; if (id === undefined) return;
  const r = st.rolos.find((x) => x.id === id); if (!r) return;
  r.resto = num(e.target.value); toca(r); save(); drawRolos(); drawFils(); render();
});
$("roloList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rdel]"); if (!b) return;
  confirma(b, () => { st.rolos = st.rolos.filter((r) => r.id !== b.dataset.rdel); apaga(b.dataset.rdel); normalizar(); save(); drawRolos(); drawFils(); render(); });
});

// ---------- Clientes ----------
$("cAdd").onclick = () => {
  if (!$("cNome").value.trim()) { aviso($("cAdd"), "Informe o nome"); return; }
  st.clientes.push(toca(novoCliente({ nome: $("cNome").value, contato: $("cContato").value }, uid())));
  $("cNome").value = ""; $("cContato").value = "";
  save(); drawClientes(); drawCliSel();
  aviso($("cAdd"), "Cadastrado ✓");
};
function drawClientes() {
  $("cliList").innerHTML = st.clientes.length ? st.clientes.map((c) => {
    const peds = st.hist.filter((h) => h.cliente === c.id), tot = peds.reduce((t, e) => t + valoresPedido(e).receita, 0);
    return `<div class="item">
    <div class="ihead"><b>${esc(c.nome)}</b><span>${brl(tot)}</span></div>
    <div class="sub">${c.contato ? esc(c.contato) + " · " : ""}${peds.length} pedido(s)</div>
    <div class="acts"><button type="button" data-cver="${esc(c.id)}">Ver pedidos</button><button type="button" data-cdel="${esc(c.id)}">Excluir</button></div>
  </div>`;
  }).join("") : `<p class="hint" style="margin:0">Nenhum cliente cadastrado. Você também pode criar o cliente na hora de salvar um pedido.</p>`;
}
$("cliList").addEventListener("click", (e) => {
  const v = e.target.closest("[data-cver]"), x = e.target.closest("[data-cdel]");
  if (v) { Object.assign(filtro, { texto: "", status: "", periodo: "", cliente: v.dataset.cver }); ["fTexto", "fStatus", "fPeriodo"].forEach((id) => { $(id).value = ""; }); mostrar("historico"); location.hash = "historico"; window.scrollTo(0, 0); }
  // Excluir o cliente não mexe nos pedidos dele: eles continuam com o nome que tinham.
  if (x) confirma(x, () => { st.clientes = st.clientes.filter((c) => c.id !== x.dataset.cdel); apaga(x.dataset.cdel); normalizar(); save(); drawClientes(); drawCliSel(); render(); });
});

// ---------- Backup ----------
const backupTxt = () => JSON.stringify(montarBackup(st, new Date().toISOString()), null, 2);
$("bExport").onclick = async () => {
  const nome = `ligalab-calculadora-backup-${ymd(new Date())}.json`;
  try {
    const file = new File([backupTxt()], nome, { type: "application/json" });
    // No celular, a folha de compartilhamento permite "Salvar em Arquivos"; no computador, baixa direto.
    if (matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Backup Liga Lab" }); msg($("bMsg"), "Backup exportado."); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg($("bMsg"), `Arquivo ${nome} gerado. Se o download não começar, use “Copiar como texto”.`);
  } catch (e) { msg($("bMsg"), "Não foi possível gerar o arquivo. Use “Copiar como texto”.", false); }
};
$("bCopy").onclick = () => copiar(backupTxt(), $("bCopy"));
$("bFile").addEventListener("change", () => { $("bImport").disabled = !$("bFile").files.length; $("iMsg").hidden = true; });
$("bImport").onclick = () => confirma($("bImport"), async () => {
  const b = $("bImport"); delete b.dataset.c; b.textContent = "Importar e substituir";
  let res;
  try { res = lerBackup(await $("bFile").files[0].text()); } catch (e) { res = { ok: false, erro: "Não foi possível ler o arquivo." }; }
  if (!res.ok) { msg($("iMsg"), res.erro, false); return; }
  Object.keys(st).forEach((k) => delete st[k]);
  Object.assign(st, clone(DEF), res.dados); st.v = 2;
  // O backup restaurado passa a valer sobre o que estiver na nuvem.
  st.apagados = {}; st.cfgMod = Date.now();
  [...st.hist, ...st.clientes, ...st.rolos].forEach(toca);
  normalizar(); save();
  carregarCampos(); drawClientes();
  $("bFile").value = ""; b.disabled = true;
  msg($("iMsg"), `Backup importado: ${st.hist.length} pedido(s), ${st.clientes.length} cliente(s) e ${st.rolos.length} rolo(s).`);
});

// ---------- Sincronização com o Google Drive ----------
function drawNuvem(i) {
  const hora = i.ultima ? new Date(i.ultima).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const conta = i.email ? ` (${i.email})` : "";
  const textos = {
    desligada: "Desligada. Os dados ficam só neste aparelho.",
    sincronizando: "Sincronizando…",
    ok: `Em dia${conta}. Última sincronização: ${hora}.`,
    reconectar: `Pausada${conta}: o acesso ao Google vale por cerca de 1 hora. Toque em “Sincronizar agora” para continuar.`,
    erro: i.erro || "Não foi possível sincronizar.",
  };
  $("nvCard").hidden = !i.configurada; // sem ID do cliente OAuth, a seção nem aparece
  $("nvTxt").textContent = i.configurada ? textos[i.estado] : "A sincronização com o Google Drive ainda não foi configurada.";
  $("nvTxt").style.color = i.estado === "erro" ? "var(--warn)" : "";
  $("nvConectar").hidden = !i.configurada || i.estado !== "desligada";
  $("nvAgora").hidden = $("nvSair").hidden = !i.configurada || i.estado === "desligada";
  $("nvAgora").disabled = i.estado === "sincronizando";
  $("nvBar").hidden = !(i.configurada && (i.estado === "reconectar" || (i.estado === "erro" && i.ultima)));
  $("nvBar").textContent = i.estado === "erro" ? "Sincronização com erro — toque para tentar de novo" : "Sincronização pausada — toque para continuar";
}
nuvem = criarNuvem({
  clientId: GOOGLE_CLIENT_ID,
  obterDoc: () => documento(st),
  aplicarDoc: (doc) => {
    aplicando = true;
    try { aplicar(st, doc); normalizar(); carregarCampos(); drawHist(); drawResumo(); drawRolos(); drawClientes(); }
    finally { aplicando = false; }
  },
  aoMudar: drawNuvem,
});
$("nvConectar").onclick = () => nuvem.conectar();
$("nvAgora").onclick = $("nvBar").onclick = () => nuvem.agora();
$("nvSair").onclick = () => confirma($("nvSair"), () => { const b = $("nvSair"); delete b.dataset.c; b.textContent = "Desconectar"; nuvem.desconectar(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") nuvem.retomar(); });
window.addEventListener("online", () => nuvem.retomar());

// ---------- Início ----------
drawCliSel(); drawFils(); render(); mostrar(location.hash.slice(1));
nuvem.retomar();

if ("serviceWorker" in navigator) {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
}
