import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { segundos, material, lerGcode, lerSliceInfo, ler3mf } from "../importar.js";
import { listarZip, extrairTexto } from "../zip.js";

// ---------- Monta um ZIP de teste ----------
function zip(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  for (const [nome, texto, guardar] of arquivos) {
    const n = Buffer.from(nome), cru = Buffer.from(texto), dados = guardar ? cru : deflateRawSync(cru);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(guardar ? 0 : 8, 8);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(cru.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(guardar ? 0 : 8, 10);
    c.writeUInt32LE(dados.length, 20); c.writeUInt32LE(cru.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    partes.push(local, n, dados); central.push(c, n);
    pos += 30 + n.length + dados.length;
  }
  const cd = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  const b = Buffer.concat([...partes, cd, fim]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ---------- Tempo e material ----------

test("segundos: horas, minutos e segundos", () => {
  assert.equal(segundos("1h 23m 45s"), 5025);
  assert.equal(segundos("16m 55s"), 1015);
  assert.equal(segundos("42s"), 42);
  assert.equal(segundos("1d 2h 3m 4s"), 93784);
  assert.equal(segundos("2h30m"), 9000);
});

test("segundos: texto sem tempo vira 0", () => {
  assert.equal(segundos(""), 0);
  assert.equal(segundos("model"), 0);
  assert.equal(segundos(undefined), 0);
});

test("material: reduz o tipo do fatiador aos materiais do app", () => {
  assert.equal(material("PLA"), "PLA");
  assert.equal(material("PLA Basic"), "PLA");
  assert.equal(material("petg-cf"), "PETG");
  assert.equal(material("ASA"), "ASA");
  assert.equal(material("TPU 95A"), "TPU");
  assert.equal(material("ABS"), "Outro");
  assert.equal(material(""), "Outro");
});

// ---------- .gcode ----------

const BAMBU = `; HEADER_BLOCK_START
; BambuStudio 02.00.00.95
; model printing time: 1h 10m 3s; total estimated time: 1h 17m 20s
; total layer number: 120
; total filament length [mm] : 9200.50,1310.20
; total filament volume [cm^3] : 22129.50,3151.38
; total filament weight [g] : 27.45,3.91
; filament_density: 1.24,1.24
; filament_diameter: 1.75,1.75
; max_z_height: 24.00
; HEADER_BLOCK_END

; CONFIG_BLOCK_START
; filament_type = PLA;PETG
; CONFIG_BLOCK_END
G1 X10 Y10
`;

test("lerGcode: Bambu Studio com dois filamentos", () => {
  const r = lerGcode(BAMBU);
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 4640);
  assert.deepEqual(r.fils, [{ mat: "PLA", g: 27.45 }, { mat: "PETG", g: 3.91 }]);
});

test("lerGcode: Bambu Studio antigo, só com tempo", () => {
  const r = lerGcode("; BambuStudio 01.08\n; model printing time: 13m 9s; total estimated time: 19m 6s\n; total layer number: 50\n");
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 1146);
  assert.deepEqual(r.fils, []);
});

test("lerGcode: PrusaSlicer / OrcaSlicer (resumo no fim do arquivo)", () => {
  const r = lerGcode("G1 X1\n; filament used [mm] = 4321.0\n; filament used [g] = 12.89\n; total filament used [g] = 12.89\n; estimated printing time (normal mode) = 2h 5m 10s\n; filament_type = PETG\n");
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 7510);
  assert.deepEqual(r.fils, [{ mat: "PETG", g: 12.89 }]);
});

test("lerGcode: filamento com peso zero é ignorado", () => {
  const r = lerGcode("; total estimated time: 10m 0s\n; total filament weight [g] : 5.00,0.00,2.50\n; filament_type = PLA;PLA;TPU\n");
  assert.deepEqual(r.fils, [{ mat: "PLA", g: 5 }, { mat: "TPU", g: 2.5 }]);
});

test("lerGcode: arquivo sem resumo não é aceito", () => {
  assert.equal(lerGcode("G28\nG1 X10 Y10\n").ok, false);
  assert.equal(lerGcode("").ok, false);
});

// ---------- slice_info.config ----------

const SLICE = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header><header_item key="X-BBL-Client-Type" value="slicer"/></header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="5437"/>
    <metadata key="weight" value="31.36"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="9.20" used_g="27.45" />
    <filament id="2" tray_info_idx="GFG00" type="PETG" color="#FFFFFF" used_m="1.31" used_g="3.91" />
  </plate>
</config>`;

test("lerSliceInfo: tempo em segundos e peso por filamento", () => {
  const r = lerSliceInfo(SLICE);
  assert.equal(r.ok, true);
  assert.equal(r.placas.length, 1);
  assert.deepEqual(r.placas[0], { indice: 1, ok: true, segundos: 5437, fils: [{ mat: "PLA", g: 27.45 }, { mat: "PETG", g: 3.91 }] });
});

test("lerSliceInfo: sem lista de filamentos usa o peso da placa", () => {
  const r = lerSliceInfo('<config><plate><metadata key="index" value="2"/><metadata key="prediction" value="600"/><metadata key="weight" value="8.50"/></plate></config>');
  assert.deepEqual(r.placas[0].fils, [{ mat: "Outro", g: 8.5 }]);
  assert.equal(r.placas[0].indice, 2);
});

test("lerSliceInfo: projeto não fatiado não tem placas válidas", () => {
  assert.equal(lerSliceInfo("<config><header/></config>").ok, false);
  assert.equal(lerSliceInfo('<config><plate><metadata key="index" value="1"/></plate></config>').ok, false);
  assert.equal(lerSliceInfo("").ok, false);
});

// ---------- ZIP e .3mf ----------

test("zip: lista e extrai entradas comprimidas e sem compressão", async () => {
  const z = zip([["a.txt", "olá, mundo", true], ["pasta/b.txt", "texto ".repeat(500)]]);
  const ents = listarZip(z);
  assert.deepEqual(ents.map((e) => e.nome), ["a.txt", "pasta/b.txt"]);
  assert.equal(await extrairTexto(z, ents[0]), "olá, mundo");
  assert.equal(await extrairTexto(z, ents[1]), "texto ".repeat(500));
});

test("zip: recusa o que não é ZIP", () => {
  assert.throws(() => listarZip(new TextEncoder().encode("isto não é um zip, é só texto comum").buffer));
});

test("ler3mf: arquivo fatiado do Bambu Studio", async () => {
  const r = await ler3mf(zip([["3D/3dmodel.model", "<model/>"], ["Metadata/slice_info.config", SLICE], ["Metadata/plate_1.gcode", BAMBU]]));
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 5437);
  assert.deepEqual(r.fils, [{ mat: "PLA", g: 27.45 }, { mat: "PETG", g: 3.91 }]);
  assert.equal(r.aviso, "");
});

test("ler3mf: várias placas — usa a primeira e avisa", async () => {
  const duas = SLICE.replace("</config>", '<plate><metadata key="index" value="2"/><metadata key="prediction" value="100"/><metadata key="weight" value="1.00"/></plate></config>');
  const r = await ler3mf(zip([["Metadata/slice_info.config", duas]]));
  assert.equal(r.segundos, 5437);
  assert.match(r.aviso, /2 placas/);
});

test("ler3mf: sem slice_info, lê o gcode da placa", async () => {
  const r = await ler3mf(zip([["Metadata/plate_1.gcode", BAMBU]]));
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 4640);
});

test("ler3mf: projeto não fatiado explica o que fazer", async () => {
  const r = await ler3mf(zip([["3D/3dmodel.model", "<model/>"], ["Metadata/slice_info.config", "<config><header/></config>"]]));
  assert.equal(r.ok, false);
  assert.match(r.erro, /não está fatiado/);
});

test("ler3mf: arquivo que não é ZIP", async () => {
  const r = await ler3mf(new TextEncoder().encode("G28 ; isto é um gcode renomeado, não um 3mf de verdade").buffer);
  assert.equal(r.ok, false);
  assert.match(r.erro, /corrompido/);
});
