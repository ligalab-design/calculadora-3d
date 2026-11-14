// Importação de arquivos fatiados (Bambu Studio, OrcaSlicer, PrusaSlicer):
// peso, tempo e, quando o arquivo traz, cores e dimensões. Sem dependência de tela.
import { listarZip, extrairTexto, extrairInicio } from "./zip.js";

const numero = (t) => { const n = parseFloat(String(t).trim()); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Converte "1d 2h 3m 4s" em segundos. Texto sem unidade de tempo vira 0. */
export function segundos(txt) {
  const fator = { d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  for (const [, n, u] of String(txt ?? "").matchAll(/(\d+(?:\.\d+)?)\s*([dhms])(?![a-z])/g)) total += parseFloat(n) * fator[u];
  return Math.round(total);
}

/** Reduz o tipo de filamento do fatiador ("PLA Basic", "PETG-CF"…) aos materiais do app. */
export function material(tipo) {
  const t = String(tipo ?? "").toUpperCase();
  for (const m of ["PETG", "PLA", "ASA", "TPU"]) if (t.includes(m)) return m;
  return "Outro";
}

/**
 * Nome aproximado, em português, de uma cor "#RRGGBB" (ou "#RRGGBBAA").
 * É uma estimativa pela tonalidade; devolve "" se o texto não for uma cor.
 */
export function corNome(hex) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex ?? "").trim());
  if (!m) return "";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.1 || (s < 0.15 && l < 0.22)) return "Preto";
  if (s < 0.15) return l > 0.85 ? "Branco" : "Cinza";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const quente = h < 45 || h >= 345;
  if (h >= 15 && h < 70 && l > 0.8) return "Bege";
  if (quente && l < 0.42 && s < 0.7) return "Marrom";
  if ((h >= 320 || h < 10) && l > 0.6) return "Rosa";
  if (h < 15 || h >= 345) return "Vermelho";
  if (h < 45) return "Laranja";
  if (h < 70) return "Amarelo";
  if (h < 170) return "Verde";
  if (h < 200) return "Turquesa";
  if (h < 250) return "Azul";
  if (h < 290) return "Roxo";
  return l < 0.35 ? "Roxo" : "Rosa";
}

/** Nomes das cores dos filamentos usados, sem repetir, na ordem em que aparecem. */
export function coresUsadas(fils) {
  const nomes = [];
  for (const f of fils || []) { const n = corNome(f.cor); if (n && !nomes.includes(n)) nomes.push(n); }
  return nomes;
}

/** "120 × 80 × 45 mm" a partir de medidas em milímetros (sem a altura, se não houver). */
export function textoDimensoes(dims) {
  if (!dims || !(dims.x > 0) || !(dims.y > 0)) return "";
  const f = (n) => (n < 20 ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString("pt-BR");
  return [dims.x, dims.y, dims.z].filter((v) => v > 0).map(f).join(" × ") + " mm";
}

const montar = (seg, pesos, tipos, cores = []) => {
  const fils = pesos.map((g, i) => ({ mat: material(tipos[i] ?? tipos[0]), g: numero(g), cor: String(cores[i] ?? "").trim() })).filter((f) => f.g > 0);
  return { ok: seg > 0 || fils.length > 0, segundos: seg, fils };
};

/**
 * Lê peso, tempo, cores e altura dos comentários de um .gcode.
 * Basta o começo e o fim do arquivo: é onde os fatiadores gravam o resumo.
 * O .gcode não informa largura nem profundidade da peça.
 */
export function lerGcode(texto) {
  const t = String(texto ?? "");
  const pega = (re) => (t.match(re) || [])[1] || "";
  const tempo =
    pega(/total estimated time:\s*([^\n;]+)/i) ||                            // Bambu Studio / OrcaSlicer
    pega(/estimated printing time \(normal mode\)\s*=\s*([^\n]+)/i) ||       // PrusaSlicer
    pega(/model printing time:\s*([^\n;]+)/i);
  const pesos =
    pega(/^;\s*total filament weight \[g\]\s*:\s*(.+)$/im) ||                // Bambu Studio
    pega(/^;\s*filament used \[g\]\s*=\s*(.+)$/im) ||                        // PrusaSlicer / OrcaSlicer
    pega(/^;\s*total filament used \[g\]\s*=\s*(.+)$/im);
  const tipos = pega(/^;\s*filament_type\s*[=:]\s*(.+)$/im);
  const cores = pega(/^;\s*filament_colou?r\s*[=:]\s*(.+)$/im);
  const r = montar(segundos(tempo), pesos ? pesos.split(",") : [], tipos ? tipos.split(/[;,]/) : [], cores ? cores.split(/[;,]/) : []);
  return { ...r, altura: numero(pega(/^;\s*max_z_height:\s*([\d.]+)/im)) };
}

/** Lê as placas do Metadata/slice_info.config de um .3mf fatiado no Bambu Studio. */
export function lerSliceInfo(xml) {
  const attr = (s, nome) => (s.match(new RegExp(`\\b${nome}="([^"]*)"`)) || [])[1] || "";
  const meta = (s, chave) => (s.match(new RegExp(`<metadata\\s+key="${chave}"\\s+value="([^"]*)"`)) || [])[1] || "";
  const placas = String(xml ?? "").split(/<plate\b/).slice(1).map((bloco, i) => {
    const b = bloco.split("</plate>")[0];
    const filamentos = [...b.matchAll(/<filament\b([^>]*)>/g)].map((m) => m[1]);
    let r = montar(Math.round(numero(meta(b, "prediction"))), filamentos.map((f) => attr(f, "used_g")), filamentos.map((f) => attr(f, "type")), filamentos.map((f) => attr(f, "color")));
    // Sem a lista de filamentos, usa o peso total da placa.
    if (!r.fils.length && numero(meta(b, "weight"))) r = montar(r.segundos, [meta(b, "weight")], []);
    return { indice: Math.round(numero(meta(b, "index"))) || i + 1, ...r };
  }).filter((p) => p.ok);
  return { ok: placas.length > 0, placas };
}

/**
 * Lê as medidas dos objetos do Metadata/plate_N.json de um .3mf do Bambu Studio.
 * Devolve { objetos: [{ nome, x, y }] } em milímetros (a torre de limpeza não conta).
 */
export function lerPlacaJson(texto) {
  let o;
  try { o = JSON.parse(texto); } catch (e) { return { objetos: [] }; }
  const medir = (bb) => (Array.isArray(bb) && bb.length >= 4 ? { x: Math.abs(bb[2] - bb[0]), y: Math.abs(bb[3] - bb[1]) } : null);
  const objetos = (Array.isArray(o && o.bbox_objects) ? o.bbox_objects : [])
    .filter((b) => b && !/wipe[ _]?tower/i.test(String(b.name || "")))
    .map((b) => ({ nome: String(b.name || ""), ...(medir(b.bbox) || {}) }))
    .filter((b) => b.x > 0 && b.y > 0);
  return { objetos };
}

/** Lê um .3mf (ZIP). Usa a primeira placa fatiada e avisa se houver outras. */
export async function ler3mf(buffer) {
  let entradas;
  try { entradas = listarZip(buffer); } catch (e) { return { ok: false, erro: "Este arquivo .3mf está corrompido ou não é um .3mf." }; }
  const achar = (re) => entradas.find((e) => re.test(e.nome));
  const info = achar(/(^|\/)slice_info\.config$/i);
  let res = null, indice = 1;
  if (info) {
    const r = lerSliceInfo(await extrairTexto(buffer, info));
    if (r.ok) {
      const p = r.placas[0]; indice = p.indice;
      res = { ok: true, segundos: p.segundos, fils: p.fils, aviso: r.placas.length > 1 ? `O arquivo tem ${r.placas.length} placas fatiadas; usei a placa ${p.indice}.` : "" };
    }
  }
  const gcode = achar(new RegExp(`(^|/)plate_${indice}\\.gcode$`, "i")) || achar(/plate_\d+\.gcode$/i);
  let cabecalho = null;
  if (gcode) { try { cabecalho = lerGcode(await extrairInicio(buffer, gcode, 65536)); } catch (e) { cabecalho = null; } }
  if (!res && cabecalho && cabecalho.ok) res = { ok: true, segundos: cabecalho.segundos, fils: cabecalho.fils, aviso: "" };
  if (!res) return { ok: false, erro: "Este .3mf não está fatiado. No Bambu Studio, fatie a placa e exporte o arquivo fatiado (.gcode.3mf)." };

  // Dimensões: largura e profundidade do objeto (plate_N.json) e altura do cabeçalho do gcode.
  res.dims = null; res.objetos = 0;
  const json = achar(new RegExp(`(^|/)plate_${indice}\\.json$`, "i"));
  if (json) {
    try {
      const { objetos } = lerPlacaJson(await extrairTexto(buffer, json));
      res.objetos = objetos.length;
      if (objetos.length) {
        const maior = objetos.reduce((a, b) => (b.x * b.y > a.x * a.y ? b : a));
        res.dims = { x: maior.x, y: maior.y, z: (cabecalho && cabecalho.altura) || 0 };
      }
    } catch (e) {}
  }
  return res;
}
