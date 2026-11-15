// Dados do app (filamentos, estoque, histórico, orçamento e backup) — sem dependência de tela.
import { num } from "./calc.js";

/** Campos que descrevem uma peça; são os guardados no histórico e restaurados ao reabrir. */
export const PECA_KEYS = ["fils", "h", "m", "qtd", "falha", "extra", "mo", "lucro", "taxa", "arred", "precoFinal", "nomePeca", "dims", "cores"];

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

/**
 * Devolve o rolo com os campos editados. Nome vazio e peso inválido mantêm o valor anterior;
 * o peso restante pode ser informado à parte (não é recalculado ao mudar o peso do rolo).
 */
export function editarRolo(rolo, { nome, mat, peso, preco, resto }) {
  const novo = { ...rolo };
  if (String(nome ?? "").trim()) novo.nome = String(nome).trim();
  if (mat) novo.mat = mat;
  if (num(peso)) novo.peso = num(peso);
  if (preco !== undefined && String(preco).trim() !== "") novo.preco = num(preco);
  if (resto !== undefined && String(resto).trim() !== "") novo.resto = num(resto);
  return novo;
}

/** Cópia de um rolo, cheia e com novo id — para cadastrar outro parecido (outra cor, por exemplo). */
export function duplicarRolo(rolo, id) {
  const { mod, ...resto } = rolo; // a marca de alteração é do novo rolo, não a do original
  return { ...resto, id, resto: num(rolo.peso) };
}

/** Gramas usados por rolo numa impressão: { idDoRolo: gramas }. */
function usoPorRolo(fils) {
  const uso = {};
  for (const f of fils || []) if (f.rolo) uso[f.rolo] = (uso[f.rolo] || 0) + num(f.g);
  return uso;
}

/**
 * Devolve uma nova lista de rolos com o peso da impressão descontado (nunca abaixo de zero).
 * `fator` multiplica o consumo: pedido de 10 peças com 2 por mesa = fator 5.
 */
export function baixarEstoque(rolos, fils, fator = 1) {
  const uso = usoPorRolo(fils);
  const f = fator > 0 ? fator : 1;
  return (rolos || []).map((r) => (uso[r.id] ? { ...r, resto: Math.max(0, num(r.resto) - uso[r.id] * f) } : { ...r }));
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

// ---------- Clientes ----------

export function novoCliente({ nome, contato }, id) {
  return { id, nome: String(nome || "").trim() || "Cliente sem nome", contato: String(contato || "").trim() };
}

// ---------- Pedidos (histórico) ----------

/** Situações de um pedido, na ordem do fluxo. O pagamento é uma marca à parte (pago / não pago). */
export const STATUS = [["orcado", "Orçado"], ["aprovado", "Aprovado"], ["producao", "Em produção"], ["pronto", "Pronto"], ["entregue", "Entregue"]];
/** Situações que contam como venda (orçamento ainda não aprovado não conta, a menos que já esteja pago). */
export const VENDIDO = ["aprovado", "producao", "pronto", "entregue"];
/** Situações a partir das quais o filamento do pedido é descontado dos rolos. */
export const CONSOME = ["pronto", "entregue"];

/** Situação do pedido. Registros antigos com a situação "pago" contam como entregues. */
export const statusDe = (e) => { const s = e && e.status; return s === "pago" ? "entregue" : STATUS.some(([x]) => x === s) ? s : "orcado"; };
/**
 * O pedido está pago? Um pedido em "Orçado" nunca está pago: o pagamento só existe de Aprovado em diante.
 * Registros antigos com a situação "pago" contam como pagos.
 */
export const pagoDe = (e) => !!e && statusDe(e) !== "orcado" && (e.pago === true || (e.pago === undefined && e.status === "pago"));
/** Conta como venda: aprovado em diante. */
export const vendido = (e) => VENDIDO.includes(statusDe(e));

/** Todos os filamentos com peso são rolos cadastrados que ainda existem (e há pelo menos um). */
export function filamentosDefinidos(fils, rolos) {
  const usados = (Array.isArray(fils) ? fils : []).filter((f) => f && num(f.g) > 0);
  return usados.length > 0 && usados.every((f) => f.rolo && (rolos || []).some((r) => r.id === f.rolo));
}

/**
 * Confere se um pedido pode ficar na situação `para`. Devolve "" se pode, ou o motivo da recusa:
 * - "rolo": fora de "Orçado", todos os filamentos precisam ser rolos cadastrados;
 * - "pago": um pedido pago não volta para "Orçado" (é preciso desmarcar o pagamento antes).
 */
export function verificarSituacao({ para, fils, rolos, pago }) {
  if (statusDe({ status: para }) === "orcado") return pago ? "pago" : "";
  return filamentosDefinidos(fils, rolos) ? "" : "rolo";
}

/**
 * Traz um pedido antigo para o formato atual: situação válida, marca de pago e marca de estoque descontado.
 * Pedidos de antes da marca de estoque contam como ainda não descontados: descontam ao virar Pronto.
 */
export function atualizarPedido(e) {
  return { ...e, status: statusDe(e), pago: pagoDe(e), consumido: e.consumido === true };
}

/**
 * Contabiliza de novo o filamento de peças refeitas (defeito, reimpressão): desconta dos rolos o
 * filamento de `pecas` peças e registra no pedido. Com `reduzirLucro`, soma o custo dessas peças
 * ao pedido, o que diminui o lucro dele. Devolve { rolos, pedido } novos, ou null se não há o que fazer.
 */
export function reimprimir(rolos, pedido, pecas, reduzirLucro) {
  const n = Math.round(num(pecas));
  if (!pedido || !(n > 0)) return null;
  const qtdMesa = Math.max(1, Math.round(num(pedido.qtd)) || 1);
  return {
    rolos: baixarEstoque(rolos, (pedido.snap && pedido.snap.fils) || [], n / qtdMesa),
    pedido: { ...pedido, refeitas: (Math.round(num(pedido.refeitas)) || 0) + n, custoExtra: num(pedido.custoExtra) + (reduzirLucro ? num(pedido.un) * n : 0) },
  };
}

/**
 * Desconta dos rolos o filamento de um pedido Pronto ou Entregue — uma única vez.
 * Devolve { rolos, consumiu }; quem chama marca o pedido como consumido quando consumiu for true.
 */
export function consumirEstoque(rolos, pedido) {
  if (!pedido || pedido.consumido || !CONSOME.includes(statusDe(pedido))) return { rolos, consumiu: false };
  const qtdMesa = Math.max(1, Math.round(num(pedido.qtd)) || 1);
  const pecas = Math.max(1, Math.round(num(pedido.vendidas)) || qtdMesa);
  return { rolos: baixarEstoque(rolos, (pedido.snap && pedido.snap.fils) || [], pecas / qtdMesa), consumiu: true };
}

const diaDe = (e) => String(e.dia || e.data || "").slice(0, 10);
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Números de um pedido: peças, receita, lucro e filamento gasto (g). Aceita registros antigos. */
export function valoresPedido(e) {
  const qtdMesa = Math.max(1, Math.round(num(e.qtd)) || 1);
  const pecas = Math.max(1, Math.round(num(e.vendidas)) || qtdMesa);
  const preco = num(e.preco), taxa = Math.min(num(e.taxa), 0.95);
  return {
    pecas,
    receita: preco * pecas,
    lucro: (preco * (1 - taxa) - num(e.un)) * pecas - num(e.custoExtra), // custoExtra: peças refeitas que reduziram o lucro
    filamento: (num(e.peso) / qtdMesa) * pecas,
  };
}

/**
 * Filtra pedidos. Todos os filtros são opcionais:
 * texto (nome da peça ou do cliente, sem diferenciar acentos), status, cliente (id),
 * pago ("sim" ou "nao"), de / ate (datas "AAAA-MM-DD", inclusive).
 */
export function filtrarHistorico(hist, { texto, status, cliente, pago, de, ate } = {}) {
  const t = semAcento(texto).trim();
  return (hist || []).filter((e) => {
    if (t && !semAcento(e.nome).includes(t) && !semAcento(e.clienteNome).includes(t)) return false;
    if (status && statusDe(e) !== status) return false;
    if (pago === "sim" && !pagoDe(e)) return false;
    if (pago === "nao" && pagoDe(e)) return false;
    if (cliente && e.cliente !== cliente) return false;
    const d = diaDe(e);
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    return true;
  });
}

/** Resumo de vendas por mês (mais recente primeiro) e no total. Conta pedidos aprovados em diante e os já pagos. */
export function resumoVendas(hist) {
  const zero = () => ({ pedidos: 0, pecas: 0, receita: 0, lucro: 0, filamento: 0, aReceber: 0 });
  const meses = {}, total = zero();
  for (const e of hist || []) {
    if (!vendido(e)) continue;
    const v = valoresPedido(e), mes = diaDe(e).slice(0, 7);
    for (const alvo of [meses[mes] || (meses[mes] = { mes, ...zero() }), total]) {
      alvo.pedidos += 1; alvo.pecas += v.pecas; alvo.receita += v.receita; alvo.lucro += v.lucro; alvo.filamento += v.filamento;
      if (!pagoDe(e)) alvo.aReceber += v.receita;
    }
  }
  return { meses: Object.values(meses).sort((a, b) => (a.mes < b.mes ? 1 : -1)), total };
}


/**
 * Monta o registro de um pedido. `r` é o resultado de calcular(st).
 * `vendidas` é a quantidade do pedido; `preco` e `un` são por peça e, se omitidos, vêm de `r`.
 */
export function entradaHistorico(st, r, { id, data, dia, nome, cliente, clienteNome, status, pago, consumido, refeitas, custoExtra, vendidas, preco, un }) {
  const snap = {};
  for (const k of PECA_KEYS) if (st[k] !== undefined) snap[k] = copia(st[k]);
  return {
    id,
    data,
    dia: dia || String(data || "").slice(0, 10),
    nome: String(nome || "").trim() || "Peça sem nome",
    cliente: cliente || "",
    clienteNome: String(clienteNome || "").trim(),
    status: statusDe({ status }),
    pago: pagoDe({ status, pago }),
    consumido: consumido === true,
    refeitas: Math.round(num(refeitas)) || 0,
    custoExtra: num(custoExtra),
    qtd: r.qtd,
    vendidas: Math.max(1, Math.round(num(vendidas)) || r.qtd),
    peso: r.peso,
    horas: r.horas,
    un: un ?? r.un,
    total: r.total,
    taxa: r.taxa,
    preco: preco ?? r.precoFinal,
    snap,
  };
}

/**
 * Atualiza os campos de uma peça (snap de um pedido) com os valores de hoje, para duplicar:
 * margem padrão, preço atual dos filamentos (do rolo, se ainda existir; senão o padrão do material)
 * e sem preço definido à mão — o preço volta a ser o sugerido.
 */
export function atualizarPeca(snap, { lucro, precos, rolos }) {
  const p = copia(snap || {});
  p.lucro = String(lucro ?? p.lucro ?? "");
  p.precoFinal = "";
  p.fils = (Array.isArray(p.fils) ? p.fils : []).map((f) => {
    const rolo = (rolos || []).find((r) => r.id === f.rolo);
    if (rolo) return { ...f, mat: rolo.mat, kg: precoKg(rolo).toFixed(2).replace(".", ",") };
    const padrao = precos && precos[f.mat];
    return { ...f, rolo: "", kg: padrao !== undefined && padrao !== "" ? String(padrao) : f.kg };
  });
  return p;
}

// ---------- Orçamento ----------

/** Texto de orçamento para enviar ao cliente. Não expõe custos, só preço. */
export function textoOrcamento({ cliente, peca, dims, cores, qtd, unit, prazo, validade, obs }) {
  const n = Math.max(1, Math.round(num(qtd)) || 1);
  const linhas = ["*LIGA LAB. — Design & Objetos*", cliente && String(cliente).trim() ? `Orçamento para ${String(cliente).trim()}` : "Orçamento", ""];
  linhas.push(`Peça: ${String(peca || "").trim() || "Impressão 3D"}`);
  const d = String(dims || "").trim(), c = String(cores || "").trim();
  if (d) linhas.push(`Dimensões: ${d}`);
  if (c) linhas.push(`${/,| e /.test(c) ? "Cores" : "Cor"}: ${c}`);
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
  for (const k of ["rolos", "hist", "clientes"]) if (d[k] !== undefined && !Array.isArray(d[k])) return { ok: false, erro: "O backup está incompleto ou corrompido." };
  return { ok: true, dados: d };
}
