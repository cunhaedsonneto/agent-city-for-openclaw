// Materiais por natureza (pintura fosca, reboco, madeira, vidro, metal, água…) e ambiente de
// reflexo gerado localmente (sem HDRI baixado). Texturas próprias de scripts/generate_textures.py.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export function makeMaterials(renderer, { lowTier = false } = {}) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (file, srgb = true) => {
    const t = loader.load(import.meta.env.BASE_URL + 'tex/' + file, () => window.dispatchEvent(new Event('volt:texture')));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = lowTier ? 2 : aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // Grama “flocada” de maquete, gerada localmente: sálvia dessaturada com grãos claros e escuros.
  const grass = flockTexture(lowTier ? 256 : 512, aniso);
  const paving = tex('calcada_albedo.jpg');
  const asphalt = tex('asfalto_albedo.jpg');
  const wood = tex('madeira_albedo.jpg');
  const plaster = tex('reboco_albedo.jpg');
  const contact = tex('sombra_contato.png');
  contact.wrapS = contact.wrapT = THREE.ClampToEdgeWrapping;

  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const officeGlass = std({ roughness: 0.12, metalness: 0.15, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 });
  return {
    textures: { contact },
    // Cor por vértice multiplica o albedo: a mesma textura serve a várias cores.
    paint: std({ roughness: 0.8 }),
    plaster: std({ map: plaster, roughness: 0.9 }),
    grass: std({ map: grass, roughness: 0.96 }),
    foliage: std({ map: grass, roughness: 0.95 }),
    paving: std({ map: paving, roughness: 0.86 }),
    asphalt: std({ map: asphalt, roughness: 0.88 }),
    wood: std({ map: wood, roughness: 0.72 }),
    glass: std({ roughness: 0.1, metalness: 0.15 }),
    officeGlass,
    metal: std({ roughness: 0.42, metalness: 0.65 }),
    screens: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: '#3a8db0', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.86 }),
    contactShadow: new THREE.MeshBasicMaterial({ map: contact, color: '#1d2228', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    plinthShadow: new THREE.MeshBasicMaterial({ map: contact, color: '#3a342b', transparent: true, opacity: 0.7, depthWrite: false })
  };
}

function flockTexture(size, aniso) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#9fb07f';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Manchas largas e suaves (variação de tom), depois grãos finos.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size, y = rnd() * size, r = size * (0.06 + rnd() * 0.12);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rnd() > 0.5 ? '178,192,140' : '134,152,104';
    grd.addColorStop(0, `rgba(${tone},0.35)`); grd.addColorStop(1, `rgba(${tone},0)`);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { g.save(); g.translate(dx, dy); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  for (let i = 0; i < size * size * 0.18; i++) {
    const v = rnd();
    g.fillStyle = v > 0.55 ? `rgba(196,208,160,${0.25 + rnd() * 0.3})` : `rgba(96,114,74,${0.2 + rnd() * 0.3})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Cúpula com degradê céu → horizonte → chão, convertida em mapa de ambiente (PMREM).
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const top = new THREE.Color('#9fbfd8'), horizon = new THREE.Color('#ebe4d6'), ground = new THREE.Color('#5d5649');
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 50;
    if (h >= 0) c.copy(horizon).lerp(top, Math.pow(h, 0.6)); else c.copy(horizon).lerp(ground, Math.min(1, -h * 3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // Um “softbox” quente no lado do sol dá brilho especular coerente com a luz direta.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.1, 3.1) }));
  sun.position.set(-22, 30, 30);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geo.dispose();
  return target.texture;
}

// Folha única com as placas (fachadas e placa de latão do pedestal).
export function makeSignAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 640;
  const g = canvas.getContext('2d');
  const rows = [
    ['Escritórios', '#8a4a2f', '#f6efe2'],
    ['Jogos', '#284f78', '#eef3f7'],
    ['Dormitórios', '#4f3f8f', '#f3f0f9'],
    ['Lazer', '#8f5a35', '#f8f0e6']
  ];
  rows.forEach(([text, bg, fg], i) => {
    const y = i * 128;
    g.fillStyle = bg; g.fillRect(0, y, 1024, 128);
    g.strokeStyle = fg + '88'; g.lineWidth = 4; g.strokeRect(10, y + 10, 1004, 108);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 78px "Iowan Old Style", Palatino, Georgia, serif';
    g.fillText(text, 512, y + 68);
  });
  // Placa de latão do pedestal da maquete.
  const y = 512;
  const grad = g.createLinearGradient(0, y, 0, y + 128);
  grad.addColorStop(0, '#d8b46a'); grad.addColorStop(0.5, '#b8924a'); grad.addColorStop(1, '#9c7a3a');
  g.fillStyle = grad; g.fillRect(0, y, 1024, 128);
  g.fillStyle = '#3b2c14'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 54px "Iowan Old Style", Palatino, Georgia, serif';
  g.fillText('AGENT CITY  ·  MAQUETE VIVA', 512, y + 66);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export const SIGN_ROWS = 5;
