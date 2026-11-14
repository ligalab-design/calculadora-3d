// Sincronização: o que vai para a nuvem e como juntar os dados de dois aparelhos.
// Sem dependência de tela nem de rede.

/** Ajustes sincronizados. O rascunho da peça em edição fica só no aparelho. */
// "padrao" guarda os padrões para novos pedidos (margem, tempo de trabalho e preço por material).
export const CFG_KEYS = ["falha", "vh", "taxa", "arred", "w", "kwh", "pimp", "vida", "manut", "padrao"];
const LISTAS = ["rolos", "clientes", "hist"];
const APP_ID = "ligalab-calc3d-sync";

const copia = (o) => JSON.parse(JSON.stringify(o));
const lista = (v) => (Array.isArray(v) ? v : []);
const mapa = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** Monta o documento sincronizado a partir do estado do app. */
export function documento(st) {
  const cfg = {};
  for (const k of CFG_KEYS) if (st[k] !== undefined) cfg[k] = st[k];
  return copia({
    app: APP_ID, versao: 1,
    cfg, cfgMod: Number(st.cfgMod) || 0,
    rolos: lista(st.rolos), clientes: lista(st.clientes), hist: lista(st.hist),
    apagados: mapa(st.apagados),
  });
}

/** Grava um documento sincronizado no estado do app (sem tocar no rascunho da peça). */
export function aplicar(st, doc) {
  for (const k of CFG_KEYS) if (doc.cfg && doc.cfg[k] !== undefined) st[k] = copia(doc.cfg[k]);
  st.cfgMod = Number(doc.cfgMod) || 0;
  for (const k of LISTAS) st[k] = copia(lista(doc[k]));
  st.apagados = copia(mapa(doc.apagados));
  return st;
}

/** Lê e valida o arquivo da nuvem. Devolve { ok: true, doc } ou { ok: false, erro }. */
export function lerDocumento(texto) {
  let o;
  try { o = JSON.parse(texto); } catch (e) { return { ok: false, erro: "O arquivo no Drive não pôde ser lido." }; }
  if (!o || typeof o !== "object" || o.app !== APP_ID) return { ok: false, erro: "O arquivo no Drive não é desta calculadora." };
  for (const k of LISTAS) if (o[k] !== undefined && !Array.isArray(o[k])) return { ok: false, erro: "O arquivo no Drive está corrompido." };
  return { ok: true, doc: { app: APP_ID, versao: 1, cfg: mapa(o.cfg), cfgMod: Number(o.cfgMod) || 0, rolos: lista(o.rolos), clientes: lista(o.clientes), hist: lista(o.hist), apagados: mapa(o.apagados) } };
}

const mod = (it) => Number(it && it.mod) || 0;
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const porId = (x, y) => cmp(String(x.id), String(y.id)); // ids começam pelo instante de criação

/** Junta duas listas por id: vale a versão alterada por último; itens apagados depois da última alteração somem. */
function juntar(a, b, apagados) {
  const porId = new Map(), ordem = [];
  for (const it of [...lista(a), ...lista(b)]) {
    if (!it || it.id == null) continue;
    const atual = porId.get(it.id);
    if (!atual) { porId.set(it.id, it); ordem.push(it.id); } else if (mod(it) > mod(atual)) porId.set(it.id, it);
  }
  return ordem.map((id) => porId.get(id)).filter((it) => !(it.id in apagados && apagados[it.id] >= mod(it)));
}

/**
 * Junta os dados locais (a) com os da nuvem (b).
 * - Pedidos, clientes e rolos: une os dois lados; se o mesmo item mudou nos dois, vale a alteração mais recente.
 * - Exclusões valem dos dois lados, a menos que o item tenha sido alterado depois de apagado.
 * - Ajustes: vale o conjunto alterado por último.
 * Devolve { doc, mudouA, mudouB }: se o resultado difere do lado local e do lado da nuvem.
 */
export function mesclar(a, b) {
  const apagados = { ...mapa(a.apagados) };
  for (const [id, t] of Object.entries(mapa(b.apagados))) apagados[id] = Math.max(Number(apagados[id]) || 0, Number(t) || 0);
  const cfgDeB = (Number(b.cfgMod) || 0) > (Number(a.cfgMod) || 0);
  const doc = copia({
    app: APP_ID, versao: 1,
    cfg: cfgDeB ? mapa(b.cfg) : mapa(a.cfg),
    cfgMod: Math.max(Number(a.cfgMod) || 0, Number(b.cfgMod) || 0),
    // Ordem determinística (igual em todos os aparelhos): cadastros por criação, pedidos do mais recente ao mais antigo.
    rolos: juntar(a.rolos, b.rolos, apagados).sort(porId),
    clientes: juntar(a.clientes, b.clientes, apagados).sort(porId),
    hist: juntar(a.hist, b.hist, apagados).sort((x, y) => cmp(String(y.data || ""), String(x.data || "")) || porId(x, y)),
    apagados,
  });
  const igual = (x) => JSON.stringify(normal(x)) === JSON.stringify(doc);
  return { doc, mudouA: !igual(a), mudouB: !igual(b) };
}

/** Mesma forma e ordem de chaves do documento mesclado, para comparar. */
function normal(d) {
  return copia({ app: APP_ID, versao: 1, cfg: mapa(d.cfg), cfgMod: Number(d.cfgMod) || 0, rolos: lista(d.rolos), clientes: lista(d.clientes), hist: lista(d.hist), apagados: mapa(d.apagados) });
}
