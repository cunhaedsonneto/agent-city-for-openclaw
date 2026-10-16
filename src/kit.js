// Kit de montagem da maquete: cada peça estática entra num “balde” por material, recebe
// cor por vértice e UV em espaço de mundo (projeção por eixo dominante). No fim, cada balde
// vira UMA malha fundida. A cidade inteira cabe em ~15 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

export function matrix(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Prepara uma geometria para fusão: sem índice, transformada, só position/normal/uv/color.
export function prepare(geometry, color, m, uvScale = 0) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (m) g.applyMatrix4(m);
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  if (uvScale > 0) {
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, w;
      if (ay >= ax && ay >= az) { u = pos.getX(i); w = pos.getZ(i); }
      else if (ax >= az) { u = pos.getZ(i); w = pos.getY(i); }
      else { u = pos.getX(i); w = pos.getY(i); }
      uv[i * 2] = u / uvScale; uv[i * 2 + 1] = w / uvScale;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  } else if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  _c.set(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Kit {
  constructor(uvScales = {}) { this.buckets = new Map(); this.uvScales = uvScales; }
  add(bucket, geometry, color, m) {
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, []);
    this.buckets.get(bucket).push(prepare(geometry, color, m, this.uvScales[bucket] || 0));
  }
  // Caixa com centro em (x, y, z).
  box(bucket, w, h, d, x, y, z, color, ry = 0) {
    this.add(bucket, new THREE.BoxGeometry(w, h, d), color, matrix(x, y, z, 0, ry));
  }
  // Laje retangular por limites, com topo em `top`.
  slab(bucket, x0, x1, z0, z1, top, thick, color) {
    this.box(bucket, x1 - x0, thick, z1 - z0, (x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2, color);
  }
  cyl(bucket, rTop, rBottom, h, x, y, z, color, seg = 16, rx = 0, rz = 0) {
    this.add(bucket, new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, matrix(x, y, z, rx, 0, rz));
  }
  build(materials, { cast = true, receive = true, noCast = [] } = {}) {
    const meshes = [];
    for (const [bucket, list] of this.buckets) {
      const material = materials[bucket];
      if (!material) throw new Error('Material ausente: ' + bucket);
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = bucket;
      mesh.castShadow = cast && !noCast.includes(bucket);
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// Une várias peças de um objeto móvel (carro, parte de figura) em uma geometria com cor por vértice.
export function fuse(parts) {
  const merged = mergeGeometries(parts.map(([geometry, color, m]) => prepare(geometry, color, m)), false);
  merged.computeBoundingSphere();
  return merged;
}
