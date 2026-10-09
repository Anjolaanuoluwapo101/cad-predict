// Builds a heart GLB from BodyParts3D (BP3D 4.0, PART-OF tree, 99% reduced OBJ files).
//
//   node scripts/build-heart.mjs --zip <partof_BP3D_4.0_obj_99.zip> --elements <partof_element_parts.txt> --out frontend/public/models/heart_bp3d.glb
//
// Options: --trim 0.85   cut vessel pieces farther than 0.85 x heart size from the heart centre (0 = off)
//          --flipx       mirror left/right if the apex points the wrong way
//          --cardiac-veins  also include the cardiac veins and coronary sinus
//
// Data: BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) : d; };
const ZIP = opt('zip'), ELEM = opt('elements'), OUT = opt('out', 'heart_bp3d.glb');
const TRIM = Number(opt('trim', 0.85)), FLIPX = Boolean(opt('flipx', false)), CARDIAC_VEINS = Boolean(opt('cardiac-veins', false));
if (!ZIP || !ELEM) { console.error('Usage: node scripts/build-heart.mjs --zip <zip> --elements <partof_element_parts.txt> --out <file.glb>'); process.exit(1); }

// Part names match what the 3D stage already looks for. Earlier parts win when two parts share a piece.
const PARTS = [
  { name: 'LeftMain', ids: ['FMA3855'] },
  { name: 'LAD', ids: ['FMA3862', 'FMA3860', 'FMA74912', 'FMA3868', 'FMA3872', 'FMA3874', 'FMA3876'] },
  { name: 'LCX', ids: ['FMA3895'] },
  { name: 'RCA', ids: ['FMA50039', 'FMA3802', 'FMA3815', 'FMA3818', 'FMA3837', 'FMA3840'] },
  { name: 'Aorta', ids: ['FMA3736', 'FMA3768'], vessel: true },
  { name: 'Pulmonary_trunk', ids: ['FMA8612'], vessel: true },
  { name: 'Veins', ids: ['FMA4720', 'FMA10951', 'FMA49911', 'FMA49913', 'FMA49914', 'FMA49916'], exclude: ['FMA68002', 'FMA68003', 'FMA68004', 'FMA68005'], vessel: true }, // exclude = the branches inside the lungs
  ...(CARDIAC_VEINS ? [{ name: 'Cardiac_veins', ids: ['FMA4707', 'FMA4713', 'FMA4714', 'FMA4706'] }] : []),
  { name: 'Heart_body', ids: ['FMA7088'], body: true },
];

// 1. concept -> piece ids. Every id on a row (FMA... or BP...) maps to the row's FJ piece, so column order does not matter.
const pieces = new Map();
for (const line of fs.readFileSync(ELEM, 'utf8').split(/\r?\n/)) {
  const tok = line.split(/\t|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const fj = tok.find((t) => /^FJ\d+M?$/i.test(t));
  if (!fj) continue;
  for (const t of tok) if (/^(FMA|BP)\d+$/i.test(t)) { const k = t.toUpperCase(); if (!pieces.has(k)) pieces.set(k, new Set()); pieces.get(k).add(fj.toUpperCase()); }
}

// 2. minimal zip reader (stored + deflate)
const zbuf = fs.readFileSync(ZIP);
let eocd = -1;
for (let i = zbuf.length - 22; i >= Math.max(0, zbuf.length - 70000); i--) if (zbuf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) { console.error('Not a readable zip file.'); process.exit(1); }
const count = zbuf.readUInt16LE(eocd + 10); let p = zbuf.readUInt32LE(eocd + 16);
const index = new Map();
for (let n = 0; n < count; n++) {
  if (zbuf.readUInt32LE(p) !== 0x02014b50) break;
  const method = zbuf.readUInt16LE(p + 10), csize = zbuf.readUInt32LE(p + 20), nl = zbuf.readUInt16LE(p + 28), el = zbuf.readUInt16LE(p + 30), cl = zbuf.readUInt16LE(p + 32), off = zbuf.readUInt32LE(p + 42);
  const name = zbuf.toString('utf8', p + 46, p + 46 + nl).replace(/\\/g, '/');
  if (/\.obj$/i.test(name)) index.set(path.basename(name, path.extname(name)).toUpperCase(), { method, csize, off });
  p += 46 + nl + el + cl;
}
function readObj(id) {
  const e = index.get(id); if (!e) return null;
  const nl = zbuf.readUInt16LE(e.off + 26), el = zbuf.readUInt16LE(e.off + 28), start = e.off + 30 + nl + el;
  const raw = zbuf.subarray(start, start + e.csize);
  return (e.method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
}

// 3. OBJ -> triangles (welded by position so normals are smooth across pieces)
function addObj(text, mesh) {
  const local = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      let X = +x, Y = +y, Z = +z; if (FLIPX) X = -X;
      const key = `${Math.round(X * 100)},${Math.round(Y * 100)},${Math.round(Z * 100)}`;
      let idx = mesh.weld.get(key);
      if (idx === undefined) { idx = mesh.pos.length / 3; mesh.weld.set(key, idx); mesh.pos.push(X, Y, Z); }
      local.push(idx);
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((s) => { const i = parseInt(s, 10); return local[i < 0 ? local.length + i : i - 1]; });
      for (let k = 1; k + 1 < f.length; k++) {
        const t = FLIPX ? [f[0], f[k + 1], f[k]] : [f[0], f[k], f[k + 1]];
        if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) mesh.idx.push(...t);
      }
    }
  }
}

const claimed = new Set(), meshes = [], report = [];
for (const part of PARTS) {
  const want = new Set();
  for (const id of part.ids) for (const fj of pieces.get(id) ?? []) want.add(fj);
  for (const id of part.exclude ?? []) for (const fj of pieces.get(id) ?? []) want.delete(fj);
  const mesh = { name: part.name, pos: [], idx: [], weld: new Map(), vessel: part.vessel, body: part.body };
  let used = 0, missing = 0;
  for (const fj of want) {
    if (claimed.has(fj)) continue;
    const text = readObj(fj);
    if (!text) { missing++; continue; }
    claimed.add(fj); used++; addObj(text, mesh);
  }
  report.push({ part: part.name, concepts: part.ids.filter((i) => pieces.has(i)).length + '/' + part.ids.length, pieces: used, missingFiles: missing, tris: mesh.idx.length / 3 });
  if (mesh.idx.length) meshes.push(mesh);
}

// 4. trim vessels that run far out of the heart
const bbox = (pos) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); } return { mn, mx }; };
const body = meshes.find((m) => m.body);
if (body && TRIM > 0) {
  const b = bbox(body.pos); const c = b.mn.map((v, k) => (v + b.mx[k]) / 2); const R = TRIM * Math.max(...b.mx.map((v, k) => v - b.mn[k]));
  for (const m of meshes.filter((x) => x.vessel)) {
    const keep = [];
    for (let i = 0; i < m.idx.length; i += 3) {
      const cen = [0, 0, 0]; for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) cen[k] += m.pos[m.idx[i + j] * 3 + k] / 3;
      if (Math.hypot(cen[0] - c[0], cen[1] - c[1], cen[2] - c[2]) <= R) keep.push(m.idx[i], m.idx[i + 1], m.idx[i + 2]);
    }
    m.idx = keep;
  }
}

// drop vertices no longer used by any triangle, so bounding boxes (and the viewer's auto-centring) are correct
for (const m of meshes) {
  const map = new Map(), pos = [], idx = [];
  for (const i of m.idx) {
    let n = map.get(i);
    if (n === undefined) { n = pos.length / 3; map.set(i, n); pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); }
    idx.push(n);
  }
  m.pos = pos; m.idx = idx;
}

// 5. smooth normals + GLB
function normals(m) {
  const n = new Float32Array(m.pos.length);
  for (let i = 0; i < m.idx.length; i += 3) {
    const [a, b, c] = [m.idx[i] * 3, m.idx[i + 1] * 3, m.idx[i + 2] * 3];
    const u = [0, 1, 2].map((k) => m.pos[b + k] - m.pos[a + k]), v = [0, 1, 2].map((k) => m.pos[c + k] - m.pos[a + k]);
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const o of [a, b, c]) for (let k = 0; k < 3; k++) n[o + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
const chunks = [], views = [], accessors = [], gmeshes = [], nodes = [], materials = [];
const push = (buf, target) => { const pad = (4 - (buf.length % 4)) % 4; const off = chunks.reduce((s, c) => s + c.length, 0); chunks.push(Buffer.concat([buf, Buffer.alloc(pad)])); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target }); return views.length - 1; };
for (const m of meshes.filter((x) => x.idx.length)) {
  const b = bbox(m.pos), P = new Float32Array(m.pos), N = normals(m), I = new Uint32Array(m.idx);
  const vp = push(Buffer.from(P.buffer), 34962), vn = push(Buffer.from(N.buffer), 34962), vi = push(Buffer.from(I.buffer), 34963);
  accessors.push({ bufferView: vp, componentType: 5126, count: P.length / 3, type: 'VEC3', min: b.mn, max: b.mx }); const ap = accessors.length - 1;
  accessors.push({ bufferView: vn, componentType: 5126, count: N.length / 3, type: 'VEC3' }); const an = accessors.length - 1;
  accessors.push({ bufferView: vi, componentType: 5125, count: I.length, type: 'SCALAR' }); const ai = accessors.length - 1;
  materials.push({ name: m.name, pbrMetallicRoughness: { baseColorFactor: [0.6, 0.64, 0.68, 1], metallicFactor: 0.02, roughnessFactor: 0.55 } });
  gmeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: ap, NORMAL: an }, indices: ai, material: materials.length - 1 }] });
  nodes.push({ name: m.name, mesh: gmeshes.length - 1 });
}
const bin = Buffer.concat(chunks);
const json = { asset: { version: '2.0', generator: 'build-heart.mjs', copyright: 'BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan' },
  scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gmeshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const total = 12 + 8 + js.length + 8 + bin.length, head = Buffer.alloc(12 + 8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([head, js, binHead, bin]));

console.log('\nBuilt', OUT, `(${(total / 1048576).toFixed(2)} MB)\n`);
console.table(report.map((r) => ({ ...r, tris: meshes.find((m) => m.name === r.part)?.idx.length / 3 || 0 })));
for (const must of ['LAD', 'LCX', 'RCA', 'Heart_body']) if (!meshes.find((m) => m.name === must && m.idx.length)) console.log(`WARNING: no geometry found for ${must}. Check the element file and zip.`);
