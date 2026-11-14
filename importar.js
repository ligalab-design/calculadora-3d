// Importação de arquivos fatiados (Bambu Studio, OrcaSlicer, PrusaSlicer): peso e tempo.
// Sem dependência de tela.
import { listarZip, extrairTexto } from "./zip.js";

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

const montar = (seg, pesos, tipos) => {
  const fils = pesos.map((g, i) => ({ mat: material(tipos[i] ?? tipos[0]), g: numero(g) })).filter((f) => f.g > 0);
  return { ok: seg > 0 || fils.length > 0, segundos: seg, fils };
};

/**
 * Lê peso e tempo dos comentários de um .gcode.
 * Basta o começo e o fim do arquivo: é onde os fatiadores gravam o resumo.
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
  return montar(segundos(tempo), pesos ? pesos.split(",") : [], tipos ? tipos.split(/[;,]/) : []);
}

/** Lê as placas do Metadata/slice_info.config de um .3mf fatiado no Bambu Studio. */
export function lerSliceInfo(xml) {
  const attr = (s, nome) => (s.match(new RegExp(`\\b${nome}="([^"]*)"`)) || [])[1] || "";
  const meta = (s, chave) => (s.match(new RegExp(`<metadata\\s+key="${chave}"\\s+value="([^"]*)"`)) || [])[1] || "";
  const placas = String(xml ?? "").split(/<plate\b/).slice(1).map((bloco, i) => {
    const b = bloco.split("</plate>")[0];
    const filamentos = [...b.matchAll(/<filament\b([^>]*)>/g)].map((m) => m[1]);
    let r = montar(Math.round(numero(meta(b, "prediction"))), filamentos.map((f) => attr(f, "used_g")), filamentos.map((f) => attr(f, "type")));
    // Sem a lista de filamentos, usa o peso total da placa.
    if (!r.fils.length && numero(meta(b, "weight"))) r = montar(r.segundos, [meta(b, "weight")], []);
    return { indice: Math.round(numero(meta(b, "index"))) || i + 1, ...r };
  }).filter((p) => p.ok);
  return { ok: placas.length > 0, placas };
}

/** Lê um .3mf (ZIP). Usa a primeira placa fatiada e avisa se houver outras. */
export async function ler3mf(buffer) {
  let entradas;
  try { entradas = listarZip(buffer); } catch (e) { return { ok: false, erro: "Este arquivo .3mf está corrompido ou não é um .3mf." }; }
  const info = entradas.find((e) => /(^|\/)slice_info\.config$/i.test(e.nome));
  if (info) {
    const r = lerSliceInfo(await extrairTexto(buffer, info));
    if (r.ok) {
      const p = r.placas[0];
      return { ok: true, segundos: p.segundos, fils: p.fils, aviso: r.placas.length > 1 ? `O arquivo tem ${r.placas.length} placas fatiadas; usei a placa ${p.indice}.` : "" };
    }
  }
  const gcode = entradas.find((e) => /plate_\d+\.gcode$/i.test(e.nome));
  if (gcode) {
    const r = lerGcode(await extrairTexto(buffer, gcode));
    if (r.ok) return { ...r, aviso: "" };
  }
  return { ok: false, erro: "Este .3mf não está fatiado. No Bambu Studio, fatie a placa e exporte o arquivo fatiado (.gcode.3mf)." };
}
