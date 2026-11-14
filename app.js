// Tela do app: liga os campos aos cálculos (calc.js) e aos dados (dados.js).
import { num, calcular, tabelaQuantidade, precoLote } from "./calc.js";
import {
  PECA_KEYS, precoKg, novoRolo, baixarEstoque, faltaEstoque, estoqueBaixo,
  entradaHistorico, textoOrcamento, montarBackup, lerBackup,
} from "./dados.js";

const PRESETS = { PLA: 120, PETG: 130, ASA: 160, TPU: 170, Outro: 150 };
const DEF = {
  h: "2", m: "30", qtd: "1", falha: "5", extra: "0", mo: "10", vh: "30", lucro: "50", taxa: "0", arred: "nenhum",
  w: "150", kwh: "1,00", pimp: "10000", vida: "5000", manut: "0,50", precoFinal: "", nomePeca: "", v: 2,
  fils: [{ rolo: "", mat: "PLA", g: "80", kg: "120" }], rolos: [], hist: [],
  orc: { cliente: "", qtd: "", prazo: "5", validade: "7", obs: "" },
};
const IDS = ["h", "m", "qtd", "falha", "extra", "mo", "vh", "lucro", "taxa", "arred", "w", "kwh", "pimp", "vida", "manut", "precoFinal", "nomePeca"];
const ORC = { orcCliente: "cliente", orcQtd: "qtd", orcPrazo: "prazo", orcValidade: "validade", orcObs: "obs" };
const TABS = ["calcular", "historico", "filamentos", "dados"];
const KEY = "ligalab-calc3d-v1";

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dec = (n, d = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const campo = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const tempo = (horas) => { const min = Math.round(horas * 60); return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`; };
const dia = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR"); };

// ---------- Estado ----------
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
const st = Object.assign(clone(DEF), saved);
// v2: novos valores padrão de impressora e tarifa valem também para quem já tinha dados salvos.
if (saved.v !== 2) { st.pimp = DEF.pimp; st.kwh = DEF.kwh; st.v = 2; }
normalizar();

function normalizar() {
  if (!Array.isArray(st.fils) || !st.fils.length) st.fils = clone(DEF.fils);
  if (!Array.isArray(st.rolos)) st.rolos = [];
  if (!Array.isArray(st.hist)) st.hist = [];
  st.orc = Object.assign(clone(DEF.orc), st.orc && typeof st.orc === "object" ? st.orc : {});
  st.fils.forEach((f) => { if (!f.rolo || !st.rolos.some((r) => r.id === f.rolo)) f.rolo = ""; });
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

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

// ---------- Abas ----------
function mostrar(tab) {
  if (!TABS.includes(tab)) tab = "calcular";
  document.querySelectorAll("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== tab; });
  document.querySelectorAll("nav [data-tab]").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (tab === "historico") drawHist();
  if (tab === "filamentos") drawRolos();
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
    else { f.rolo = ""; f.mat = val; f.kg = String(PRESETS[val] ?? PRESETS.Outro); }
    drawFils();
  } else f[k] = t.value;
  render();
});
$("fils").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]"); if (!b || st.fils.length < 2) return;
  st.fils.splice(+b.dataset.del, 1); drawFils(); render();
});
$("addFil").onclick = () => { st.fils.push({ rolo: "", mat: "PLA", g: "", kg: String(PRESETS.PLA) }); drawFils(); render(); };

IDS.forEach((id) => { $(id).value = st[id] ?? ""; $(id).addEventListener("input", () => { st[id] = $(id).value; render(); }); });
Object.entries(ORC).forEach(([id, k]) => { $(id).value = st.orc[k] ?? ""; $(id).addEventListener("input", () => { st.orc[k] = $(id).value; drawOrc(); save(); }); });

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

  const falta = faltaEstoque(st.rolos, st.fils);
  $("faltaTxt").hidden = !falta.length;
  $("faltaTxt").textContent = falta.map((f) => `${f.nome}: a peça pede ${dec(f.precisa, 0)} g e restam ${dec(f.resto, 0)} g.`).join(" ");
  $("baixarBox").hidden = !st.fils.some((f) => f.rolo);

  last = { parts, r, manual };
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
$("reset").onclick = () => {
  ["h", "m", "extra", "mo"].forEach((id) => { st[id] = "0"; });
  st.qtd = "1"; st.precoFinal = ""; st.nomePeca = "";
  st.fils = [{ rolo: "", mat: "PLA", g: "", kg: String(PRESETS.PLA) }];
  carregarCampos();
};
function carregarCampos() {
  IDS.forEach((id) => { $(id).value = st[id] ?? ""; });
  drawFils(); render();
}

// ---------- Orçamento ----------
function drawOrc() {
  const { r, manual } = last; if (!r) return;
  const qtd = Math.max(1, Math.round(num(st.orc.qtd)) || r.qtd);
  $("orcQtd").placeholder = String(r.qtd);
  const unit = manual ? r.precoFinal : precoLote(st, qtd).preco;
  const txt = textoOrcamento({ cliente: st.orc.cliente, peca: st.nomePeca, qtd, unit, prazo: st.orc.prazo, validade: st.orc.validade, obs: st.orc.obs });
  $("orcTxt").value = txt;
  $("orcWa").href = "https://wa.me/?text=" + encodeURIComponent(txt);
}
$("abrirOrc").onclick = () => { const b = $("orcBox"); b.hidden = !b.hidden; if (!b.hidden) { drawOrc(); b.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
$("orcCopy").onclick = () => copiar($("orcTxt").value, $("orcCopy"));

// ---------- Histórico ----------
$("salvar").onclick = () => {
  const { r } = last;
  st.hist.unshift(entradaHistorico(st, r, { id: uid(), data: new Date().toISOString(), nome: st.nomePeca }));
  const baixou = !$("baixarBox").hidden && $("baixar").checked;
  if (baixou) { st.rolos = baixarEstoque(st.rolos, st.fils); drawFils(); }
  render();
  aviso($("salvar"), baixou ? "Salvo e estoque atualizado ✓" : "Salvo ✓");
};
function drawHist() {
  $("histTit").textContent = st.hist.length ? `Peças salvas (${st.hist.length})` : "Peças salvas";
  $("histList").innerHTML = st.hist.length ? st.hist.map((e) => `<div class="item">
    <div class="ihead"><b>${esc(e.nome)}</b><span>${brl(num(e.preco))}</span></div>
    <div class="sub">${dia(e.data)} · ${esc(e.qtd)} peça(s) · ${dec(num(e.peso))} g · ${tempo(num(e.horas))} · custo ${brl(num(e.un))} por peça</div>
    <div class="acts"><button type="button" data-abrir="${esc(e.id)}">Reabrir na calculadora</button><button type="button" data-excluir="${esc(e.id)}">Excluir</button></div>
  </div>`).join("") : `<p class="hint" style="margin:0">Nenhuma peça salva ainda. Na aba Calcular, dê um nome à peça e toque em “Salvar no histórico”.</p>`;
}
$("histList").addEventListener("click", (e) => {
  const a = e.target.closest("[data-abrir]"), x = e.target.closest("[data-excluir]");
  if (a) {
    const it = st.hist.find((h) => h.id === a.dataset.abrir); if (!it || !it.snap) return;
    PECA_KEYS.forEach((k) => { if (it.snap[k] !== undefined) st[k] = clone(it.snap[k]); });
    normalizar(); carregarCampos(); mostrar("calcular"); location.hash = "calcular"; window.scrollTo(0, 0);
  }
  if (x) confirma(x, () => { st.hist = st.hist.filter((h) => h.id !== x.dataset.excluir); save(); drawHist(); });
});

// ---------- Filamentos ----------
$("rMat").innerHTML = Object.keys(PRESETS).map((p) => `<option>${p}</option>`).join("");
$("rAdd").onclick = () => {
  if (!$("rNome").value.trim() && !num($("rPreco").value)) { aviso($("rAdd"), "Preencha nome e preço"); return; }
  st.rolos.push(novoRolo({ nome: $("rNome").value, mat: $("rMat").value, peso: $("rPeso").value, preco: $("rPreco").value }, uid()));
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
  r.resto = num(e.target.value); save(); drawRolos(); drawFils(); render();
});
$("roloList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rdel]"); if (!b) return;
  confirma(b, () => { st.rolos = st.rolos.filter((r) => r.id !== b.dataset.rdel); normalizar(); save(); drawRolos(); drawFils(); render(); });
});

// ---------- Backup ----------
const msg = (el, txt, ok = true) => { el.hidden = false; el.textContent = txt; el.style.color = ok ? "" : "var(--warn)"; };
const backupTxt = () => JSON.stringify(montarBackup(st, new Date().toISOString()), null, 2);
$("bExport").onclick = async () => {
  const nome = `ligalab-calculadora-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
  normalizar(); save();
  Object.entries(ORC).forEach(([id, k]) => { $(id).value = st.orc[k] ?? ""; });
  carregarCampos(); drawHist(); drawRolos();
  $("bFile").value = ""; b.disabled = true;
  msg($("iMsg"), `Backup importado: ${st.hist.length} peça(s) no histórico e ${st.rolos.length} rolo(s).`);
});

// ---------- Início ----------
drawFils(); render(); mostrar(location.hash.slice(1));

if ("serviceWorker" in navigator) {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
}
