import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { segundos, material, corNome, coresUsadas, textoDimensoes, lerGcode, lerSliceInfo, lerPlacaJson, ler3mf } from "../importar.js";
import { listarZip, extrairTexto, extrairInicio } from "../zip.js";

const semCor = (fils) => fils.map(({ mat, g }) => ({ mat, g }));

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
; filament_colour = #000000;#FFFFFF
; filament_type = PLA;PETG
; CONFIG_BLOCK_END
G1 X10 Y10
`;

test("lerGcode: Bambu Studio com dois filamentos", () => {
  const r = lerGcode(BAMBU);
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 4640);
  assert.deepEqual(semCor(r.fils), [{ mat: "PLA", g: 27.45 }, { mat: "PETG", g: 3.91 }]);
});

test("lerGcode: Bambu Studio antigo, só com tempo", () => {
  const r = lerGcode("; BambuStudio 01.08\n; model printing time: 13m 9s; total estimated time: 19m 6s\n; total layer number: 50\n");
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 1146);
  assert.deepEqual(semCor(r.fils), []);
});

test("lerGcode: PrusaSlicer / OrcaSlicer (resumo no fim do arquivo)", () => {
  const r = lerGcode("G1 X1\n; filament used [mm] = 4321.0\n; filament used [g] = 12.89\n; total filament used [g] = 12.89\n; estimated printing time (normal mode) = 2h 5m 10s\n; filament_type = PETG\n");
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 7510);
  assert.deepEqual(semCor(r.fils), [{ mat: "PETG", g: 12.89 }]);
});

test("lerGcode: filamento com peso zero é ignorado", () => {
  const r = lerGcode("; total estimated time: 10m 0s\n; total filament weight [g] : 5.00,0.00,2.50\n; filament_type = PLA;PLA;TPU\n");
  assert.deepEqual(semCor(r.fils), [{ mat: "PLA", g: 5 }, { mat: "TPU", g: 2.5 }]);
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
  assert.deepEqual(r.placas[0], { indice: 1, ok: true, segundos: 5437, fils: [{ mat: "PLA", g: 27.45, cor: "#000000" }, { mat: "PETG", g: 3.91, cor: "#FFFFFF" }] });
});

test("lerSliceInfo: sem lista de filamentos usa o peso da placa", () => {
  const r = lerSliceInfo('<config><plate><metadata key="index" value="2"/><metadata key="prediction" value="600"/><metadata key="weight" value="8.50"/></plate></config>');
  assert.deepEqual(semCor(r.placas[0].fils), [{ mat: "Outro", g: 8.5 }]);
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
  assert.deepEqual(semCor(r.fils), [{ mat: "PLA", g: 27.45 }, { mat: "PETG", g: 3.91 }]);
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

// ---------- Cores e dimensões ----------

test("corNome: cores básicas", () => {
  const casos = { "#000000": "Preto", "#FFFFFF": "Branco", "#898989": "Cinza", "#FF0000": "Vermelho", "#8B0000": "Vermelho", "#FF6A13": "Laranja",
    "#F4EE2A": "Amarelo", "#00AE42": "Verde", "#0A2989": "Azul", "#5E43B7": "Roxo", "#F55A74": "Rosa", "#9D432C": "Marrom", "#F7E6DE": "Bege", "#00B1B7": "Turquesa" };
  for (const [hex, nome] of Object.entries(casos)) assert.equal(corNome(hex), nome, hex);
});

test("corNome: aceita transparência, minúsculas e sem #; texto inválido vira vazio", () => {
  assert.equal(corNome("#00ae42ff"), "Verde");
  assert.equal(corNome("0A2989"), "Azul");
  assert.equal(corNome(""), "");
  assert.equal(corNome("verde"), "");
  assert.equal(corNome(undefined), "");
});

test("coresUsadas: sem repetir e ignorando filamento sem cor", () => {
  assert.deepEqual(coresUsadas([{ cor: "#000000" }, { cor: "#111111" }, { cor: "" }, { cor: "#FFFFFF" }]), ["Preto", "Branco"]);
  assert.deepEqual(coresUsadas([]), []);
  assert.deepEqual(coresUsadas(undefined), []);
});

test("textoDimensoes: largura × profundidade × altura em mm", () => {
  assert.equal(textoDimensoes({ x: 120.4, y: 80.2, z: 45 }), "120 × 80 × 45 mm");
  assert.equal(textoDimensoes({ x: 12.34, y: 8.06, z: 4.5 }), "12,3 × 8,1 × 4,5 mm");
  assert.equal(textoDimensoes({ x: 120, y: 80, z: 0 }), "120 × 80 mm");
  assert.equal(textoDimensoes(null), "");
  assert.equal(textoDimensoes({ x: 0, y: 80, z: 10 }), "");
});

test("lerGcode: cores na ordem dos filamentos e altura da peça", () => {
  const r = lerGcode(BAMBU);
  assert.deepEqual(r.fils.map((f) => f.cor), ["#000000", "#FFFFFF"]);
  assert.equal(r.altura, 24);
  assert.equal(lerGcode("; total estimated time: 1m 0s\n").altura, 0);
});

test("lerGcode: cor acompanha o filamento mesmo quando outro tem peso zero", () => {
  const r = lerGcode("; total estimated time: 10m 0s\n; total filament weight [g] : 0.00,2.50\n; filament_colour = #FF0000;#0A2989\n; filament_type = PLA;PLA\n");
  assert.deepEqual(r.fils, [{ mat: "PLA", g: 2.5, cor: "#0A2989" }]);
});

const PLACA = JSON.stringify({ bbox_all: [60, 70, 196.5, 150.2], bbox_objects: [
  { area: 100, bbox: [60, 70, 180.4, 150.2], id: 1, layer_height: 0.2, name: "Vaso.stl" },
  { area: 10, bbox: [185, 70, 196.5, 80], id: 2, layer_height: 0.2, name: "Tampa.stl" },
  { area: 5, bbox: [10, 10, 70, 70], id: 3, name: "wipe_tower" },
], filament_colors: ["#000000", "#FFFFFF"], version: 2 });

test("lerPlacaJson: medidas dos objetos, sem a torre de limpeza", () => {
  const { objetos } = lerPlacaJson(PLACA);
  assert.equal(objetos.length, 2);
  assert.equal(objetos[0].nome, "Vaso.stl");
  assert.ok(Math.abs(objetos[0].x - 120.4) < 1e-9 && Math.abs(objetos[0].y - 80.2) < 1e-9);
});

test("lerPlacaJson: texto inválido ou sem objetos devolve lista vazia", () => {
  assert.deepEqual(lerPlacaJson("lixo"), { objetos: [] });
  assert.deepEqual(lerPlacaJson("{}"), { objetos: [] });
  assert.deepEqual(lerPlacaJson(JSON.stringify({ bbox_objects: [{ name: "x", bbox: [1, 2] }] })), { objetos: [] });
});

test("zip: extrairInicio lê só o começo de uma entrada grande", async () => {
  const grande = BAMBU + "G1 X10 Y10 E0.5\n".repeat(200000);
  const z = zip([["Metadata/plate_1.gcode", grande], ["a.txt", "curto", true]]);
  const [g, a] = listarZip(z);
  const inicio = await extrairInicio(z, g, 4096);
  assert.equal(inicio.length, 4096);
  assert.equal(inicio, grande.slice(0, 4096));
  assert.equal(await extrairInicio(z, a, 4096), "curto");
});

test("ler3mf: traz cores e as dimensões do maior objeto, com a altura do gcode", async () => {
  const r = await ler3mf(zip([["Metadata/slice_info.config", SLICE], ["Metadata/plate_1.json", PLACA], ["Metadata/plate_1.gcode", BAMBU + "G1 X1\n".repeat(50000)]]));
  assert.equal(r.ok, true);
  assert.deepEqual(coresUsadas(r.fils), ["Preto", "Branco"]);
  assert.equal(r.objetos, 2);
  assert.equal(textoDimensoes(r.dims), "120 × 80 × 24 mm");
});

test("ler3mf: sem plate_N.json não inventa dimensões", async () => {
  const r = await ler3mf(zip([["Metadata/slice_info.config", SLICE]]));
  assert.equal(r.dims, null);
  assert.equal(r.objetos, 0);
});

// ---------- Formato real do Bambu Studio 2.x (estrutura de um arquivo exportado) ----------

const SLICE_REAL = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="02.09.01.70"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="extruder_type" value="0"/>
    <metadata key="printer_model_id" value="N7"/>
    <metadata key="nozzle_diameters" value="0.4"/>
    <metadata key="prediction" value="43324"/>
    <metadata key="weight" value="119.21"/>
    <metadata key="first_layer_time" value="367,583618"/>
    <metadata key="support_used" value="true"/>
    <metadata key="filament_maps" value="1"/>
    <object identify_id="85" name="peca.stl" skipped="false" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="39.34" used_g="119.21" group_id="0" nozzle_diameter="0.40" volume_type="Standard" used_for_object="true" used_for_support="true" directly_used="true" total_load_time="26.00" total_unload_time="0.00"/>
    <nozzle id="0" extruder_id="1" nozzle_diameter="0.4" volume_type="Standard"/>
    <layer_filament_lists>
      <layer_filament_list filament_list="0" layer_ranges="0 1248" />
    </layer_filament_lists>
  </plate>
</config>`;
const PLACA_REAL = '{"bbox_all":[57.280030000000004,63.59454,195.72215000000003,203.19503],"bbox_objects":[{"area":5889.43017578125,"bbox":[57.280030000000004,63.59454,195.72215000000003,203.19503],"id":106,"layer_height":0.20000000298023224,"name":"peca.stl"}],"bed_type":"textured_plate","filament_colors":["#000000"],"filament_ids":[0],"first_extruder":0,"first_layer_time":367.5836181640625,"is_seq_print":false,"nozzle_diameter":0.4000000059604645,"version":2}';
const GCODE_REAL = `; HEADER_BLOCK_START
; BambuStudio 02.09.01.70
; model printing time: 11h 55m 2s; total estimated time: 12h 2m 4s
; total layer number: 1249
; total filament length [mm] : 39336.14
; total filament volume [cm^3] : 94614.50
; total filament weight [g] : 119.21
; filament_density: 1.26
; filament_diameter: 1.75
; max_z_height: 149.96
; filament: 1
; support_material_on_wipe_tower: 0
; HEADER_BLOCK_END

; CONFIG_BLOCK_START
; accel_to_decel_enable = 0
`;

test("ler3mf: arquivo no formato real do Bambu Studio 2.x", async () => {
  const r = await ler3mf(zip([["Metadata/plate_1.json", PLACA_REAL], ["3D/3dmodel.model", "<model/>"], ["Metadata/plate_1.gcode", GCODE_REAL + "G1 X1 Y1\n".repeat(100000)], ["Metadata/slice_info.config", SLICE_REAL]]));
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 43324);
  assert.deepEqual(r.fils, [{ mat: "PLA", g: 119.21, cor: "#000000" }]);
  assert.deepEqual(coresUsadas(r.fils), ["Preto"]);
  assert.equal(r.objetos, 1);
  assert.equal(textoDimensoes(r.dims), "138 × 140 × 150 mm");
  assert.equal(r.aviso, "");
});
