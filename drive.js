// Acesso ao Google: login (Google Identity Services) e um arquivo no Google Drive.
// O app pede só a permissão "drive.file": enxerga apenas os arquivos que ele mesmo criou.

export const ESCOPO = "https://www.googleapis.com/auth/drive.file";
export const NOME_ARQUIVO = "Liga Lab Calculadora 3D - dados.json";
const API = "https://www.googleapis.com/drive/v3";
const ENVIO = "https://www.googleapis.com/upload/drive/v3/files";

let gis = null;
/** Carrega a biblioteca de login do Google (uma vez). */
export function carregarLogin() {
  if (gis) return gis;
  gis = new Promise((ok, falha) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => (window.google && window.google.accounts && window.google.accounts.oauth2 ? ok() : falha(new Error("login indisponível")));
    s.onerror = () => { gis = null; falha(new Error("login indisponível")); };
    document.head.appendChild(s);
  });
  return gis;
}

/**
 * Pede um token de acesso (vale cerca de 1 hora). Abre uma janela do Google, por isso
 * precisa ser chamado a partir de um toque do usuário.
 * `email` evita a escolha de conta; `consentir` força a tela de permissão (primeira conexão).
 */
export async function pedirToken({ clientId, email, consentir }) {
  await carregarLogin();
  return new Promise((ok, falha) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: ESCOPO, hint: email || undefined, prompt: consentir ? "consent" : "",
      callback: (r) => (r && r.access_token
        ? ok({ token: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 })
        : falha(Object.assign(new Error("login recusado"), { recusado: true }))),
      error_callback: (e) => falha(Object.assign(new Error("login cancelado"), { cancelado: true, tipo: e && e.type })),
    });
    cliente.requestAccessToken();
  });
}

async function chamar(url, token, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) } });
  if (!r.ok) throw Object.assign(new Error("Drive respondeu " + r.status), { status: r.status });
  return r;
}

/** E-mail da conta conectada (ou "" se não der para saber). */
export async function emailDaConta(token) {
  try { return (await (await chamar(`${API}/about?fields=user(emailAddress)`, token)).json()).user.emailAddress || ""; }
  catch (e) { return ""; }
}

/** Procura o arquivo de dados criado pelo app. Devolve o id ou null. */
export async function acharArquivo(token) {
  const q = encodeURIComponent(`name='${NOME_ARQUIVO}' and trashed=false`);
  const r = await chamar(`${API}/files?q=${q}&fields=files(id)&orderBy=modifiedTime%20desc&pageSize=1&spaces=drive`, token);
  const lista = (await r.json()).files || [];
  return lista.length ? lista[0].id : null;
}

/** Baixa o conteúdo do arquivo. Devolve null se ele não existir mais. */
export async function baixarArquivo(token, id) {
  try { return await (await chamar(`${API}/files/${encodeURIComponent(id)}?alt=media`, token, { cache: "no-store" })).text(); }
  catch (e) { if (e.status === 404) return null; throw e; }
}

/** Cria o arquivo de dados no Drive e devolve o id. */
export async function criarArquivo(token, texto) {
  const limite = "ligalab" + Date.now().toString(36);
  const corpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NOME_ARQUIVO, mimeType: "application/json" })}\r\n` +
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${texto}\r\n--${limite}--`;
  const r = await chamar(`${ENVIO}?uploadType=multipart&fields=id`, token, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body: corpo });
  return (await r.json()).id;
}

/** Substitui o conteúdo do arquivo de dados. */
export async function gravarArquivo(token, id, texto) {
  await chamar(`${ENVIO}/${encodeURIComponent(id)}?uploadType=media`, token, { method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: texto });
}
