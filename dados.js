// Dados do app (filamentos, estoque, histórico, orçamento e backup) — sem dependência de tela.
import { num } from "./calc.js";

/** Campos que descrevem uma peça; são os guardados no histórico e restaurados ao reabrir. */
export const PECA_KEYS = ["fils", "h", "m", "qtd", "falha", "extra", "mo", "lucro", "taxa", "arred", "precoFinal", "nomePeca"];

const copia = (o) => JSON.parse(JSON.stringify(o));
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

// ---------- Filamentos e estoque ----------

/** Preço por kg de um rolo, a partir do que foi pago e do peso do rolo cheio. */
export function precoKg(rolo) {
  return num(rolo.peso) ? (num(rolo.preco) / num(rolo.peso)) * 1000 : 0;
}

/** Cria um rolo novo, cheio. Sem nome vira "<material> sem nome"; peso padrão 1000 g. */
export function novoRolo({ nome, mat, peso, preco }, id) {
  const p = num(peso) || 1000;
  const material = mat || "PLA";
  return { id, nome: String(nome || "").trim() || `${material} sem nome`, mat: material, peso: p, preco: num(preco), resto: p };
}

/** Gramas usados por rolo numa impressão: { idDoRolo: gramas }. */
function usoPorRolo(fils) {
  const uso = {};
  for (const f of fils || []) if (f.rolo) uso[f.rolo] = (uso[f.rolo] || 0) + num(f.g);
  return uso;
}

/** Devolve uma nova lista de rolos com o peso da impressão descontado (nunca abaixo de zero). */
export function baixarEstoque(rolos, fils) {
  const uso = usoPorRolo(fils);
  return (rolos || []).map((r) => (uso[r.id] ? { ...r, resto: Math.max(0, num(r.resto) - uso[r.id]) } : { ...r }));
}

/** Rolos que não têm filamento suficiente para a impressão. */
export function faltaEstoque(rolos, fils) {
  const uso = usoPorRolo(fils);
  return (rolos || [])
    .filter((r) => uso[r.id] > num(r.resto))
    .map((r) => ({ id: r.id, nome: r.nome, precisa: uso[r.id], resto: num(r.resto) }));
}

/** Rolo acabando: menos de 15% do peso original. */
export function estoqueBaixo(rolo) {
  return num(rolo.resto) < num(rolo.peso) * 0.15;
}

// ---------- Histórico ----------

/** Monta o registro de uma peça calculada. `r` é o resultado de calcular(st). */
export function entradaHistorico(st, r, { id, data, nome }) {
  const snap = {};
  for (const k of PECA_KEYS) if (st[k] !== undefined) snap[k] = copia(st[k]);
  return {
    id,
    data,
    nome: String(nome || "").trim() || "Peça sem nome",
    qtd: r.qtd,
    peso: r.peso,
    horas: r.horas,
    un: r.un,
    total: r.total,
    preco: r.precoFinal,
    snap,
  };
}

// ---------- Orçamento ----------

/** Texto de orçamento para enviar ao cliente. Não expõe custos, só preço. */
export function textoOrcamento({ cliente, peca, qtd, unit, prazo, validade, obs }) {
  const n = Math.max(1, Math.round(num(qtd)) || 1);
  const linhas = ["*LIGA LAB. — Design & Objetos*", cliente && String(cliente).trim() ? `Orçamento para ${String(cliente).trim()}` : "Orçamento", ""];
  linhas.push(`Peça: ${String(peca || "").trim() || "Impressão 3D"}`);
  linhas.push(`Quantidade: ${n}`);
  if (n > 1) linhas.push(`Valor unitário: ${brl(unit)}`);
  linhas.push(`Total: ${brl(unit * n)}`);
  if (num(prazo)) linhas.push(`Prazo de produção: ${Math.round(num(prazo))} dia(s) útil(eis)`);
  if (num(validade)) linhas.push(`Validade do orçamento: ${Math.round(num(validade))} dia(s)`);
  if (obs && String(obs).trim()) linhas.push("", String(obs).trim());
  linhas.push("", "_Uma ideia começa aqui._");
  return linhas.join("\n");
}

// ---------- Backup ----------

const APP_ID = "ligalab-calc3d";

/** Empacota todos os dados do app para exportar. */
export function montarBackup(st, agora) {
  return { app: APP_ID, versao: 1, exportadoEm: agora, dados: copia(st) };
}

/** Lê e valida um backup. Devolve { ok: true, dados } ou { ok: false, erro }. */
export function lerBackup(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch (e) {
    return { ok: false, erro: "O arquivo não é um backup válido (não é JSON)." };
  }
  if (!obj || typeof obj !== "object" || obj.app !== APP_ID) return { ok: false, erro: "Este arquivo não é um backup da calculadora Liga Lab." };
  const d = obj.dados;
  if (!d || typeof d !== "object" || !Array.isArray(d.fils)) return { ok: false, erro: "O backup está incompleto ou corrompido." };
  for (const k of ["rolos", "hist"]) if (d[k] !== undefined && !Array.isArray(d[k])) return { ok: false, erro: "O backup está incompleto ou corrompido." };
  return { ok: true, dados: d };
}
