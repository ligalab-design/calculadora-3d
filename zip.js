// Leitor mínimo de arquivos ZIP (um .3mf é um ZIP). Sem dependências.
// Suporta entradas sem compressão (método 0) e deflate (método 8); não suporta ZIP64.

/** Lista as entradas de um ZIP a partir do diretório central. Lança erro se não for um ZIP. */
export function listarZip(buffer) {
  const dv = new DataView(buffer), n = dv.byteLength;
  let fim = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("não é um arquivo ZIP");
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const txt = new TextDecoder(), entradas = [];
  for (let k = 0; k < total; k++) {
    if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP corrompido");
    const nomeLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), comLen = dv.getUint16(p + 32, true);
    entradas.push({
      nome: txt.decode(new Uint8Array(buffer, p + 46, nomeLen)),
      metodo: dv.getUint16(p + 10, true),
      tamanho: dv.getUint32(p + 20, true),
      local: dv.getUint32(p + 42, true),
    });
    p += 46 + nomeLen + extraLen + comLen;
  }
  return entradas;
}

/** Extrai uma entrada (devolvida por listarZip) como texto UTF-8. */
export async function extrairTexto(buffer, entrada) {
  const dv = new DataView(buffer), p = entrada.local;
  if (dv.getUint32(p, true) !== 0x04034b50) throw new Error("ZIP corrompido");
  const inicio = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const bytes = new Uint8Array(buffer, inicio, entrada.tamanho);
  if (entrada.metodo === 0) return new TextDecoder().decode(bytes);
  if (entrada.metodo !== 8) throw new Error("compressão não suportada");
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(fluxo).text();
}

/**
 * Extrai só o começo de uma entrada (até `maxBytes` já descomprimidos), sem abrir o arquivo inteiro.
 * Útil para ler o cabeçalho de um .gcode grande dentro de um .3mf.
 */
export async function extrairInicio(buffer, entrada, maxBytes = 65536) {
  const dv = new DataView(buffer), p = entrada.local;
  if (dv.getUint32(p, true) !== 0x04034b50) throw new Error("ZIP corrompido");
  const inicio = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const bytes = new Uint8Array(buffer, inicio, entrada.tamanho);
  if (entrada.metodo === 0) return new TextDecoder().decode(bytes.subarray(0, maxBytes));
  if (entrada.metodo !== 8) throw new Error("compressão não suportada");
  // Alimenta o descompressor aos poucos e para assim que houver texto suficiente.
  const ds = new DecompressionStream("deflate-raw"), w = ds.writable.getWriter(), r = ds.readable.getReader();
  const partes = []; let total = 0, pos = 0, fim = false;
  const alimentar = (async () => {
    try { while (pos < bytes.length && !fim) { await w.write(bytes.subarray(pos, pos + 65536)); pos += 65536; } if (!fim) await w.close(); } catch (e) {}
  })();
  try {
    while (total < maxBytes) { const { value, done } = await r.read(); if (done) break; partes.push(value); total += value.length; }
  } finally { fim = true; r.cancel().catch(() => {}); w.abort().catch(() => {}); await alimentar; }
  const junto = new Uint8Array(total); let o = 0;
  for (const parte of partes) { junto.set(parte, o); o += parte.length; }
  return new TextDecoder().decode(junto.subarray(0, maxBytes));
}
