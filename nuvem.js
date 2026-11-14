// Motor da sincronização: decide quando baixar, juntar e enviar os dados.
import { mesclar, lerDocumento } from "./sync.js";
import { pedirToken, emailDaConta, acharArquivo, baixarArquivo, criarArquivo, gravarArquivo } from "./drive.js";

const K_CFG = "ligalab-calc3d-nuvem", K_TOKEN = "ligalab-calc3d-token";
const ler = (area, k) => { try { return JSON.parse(area.getItem(k) || "null"); } catch (e) { return null; } };
const gravar = (area, k, v) => { try { v == null ? area.removeItem(k) : area.setItem(k, JSON.stringify(v)); } catch (e) {} };

/**
 * clientId: ID do cliente OAuth · obterDoc(): documento local · aplicarDoc(doc): grava o resultado no app ·
 * aoMudar(info): avisa a tela. info.estado: "desligada" | "ok" | "sincronizando" | "reconectar" | "erro".
 */
export function criarNuvem({ clientId, obterDoc, aplicarDoc, aoMudar }) {
  const cfg = Object.assign({ on: false, fileId: null, email: "", ultima: 0 }, ler(localStorage, K_CFG) || {});
  // O token fica só na memória da sessão (some ao fechar o app) e vale cerca de 1 hora.
  let token = ler(sessionStorage, K_TOKEN), rodando = false, pendente = false, relogio = null, estado = cfg.on ? "reconectar" : "desligada", erro = "";

  const tokenValido = () => !!(token && token.expira - 60000 > Date.now());
  const guardar = () => gravar(localStorage, K_CFG, cfg);
  const avisar = (e, msg = "") => { estado = e; erro = msg; aoMudar(info()); };
  const info = () => ({ estado, erro, email: cfg.email, ultima: cfg.ultima, configurada: !!clientId });

  async function obterToken(interativo, consentir) {
    if (tokenValido()) return token.token;
    if (!interativo) throw Object.assign(new Error("precisa de um toque"), { precisaToque: true });
    token = await pedirToken({ clientId, email: cfg.email, consentir });
    gravar(sessionStorage, K_TOKEN, token);
    return token.token;
  }

  /** Baixa, junta e envia. `interativo` = veio de um toque (pode abrir a janela do Google). */
  async function sincronizar({ interativo = false, consentir = false } = {}) {
    if (!cfg.on || !clientId) return;
    if (rodando) { pendente = true; return; }
    rodando = true; avisar("sincronizando");
    try {
      const t = await obterToken(interativo, consentir);
      if (!cfg.email) cfg.email = await emailDaConta(t);
      let id = cfg.fileId || (await acharArquivo(t));
      let texto = id ? await baixarArquivo(t, id) : null;
      if (id && texto == null) { // o arquivo conhecido sumiu; procura outro
        id = await acharArquivo(t);
        texto = id ? await baixarArquivo(t, id) : null;
        if (texto == null) id = null;
      }
      let remoto = null;
      if (texto != null) {
        const r = lerDocumento(texto);
        if (!r.ok) throw Object.assign(new Error(r.erro), { legivel: true });
        remoto = r.doc;
      }
      const local = obterDoc();
      const m = remoto ? mesclar(local, remoto) : { doc: local, mudouA: false, mudouB: true };
      if (m.mudouA) aplicarDoc(m.doc);
      if (m.mudouB) { const texto = JSON.stringify(m.doc); if (id) await gravarArquivo(t, id, texto); else id = await criarArquivo(t, texto); }
      cfg.fileId = id; cfg.ultima = Date.now(); guardar();
      avisar("ok");
    } catch (e) {
      if (e.status === 401) { token = null; gravar(sessionStorage, K_TOKEN, null); avisar("reconectar"); }
      else if (e.precisaToque) avisar("reconectar");
      else if (e.cancelado || e.recusado) avisar(cfg.ultima ? "reconectar" : "erro", "A conexão com o Google não foi concluída.");
      else avisar("erro", e.legivel ? e.message : navigator.onLine === false ? "Sem internet. Os dados ficam salvos no aparelho e sobem depois." : "Não foi possível falar com o Google Drive. Tente de novo.");
    } finally {
      rodando = false;
      if (pendente) { pendente = false; agendar(); }
    }
  }

  /** Marca que há alterações locais; envia em alguns segundos se houver login válido. */
  function agendar(ms = 4000) {
    if (!cfg.on || !clientId) return;
    clearTimeout(relogio);
    relogio = setTimeout(() => { if (tokenValido()) sincronizar(); else if (estado !== "sincronizando") avisar("reconectar"); }, ms);
  }

  return {
    info,
    agendar,
    /** Sincroniza agora, a partir de um toque. */
    agora: () => sincronizar({ interativo: true }),
    /** Liga a sincronização e pede a permissão do Google (precisa vir de um toque). */
    async conectar() { cfg.on = true; guardar(); await sincronizar({ interativo: true, consentir: !cfg.ultima }); if (estado === "erro" && !cfg.ultima) { cfg.on = false; guardar(); } },
    /** Desliga a sincronização neste aparelho. O arquivo no Drive e os dados locais ficam como estão. */
    desconectar() {
      clearTimeout(relogio);
      if (token && window.google && window.google.accounts) { try { window.google.accounts.oauth2.revoke(token.token, () => {}); } catch (e) {} }
      token = null; gravar(sessionStorage, K_TOKEN, null);
      Object.assign(cfg, { on: false, fileId: null, email: "", ultima: 0 }); guardar();
      avisar("desligada");
    },
    /** Ao abrir o app ou voltar para ele: sincroniza se o login ainda vale; senão, pede um toque. */
    retomar() { if (!cfg.on || !clientId) return aoMudar(info()); if (tokenValido()) sincronizar(); else avisar("reconectar"); },
  };
}
