// The whole site is one 3D world: a Free Meals on Wheels food truck on a small plaza floating in a blue sky.
// People and objects around it are the navigation; clicking one moves the camera there and opens its card.
// CC0 assets: city by Quaternius (Downtown City MegaKit), people by Quaternius (Ultimate Modular Men/Women),
// food by Kenney (Food Kit), surface textures from Poly Haven.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { loadFood, type FoodId } from './world/assets';
import { makeChair } from './world/figure';
import { loadCast, type Person, type Kind } from './world/people';
import { Crowd, type Seat } from './world/crowd';
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type View = { pos: [number, number, number]; look: [number, number, number]; fov?: number };

const C = {
  green: '#13703F', greenDark: '#0E4F2D', orange: '#F07A2E', cream: '#F7F1E6', gold: '#D9BC7E',
  paving: '#ECE6DC', wood: '#A9784F', ink: '#2A2F2C', tire: '#2A2A2A', glass: '#AFCBD3', steel: '#C9CCCF',
};

const ANCHORS: Record<StationId, [number, number, number]> = {
  volunteer: [1.75, 2.35, 1.4], donate: [3.2, 1.85, 3.1], about: [5.6, 2.9, 4.4], resources: [-6.2, 3.2, 3.9], contact: [8.4, 3.05, 3.4],
};

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: 0, ...extra });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
const keep = <T extends THREE.Object3D>(o: T) => { o.userData.keep = true; return o; };
const rot = <T extends THREE.Object3D>(o: T, x: number, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const rbox = (w: number, h: number, d: number, r = .05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
function canvasTex(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 256, repeat?: [number, number]) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.moveTo(x, y + s * .3);
  c.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3);
  c.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .8, x, y + s);
  c.bezierCurveTo(x, y + s * .8, x + s * .5, y + s * .6, x + s * .5, y + s * .3);
  c.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3); c.fill();
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// A soft, fluffy cloud puff: layered blobs with a light top and a warm grey underside.
function puffTexture() {
  return canvasTex((c, w, h) => {
    for (let i = 0; i < 46; i++) {
      const x = w * (.22 + rnd() * .56), y = h * (.3 + rnd() * .45), r = w * (.08 + rnd() * .16);
      const g = c.createRadialGradient(x, y - r * .3, 0, x, y, r);
      const shade = Math.round(222 + (1 - y / h) * 33);
      g.addColorStop(0, `rgba(255,255,${shade},.55)`); g.addColorStop(.6, `rgba(${shade},${shade - 6},${shade - 14},.28)`); g.addColorStop(1, 'rgba(230,225,220,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }, 256, 256);
}

// A street tree: tapered trunk, a few limbs, and a canopy of many leaf clumps in varied greens.
function tree(parent: THREE.Object3D, x: number, z: number, s: number) {
  const t = new THREE.Group(); t.position.set(x, .14, z); t.scale.setScalar(s); t.rotation.y = rnd() * 6; parent.add(t);
  const bark = std('#6B5442', { roughness: 1 });
  t.add(mesh(new THREE.CylinderGeometry(.06, .11, 2.2, 10), bark, 0, 1.1, 0));
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(.025, .045, .9, 6), bark, 0, 1.9, 0); l.rotation.set(.7, i * 2.1, 0); l.translateY(.35); t.add(l); }
  const geo = new THREE.IcosahedronGeometry(.32, 1), cols = ['#4F7A47', '#5E8A52', '#6E9A5C', '#476F41', '#7FA766'];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * .85, y = 2.1 + rnd() * 1.3 - r * .3;
    const c = new THREE.Color(cols[i % 5]).offsetHSL((rnd() - .5) * .03, 0, (rnd() - .5) * .06);
    const leaf = mesh(geo, std('#ffffff', { color: c, roughness: .95, flatShading: true }), Math.cos(a) * r, y, Math.sin(a) * r);
    leaf.scale.setScalar(.7 + rnd() * .7); t.add(leaf);
  }
}

// Compressed models store attributes as packed integers; merging needs plain floats.
function floatAttrs(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k] as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) out[i * a.itemSize + j] = a.getComponent(i, j);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}

// Merge a subtree's static meshes into one mesh per look (same material settings), in the root's local space.
function bake(root: THREE.Object3D, keep: (o: THREE.Object3D) => boolean = () => false) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean }>();
  const found: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => { if (o !== root && keep(o)) return; const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material)) found.push(m); o.children.forEach(walk); };
  walk(root);
  for (const m of found) {
    const mat = m.material as THREE.MeshStandardMaterial;
    const key = [mat.type, mat.color?.getHexString(), mat.roughness, mat.metalness, mat.map?.uuid, mat.normalMap?.uuid, mat.roughnessMap?.uuid, mat.transparent, mat.opacity, mat.side, mat.emissive?.getHexString(), mat.emissiveIntensity, (mat as THREE.MeshPhysicalMaterial).clearcoat, mat.flatShading].join('|');
    const g = floatAttrs(m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const geo = floatAttrs(g.index ? g.toNonIndexed() : g);
    const e = groups.get(key) ?? { mat, geos: [], shadow: false }; e.geos.push(geo); e.shadow ||= m.castShadow; groups.set(key, e);
    m.removeFromParent();
  }
  for (const e of groups.values()) {
    const merged = mergeGeometries(e.geos, false); if (!merged) continue;
    const mm = new THREE.Mesh(merged, e.mat); mm.castShadow = e.shadow; mm.receiveShadow = true; root.add(mm);
  }
}

export interface TruckApi { surfaces(s: Partial<Record<'about' | 'contact', HTMLElement>>): void; focus(id: StationId | null, peek?: boolean): void; give(amount: number): void; dispose(): void }

export function mountTruck(
  canvas: HTMLCanvasElement,
  labels: Partial<Record<StationId, HTMLElement>>,
  onSelect: (id: StationId) => void,
  onArrive: (id: StationId) => void = () => {},
): TruckApi | null {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  // Most visitors are on everyday phones and laptops: start light on modest hardware, and step down further if frames run slow.
  const nav = navigator as Navigator & { deviceMemory?: number };
  const modest = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 4) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  let tier = modest ? 1 : 2;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: tier > 1, powerPreference: 'high-performance' }); } catch { return null; }
  const applyTier = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, [.75, 1, 1.35][tier]));
    renderer.shadowMap.enabled = tier > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  };
  applyTier();
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = canvasTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3F92E6'); g.addColorStop(.55, '#8CC4F0'); g.addColorStop(1, '#DCEBF2');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 4, 256);
  scene.fog = new THREE.Fog('#CFE3EE', 60, 160);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.add(new THREE.HemisphereLight('#DCEEFF', '#D8C4A4', 1.25));
  const sun = new THREE.DirectionalLight('#FFE7C4', 3.1); sun.position.set(-7, 13, 9); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(1024); sun.shadow.radius = 5; sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 45 });
  scene.add(sun);

  // ——— Textures (Poly Haven, 512px webp) and a fine noise used to break up flat paint.
  const texLoader = new THREE.TextureLoader();
  const tex = (name: string, rx: number, ry = rx, color = false) => {
    const t = texLoader.load(`${BASE}tex/${name}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const grime = canvasTex((c, w, h) => {
    const id = c.createImageData(w, h);
    for (let i = 0; i < id.data.length; i += 4) { const v = 150 + rnd() * 60 + Math.sin(i * .0007) * 12; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    c.putImageData(id, 0, 0);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(90,90,90,${rnd() * .12})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 40, 1 + rnd() * 3); }
  }, 256, 256, [3, 2]);
  grime.colorSpace = THREE.NoColorSpace;

  // ——— The city: a real street block. Loaded from one compressed file, pieces cloned into place.
  const city = new THREE.Group(); city.position.y = .14; scene.add(city);
  const baseGround = mesh(new THREE.PlaneGeometry(200, 200), std('#B9B4AA', { roughness: 1, roughnessMap: grime }), 0, -.12, 0); baseGround.rotation.x = -Math.PI / 2; baseGround.castShadow = false; scene.add(baseGround);
  const gl = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  gl.load(`${BASE}models/city/city.glb`, (g) => {
    if (!alive) return;
    // The kit stores engine blend masks in vertex colors; they are not meant to be seen.
    g.scene.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) for (const mat of [m.material].flat() as THREE.MeshStandardMaterial[]) { mat.vertexColors = false; mat.metalnessMap = null; mat.metalness = /glass/i.test(mat.name) ? .3 : 0; mat.envMapIntensity = .6;  if (/Brick/.test(mat.name)) mat.color.set('#FFB59A'); if (/Trim$/.test(mat.name)) mat.color.set('#FFF1DC'); mat.needsUpdate = true; } });
    const part = (name: string) => g.scene.getObjectByName(name)!;
    // Clean painted plaster for each storefront (the kit's stained concrete reads dirty), with a deeper trim band.
    const plaster = ['#FBE7C6', '#D8EFE3', '#FCD9D3', '#DCE8F7', '#FFF1B8', '#E9DDF6', '#FFE2C2'], trims = ['#2F8F5B', '#C8473F', '#3A73B8', '#D98A2B', '#7A55B0', '#2A8C86', '#B05A3A'], brickCols = ['#FFB59A', '#F6C7A6', '#E99B7C', '#FFD0B5'];
    let bi = 0;
    const put = (name: string, x: number, z: number, ry = 0, shadow = false) => {
      const o = part(name).clone(); o.position.set(x, 0, z); o.rotation.y = ry; city.add(o);
      if (name.startsWith('Building')) {
        // Each building gets its own painted shopfront and brick tone so the street isn't one grey block.
        const shop = trims[bi % trims.length], wall = plaster[bi % plaster.length], brick = brickCols[bi % brickCols.length]; bi++;
        const swap = new Map<THREE.Material, THREE.Material>();
        o.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; const mat = m.material as THREE.MeshStandardMaterial;
          void shop; void wall;
          if (/Brick/.test(mat.name)) { if (!swap.has(mat)) { const n = mat.clone(); n.color.set(brick); swap.set(mat, n); } m.material = swap.get(mat)!; } });
      }
      o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = shadow; } });
      return o;
    };
    // Road behind the truck, running left to right, with sidewalks on both sides.
    for (let x = -42; x <= 42; x += 6) put('Street_4Lane', x, -6.1);
    // The plaza in front: light stone pavers (Poly Haven pavement_03).
    {
      const fm = std('#F1E9DC', { map: tex('pavement-color', 14, 6, true), normalMap: tex('pavement-normal', 14, 6), roughnessMap: tex('pavement-rough', 14, 6) });
      for (const t of [fm.map, fm.normalMap, fm.roughnessMap]) t?.repeat.set(30, 9);
      const plaza = new THREE.Mesh(new THREE.PlaneGeometry(90, 24), fm); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, .005, 15); plaza.receiveShadow = true; city.add(plaza);
    }
    // Buildings across the street and framing the plaza.
    const row: [string, number][] = [-45, -30, -15, 0, 15, 30, 45].map((x) => ['Building_Medium_2_001', x]);
    for (const [n, x] of row) put(n, x, -15.6);

    for (const x of [-15, -9, 7, 13]) put('Sidewalk_Planter', x, 3.4, 0, true);
    for (const x of [-14, -11, 8.5, 12]) put('Prop_Bollard', x, 2.4, 0, true);
    put('Prop_ManholeCover', -6, -4); put('Prop_Drain', 5, 2.2); put('Prop_ManholeCover', 8, -9);
    for (const [x, z] of [[-14, 9], [14, 11], [-6, 15], [8, 16]]) put('Prop_Planter_Single', x, z, 0, true);
    // Bake every static piece into one mesh per material: hundreds of draw calls become about a dozen.
    city.updateMatrixWorld(true);
    const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
    const statics: THREE.Mesh[] = [];
    city.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material)) statics.push(m); });
    for (const m of statics) {
      const gm = floatAttrs(m.geometry.clone()).applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(gm.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gm.deleteAttribute(k);
      if (!gm.attributes.uv) gm.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gm.attributes.position.count * 2), 2));
      if (!gm.attributes.normal) gm.computeVertexNormals();
      const geo = floatAttrs(gm.index ? gm.toNonIndexed() : gm);
      const g = groups.get(m.material as THREE.Material) ?? { geos: [], shadow: false };
      g.geos.push(geo); g.shadow ||= m.castShadow; groups.set(m.material as THREE.Material, g);
      m.removeFromParent();
    }
    while (city.children.length) city.remove(city.children[0]);
    city.position.set(0, 0, 0); city.updateMatrixWorld(true);
    for (const [mat, g] of groups) {
      const merged = mergeGeometries(g.geos, false); if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat); mm.receiveShadow = true; mm.castShadow = g.shadow; mm.matrixAutoUpdate = false; city.add(mm);
    }
    
  });

  // ——— The truck, built in meters around a real serving window with an interior.
  const truck = new THREE.Group(); truck.position.y = -.06; scene.add(truck);
  const green = new THREE.MeshPhysicalMaterial({ color: C.green, roughness: .45, roughnessMap: grime, metalness: .15, clearcoat: .7, clearcoatRoughness: .25 });
  const orange = new THREE.MeshPhysicalMaterial({ color: C.orange, roughness: .5, roughnessMap: grime, clearcoat: .5 }), cream = std(C.cream, { roughness: .6, roughnessMap: grime });
  const chrome = std('#E6E3DC', { metalness: .85, roughness: .22 });
  const liner = std('#E9E6E0', { metalness: .55, roughness: .35, normalMap: tex('metal_plate-normal', 3, 1), normalScale: new THREE.Vector2(.25, .25), side: THREE.DoubleSide });
  const tread = std('#B8B9B6', { metalness: .7, roughness: .45, map: tex('metal_plate-color', 4, 1.5, true), normalMap: tex('metal_plate-normal', 4, 1.5), roughnessMap: tex('metal_plate-rough', 4, 1.5) });
  const oak = std('#ffffff', { map: tex('oak_wood_planks-color', 2, .5, true), normalMap: tex('oak_wood_planks-normal', 2, .5), roughnessMap: tex('oak_wood_planks-rough', 2, .5) });
  const shutterM = std('#D8D6D0', { map: tex('painted_metal_shutter-color', 1, 1, true), normalMap: tex('painted_metal_shutter-normal', 1, 1), metalness: .4, roughness: .5 });
  const X0 = -3.6, X1 = 2.6, Z = 1.15, FLOOR = .78, TOP = 3.25, W0 = -2.4, W1 = 1.0, WB = 1.65, WT = 2.75;
  const L = X1 - X0, cx = (X0 + X1) / 2;
  // Shell: lower and upper front panels, pillars either side of the window, back wall, ends, roof, floor.
  truck.add(mesh(rbox(L, WB - .5, .1, .04), green, cx, (WB + .5) / 2, Z));
  truck.add(mesh(rbox(L, TOP - WT, .1, .04), green, cx, (WT + TOP) / 2, Z));
  truck.add(mesh(rbox(W0 - X0, WT - WB, .1, .04), green, (X0 + W0) / 2, (WB + WT) / 2, Z));
  truck.add(mesh(rbox(X1 - W1, WT - WB, .1, .04), green, (W1 + X1) / 2, (WB + WT) / 2, Z));
  truck.add(mesh(rbox(L, TOP - .5, .1, .04), green, cx, (TOP + .5) / 2, -Z));
  for (const x of [X0, X1]) truck.add(mesh(rbox(.1, TOP - .5, Z * 2, .04), green, x, (TOP + .5) / 2, 0));
  truck.add(mesh(rbox(L + .2, .16, Z * 2 + .2, .07), cream, cx, TOP + .06, 0));
  truck.add(keep(mesh(new THREE.BoxGeometry(L - .1, .06, Z * 2 - .1), tread, cx, FLOOR - .03, 0)));
  truck.add(mesh(rbox(L + .08, .26, Z * 2 + .08, .08), orange, cx, .62, 0));
  truck.add(mesh(rbox(L + .04, .05, Z * 2 + .04, .02), chrome, cx, .47, 0));
  // Interior liner, lights and kit.
  const inner = new THREE.Group(); truck.add(inner);
  inner.add(mesh(new THREE.PlaneGeometry(L - .2, TOP - FLOOR - .1), liner, cx, (TOP + FLOOR) / 2, -Z + .1));
  inner.add(rot(mesh(new THREE.PlaneGeometry(L - .14, Z * 2 - .1), liner, cx, TOP - .12, 0), Math.PI / 2));
  for (const x of [X0 + .1, X1 - .1]) inner.add(rot(mesh(new THREE.PlaneGeometry(Z * 2 - .1, TOP - FLOOR), liner, x, (TOP + FLOOR) / 2, 0), 0, Math.PI / 2));
  const steel = std(C.steel, { metalness: .65, roughness: .32, roughnessMap: grime, normalMap: tex('metal_plate-normal', 2, 1), normalScale: new THREE.Vector2(.15, .15) });
  inner.add(mesh(rbox(L - .3, .9, .62, .02), steel, cx, FLOOR + .45, -Z + .38));
  inner.add(mesh(rbox(1.2, .06, .56, .02), std('#2B2B2B', { roughness: .4 }), -1.6, FLOOR + .93, -Z + .38));
  inner.add(mesh(rbox(1.4, .5, .7, .04), steel, -1.6, TOP - .4, -Z + .4));
  for (const y of [2.15, 2.6]) inner.add(mesh(new THREE.BoxGeometry(2.2, .04, .28), oak, .9, y, -Z + .26));
  inner.add(mesh(rbox(.8, 1.9, .7, .04), std('#E7E4DE', { metalness: .3, roughness: .3 }), X1 - .5, FLOOR + .95, -Z + .42));
  inner.add(mesh(rbox(2.6, .9, .5, .02), steel, (W0 + W1) / 2, FLOOR + .45, Z - .32));
  for (const x of [-2.2, .2]) { const l = new THREE.PointLight('#FFE2B8', 1.1, 5, 2); l.position.set(x, TOP - .25, 0); inner.add(l); inner.add(mesh(new THREE.CylinderGeometry(.18, .18, .03, 20), std('#FFF6E0', { emissive: '#FFE9B8', emissiveIntensity: 1.2 }), x, TOP - .05, 0)); }
  // Serving window: frame, outside ledge, roll-up shutter, awning, menu.
  for (const [w, h, x, y] of [[W1 - W0 + .16, .08, (W0 + W1) / 2, WT], [W1 - W0 + .16, .08, (W0 + W1) / 2, WB], [.08, WT - WB, W0, (WB + WT) / 2], [.08, WT - WB, W1, (WB + WT) / 2]] as const)
    truck.add(mesh(rbox(w, h, .14, .03), chrome, x, y, Z + .02));
  truck.add(keep(mesh(new THREE.BoxGeometry(W1 - W0 + .3, .06, .42), oak, (W0 + W1) / 2, WB + .02, Z + .2)));
  for (const x of [W0 + .3, W1 - .3]) { const br = mesh(new THREE.BoxGeometry(.04, .3, .3), chrome, x, WB - .14, Z + .16); br.rotation.x = -.6; truck.add(keep(br)); }
  truck.add(rot(mesh(new THREE.CylinderGeometry(.09, .09, W1 - W0 + .1, 20), shutterM, (W0 + W1) / 2, WT + .12, Z + .08), 0, 0, Math.PI / 2));
  const stripeTex = canvasTex((c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#F4EEE3' : C.orange; c.fillRect(i * w / 12, 0, w / 12, h); } }, 512, 64);
  const awning = mesh(new THREE.BoxGeometry(W1 - W0 + .5, .03, 1.1), std('#ffffff', { map: stripeTex, roughness: .85 }), (W0 + W1) / 2, WT + .3, Z + .58); awning.rotation.x = .28; truck.add(awning);
  for (const x of [W0 - .1, W1 + .1]) { const rod = mesh(new THREE.CylinderGeometry(.012, .012, 1.15, 6), chrome, x, WT + .15, Z + .55); rod.rotation.x = 1.3; truck.add(rod); }
  const menuTex = canvasTex((c, w, h) => {
    c.fillStyle = '#25362D'; c.fillRect(0, 0, w, h);
    c.fillStyle = C.gold; c.font = 'italic 600 54px Georgia, serif'; c.fillText("Today's menu", 34, 72);
    c.fillStyle = C.cream; c.font = '400 34px Inter, sans-serif';
    ['Rajma chawal', 'Veggie pasta', 'Fresh fruit', 'Masala chai'].forEach((s, i) => { c.fillText(s, 34, 142 + i * 54); c.fillText('Free', w - 104, 142 + i * 54); });
  }, 520, 380);
  truck.add(keep(mesh(rbox(.86, .66, .04, .02), std(C.wood), X0 + .62, 2.2, Z + .07)));
  truck.add(keep(mesh(new THREE.PlaneGeometry(.78, .58), std('#ffffff', { map: menuTex }), X0 + .62, 2.2, Z + .095)));
  // The real logo art (pastel heart with fork and spoon), redrawn onto every branded surface once it loads.
  const logoImg = new Image(); logoImg.src = `${BASE}img/logo-heart.png`;
  const logoTextures: { tex: THREE.CanvasTexture; draw: () => void }[] = [];
  const redrawAll = () => { for (const l of logoTextures) { l.draw(); l.tex.needsUpdate = true; } };
  logoImg.onload = redrawAll;
  const teamImg = new Image(); teamImg.src = `${BASE}img/team.webp`; teamImg.onload = redrawAll;
  const smileImg = new Image(); smileImg.src = `${BASE}img/smile.webp`; smileImg.onload = redrawAll;
  Promise.all(['400 100px "Instrument Serif"', 'italic 400 100px "Instrument Serif"', '400 40px Kalam', '600 30px Inter'].map((f) => document.fonts.load(f))).then(redrawAll).catch(() => {});
  const logoCanvas = (w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number, logo: HTMLImageElement | null) => void) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const run = () => { c.clearRect(0, 0, w, h); draw(c, w, h, logoImg.complete && logoImg.naturalWidth ? logoImg : null); };
    run(); logoTextures.push({ tex, draw: run }); return tex;
  };
  // Branding: two-tone livery (cream upper band, orange pinstripe), a big emblem and the full name, and a lit roof banner.
  const emblem = (c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ring: string) => {
    c.fillStyle = ring; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = fill; c.beginPath(); c.arc(x, y, r * .86, 0, Math.PI * 2); c.fill();
    c.fillStyle = ring; heart(c, x, y - r * .42, r * .9);
    c.strokeStyle = fill; c.lineWidth = r * .06; c.beginPath(); c.moveTo(x - r * .5, y + r * .62); c.lineTo(x + r * .5, y + r * .62); c.stroke();
  };
  for (const z of [Z + .06, -Z - .06]) { truck.add(mesh(new THREE.BoxGeometry(L + .02, .44, .02), cream, cx, TOP - .24, z)); truck.add(mesh(new THREE.BoxGeometry(L + .03, .05, .03), orange, cx, TOP - .49, z)); }
  for (const x of [X0 - .06, X1 + .06]) truck.add(mesh(new THREE.BoxGeometry(.02, .44, Z * 2 + .14), cream, x, TOP - .24, 0));
  const brandTex = logoCanvas(1500, 340, (c, w, h, logo) => {
    c.fillStyle = '#FFF8EC'; c.beginPath(); c.arc(150, h / 2, 128, 0, Math.PI * 2); c.fill();
    if (logo) c.drawImage(logo, 50, h / 2 - 88, 200, 178);
    c.fillStyle = '#FFF7E8'; c.font = '700 116px Inter, system-ui, sans-serif'; c.fillText('Free Meals', 310, 150);
    c.font = '600 92px Inter, system-ui, sans-serif'; c.fillText('on Wheels', 316, 250);
    c.fillStyle = '#FFD9A8'; c.font = '500 40px Inter, system-ui, sans-serif'; c.fillText('Bringing smiles, one meal at a time', 320, 315);
  });
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .77), std('#ffffff', { map: brandTex, transparent: true, roughness: .55 }));
  brand.position.set(-.55, 1.08, Z + .056); truck.add(brand);
  const backBrand = brand.clone(); backBrand.rotation.y = Math.PI; backBrand.position.z = -Z - .056; truck.add(backBrand);
  const cabTex = logoCanvas(256, 256, (c, w, h, logo) => { c.fillStyle = '#FFF8EC'; c.beginPath(); c.arc(w / 2, h / 2, w * .46, 0, Math.PI * 2); c.fill(); if (logo) c.drawImage(logo, w * .14, h * .18, w * .72, h * .64); });
  for (const z of [Z + .056, -Z - .056]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), std('#ffffff', { map: cabTex, transparent: true })); e.position.set(3.35, 1.25, z * 1.02); if (z < 0) e.rotation.y = Math.PI; truck.add(e); }
  // Roof banner: wide, two-sided, framed, with the full name and emblem, softly lit.
  const roofSign = new THREE.Group(); roofSign.position.set(-.5, TOP + .78, 0); truck.add(roofSign);
  roofSign.add(mesh(rbox(4.6, .98, .16, .08), std(C.greenDark, { roughness: .4, metalness: .2 })));
  const roofTex = logoCanvas(1800, 380, (c, w, h, logo) => {
    c.fillStyle = '#FFF8EC'; c.fillRect(0, 0, w, h);
    c.strokeStyle = C.green; c.lineWidth = 10; c.strokeRect(22, 22, w - 44, h - 44);
    if (logo) c.drawImage(logo, 50, h / 2 - 120, 270, 240);
    c.fillStyle = C.greenDark; c.font = '800 118px Inter, system-ui, sans-serif'; c.fillText('Free Meals', 330, 196);
    const fmw = c.measureText('Free Meals').width; c.fillStyle = C.orange; c.fillText('on Wheels', 330 + fmw + 30, 196);
    c.fillStyle = C.orange; c.font = '600 46px Inter, system-ui, sans-serif'; c.fillText('Bringing smiles, one meal at a time', 336, 272);
  });
  for (const sgn of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(4.4, .86), std('#ffffff', { map: roofTex, emissive: '#FFFFFF', emissiveMap: roofTex, emissiveIntensity: .25 })); f.position.z = .085 * sgn; if (sgn < 0) f.rotation.y = Math.PI; roofSign.add(f); }
  for (const x of [-1.8, 0, 1.8]) roofSign.add(mesh(new THREE.CylinderGeometry(.035, .035, .5, 8), std(C.ink), x, -.7, 0));
  truck.add(mesh(rbox(.7, .32, .8, .08), std('#DCD8CF', { metalness: .4, roughness: .4 }), 1.9, TOP + .3, -.6));
  truck.add(mesh(new THREE.CylinderGeometry(.1, .1, .45, 16), chrome, -3.2, TOP + .3, -.6));
  // A dark chassis skirt closes the gap under the body.
  truck.add(mesh(new THREE.BoxGeometry(L - .6, .3, Z * 2 - .3), std('#2A2D2B', { roughness: .9 }), cx + .2, .32, 0));
  // Rear door with a step.
  truck.add(mesh(rbox(.05, 1.9, .9, .02), std('#285C42', { roughness: .4 }), X0 - .03, FLOOR + 1.05, 0));
  truck.add(mesh(new THREE.BoxGeometry(.04, .3, .04), chrome, X0 - .07, FLOOR + 1.0, .3));
  truck.add(mesh(rbox(.4, .06, .9, .02), steel, X0 - .25, .42, 0));
  // Cab.
  const CX0 = X1, CX1 = X1 + 1.55;
  truck.add(mesh(rbox(CX1 - CX0, 1.85, Z * 2, .28), green, (CX0 + CX1) / 2, 1.42, 0));
  truck.add(mesh(rbox(CX1 - CX0 + .04, .26, Z * 2 + .04, .1), orange, (CX0 + CX1) / 2, .62, 0));
  const glassM = std(C.glass, { roughness: .05, metalness: .35, envMapIntensity: 1.6 });
  truck.add(mesh(rbox(.06, .72, Z * 2 - .3, .03), glassM, CX1 - .02, 1.92, 0));
  for (const z of [Z, -Z]) truck.add(mesh(rbox(.8, .62, .04, .02), glassM, CX0 + .78, 1.92, z * 1.005));
  truck.add(mesh(rbox(.1, .34, Z * 2 - .4, .04), chrome, CX1 + .02, 1.1, 0));
  for (const z of [.72, -.72]) truck.add(mesh(new THREE.SphereGeometry(.11, 16, 12), std('#FFF6D8', { emissive: '#FFE7A8', emissiveIntensity: .7 }), CX1 + .02, 1.06, z));
  truck.add(mesh(rbox(.16, .16, Z * 2 + .2, .06), chrome, CX1 + .06, .62, 0));
  for (const z of [Z + .12, -Z - .12]) truck.add(mesh(rbox(.06, .24, .14, .03), std(C.ink), CX0 + .2, 2.0, z));
  // Wheels.
  for (const [x, z] of [[-2.3, Z - .12], [-2.3, -Z + .12], [CX0 + .75, Z - .12], [CX0 + .75, -Z + .12]]) {
    truck.add(mesh(new THREE.TorusGeometry(.56, .06, 8, 28, Math.PI), std(C.greenDark), x, .48, z > 0 ? Z + .1 : -Z - .1));
    const w = mesh(new THREE.CylinderGeometry(.46, .46, .34, 36), std(C.tire, { roughness: .9 }), x, .46, z); w.rotation.x = Math.PI / 2; w.receiveShadow = false; truck.add(w);
    const hub = mesh(new THREE.CylinderGeometry(.22, .22, .36, 24), chrome, x, .46, z); hub.rotation.x = Math.PI / 2; truck.add(hub);
  }
  // Truck as obstacles for walkers.
  const truckObstacles = Array.from({ length: 9 }, (_, i) => ({ x: X0 + .3 + i * ((CX1 - X0 - .6) / 8), z: 0, r: 1.35 }));

  // ——— Our story: a chalkboard easel.
  const board = new THREE.Group(); board.position.set(5.6, .14, 4.4); board.rotation.y = -.4; scene.add(board);
  // The board face is drawn to match chapter one of the story exactly, so zooming in never swaps one board for another.
  const chalkSpeckle = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.save(); c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(0,0,0,${.25 + rnd() * .5})`; c.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); }
    c.restore();
  };
  const slate = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = '#26382E'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(230,235,225,${.012 + rnd() * .03})`; c.lineWidth = 30 + rnd() * 90; c.lineCap = 'round'; c.beginPath(); const a2 = rnd() * 6; c.arc(rnd() * w, rnd() * h, 80 + rnd() * 260, a2, a2 + .6 + rnd() * 1.4); c.stroke(); }
  };
  const boardTex = logoCanvas(1600, 1000, (c, w, h) => {
    const seedSave = seed; seed = 41;
    slate(c, w, h);
    const ink = document.createElement('canvas'); ink.width = w; ink.height = h; const k = ink.getContext('2d')!;
    k.textBaseline = 'alphabetic'; k.shadowColor = 'rgba(255,255,255,.4)'; k.shadowBlur = 2;
    k.fillStyle = '#FFE08F'; k.font = '500 22px ui-monospace, Menlo, monospace'; k.fillText('1 / 7', 110, 205);
    k.fillStyle = '#FBFAF4'; k.font = '400 104px "Instrument Serif", Georgia, serif'; k.fillText('It started with', 110, 318);
    k.fillStyle = '#FFE08F'; k.font = 'italic 400 104px "Instrument Serif", Georgia, serif'; k.fillText('two friends.', 110, 420);
    k.fillStyle = '#F2F1EA'; k.font = '400 38px Kalam, cursive';
    ['Japjot Sethi and Devinder Kumar', 'believed no neighbor should go', 'to bed hungry. So they started', 'cooking.'].forEach((l, i) => k.fillText(l, 110, 500 + i * 53));
    k.strokeStyle = '#F4F1E8'; k.lineWidth = 3.2; k.lineCap = 'round'; k.save(); k.translate(110, 740); k.scale(1.2, 1.2);
    for (const d of ['M30 90c0-14 8-22 16-22s16 8 16 22', 'M78 90c0-14 8-22 16-22s16 8 16 22', 'M62 74c4-6 12-6 16 0', 'M70 28c-4-6-14-2-10 6l10 9 10-9c4-8-6-12-10-6z']) k.stroke(new Path2D(d));
    for (const [x, y] of [[46, 51], [94, 51]]) { k.beginPath(); k.arc(x, y, 9, 0, Math.PI * 2); k.stroke(); }
    k.restore();
    chalkSpeckle(k, w, h); c.drawImage(ink, 0, 0);
    // Taped polaroid on the right, tilted like the page.
    c.save(); c.translate(1150, 470); c.rotate(-4 * Math.PI / 180);
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 30; c.shadowOffsetY = 14; c.fillStyle = '#FFFDF7'; c.fillRect(-320, -267, 640, 535); c.shadowColor = 'transparent';
    if (teamImg.complete && teamImg.naturalWidth) { const iw = teamImg.naturalWidth, ih = teamImg.naturalHeight, tw = 604, th = 453, sc = Math.max(tw / iw, th / ih); c.save(); c.beginPath(); c.rect(-302, -249, tw, th); c.clip(); c.drawImage(teamImg, -302 + (tw - iw * sc) / 2, -249 + (th - ih * sc) / 2, iw * sc, ih * sc); c.restore(); }
    c.fillStyle = 'rgba(246,233,196,.8)'; c.rotate(-.05); c.fillRect(-55, -285, 110, 30);
    c.restore();
    seed = seedSave;
  });
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(.06, 2.3, .06), std(C.wood), s * .78, 1.12, -.12); leg.rotation.z = s * -.06; board.add(leg); }
  board.add(mesh(rbox(1.72, 1.1, .06, .02), std(C.wood), 0, 1.65, 0));
  const BOARD = { w: 1.6, h: 1, y: 1.65, z: .035 };
  board.add(mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }), 0, BOARD.y, BOARD.z));

  // ——— Contact: a community bulletin board under a little roof.
  const bulletin = new THREE.Group(); bulletin.position.set(8.4, .14, 3.4); bulletin.rotation.y = -.6; scene.add(bulletin);
  for (const x of [-.95, .95]) bulletin.add(mesh(new THREE.BoxGeometry(.1, 2.7, .1), std(C.wood), x, 1.35, 0));
  bulletin.add(mesh(rbox(1.9, 1.16, .1, .03), std('#8A5E3C'), 0, 1.82, 0));
  const PIN = { w: 1.76, h: 1.06, y: 1.82, z: .055 };
  const corkTex = logoCanvas(1760, 1060, (c, w, h) => {
    const seedSave = seed; seed = 77;
    c.fillStyle = '#C99C62'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const r = 1.5 + rnd() * 4.5, l = rnd() < .5; c.fillStyle = l ? `rgba(255,228,180,${.15 + rnd() * .25})` : `rgba(110,64,28,${.15 + rnd() * .3})`; c.beginPath(); c.ellipse(rnd() * w, rnd() * h, r, r * (.5 + rnd()), rnd() * 3, 0, Math.PI * 2); c.fill(); }
    const Z2 = 1.22, X = (v: number) => v * Z2, col = (i: number) => X(44 + i * (322 + 22)), cw = X(322);
    const note = (x: number, y: number, ww: number, hh: number, bg: string, rot: number, draw: () => void) => {
      c.save(); c.translate(x + ww / 2, y + hh / 2); c.rotate(rot); c.shadowColor = 'rgba(60,30,10,.3)'; c.shadowBlur = 24; c.shadowOffsetY = 12; c.fillStyle = bg; c.fillRect(-ww / 2, -hh / 2, ww, hh); c.shadowColor = 'transparent';
      c.fillStyle = '#E8682F'; c.beginPath(); c.arc(0, -hh / 2 + 18, 10, 0, Math.PI * 2); c.fill(); c.translate(-ww / 2 + 28, -hh / 2 + 34); draw(); c.restore();
    };
    c.fillStyle = '#2A1A0C'; c.font = 'italic 400 96px "Instrument Serif", Georgia, serif'; c.fillText('Community board', col(0), X(34) + 90);
    c.fillStyle = '#3B2412'; c.font = '400 26px Inter, sans-serif'; c.fillText('Questions, ideas, a team that wants to help,', col(0), X(34) + 150); c.fillText('or just a hello. It all goes here.', col(0), X(34) + 186);
    const tt = (t: string, sub: string[], serif = false) => () => { c.fillStyle = '#1F4D34'; c.font = serif ? 'italic 400 44px "Instrument Serif", Georgia, serif' : '650 30px Inter, sans-serif'; c.fillText(t, 0, 36); c.fillStyle = '#5F6B64'; c.font = '400 24px Inter, sans-serif'; sub.forEach((l, i) => c.fillText(l, 0, 80 + i * 32)); };
    note(col(2), X(34), cw, X(150), '#FFFDF6', .02, () => { c.fillStyle = '#5F6B64'; c.font = '400 22px Inter, sans-serif'; c.fillText('Write to us', 0, 24); c.fillStyle = '#1F4D34'; c.font = '650 22px Inter, sans-serif'; c.fillText('info@freemealsonwheels.com', 0, 62); c.fillStyle = '#5F6B64'; c.font = '400 22px Inter, sans-serif'; c.fillText('A real person reads every note.', 0, 100); });
    note(col(3), X(34), cw, X(250), '#FFFDF6', -.02, () => { if (smileImg.complete && smileImg.naturalWidth) { const s2 = cw - 56; c.drawImage(smileImg, -12, -20, s2 + 24, s2 * .82); } c.fillStyle = '#17271E'; c.font = 'italic 400 34px "Instrument Serif", Georgia, serif'; c.fillText('@freemealsonwheels', 40, X(250) - 70); });
    const y2 = X(34 + 250 + 22);
    note(col(0), y2, cw, X(150), '#E2EFD9', -.03, tt('Bring your team', ['Cook and pack together on a', 'Saturday. Great for companies,', 'schools and clubs.']));
    note(col(1), y2, cw, X(130), '#FDE4CF', .02, tt('Host a blanket drive', ['Every winter we pair a hot', 'meal with a warm blanket.']));
    note(col(2), y2, cw, X(110), '#FFFDF6', -.01, tt('Find us on Facebook', ['Free Meals on Wheels'], true));
    note(col(3), y2, cw, X(120), '#FFF3A8', .015, tt('Need a meal?', ["There's a seat for you. Tap here."], true));
    note(col(0), y2 + X(172), X(322 * 2 + 22), X(150), '#FFFDF6', -.01, tt('Leave a note for the volunteers', ['They read these on Saturday morning.'], true));
    seed = seedSave;
  });
  bulletin.add(mesh(new THREE.BoxGeometry(PIN.w, PIN.h, .03), std('#C49A66', { roughness: 1 }), 0, PIN.y, .04));
  bulletin.add(mesh(new THREE.PlaneGeometry(PIN.w, PIN.h), new THREE.MeshBasicMaterial({ map: corkTex, toneMapped: false }), 0, PIN.y, PIN.z + .001));
  const roofB = mesh(new THREE.BoxGeometry(2.3, .06, .7), std(C.green), 0, 2.72, .1); roofB.rotation.x = .25; bulletin.add(roofB);

  // ——— Picnic tables.
  const woodM = std(C.wood, { roughness: .75 });
  const umbTex = canvasTex((c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#FFF6E6' : '#13703F'; c.fillRect(i * w / 12, 0, w / 12 + 1, h); } }, 512, 32);
  const seats: Seat[] = [];
  const table = (x: number, z: number, rot: number, umbrella: boolean, reserve = false) => {
    const t = new THREE.Group(); t.position.set(x, .14, z); t.rotation.y = rot; scene.add(t);
    t.add(mesh(rbox(1.9, .07, .85, .02), woodM, 0, .76, 0));
    for (const bz of [-.68, .68]) t.add(mesh(rbox(1.9, .05, .3, .02), woodM, 0, .45, bz));
    for (const bx of [-.72, .72]) for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(.06, .82, .06), woodM, bx, .38, s * .3); leg.rotation.x = s * .55; t.add(leg); }
    if (umbrella) {
      t.add(mesh(new THREE.CylinderGeometry(.025, .025, 2.3, 8), chrome, 0, 1.15, 0));
      t.add(mesh(new THREE.ConeGeometry(1.45, .5, 48, 4, true), std('#ffffff', { map: umbTex, side: THREE.DoubleSide, roughness: .85 }), 0, 2.35, 0));
      t.add(mesh(new THREE.CylinderGeometry(1.45, 1.45, .14, 48, 1, true), std('#ffffff', { map: umbTex, side: THREE.DoubleSide, roughness: .85 }), 0, 2.04, 0));
      t.add(mesh(new THREE.SphereGeometry(.05, 12, 8), std(C.cream), 0, 2.62, 0));
    }
    t.updateMatrixWorld(true);
    if (!reserve) for (const sx of [-.45, .45]) for (const sz of [-.68, .68]) seats.push({ pos: t.localToWorld(new THREE.Vector3(sx, -.14, sz)), face: rot + (sz > 0 ? Math.PI : 0), taken: false });
    return t;
  };
  const picnic = table(-6.2, 3.9, .2, true, true);
  table(-9.4, 6.6, -.3, true); table(-11.5, 12, .15, false); table(11, 7.4, .4, true);

  // ——— Planters, lamps, trees, string lights.
  const flowerCols = ['#E9A86A', '#E38C8C', '#F0D27A', '#FFFFFF', '#B9A0D8'];
  const planter = (x: number, z: number, w = 1.4) => {
    const p = new THREE.Group(); p.position.set(x, .14, z); scene.add(p);
    p.add(mesh(rbox(w, .45, .5, .05), std('#B9A48C', { roughness: .9 }), 0, .22, 0));
    for (let i = 0; i < 5; i++) p.add(mesh(new THREE.SphereGeometry(.17, 16, 12), std('#618B5C', { roughness: .95 }), -w / 2 + .2 + i * (w - .4) / 4, .52, (rnd() - .5) * .15));
    for (let i = 0; i < 10; i++) p.add(mesh(new THREE.SphereGeometry(.035, 8, 6), std(flowerCols[i % 5]), (rnd() - .5) * w * .85, .64 + rnd() * .08, (rnd() - .5) * .3));
  };
  const lamp = (x: number, z: number) => {
    const l = new THREE.Group(); l.position.set(x, .14, z); scene.add(l);
    l.add(mesh(new THREE.CylinderGeometry(.045, .065, 3.6, 12), std(C.greenDark, { metalness: .4, roughness: .45 }), 0, 1.8, 0));
    l.add(mesh(new THREE.SphereGeometry(.19, 20, 14), std('#FFF6DE', { emissive: '#FFE4A8', emissiveIntensity: .5 }), 0, 3.7, 0));
    l.add(mesh(new THREE.CylinderGeometry(.24, .2, .07, 20), std(C.greenDark), 0, 3.88, 0));
  };
  lamp(-8, 2.4); lamp(5.6, 2.4); lamp(16, 9); lamp(-16, 9.5);
  for (const x of [-15, -9, 7, 13]) tree(scene, x, 3.4, 1.35); tree(scene, -16.5, 14, 1.5); tree(scene, 17, 15, 1.4);
  const bulbs: THREE.Mesh[] = [];
  for (const [a, b] of [[new THREE.Vector3(-8, 3.55, 1.8), new THREE.Vector3(-3.6, 3.3, 1.2)], [new THREE.Vector3(4.15, 3.1, 1.2), new THREE.Vector3(5, 3.55, 1.9)]] as const) {
    const mid = a.clone().lerp(b, .5); mid.y -= .4;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .007, 4), std(C.ink)));
    for (let i = 1; i < 10; i++) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), new THREE.MeshStandardMaterial({ color: '#FFF1C9', emissive: '#FFD27A', emissiveIntensity: 1.3 }));
      bl.position.copy(curve.getPoint(i / 10)); bl.position.y -= .05; scene.add(bl); bulbs.push(bl);
    }
  }

  // ——— The logo as a sculpture: the heart drawn as a single tube, with a fork and spoon crossing at its point.
  const statue = new THREE.Group(); statue.position.set(-4.2, .14, 7.4); statue.rotation.y = .35; statue.scale.setScalar(1.35); scene.add(statue);
  statue.add(mesh(rbox(1.6, .5, 1.1, .08), std('#E9E2D6', { roughness: .8, roughnessMap: grime }), 0, .25, 0));
  statue.add(mesh(rbox(1.75, .08, 1.25, .03), std('#D6CCBC'), 0, .54, 0));
  const plaque = logoCanvas(512, 128, (c, w, h) => { c.fillStyle = '#2E3B33'; c.fillRect(0, 0, w, h); c.fillStyle = '#E9D9B4'; c.font = '600 44px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Free Meals on Wheels', w / 2, 62); c.font = 'italic 30px Georgia, serif'; c.fillText('Bringing smiles, one meal at a time', w / 2, 104); });
  statue.add(mesh(new THREE.PlaneGeometry(1.2, .3), std('#ffffff', { map: plaque, metalness: .3, roughness: .4 }), 0, .27, .556));
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 120; i++) { const t = (i / 120) * Math.PI * 2; pts.push(new THREE.Vector3(16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t), 0).multiplyScalar(.055)); }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const geo = new THREE.TubeGeometry(curve, 240, .06, 16, true);
    // Pastel gradient along the stroke, like the logo's watercolor line: lilac, butter, mint.
    const cols = ['#B9A3D9', '#F2D488', '#9FD3C1', '#B9A3D9'].map((c) => new THREE.Color(c)), col = new Float32Array(geo.attributes.position.count * 3);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i) * 3, k = Math.min(2, Math.floor(u)), c = cols[k].clone().lerp(cols[k + 1], u - k); col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    statue.add(mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .3, metalness: .1, clearcoat: 1 }), 0, 1.45, 0));
    const ink = new THREE.MeshStandardMaterial({ color: '#2A2A2A', roughness: .4 });
    const fork = new THREE.Group(), spoon = new THREE.Group();
    fork.add(mesh(new THREE.CylinderGeometry(.025, .03, .7, 10), std('#F2D488', { roughness: .3 }), 0, 0, 0));
    for (const x of [-.045, -.015, .015, .045]) fork.add(mesh(new THREE.CylinderGeometry(.008, .008, .16, 6), ink, x, .42, 0));
    spoon.add(mesh(new THREE.CylinderGeometry(.025, .03, .7, 10), std('#9FD3C1', { roughness: .3 }), 0, 0, 0));
    const sb = mesh(new THREE.SphereGeometry(.09, 16, 12), std('#9FD3C1', { roughness: .3 }), 0, .44, 0); sb.scale.set(1, 1.4, .45); spoon.add(sb);
    fork.position.set(-.12, .95, .02); fork.rotation.z = .5; spoon.position.set(.12, .95, -.02); spoon.rotation.z = -.5;
    statue.add(fork, spoon);
  }
  const statueGlow = new THREE.PointLight('#FFE6C2', .8, 4, 2); statueGlow.position.set(0, 1.4, 1.2); statue.add(statueGlow);

  // ——— Donation jar on its own little table, with a hand-lettered sign.
  const giving = new THREE.Group(); giving.position.set(3.2, .14, 3.1); scene.add(giving);
  giving.add(mesh(new THREE.CylinderGeometry(.42, .42, .05, 40), std(C.wood, { roughness: .55 }), 0, .86, 0));
  giving.add(mesh(new THREE.CylinderGeometry(.035, .05, .84, 12), std(C.greenDark), 0, .43, 0));
  giving.add(mesh(new THREE.CylinderGeometry(.22, .25, .03, 28), std(C.greenDark), 0, .015, 0));
  const signTex = canvasTex((c, w) => {
    c.fillStyle = '#25362D'; c.fillRect(0, 0, w, 240); c.fillStyle = '#E8875A'; heart(c, w / 2, 24, 56);
    c.fillStyle = C.cream; c.textAlign = 'center'; c.font = 'italic 500 44px Georgia, serif'; c.fillText('Every coin is', w / 2, 140); c.fillText('a warm dinner', w / 2, 192);
  }, 320, 240);
  const sign = new THREE.Group(); sign.position.set(.2, .89, -.12); sign.rotation.set(-.25, -.35, 0); giving.add(sign);
  sign.add(mesh(rbox(.34, .26, .02, .01), std(C.wood), 0, .13, 0));
  sign.add(mesh(new THREE.PlaneGeometry(.3, .22), std('#ffffff', { map: signTex }), 0, .13, .012));
  giving.add(mesh(new THREE.CylinderGeometry(.04, .05, .14, 16), std('#DDEDEA', { roughness: .2 }), -.24, .96, -.1));
  for (let i = 0; i < 5; i++) giving.add(mesh(new THREE.SphereGeometry(.032, 10, 8), std(flowerCols[i]), -.24 + Math.sin(i * 1.3) * .05, 1.1 + (i % 2) * .04, -.1 + Math.cos(i * 1.3) * .04));
  const jar = new THREE.Group(); jar.position.set(-.02, .885, .05); jar.scale.setScalar(1.25); giving.add(jar);
  jar.add(mesh(new THREE.CylinderGeometry(.14, .13, .34, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#EAF4F2', roughness: .05, metalness: .1, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }), 0, .17, 0));
  jar.add(rot(mesh(new THREE.TorusGeometry(.14, .01, 8, 40), std('#ffffff', { roughness: .1, transparent: true, opacity: .6 }), 0, .34, 0), Math.PI / 2));
  const ribbon = mesh(new THREE.TorusGeometry(.142, .014, 8, 40), std(C.orange), 0, .25, 0); ribbon.rotation.x = Math.PI / 2; jar.add(ribbon);
  const coinGeo = new THREE.CylinderGeometry(.03, .03, .007, 20), coinM = std(C.gold, { metalness: .85, roughness: .25 });
  const billM = std('#A9C99A', { roughness: .8, side: THREE.DoubleSide });
  const pile: THREE.Object3D[] = [];
  const addToPile = (o: THREE.Object3D) => {
    const n = pile.length, r = Math.sqrt((n % 9) / 9) * .09, a = n * 2.4;
    o.position.set(Math.cos(a) * r, .015 + Math.floor(n / 9) * .012, Math.sin(a) * r); o.rotation.set((rnd() - .5) * .5, rnd() * 6, (rnd() - .5) * .5);
    jar.add(o); pile.push(o);
  };
  for (let i = 0; i < 46; i++) addToPile(i % 5 ? new THREE.Mesh(coinGeo, coinM) : new THREE.Mesh(new THREE.PlaneGeometry(.1, .05), billM));
  const falling: { o: THREE.Object3D; v: number; spin: number }[] = [];
  const heartTex = canvasTex((c, w) => { c.fillStyle = '#F07B4A'; heart(c, w / 2, 8, w - 16); }, 64, 64);
  const hearts: { s: THREE.Sprite; age: number; dx: number }[] = [];

  // ——— Steam from the stove and over your bowl.
  const steamM = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: .3, depthWrite: false });
  const steam = Array.from({ length: 10 }, () => { const s = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), steamM.clone()); scene.add(s); return s; });
  const bowlSteam = Array.from({ length: 6 }, () => { const s = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), steamM.clone()); scene.add(s); return s; });

  // ——— The crew: volunteers who move between stations inside the truck (window, stove, prep, fridge, pass).
  const STATIONS = [
    { id: 'window', x: -1.35, z: Z - .62, ry: 0, pose: 'serve' as const }, { id: 'window2', x: .2, z: Z - .62, ry: 0, pose: 'reach' as const },
    { id: 'stove', x: -1.7, z: -Z + .82, ry: Math.PI, pose: 'stir' as const }, { id: 'prep', x: -.55, z: -Z + .82, ry: Math.PI, pose: 'reach' as const },
    { id: 'prep2', x: .55, z: -Z + .82, ry: Math.PI, pose: 'stir' as const }, { id: 'fridge', x: 1.75, z: -Z + .9, ry: Math.PI * .85, pose: 'reach' as const },
    { id: 'pass', x: -2.9, z: 0, ry: Math.PI / 2, pose: 'reach' as const },
  ];
  type Crew = { p: Person; at: number; from: number; path: THREE.Vector3[]; timer: number; home: boolean };
  const crew: Crew[] = [];
  const taken = new Set<number>();
  // Only one person uses the aisle at a time, so nobody walks through anybody.
  let aisle: Crew | null = null;
  let foodFn: ((id: FoodId, size?: number) => THREE.Object3D) | null = null;
  const counterMeals: THREE.Object3D[] = [];
  const tool = (c: Crew, id: FoodId | null, size = .22) => { c.p.carry(id && foodFn ? (() => { const o = foodFn!(id, size); o.rotation.set(Math.PI / 2, 0, 0); return o; })() : null); };
  const sendTo = (c: Crew, i: number) => {
    if (aisle && aisle !== c) return false;
    aisle = c; taken.delete(c.at); taken.add(i); c.from = c.at; c.at = i;
    const st = STATIONS[i], o = c.p.obj.position;
    c.path = [new THREE.Vector3(o.x, FLOOR, 0), new THREE.Vector3(st.x, FLOOR, 0), new THREE.Vector3(st.x, FLOOR, st.z)];
    // What they carry depends on where they are going: meals to the window, produce from the fridge.
    const to = STATIONS[i].id, from = STATIONS[c.from].id;
    tool(c, to.startsWith('window') ? 'styrofoam-dinner' : from === 'fridge' ? (['tomato', 'cabbage', 'carrot'] as FoodId[])[Math.floor(Math.random() * 3)] : null, to.startsWith('window') ? .26 : .14);
    c.p.set('walk');
    return true;
  };
  const atStation = (c: Crew) => {
    const st = STATIONS[c.at];
    // Set down whatever they brought: a meal joins the row on the serving counter.
    if (st.id.startsWith('window') && foodFn && c.p.hand.children.some((x) => x.userData.carried)) {
      const m = foodFn('styrofoam-dinner', .26); m.position.set(-.2 + (counterMeals.length % 4) * .3, WB + .06, Z + .18); m.rotation.y = (Math.random() - .5) * .3; truck.add(m); counterMeals.push(m);
      if (counterMeals.length > 6) counterMeals.shift()!.removeFromParent();
    }
    tool(c, st.id === 'stove' ? 'cooking-spoon' : st.id.startsWith('prep') ? (Math.random() < .5 ? 'whisk' : 'cooking-spoon') : null, .3);
    c.p.set(st.pose);
  };
  let server: Person | null = null, serveFlash = 0;

  // ——— Food, once the small models arrive.
  let crowd: Crowd | null = null;
  const SIT_Y = .02;
  const place = (o: THREE.Object3D, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  let alive = true;
  // People: lighter devices download fewer characters.
  const KINDS: Kind[] = tier > 1 ? ['m-casual_2', 'm-casual_hoodie', 'm-farmer', 'm-suit', 'm-worker', 'm-beach', 'w-casual', 'w-formal', 'w-suit', 'w-worker', 'w-adventurer'] : ['m-casual_2', 'm-casual_hoodie', 'm-worker', 'w-casual', 'w-formal', 'w-adventurer'];
  let cast: Awaited<ReturnType<typeof loadCast>> | null = null, friend: Person | null = null;
  const castReady = loadCast(`${BASE}models/people`, KINDS).then((c) => {
    if (!alive) return;
    cast = c;
    const crewKinds: Kind[] = ['m-casual_2', 'w-casual', 'm-casual_hoodie', 'w-adventurer', 'm-beach'].filter((k) => KINDS.includes(k as Kind)) as Kind[];
    const starts = [0, 2, 3, 1, 6];
    crewKinds.forEach((k, i) => {
      const p = c.make(k, { height: 1.68, skin: [1, 3, 4, 0, 2][i] });
      const st = STATIONS[starts[i]]; p.obj.position.set(st.x, FLOOR, st.z); p.obj.rotation.y = st.ry; truck.add(p.obj); p.set(st.pose);
      const cr: Crew = { p, at: starts[i], from: starts[i], path: [], timer: 2 + Math.random() * 5, home: i === 0 }; taken.add(starts[i]); crew.push(cr);
      if (i === 0) server = p;
    });
    friend = c.make('w-formal', { height: 1.64, skin: 2 }); place(friend.obj, picnic, .45, SIT_Y, -.95); friend.set('sit');
  }).catch(() => {});
  loadFood().then(async (food) => {
    if (!alive) return;
    foodFn = food;
    const F = (id: FoodId, size: number, x: number, y: number, z: number, ry = 0) => place(food(id, size), truck, x, y, z, ry);
    for (let i = 0; i < 4; i++) F('styrofoam-dinner', .26, -.2 + i * .3, WB + .06 + (i % 2) * .09, Z + .18, (rnd() - .5) * .3);
    F('pot-stew', .36, -1.9, FLOOR + .96, -Z + .38); F('pot-stew', .32, -1.25, FLOOR + .96, -Z + .4);
    F('loaf-round', .2, -1.8, WB + .07, Z + .2); F('apple', .08, -1.5, WB + .05, Z + .22); F('orange', .08, -1.4, WB + .05, Z + .16);
    for (let i = 0; i < 6; i++) F((['pumpkin-basic', 'cabbage', 'carrot', 'tomato', 'corn', 'cabbage'] as FoodId[])[i], .15, .1 + i * .32, 2.24, -Z + .2, rnd() * 3);
    for (let i = 0; i < 6; i++) F('styrofoam-dinner', .24, 1.4 + (i % 2) * .3, FLOOR + .93 + Math.floor(i / 2) * .1, Z - .32);
    // A working kitchen: stove top, prep line, shelves, rail, sink.
    const BACK = FLOOR + .93, bz = -Z + .4;
    F('frying-pan', .34, -2.25, BACK + .02, bz, .6); F('pot-lid', .26, -1.05, BACK + .02, bz + .05);
    F('cutting-board', .4, -.55, BACK, bz); F('carrot', .14, -.62, BACK + .04, bz - .02, 1); F('tomato', .08, -.42, BACK + .04, bz + .05);
    F('cutting-board', .4, .55, BACK, bz, .2); F('cabbage', .16, .5, BACK + .06, bz); F('bread', .2, .7, BACK + .05, bz + .04, .4);
    F('knife-block', .2, .05, BACK, bz - .1); F('bottle-oil', .2, -2.85, BACK, bz - .1); F('shaker-salt', .08, -2.7, BACK, bz - .05); F('shaker-pepper', .08, -2.62, BACK, bz - .1);
    F('bowl', .2, 1.05, BACK, bz); F('rollingPin', .3, -.1, BACK + .02, bz + .12, 1.2);
    for (let i = 0; i < 5; i++) F('plate', .24, 1.25, 2.17 + i * .018, -Z + .26);
    for (let i = 0; i < 4; i++) F('plate-deep', .22, 1.6, 2.17 + i * .03, -Z + .26);
    for (let i = 0; i < 4; i++) F('cup', .09, .45 + i * .14, 2.62, -Z + .26);
    for (let i = 0; i < 3; i++) F('bowl', .18, .1 + i * .22, 2.62, -Z + .26);
    // Pan rail above the prep line.
    truck.add(rot(mesh(new THREE.CylinderGeometry(.012, .012, 1.8, 8), chrome, -.6, TOP - .55, -Z + .25), 0, 0, Math.PI / 2));
    for (let i = 0; i < 4; i++) { const pan = food(i % 2 ? 'pan' : 'frying-pan', .3); pan.rotation.set(Math.PI / 2, 0, 0); place(pan, truck, -1.3 + i * .45, TOP - .75, -Z + .22); }
    // Sink with a tap, a paper towel roll, a bin, ticket slips on a rail.
    truck.add(mesh(new THREE.BoxGeometry(.5, .06, .4), std('#9EA4A8', { metalness: .8, roughness: .2 }), 1.75, BACK - .02, Z - .32));
    truck.add(mesh(new THREE.TorusGeometry(.1, .012, 8, 16, Math.PI), chrome, 1.75, BACK + .12, Z - .48));
    truck.add(rot(mesh(new THREE.CylinderGeometry(.06, .06, .26, 16), std('#FFFFFF', { roughness: .9 }), 2.3, 2.05, Z - .12), 0, 0, Math.PI / 2));
    truck.add(mesh(new THREE.CylinderGeometry(.16, .14, .5, 20), std('#3B4A40', { roughness: .6 }), 2.25, FLOOR + .25, -.1));
    truck.add(mesh(new THREE.BoxGeometry(1.3, .02, .03), chrome, -.75, WT - .12, Z - .08));
    for (let i = 0; i < 5; i++) truck.add(mesh(new THREE.PlaneGeometry(.1, .14), std(i % 2 ? '#FFF8E1' : '#FFFFFF', { side: THREE.DoubleSide }), -1.3 + i * .26, WT - .21, Z - .09));
    // Your seat: a warm tray, and a friend across the table.
    for (const [id, sz, x, z] of [['plate-dinner', .34, .45, .22], ['bowl-soup', .2, .4, .2], ['loaf-round', .13, .62, .12], ['apple', .07, .25, .35], ['mug', .1, .7, .34], ['utensil-spoon', .16, .2, .18]] as [FoodId, number, number, number][]) place(food(id, sz), picnic, x, .8, z, rnd() * .4);
    for (const [id, sz, x, z] of [['plate-dinner', .34, .45, -.25], ['salad', .18, .45, -.25], ['cup-tea', .09, .2, -.3]] as [FoodId, number, number, number][]) place(food(id, sz), picnic, x, .8, z);
    const tableFood = new THREE.Group(); scene.add(tableFood);
    for (const s of seats) place(food((['salad', 'sandwich', 'bowl-broth', 'pie', 'rice-ball'] as FoodId[])[Math.floor(rnd() * 5)], .16), tableFood, s.pos.x - Math.sin(s.face) * .35, .94, s.pos.z - Math.cos(s.face) * .35);
    const isPerson = (o: THREE.Object3D) => crew.some((c) => c.p.obj === o) || o === friend?.obj;
    bake(truck, isPerson); bake(picnic, isPerson); bake(tableFood);
    if (!cast) await castReady;
    crowd = new Crowd(scene, {
      window: new THREE.Vector3(-.9, .14, Z + .95), queueDir: new THREE.Vector3(-.99, 0, .14), seats, minZ: Z + .75,
      entries: [new THREE.Vector3(-21, .14, 2.1), new THREE.Vector3(21, .14, 2.1), new THREE.Vector3(-19, .14, 13), new THREE.Vector3(19, .14, 14)],
      exits: [new THREE.Vector3(-22, .14, 2.1), new THREE.Vector3(22, .14, 2.1), new THREE.Vector3(-20, .14, 13), new THREE.Vector3(20, .14, 14)],
      obstacles: [
        ...truckObstacles, { x: -4.2, z: 7.4, r: 1.5 }, { x: 3.2, z: 3.1, r: .55 }, { x: 5.6, z: 4.4, r: 1 }, { x: 8.4, z: 3.4, r: 1.2 },
        { x: -6.2, z: 3.9, r: 1.25 }, { x: -9.4, z: 6.6, r: 1.25 }, { x: -11.5, z: 12, r: 1.25 }, { x: 11, z: 7.4, r: 1.25 },
        ...[-15, -9, 7, 13].map((x) => ({ x, z: 3.4, r: 1.4 })), ...[-14, -11, 8.5, 12].map((x) => ({ x, z: 2.4, r: .25 })),
        { x: -14, z: 9, r: 2.6 }, { x: 14, z: 11, r: 2.6 }, { x: -6, z: 15, r: 2.6 }, { x: 8, z: 16, r: 2.6 }, { x: 1, z: 12, r: .9 }, { x: -8, z: 2.4, r: .25 }, { x: 5.6, z: 2.4, r: .25 },
      ],
      max: tier > 1 ? 12 : 8,
      meal: () => food('styrofoam-dinner', .26),
      onOrder: () => server?.set('nod'),
      onServe: () => { server?.set('reach'); serveFlash = 1.2; },
      make: (mobility) => cast!.make(undefined, { mobility, height: 1.6 + Math.random() * .22, chair: () => { const c = makeChair(); c.scale.setScalar(1.05); return c; } }),
    });
  }).catch(() => {});

  // ——— Bake static detail into few draw calls (the steam, lights, jar coins and people stay separate).
  // The exterior is a Blender model (public/models/truck.glb); drop the placeholder shell built above.
  for (const c of [...truck.children]) if ((c as THREE.Mesh).isMesh && !c.userData.keep) c.removeFromParent();
  bake(truck);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${BASE}models/truck.glb`, (g) => {
    if (!alive) return;
    g.scene.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mat = m.material as THREE.MeshStandardMaterial; if (/Bulb|Lamp/.test(mat.name)) mat.emissiveIntensity = 1.4; if (/Logo/.test(mat.name)) { mat.transparent = true; mat.alphaTest = .05; } } });
    truck.add(g.scene);
  });
  for (const o of [...scene.children]) if ((o as THREE.Group).isGroup && o !== truck && o !== city && o !== giving && o !== picnic && o !== board && o !== bulletin && o !== statue) bake(o);
  bake(board); bake(bulletin); bake(picnic);

  // ——— Plaza furniture so the square feels lived in: trees in the planters, benches, flower beds.
  const benchWood = std('#B07A4A', { roughness: .7 }), benchIron = std('#2E3A33', { metalness: .5, roughness: .4 });
  const bench = (x: number, z: number, ry: number) => {
    const b = new THREE.Group(); b.position.set(x, .14, z); b.rotation.y = ry; scene.add(b);
    for (let i = 0; i < 3; i++) b.add(mesh(rbox(1.7, .05, .12, .02), benchWood, 0, .45, -.12 + i * .13));
    for (let i = 0; i < 2; i++) b.add(mesh(rbox(1.7, .1, .04, .02), benchWood, 0, .68 + i * .16, -.24));
    for (const sx of [-.75, .75]) { b.add(mesh(new THREE.BoxGeometry(.05, .45, .4), benchIron, sx, .22, 0)); b.add(mesh(new THREE.BoxGeometry(.05, .5, .04), benchIron, sx, .7, -.24)); }
  };
  for (const [x, z] of [[-14, 9], [14, 11], [-6, 15], [8, 16]] as const) {
    tree(scene, x, z, 1.25);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; scene.add(mesh(new THREE.SphereGeometry(.07, 8, 6), std(['#FF6F91', '#FFD166', '#FFFFFF', '#C08BFF'][i % 4]), x + Math.cos(a) * .7, .78, z + Math.sin(a) * .7)); }
    bench(x + 2, z, -Math.PI / 2); bench(x - 2, z, Math.PI / 2);
  }
  for (const [x, z, ry] of [[1, 12, 0], [-9, 17, 0], [17, 15, -.4], [-18, 13, .4]] as const) bench(x, z, ry);
  const bed = (x: number, z: number, w: number) => {
    scene.add(mesh(rbox(w, .3, 1, .06), std('#9C8B78', { roughness: .9 }), x, .29, z));
    scene.add(mesh(new THREE.BoxGeometry(w - .15, .06, .85), std('#4E6B3A', { roughness: 1 }), x, .45, z));
    for (let i = 0; i < w * 9; i++) scene.add(mesh(new THREE.SphereGeometry(.08 + rnd() * .05, 8, 6), std(['#FF6F91', '#FFD166', '#F78C6B', '#FFFFFF', '#C08BFF', '#6FBF73'][i % 6]), x + (rnd() - .5) * (w - .3), .55 + rnd() * .08, z + (rnd() - .5) * .7));
  };
  bed(-1, 19, 6); bed(12, 19.5, 5); bed(-14, 19.5, 5);

  // ——— Storefronts: striped awnings and flower boxes in cheerful colors.
  const awnCols = ['#E8574A', '#2E9E6A', '#F2B03D', '#3D7DD8', '#E07A9A', '#13703F'];
  for (let i = 0; i < 7; i++) {
    const x = -45 + i * 15, col = awnCols[i % awnCols.length];
    const tex2 = canvasTex((c, w, h) => { for (let k = 0; k < 10; k++) { c.fillStyle = k % 2 ? '#FFF7EA' : col; c.fillRect(k * w / 10, 0, w / 10 + 1, h); } }, 256, 32);
    const aw = mesh(new THREE.BoxGeometry(5, .05, 1.2), std('#ffffff', { map: tex2, roughness: .8 }), x - 3.2, 3.3, -14.45); aw.rotation.x = .32; scene.add(aw);
    // A named shop sign above each awning.
    const name = ['Corner Bakery', 'Books & Tea', 'Flower Shop', 'San Jose Pizza', 'Café Luna', 'Noodle House', 'Fresh Market'][i];
    const pizza = name === 'San Jose Pizza';
    const signT = canvasTex((c, w, h) => {
      c.fillStyle = pizza ? '#C8352B' : col; c.fillRect(0, 0, w, h); c.strokeStyle = '#FFF7EA'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      let left = 0;
      if (pizza) {
        // A pizza-slice logo: crust, cheese, pepperoni.
        c.save(); c.translate(70, 64); c.fillStyle = '#E8B04A'; c.beginPath(); c.moveTo(0, 44); c.lineTo(-38, -34); c.quadraticCurveTo(0, -50, 38, -34); c.closePath(); c.fill();
        c.fillStyle = '#FFD86B'; c.beginPath(); c.moveTo(0, 38); c.lineTo(-30, -24); c.quadraticCurveTo(0, -36, 30, -24); c.closePath(); c.fill();
        c.fillStyle = '#B7281F'; for (const [x, y] of [[-10, -12], [12, -6], [0, 16]]) { c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); }
        c.restore(); left = 70;
      }
      c.fillStyle = '#FFF7EA'; c.textAlign = 'center';
      let fs = 64; do { c.font = `italic 400 ${fs}px Georgia, serif`; fs -= 2; } while (c.measureText(name).width > w - 60 - left * 1.6 && fs > 24);
      c.fillText(name, w / 2 + left * .6, 84);
    }, 640, 128);
    scene.add(mesh(new THREE.BoxGeometry(3.2, .64, .06), std('#ffffff', { map: signT, roughness: .6 }), x - 3.2, 4.1, -14.97));
    const fb = new THREE.Group(); fb.position.set(x + 3.6, .14, -14.75); scene.add(fb);
    fb.add(mesh(rbox(1.2, .4, .4, .04), std('#6B4A33'), 0, .2, 0));
    for (let k = 0; k < 7; k++) fb.add(mesh(new THREE.SphereGeometry(.09, 8, 6), std(['#FF6F91', '#FFD166', '#F78C6B', '#FFFFFF', '#C08BFF'][k % 5]), -.45 + k * .15, .48 + rnd() * .08, (rnd() - .5) * .2));
  }

  // ——— Street life: traffic in both directions, birds, and a truck that is clearly running.
  const carCols = ['#E24B3B', '#F2C14E', '#3D7DD8', '#F4F1EA', '#2FA37A', '#F08A3C', '#7A5BD1', '#1E2A38'];
  const cars: { g: THREE.Group; lane: number; dir: number; speed: number; wheels: THREE.Mesh[] }[] = [];
  const glassCar = std('#9FC3D6', { roughness: .1, metalness: .4 }), tireM = std('#222', { roughness: .9 }), hubM = std('#cfcfcf', { metalness: .7, roughness: .3 });
  const lanes = [{ z: -7.6, dir: 1 }, { z: -10.6, dir: -1 }];
  for (let i = 0; i < (tier > 1 ? 4 : 2); i++) {
    const g = new THREE.Group(), body = std(carCols[i % carCols.length], { roughness: .35, metalness: .3 }), van = i % 4 === 3;
    g.add(mesh(rbox(van ? 4.4 : 3.9, van ? 1.3 : .75, 1.75, .25), body, 0, van ? .95 : .62, 0));
    g.add(mesh(rbox(van ? 1.4 : 2.1, .6, 1.6, .22), van ? body : glassCar, van ? 1.3 : -.15, van ? 1.65 : 1.22, 0));
    if (!van) g.add(mesh(rbox(1.9, .08, 1.62, .04), body, -.15, 1.53, 0));
    for (const z of [-.8, .8]) for (const x of [-1.25, 1.25]) { const w = mesh(new THREE.CylinderGeometry(.34, .34, .24, 18), tireM, x, .34, z); w.rotation.x = Math.PI / 2; g.add(w); const hb = mesh(new THREE.CylinderGeometry(.16, .16, .26, 12), hubM, x, .34, z); hb.rotation.x = Math.PI / 2; g.add(hb); }
    for (const z of [-.6, .6]) { g.add(mesh(new THREE.SphereGeometry(.09, 10, 8), std('#FFF6D6', { emissive: '#FFF0C0', emissiveIntensity: 1 }), 1.95, .7, z)); g.add(mesh(new THREE.SphereGeometry(.08, 10, 8), std('#C0262A', { emissive: '#FF2A2A', emissiveIntensity: .8 }), -1.95, .7, z)); }
    const lane = i % 2; g.rotation.y = lanes[lane].dir > 0 ? 0 : Math.PI;
    g.position.set(-50 + i * 27 + Math.random() * 6, .14, lanes[lane].z); scene.add(g);
    cars.push({ g, lane, dir: lanes[lane].dir, speed: 2.4 + Math.random() * 1.2, wheels: g.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'CylinderGeometry') as THREE.Mesh[] });
  }
  const birdGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.35, .1, 0), new THREE.Vector3(0, 0, .05), new THREE.Vector3(.35, .1, 0)]);
  const birds = Array.from({ length: 9 }, (_, i) => { const b = new THREE.Line(birdGeo.clone(), new THREE.LineBasicMaterial({ color: '#2A3138' })); scene.add(b); return { b, r: 14 + (i % 3) * 3, h: 16 + (i % 4), ph: i * .7 }; });
  const exhaust = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#d7d7d7', transparent: true, depthWrite: false })); scene.add(m); return m; });
  const markers: THREE.Mesh[] = [];
  for (const [x, z] of [[X0 + .05, Z + .07], [X1 + 1.5, Z + .07], [X0 + .05, -Z - .07]] as const) { const m = mesh(new THREE.SphereGeometry(.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#FFB347', emissive: '#FF9A1F', emissiveIntensity: 1 }), x, .95, z); truck.add(keep(m)); markers.push(m); }

  // ——— Picking.
  const targets: Record<StationId, THREE.Object3D[]> = { volunteer: [truck], donate: [giving], about: [board], resources: [picnic], contact: [bulletin] };
  const owner = new Map<THREE.Object3D, StationId>();
  for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) list.forEach((o) => o.traverse((c) => owner.set(c, id)));

  // ——— Views.
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 260);
  const W = (o: THREE.Object3D, x: number, y: number, z: number) => { o.updateMatrixWorld(true); return o.localToWorld(new THREE.Vector3(x, y, z)).toArray() as View['pos']; };
  // A board view fits the board to about 94% of the screen, square to its face, so the page can take over seamlessly.
  const fitBoard = (o: THREE.Object3D, b: { w: number; h: number; y: number; z: number }): View => {
    const fov = 30, t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const d = Math.max(b.h / .94 / (2 * t), b.w / .94 / (2 * t * camera.aspect));
    return { pos: W(o, 0, b.y, b.z + d), look: W(o, 0, b.y, b.z), fov };
  };
  const views = (): Record<StationId, View> => ({
    volunteer: { pos: W(truck, 2.25, TOP - .32, .25), look: W(truck, -1.6, 1.45, .45), fov: 64 },
    donate: { pos: [4.0, 1.68, 4.35], look: [3.2, 1.18, 3.1], fov: 32 },
    about: fitBoard(board, BOARD),
    resources: { pos: W(picnic, .45, 1.3, 1.15), look: W(picnic, .45, 1.05, -.5), fov: 56 },
    contact: fitBoard(bulletin, PIN),
  });

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .5, zoomSpeed: .6,
    minDistance: 9, maxDistance: 34, minPolarAngle: .85, maxPolarAngle: 1.4, minAzimuthAngle: -.7, maxAzimuthAngle: .7,
  });
  let narrow = false, peeking = false, focused: StationId | null = null, flying = true, shift = 0, fovGoal = 30, arrivedFor: StationId | null = null;
  const baseFov = () => (narrow ? 40 : 30);
  // The opening view fits the whole scene (tables on the left to the community board on the right) for any screen shape.
  const overview = (): View => {
    const half = narrow ? 6.5 : 8.6, look: View['look'] = [narrow ? .4 : 1, 1.8, 3.2];
    const t = Math.tan(THREE.MathUtils.degToRad(baseFov() / 2)), dist = Math.max(half / (t * camera.aspect), 5.5 / t) * 1.02;
    const dir = new THREE.Vector3(.32, .3, 1).normalize().multiplyScalar(dist);
    return { pos: [look[0] + dir.x, look[1] + dir.y, look[2] + dir.z], look };
  };
  const station = (id: StationId, peek = false): View => {
    if (peek) { const a = ANCHORS[id]; return { pos: [a[0] + .8, a[1] + 2, a[2] + 9], look: [a[0], a[1] - 1.4, a[2]] }; }
    const v = views()[id];
    if (narrow && (id === 'volunteer' || id === 'resources' || id === 'donate')) return { ...v, look: [v.look[0], v.look[1] - .45, v.look[2]], fov: (v.fov ?? 30) + 10 };
    return v;
  };
  let goal = overview();
  camera.position.set(...goal.pos); controls.target.set(...goal.look);
  if (!reduce) camera.position.set(goal.pos[0] - 8, goal.pos[1] + 10, goal.pos[2] + 14);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); css?.setSize(w, h);
    camera.aspect = w / h; narrow = w / h < 1;
    if (!focused) { goal = overview(); flying = true; fovGoal = baseFov(); } else if (!peeking) goal = station(focused);
    camera.updateProjectionMatrix();
  }
  // Real page surfaces mounted on the boards in the world (one board, not a 3D copy plus an overlay).
  const cssObjs: { id: StationId; o: CSS3DObject; el: HTMLElement }[] = [];
  const css = new CSS3DRenderer();
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1', overflow: 'hidden' });
  css.domElement.className = 'surfaces';
  canvas.after(css.domElement);
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  camera.fov = fovGoal; camera.updateProjectionMatrix();

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover: StationId | null = null;
  const pick = (e: PointerEvent): StationId | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(Object.values(targets).flat(), true)) { const id = owner.get(hit.object); if (id) return id; }
    return null;
  };
  const onMove = (e: PointerEvent) => {
    hover = e.pointerType === 'mouse' && !focused ? pick(e) : null;
    canvas.style.cursor = hover ? 'pointer' : focused ? '' : 'grab';
    for (const [id, el] of Object.entries(labels)) el?.classList.toggle('hot', id === hover);
  };
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if ((focused && !peeking) || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const id = pick(e); if (id) onSelect(id);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  function placeLabels(w: number, h: number) {
    for (const [id, el] of Object.entries(labels) as [StationId, HTMLElement][]) {
      v.set(...ANCHORS[id]).project(camera);
      const half = el.offsetWidth / 2 + 8;
      el.style.transform = `translate(${Math.min(w - half, Math.max(half, (v.x * .5 + .5) * w))}px, ${(-v.y * .5 + .5) * h}px) translate(-50%, -100%)`;
      el.classList.toggle('off', v.z > 1 || (focused !== null && (!peeking || focused !== id)));
    }
  }

  let last = 0, slow = 0, sampled = 0, frameNo = 0;
  function frame(t: number) {
    const raw = t - last, dt = Math.min(.05, raw); last = t;
    // Adaptive quality: if frames average over ~28 ms for a couple of seconds, drop a tier.
    if (tier > 0 && t > 3 && raw < .5) {
      slow += raw > .028 ? 1 : 0; sampled++;
      if (sampled >= 120) {
        if (slow / sampled > .5) { tier--; applyTier(); sun.shadow.map?.dispose(); sun.shadow.map = null; resize(); crowd?.limit(tier ? 7 : 5); }
        slow = sampled = 0;
      }
    }
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4);
    controls.enabled = !focused && !narrow && !flying;
    if (flying) {
      camera.position.lerp(v.set(...goal.pos), k);
      controls.target.lerp(v2.set(...goal.look), k);
      const near = camera.position.distanceTo(v) < .04 && controls.target.distanceTo(v2) < .04;
      // Snap exactly onto the target once close, so text on the boards stops shimmering.
      if (near && focused && !peeking) { camera.position.copy(v); controls.target.copy(v2); }
      if (near && focused && !peeking && arrivedFor !== focused) { arrivedFor = focused; onArrive(focused); }
      if (near && !focused) flying = false;
      camera.lookAt(controls.target);
    } else controls.update();
    if (Math.abs(camera.fov - fovGoal) > .01) { camera.fov += (fovGoal - camera.fov) * k; camera.updateProjectionMatrix(); }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const side = focused === 'volunteer' || focused === 'resources' || focused === 'donate';
    shift += ((narrow || !focused || peeking || !side ? 0 : .13) - shift) * k;
    camera.setViewOffset(w, h, shift * w, 0, w, h);

    // Life.
    crowd?.update(dt);
    for (const c of cars) {
      // Keep a safe gap to the car ahead in the same lane; ease speed instead of snapping.
      const ahead = cars.filter((o) => o !== c && o.lane === c.lane && (o.g.position.x - c.g.position.x) * c.dir > 0).reduce((m, o) => Math.min(m, Math.abs(o.g.position.x - c.g.position.x)), 99);
      const want = ahead < 9 ? 0 : c.speed; c.wheels.forEach((w) => (w.rotation.y += want * dt * 3));
      c.g.position.x += c.dir * Math.min(want, c.speed) * dt;
      // Loop around the block, re-entering only when the lane entrance is clear.
      if (Math.abs(c.g.position.x) > 55) { const x0 = -55 * c.dir; if (cars.every((o) => o === c || o.lane !== c.lane || Math.abs(o.g.position.x - x0) > 12)) c.g.position.x = x0; else c.g.position.x = 55 * c.dir; }
    }
    for (const bd of birds) { const a = t * .12 + bd.ph; bd.b.position.set(Math.cos(a) * bd.r, bd.h + Math.sin(t + bd.ph) * .6, -14 + Math.sin(a) * bd.r * .5); bd.b.rotation.y = -a; const f = Math.sin(t * 9 + bd.ph) * .18, p = bd.b.geometry.attributes.position; p.setY(0, .1 + f); p.setY(2, .1 + f); p.needsUpdate = true; }
    exhaust.forEach((m, i) => { const age = (t * .6 + i / exhaust.length) % 1; m.position.set(X0 - .2 - age * .9, .42 + age * .5, -Z + .3 + Math.sin(i + t) * .05); m.scale.setScalar(.6 + age * 2.4); (m.material as THREE.MeshStandardMaterial).opacity = .35 * (1 - age); });
    const blink = Math.sin(t * 5) > .3 ? 1.6 : .15; for (const m of markers) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = blink;
    truck.position.y = -.06 + Math.sin(t * 38) * .0025;
    for (const c of crew) c.p.obj.visible = !focused || peeking || c.p.obj.getWorldPosition(v2).distanceTo(camera.position) > 1.1;
    if (crowd) for (const n of crowd.npcs) n.f.obj.visible = !focused || peeking || n.f.obj.position.distanceTo(camera.position) > 2.4;
    for (const c of crew) {
      c.p.update(dt);
      const o = c.p.obj;
      if (c.path.length) {
        const tgt = c.path[0], d = v.subVectors(tgt, o.position); d.y = 0; const dist = d.length();
        if (dist < .04) { c.path.shift(); if (!c.path.length) { if (aisle === c) aisle = null; atStation(c); c.timer = 4 + Math.random() * 7; } }
        else { o.position.addScaledVector(d.normalize(), Math.min(dist, dt * .9)); o.rotation.y += Math.atan2(Math.sin(Math.atan2(d.x, d.z) - o.rotation.y), Math.cos(Math.atan2(d.x, d.z) - o.rotation.y)) * Math.min(1, dt * 8); }
        continue;
      }
      const st = STATIONS[c.at];
      o.rotation.y += Math.atan2(Math.sin(st.ry - o.rotation.y), Math.cos(st.ry - o.rotation.y)) * Math.min(1, dt * 4);
      if (c.p === server && serveFlash > 0) { serveFlash -= dt; continue; }
      c.timer -= dt;
      if (c.timer <= 0) {
        if (c.home || Math.random() < .35) { c.p.set(Math.random() < .5 ? st.pose : 'idle'); c.timer = 3 + Math.random() * 5; }
        else { const free = STATIONS.map((_, i) => i).filter((i) => !taken.has(i) && i !== 0); if (!free.length || !sendTo(c, free[Math.floor(Math.random() * free.length)])) c.timer = 1 + Math.random() * 2; }
      }
    }
    friend?.update(dt);
    bulbs.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(t * 2 + i) * .2));
    steam.forEach((s, i) => {
      const age = (t * .28 + i / steam.length) % 1;
      s.position.set(-1.6 + Math.sin(age * 5 + i) * .15, FLOOR + 1.1 + age * 1.1, -Z + .4 + Math.sin(i) * .1);
      s.scale.setScalar(.8 + age * 2.5); (s.material as THREE.MeshStandardMaterial).opacity = .35 * (1 - age);
    });
    const bowl = v.copy(picnic.localToWorld(v2.set(.4, .98, .2)));
    bowlSteam.forEach((s, i) => {
      const age = (t * .3 + i / bowlSteam.length) % 1;
      s.position.set(bowl.x + Math.sin(age * 6 + i) * .03, bowl.y + age * .45, bowl.z);
      s.scale.setScalar(.6 + age * 2.4); (s.material as THREE.MeshStandardMaterial).opacity = .25 * (1 - age);
    });
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i]; f.v += dt * 2.2; f.o.position.y -= f.v * dt; f.o.rotation.x += f.spin * dt;
      if (f.o.position.y <= .02 + Math.floor(pile.length / 9) * .012) { falling.splice(i, 1); f.o.removeFromParent(); addToPile(f.o); }
    }
    for (let i = hearts.length - 1; i >= 0; i--) {
      const hh = hearts[i]; hh.age += dt / 2.4;
      hh.s.position.y += dt * .22; hh.s.position.x += Math.sin(hh.age * 8) * .002 + hh.dx * dt;
      hh.s.material.opacity = Math.sin(Math.min(1, Math.max(0, hh.age)) * Math.PI);
      if (hh.age >= 1) { hh.s.removeFromParent(); hearts.splice(i, 1); }
    }
    for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) {
      if (id === 'volunteer') continue;
      const s = id === hover ? 1.04 : 1; list.forEach((o) => o.scale.lerp(v.set(s, s, s), .2));
    }
    // Shadows refresh at half rate: people move slowly enough that nobody notices, and it halves the shadow cost.
    if ((frameNo++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    css.domElement.style.transform = `translateX(${-shift * w}px)`;
    for (const c of cssObjs) { const on = focused === c.id && !peeking && camera.position.distanceTo(v.set(...goal.pos)) < 1.5; c.el.style.opacity = on ? '1' : '0'; c.o.visible = on || c.el.style.opacity !== '0'; }
    css.render(scene, camera);
    placeLabels(w, h);
  }

  let raf = 0, visible = true;
  const start = performance.now();
  const prof = { js: 0, n: 0 }; (window as unknown as { __prof: unknown }).__prof = prof;
  const tick = () => { if (!visible || !alive) return; const t0 = performance.now(); frame((t0 - start) / 1000); prof.js += performance.now() - t0; prof.n++; raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) tick(); });
  io.observe(canvas);
  tick();

  (window as unknown as { __r: unknown }).__r = renderer;
  return {
    surfaces(m) {
      for (const [id, el] of Object.entries(m) as ['about' | 'contact', HTMLElement][]) {
        const [host, b, pw] = id === 'about' ? [board, BOARD, 1600] : [bulletin, PIN, 1760];
        const o = new CSS3DObject(el); o.position.set(0, b.y, b.z + .004); o.scale.setScalar(b.w / pw); host.add(o); cssObjs.push({ id, o, el });
      }
    },
    focus(id, peek = false) {
      focused = id; peeking = peek; arrivedFor = null; goal = id ? station(id, peek) : overview(); flying = true;
      fovGoal = (id && !peek && goal.fov) || baseFov();
      if (reduce) { camera.fov = fovGoal; camera.updateProjectionMatrix(); frame(8); }
    },
    give(amount) {
      const n = Math.min(14, Math.max(2, Math.round(amount / 5)));
      for (let i = 0; i < n; i++) {
        const o = i % 4 === 3 ? new THREE.Mesh(new THREE.PlaneGeometry(.1, .05), billM) : new THREE.Mesh(coinGeo, coinM);
        o.position.set((rnd() - .5) * .1, .55 + i * .07, (rnd() - .5) * .1); jar.add(o);
        falling.push({ o, v: 0, spin: 4 + rnd() * 8 });
      }
      for (let i = 0; i < Math.min(8, 2 + n / 2); i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, opacity: 0, depthWrite: false }));
        s.scale.setScalar(.05 + rnd() * .04); s.position.copy(jar.localToWorld(new THREE.Vector3((rnd() - .5) * .2, .35 + rnd() * .1, (rnd() - .5) * .1)));
        scene.add(s); hearts.push({ s, age: -i * .15, dx: (rnd() - .5) * .08 });
      }
    },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      renderer.dispose(); pmrem.dispose();
    },
  };
}
