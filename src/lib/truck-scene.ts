// The whole site is one 3D world: a Free Meals on Wheels food truck on a small plaza floating in a blue sky.
// People and objects around it are the navigation; clicking one moves the camera there and opens its card.
// People are architectural-model figures built in code; food is CC0 models by Kenney (kenney.nl).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadFood, type FoodId } from './world/assets';
import { Figure } from './world/figure';
import { Crowd, type Seat } from './world/crowd';

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type View = { pos: [number, number, number]; look: [number, number, number]; fov?: number };

const C = {
  green: '#2E6649', greenDark: '#1F4D34', orange: '#DD7436', cream: '#F7F1E6', gold: '#D9BC7E',
  paving: '#ECE6DC', wood: '#A9784F', ink: '#2A2F2C', tire: '#2A2A2A', glass: '#AFCBD3', steel: '#C9CCCF',
};

const OVERVIEW: View = { pos: [3.5, 7.5, 21], look: [.2, 1.6, 1] };
const OVERVIEW_NARROW: View = { pos: [1.5, 9, 29], look: [.2, 2.2, 1] };
const ANCHORS: Record<StationId, [number, number, number]> = {
  volunteer: [-.7, 3.75, 1.3], donate: [3.2, 1.85, 3.1], about: [6.2, 2.9, 2.6], resources: [-6, 3.2, 4.6], contact: [8.6, 3.05, 1.2],
};

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: 0, ...extra });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
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

function tree(parent: THREE.Object3D, x: number, z: number, s: number) {
  const t = new THREE.Group(); t.position.set(x, .14, z); t.scale.setScalar(s); parent.add(t);
  t.add(mesh(new THREE.CylinderGeometry(.07, .11, 1.8, 10), std('#7A5A3F', { roughness: .9 }), 0, .9, 0));
  const cols = ['#5F8A5C', '#6F9866', '#557F53'];
  for (let i = 0; i < 4; i++) t.add(mesh(new THREE.SphereGeometry(.62 - i * .07, 24, 18), std(cols[i % 3], { roughness: .95 }), Math.sin(i * 2.3) * .32, 2.05 + i * .26, Math.cos(i * 2.3) * .28));
}

export interface TruckApi { focus(id: StationId | null, peek?: boolean): void; give(amount: number): void; dispose(): void }

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
    renderer.setPixelRatio(Math.min(devicePixelRatio, [1, 1.25, 1.75][tier]));
    renderer.shadowMap.enabled = tier > 0;
    renderer.shadowMap.type = tier > 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  };
  applyTier();
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = canvasTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3D8ED8'); g.addColorStop(.6, '#6FB2E4'); g.addColorStop(1, '#A9D4EF');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 4, 256);
  scene.fog = new THREE.Fog('#9CCCEB', 40, 110);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.add(new THREE.HemisphereLight('#E4F1FF', '#C9B9A2', 1.0));
  const sun = new THREE.DirectionalLight('#FFF1DE', 2.6); sun.position.set(-7, 13, 9); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(tier > 1 ? 2048 : 1024); sun.shadow.radius = 5; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 45 });
  scene.add(sun);

  // ——— The floating plaza.
  const pavTex = canvasTex((c, w, h) => {
    c.fillStyle = C.paving; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(140,120,95,.18)'; c.lineWidth = 2;
    for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke(); }
  }, 512, 512, [16, 8]);
  const edgeM = std('#D9D1C4');
  scene.add(mesh(new THREE.BoxGeometry(30, .5, 16), [edgeM, edgeM, std('#ffffff', { map: pavTex, roughness: .95 }), std('#5D5A55'), edgeM, edgeM], 0, -.11, 3));
  const under = mesh(new THREE.CylinderGeometry(1, .2, 1, 40), std('#6C6158', { roughness: 1 }), 0, -2.85, 3); under.scale.set(14.5, 4.6, 7.4); scene.add(under);
  scene.add(mesh(new THREE.BoxGeometry(30.3, .14, 16.3), std('#87AE74', { roughness: 1 }), 0, -.36, 3));

  // ——— Clouds: big soft puffs drifting around and below the plaza, some close and out of focus.
  const puffs = [puffTexture(), puffTexture(), puffTexture()];
  const clouds: { g: THREE.Group; speed: number; x0: number }[] = [];
  for (const [x, y, z, s] of [[-26, -3, -6, 1.3], [24, -2, -4, 1.4], [-18, -7, 8, 1.1], [20, -8, 10, 1.2], [0, -10, -10, 1.6], [-34, 6, -26, 1.8], [30, 8, -30, 2], [6, 12, -40, 2.2], [-12, -4, 20, .9], [16, 1, 22, 1]] as const) {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffs[i % 3], transparent: true, depthWrite: false, fog: false, opacity: .95 }));
      const sz = (4 + rnd() * 5) * s; sp.scale.set(sz, sz * .8, 1); sp.position.set((rnd() - .5) * 9 * s, (rnd() - .5) * 2.2 * s, (rnd() - .5) * 3 * s); g.add(sp);
    }
    clouds.push({ g, speed: .15 + rnd() * .2, x0: x });
  }

  // ——— The truck, built in meters around a real serving window with an interior.
  const truck = new THREE.Group(); scene.add(truck);
  const green = std(C.green, { roughness: .32, metalness: .2 }), orange = std(C.orange, { roughness: .45 }), cream = std(C.cream, { roughness: .6 });
  const chrome = std('#E6E3DC', { metalness: .85, roughness: .22 }), liner = std('#F2ECE2', { roughness: .8, side: THREE.DoubleSide });
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
  truck.add(mesh(new THREE.BoxGeometry(L - .1, .06, Z * 2 - .1), std('#B9B3A8', { roughness: .6 }), cx, FLOOR - .03, 0));
  truck.add(mesh(rbox(L + .08, .26, Z * 2 + .08, .08), orange, cx, .62, 0));
  truck.add(mesh(rbox(L + .04, .05, Z * 2 + .04, .02), chrome, cx, .47, 0));
  // Interior liner, lights and kit.
  const inner = new THREE.Group(); truck.add(inner);
  inner.add(mesh(new THREE.PlaneGeometry(L - .14, TOP - FLOOR - .05), liner, cx, (TOP + FLOOR) / 2, -Z + .06));
  inner.add(rot(mesh(new THREE.PlaneGeometry(L - .14, Z * 2 - .1), liner, cx, TOP - .03, 0), Math.PI / 2));
  for (const x of [X0 + .06, X1 - .06]) inner.add(rot(mesh(new THREE.PlaneGeometry(Z * 2 - .1, TOP - FLOOR), liner, x, (TOP + FLOOR) / 2, 0), 0, Math.PI / 2));
  const steel = std(C.steel, { metalness: .6, roughness: .35 });
  inner.add(mesh(rbox(L - .3, .9, .62, .02), steel, cx, FLOOR + .45, -Z + .38));
  inner.add(mesh(rbox(1.2, .06, .56, .02), std('#2B2B2B', { roughness: .4 }), -1.6, FLOOR + .93, -Z + .38));
  inner.add(mesh(rbox(1.4, .5, .7, .04), steel, -1.6, TOP - .4, -Z + .4));
  for (const y of [2.15, 2.6]) inner.add(mesh(new THREE.BoxGeometry(2.2, .03, .28), std(C.wood), .9, y, -Z + .2));
  inner.add(mesh(rbox(.8, 1.9, .7, .04), std('#E7E4DE', { metalness: .3, roughness: .3 }), X1 - .5, FLOOR + .95, -Z + .42));
  inner.add(mesh(rbox(2.6, .9, .5, .02), steel, (W0 + W1) / 2, FLOOR + .45, Z - .32));
  for (const x of [-2.2, .2]) { const l = new THREE.PointLight('#FFE2B8', 1.1, 5, 2); l.position.set(x, TOP - .25, 0); inner.add(l); inner.add(mesh(new THREE.CylinderGeometry(.18, .18, .03, 20), std('#FFF6E0', { emissive: '#FFE9B8', emissiveIntensity: 1.2 }), x, TOP - .05, 0)); }
  // Serving window: frame, outside ledge, roll-up shutter, awning, menu.
  for (const [w, h, x, y] of [[W1 - W0 + .16, .08, (W0 + W1) / 2, WT], [W1 - W0 + .16, .08, (W0 + W1) / 2, WB], [.08, WT - WB, W0, (WB + WT) / 2], [.08, WT - WB, W1, (WB + WT) / 2]] as const)
    truck.add(mesh(rbox(w, h, .14, .03), chrome, x, y, Z + .02));
  truck.add(mesh(rbox(W1 - W0 + .3, .06, .42, .02), std(C.wood, { roughness: .55 }), (W0 + W1) / 2, WB + .02, Z + .2));
  for (const x of [W0 + .3, W1 - .3]) { const br = mesh(new THREE.BoxGeometry(.04, .3, .3), chrome, x, WB - .14, Z + .16); br.rotation.x = -.6; truck.add(br); }
  truck.add(rot(mesh(new THREE.CylinderGeometry(.09, .09, W1 - W0 + .1, 20), std('#D7D3CC', { metalness: .5, roughness: .4 }), (W0 + W1) / 2, WT + .12, Z + .08), 0, 0, Math.PI / 2));
  const stripeTex = canvasTex((c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#F4EEE3' : C.orange; c.fillRect(i * w / 12, 0, w / 12, h); } }, 512, 64);
  const awning = mesh(new THREE.BoxGeometry(W1 - W0 + .5, .03, 1.1), std('#ffffff', { map: stripeTex, roughness: .85 }), (W0 + W1) / 2, WT + .3, Z + .58); awning.rotation.x = .28; truck.add(awning);
  for (const x of [W0 - .1, W1 + .1]) { const rod = mesh(new THREE.CylinderGeometry(.012, .012, 1.15, 6), chrome, x, WT + .15, Z + .55); rod.rotation.x = 1.3; truck.add(rod); }
  const menuTex = canvasTex((c, w, h) => {
    c.fillStyle = '#25362D'; c.fillRect(0, 0, w, h);
    c.fillStyle = C.gold; c.font = 'italic 600 54px Georgia, serif'; c.fillText("Today's menu", 34, 72);
    c.fillStyle = C.cream; c.font = '400 34px Inter, sans-serif';
    ['Rajma chawal', 'Veggie pasta', 'Fresh fruit', 'Masala chai'].forEach((s, i) => { c.fillText(s, 34, 142 + i * 54); c.fillText('Free', w - 104, 142 + i * 54); });
  }, 520, 380);
  truck.add(mesh(rbox(.86, .66, .04, .02), std(C.wood), X0 + .62, 2.2, Z + .07));
  truck.add(mesh(new THREE.PlaneGeometry(.78, .58), std('#ffffff', { map: menuTex }), X0 + .62, 2.2, Z + .095));
  // Branding on the lower panel, both sides, and a roof sign.
  const brandTex = canvasTex((c) => {
    c.fillStyle = C.cream; heart(c, 92, 52, 120);
    c.font = '600 88px Inter, system-ui, sans-serif'; c.fillText('Free Meals on Wheels', 190, 140);
    c.fillStyle = C.gold; c.font = 'italic 400 46px Georgia, serif'; c.fillText('Fresh, hot meals, free for everyone', 194, 205);
  }, 1300, 240);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .52), std('#ffffff', { map: brandTex, transparent: true, roughness: .6 }));
  brand.position.set(-.7, 1.12, Z + .055); truck.add(brand);
  const backBrand = brand.clone(); backBrand.rotation.y = Math.PI; backBrand.position.z = -Z - .055; truck.add(backBrand);
  const roofSign = new THREE.Group(); roofSign.position.set(-.7, TOP + .62, 0); truck.add(roofSign);
  roofSign.add(mesh(rbox(2.6, .66, .14, .06), cream));
  const roofTex = canvasTex((c) => { c.fillStyle = C.orange; heart(c, 110, 44, 140); c.fillStyle = C.greenDark; c.font = '650 118px Inter, system-ui, sans-serif'; c.fillText('Free meals', 215, 165); }, 900, 250);
  const roofFace = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .6), std('#ffffff', { map: roofTex, transparent: true })); roofFace.position.z = .075; roofSign.add(roofFace);
  for (const x of [-1, 1]) roofSign.add(mesh(new THREE.CylinderGeometry(.03, .03, .4, 8), std(C.ink), x, -.5, 0));
  truck.add(mesh(rbox(.7, .32, .8, .08), std('#DCD8CF', { metalness: .4, roughness: .4 }), 1.6, TOP + .3, -.3));
  truck.add(mesh(new THREE.CylinderGeometry(.1, .1, .45, 16), chrome, -2.9, TOP + .3, -.4));
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
    truck.add(mesh(new THREE.TorusGeometry(.56, .06, 8, 28, Math.PI), std(C.greenDark), x, .48, z > 0 ? Z + .03 : -Z - .03));
    const w = mesh(new THREE.CylinderGeometry(.46, .46, .34, 36), std(C.tire, { roughness: .9 }), x, .46, z); w.rotation.x = Math.PI / 2; truck.add(w);
    const hub = mesh(new THREE.CylinderGeometry(.22, .22, .36, 24), chrome, x, .46, z); hub.rotation.x = Math.PI / 2; truck.add(hub);
  }
  // Truck as obstacles for walkers.
  const truckObstacles = Array.from({ length: 9 }, (_, i) => ({ x: X0 + .3 + i * ((CX1 - X0 - .6) / 8), z: 0, r: 1.35 }));

  // ——— Our story: a chalkboard easel.
  const board = new THREE.Group(); board.position.set(6.2, .14, 2.6); board.rotation.y = -.5; scene.add(board);
  const boardTex = canvasTex((c, w, h) => {
    c.fillStyle = '#26382E'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#F4F1E8'; c.font = 'italic 500 92px Georgia, serif'; c.fillText('Our story', 70, 150);
    c.globalAlpha = .75; c.font = '400 46px Inter, sans-serif'; ['Every Saturday since 2020', '300+ meals a week', '400+ volunteers'].forEach((s, i) => c.fillText(s, 74, 250 + i * 70));
  }, 1024, 640);
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(.06, 2.3, .06), std(C.wood), s * .78, 1.12, -.12); leg.rotation.z = s * -.06; board.add(leg); }
  board.add(mesh(rbox(1.72, 1.1, .06, .02), std(C.wood), 0, 1.65, 0));
  const BOARD = { w: 1.6, h: 1, y: 1.65, z: .035 };
  board.add(mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), std('#ffffff', { map: boardTex, roughness: .95 }), 0, BOARD.y, BOARD.z));

  // ——— Contact: a community bulletin board under a little roof.
  const bulletin = new THREE.Group(); bulletin.position.set(8.6, .14, 1.2); bulletin.rotation.y = -.7; scene.add(bulletin);
  for (const x of [-.95, .95]) bulletin.add(mesh(new THREE.BoxGeometry(.1, 2.7, .1), std(C.wood), x, 1.35, 0));
  bulletin.add(mesh(rbox(1.9, 1.16, .1, .03), std('#8A5E3C'), 0, 1.82, 0));
  const PIN = { w: 1.76, h: 1.06, y: 1.82, z: .055 };
  bulletin.add(mesh(new THREE.BoxGeometry(PIN.w, PIN.h, .03), std('#C49A66', { roughness: 1 }), 0, PIN.y, .04));
  const roofB = mesh(new THREE.BoxGeometry(2.3, .06, .7), std(C.green), 0, 2.72, .1); roofB.rotation.x = .25; bulletin.add(roofB);
  const noteCols = ['#FFFBF2', '#FCE3CD', '#E1EEDA', '#FFF1B0', '#E3ECF7'];
  for (let i = 0; i < 10; i++) {
    const w = .26 + rnd() * .14, h = .2 + rnd() * .14;
    const n = mesh(new THREE.PlaneGeometry(w, h), std(noteCols[i % 5]), -.62 + (i % 4) * .41 + rnd() * .05, 1.52 + Math.floor(i / 4) * .3 + rnd() * .04, .06);
    n.rotation.z = (rnd() - .5) * .2; bulletin.add(n);
  }

  // ——— Picnic tables.
  const woodM = std(C.wood, { roughness: .75 });
  const umbTex = canvasTex((c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#F4EEE3' : C.green; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.fill(); } }, 256, 256);
  const seats: Seat[] = [];
  const table = (x: number, z: number, rot: number, umbrella: boolean, reserve = false) => {
    const t = new THREE.Group(); t.position.set(x, .14, z); t.rotation.y = rot; scene.add(t);
    t.add(mesh(rbox(1.9, .07, .85, .02), woodM, 0, .76, 0));
    for (const bz of [-.68, .68]) t.add(mesh(rbox(1.9, .05, .3, .02), woodM, 0, .45, bz));
    for (const bx of [-.72, .72]) for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(.06, .82, .06), woodM, bx, .38, s * .3); leg.rotation.x = s * .55; t.add(leg); }
    if (umbrella) {
      t.add(mesh(new THREE.CylinderGeometry(.025, .025, 2.3, 8), chrome, 0, 1.15, 0));
      t.add(mesh(new THREE.ConeGeometry(1.45, .42, 16, 1, true), std('#ffffff', { map: umbTex, side: THREE.DoubleSide, roughness: .85 }), 0, 2.35, 0));
    }
    t.updateMatrixWorld(true);
    if (!reserve) for (const sx of [-.45, .45]) for (const sz of [-.68, .68]) seats.push({ pos: t.localToWorld(new THREE.Vector3(sx, -.14, sz)), face: rot + (sz > 0 ? Math.PI : 0), taken: false });
    return t;
  };
  const picnic = table(-6, 4.6, .25, true, true);
  table(-9.5, 7.6, -.3, true); table(-3.4, 8.2, .15, false); table(10.6, 6.6, .4, true);

  // ——— Planters, lamps, trees, string lights.
  const flowerCols = ['#E9A86A', '#E38C8C', '#F0D27A', '#FFFFFF', '#B9A0D8'];
  const planter = (x: number, z: number, w = 1.4) => {
    const p = new THREE.Group(); p.position.set(x, .14, z); scene.add(p);
    p.add(mesh(rbox(w, .45, .5, .05), std('#B9A48C', { roughness: .9 }), 0, .22, 0));
    for (let i = 0; i < 5; i++) p.add(mesh(new THREE.SphereGeometry(.17, 16, 12), std('#618B5C', { roughness: .95 }), -w / 2 + .2 + i * (w - .4) / 4, .52, (rnd() - .5) * .15));
    for (let i = 0; i < 10; i++) p.add(mesh(new THREE.SphereGeometry(.035, 8, 6), std(flowerCols[i % 5]), (rnd() - .5) * w * .85, .64 + rnd() * .08, (rnd() - .5) * .3));
  };
  planter(-1.2, 9.6, 2); planter(4.6, 9.4, 2); planter(12.2, 2.6); planter(-12, 3);
  const lamp = (x: number, z: number) => {
    const l = new THREE.Group(); l.position.set(x, .14, z); scene.add(l);
    l.add(mesh(new THREE.CylinderGeometry(.045, .065, 3.6, 12), std(C.greenDark, { metalness: .4, roughness: .45 }), 0, 1.8, 0));
    l.add(mesh(new THREE.SphereGeometry(.19, 20, 14), std('#FFF6DE', { emissive: '#FFE4A8', emissiveIntensity: .5 }), 0, 3.7, 0));
    l.add(mesh(new THREE.CylinderGeometry(.24, .2, .07, 20), std(C.greenDark), 0, 3.88, 0));
  };
  lamp(-8, 1.8); lamp(5, 1.9); lamp(13.5, 8); lamp(-13.5, 8.5);
  tree(scene, -11.5, -1.5, 1.25); tree(scene, 11, -2, 1.35); tree(scene, -13, 5.5, 1); tree(scene, 13.4, 4.6, 1.1); tree(scene, 7.5, 10, 1);
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
  jar.add(mesh(new THREE.CylinderGeometry(.14, .13, .34, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .95, roughness: .04, thickness: .08, ior: 1.4, transparent: true, opacity: .4, side: THREE.DoubleSide }), 0, .17, 0));
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

  // ——— The crew: five volunteers, each with their own rhythm.
  type CrewPose = 'serve' | 'stir' | 'reach' | 'idle' | 'nod' | 'carry';
  const crew: { f: Figure; next: number; poses: CrewPose[] }[] = [];
  const hire = (x: number, z: number, ry: number, poses: CrewPose[], palette: number, skin: number) => {
    const f = new Figure(1.7, { apron: true, palette, skin }); f.obj.position.set(x, FLOOR, z); f.obj.rotation.y = ry; truck.add(f.obj);
    crew.push({ f, next: Math.random() * 2, poses }); return f;
  };
  const server = hire(-.9, Z - .75, 0, ['serve', 'idle', 'reach'], 2, 1);
  hire(.35, Z - .75, -.25, ['reach', 'idle', 'nod'], 5, 3);
  hire(-1.7, -Z + .95, Math.PI, ['stir'], 0, 4);
  hire(-.6, -Z + .95, Math.PI + .3, ['stir', 'reach', 'idle'], 7, 0);
  hire(-2.95, .1, Math.PI / 2, ['carry', 'reach', 'idle'], 9, 2);
  let serveFlash = 0;

  // ——— Food, once the small models arrive.
  let crowd: Crowd | null = null;
  const place = (o: THREE.Object3D, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  let alive = true;
  loadFood().then((food) => {
    if (!alive) return;
    const F = (id: FoodId, size: number, x: number, y: number, z: number, ry = 0) => place(food(id, size), truck, x, y, z, ry);
    for (let i = 0; i < 4; i++) F('styrofoam-dinner', .26, -.2 + i * .3, WB + .06 + (i % 2) * .09, Z + .18, (rnd() - .5) * .3);
    F('pot-stew', .36, -1.9, FLOOR + .96, -Z + .38); F('pot-stew', .32, -1.25, FLOOR + .96, -Z + .4);
    F('loaf-round', .2, -1.8, WB + .07, Z + .2); F('apple', .08, -1.5, WB + .05, Z + .22); F('orange', .08, -1.4, WB + .05, Z + .16);
    for (let i = 0; i < 6; i++) F((['pumpkin-basic', 'cabbage', 'carrot', 'tomato', 'corn', 'cabbage'] as FoodId[])[i], .15, .1 + i * .32, 2.24, -Z + .2, rnd() * 3);
    for (let i = 0; i < 6; i++) F('styrofoam-dinner', .24, 1.4 + (i % 2) * .3, FLOOR + .93 + Math.floor(i / 2) * .1, Z - .32);
    // Your seat: a warm tray, and a friend across the table.
    for (const [id, sz, x, z] of [['plate-dinner', .34, .45, .22], ['bowl-soup', .2, .4, .2], ['loaf-round', .13, .62, .12], ['apple', .07, .25, .35], ['mug', .1, .7, .34], ['utensil-spoon', .16, .2, .18]] as [FoodId, number, number, number][]) place(food(id, sz), picnic, x, .8, z, rnd() * .4);
    for (const [id, sz, x, z] of [['plate-dinner', .34, .45, -.25], ['salad', .18, .45, -.25], ['cup-tea', .09, .2, -.3]] as [FoodId, number, number, number][]) place(food(id, sz), picnic, x, .8, z);
    for (const s of seats) place(food((['salad', 'sandwich', 'bowl-broth', 'pie', 'rice-ball'] as FoodId[])[Math.floor(rnd() * 5)], .16), scene, s.pos.x - Math.sin(s.face) * .35, .94, s.pos.z - Math.cos(s.face) * .35);
    crowd = new Crowd(scene, {
      window: new THREE.Vector3(-.9, .14, Z + .95), queueDir: new THREE.Vector3(-.9, 0, .44), seats, minZ: Z + .75,
      entries: [new THREE.Vector3(-8.5, .14, -2.2), new THREE.Vector3(8, .14, -2.2)],
      exits: [new THREE.Vector3(-8.5, .14, -2.4), new THREE.Vector3(8, .14, -2.4)],
      obstacles: [
        ...truckObstacles, { x: 3.2, z: 3.1, r: .55 }, { x: 6.2, z: 2.6, r: .95 }, { x: 8.6, z: 1.2, r: 1.1 },
        { x: -6, z: 4.6, r: 1.25 }, { x: -9.5, z: 7.6, r: 1.25 }, { x: -3.4, z: 8.2, r: 1.25 }, { x: 10.6, z: 6.6, r: 1.25 },
        { x: -1.2, z: 9.6, r: 1.1 }, { x: 4.6, z: 9.4, r: 1.1 }, { x: 12.2, z: 2.6, r: .8 }, { x: -12, z: 3, r: .8 }, { x: -8, z: 1.8, r: .25 }, { x: 5, z: 1.9, r: .25 },
      ],
      max: tier > 1 ? 10 : 7,
      meal: () => food('styrofoam-dinner', .26),
      onOrder: () => server.set('nod'),
      onServe: () => { server.set('reach'); serveFlash = 1.2; },
    });
  }).catch(() => {});
  const friend = new Figure(1.66, { palette: 3, skin: 2 }); place(friend.obj, picnic, .45, 0, -.72); friend.set('sit');

  // ——— Picking.
  const targets: Record<StationId, THREE.Object3D[]> = { volunteer: [truck], donate: [giving], about: [board], resources: [picnic], contact: [bulletin] };
  const owner = new Map<THREE.Object3D, StationId>();
  for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) list.forEach((o) => o.traverse((c) => owner.set(c, id)));

  // ——— Views.
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 220);
  const W = (o: THREE.Object3D, x: number, y: number, z: number) => { o.updateMatrixWorld(true); return o.localToWorld(new THREE.Vector3(x, y, z)).toArray() as View['pos']; };
  // A board view fits the board to about 94% of the screen, square to its face, so the page can take over seamlessly.
  const fitBoard = (o: THREE.Object3D, b: { w: number; h: number; y: number; z: number }): View => {
    const fov = 30, t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const d = Math.max(b.h / .94 / (2 * t), b.w / .94 / (2 * t * camera.aspect));
    return { pos: W(o, 0, b.y, b.z + d), look: W(o, 0, b.y, b.z), fov };
  };
  const views = (): Record<StationId, View> => ({
    volunteer: { pos: W(truck, 1.9, TOP - .45, -.55), look: W(truck, -1.4, 1.5, Z + 1.6), fov: 62 },
    donate: { pos: [4.0, 1.68, 4.35], look: [3.2, 1.18, 3.1], fov: 32 },
    about: fitBoard(board, BOARD),
    resources: { pos: W(picnic, .45, 1.3, 1.15), look: W(picnic, .45, 1.05, -.5), fov: 56 },
    contact: fitBoard(bulletin, PIN),
  });

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .5, zoomSpeed: .6,
    minDistance: 10, maxDistance: 32, minPolarAngle: .85, maxPolarAngle: 1.4, minAzimuthAngle: -.7, maxAzimuthAngle: .7,
  });
  let narrow = false, peeking = false, focused: StationId | null = null, flying = true, shift = 0, fovGoal = 30, arrivedFor: StationId | null = null;
  const baseFov = () => (narrow ? 40 : 30);
  const overview = () => (narrow ? OVERVIEW_NARROW : OVERVIEW);
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
    renderer.setSize(w, h, false);
    camera.aspect = w / h; narrow = w / h < 1;
    if (!focused) { goal = overview(); flying = true; fovGoal = baseFov(); } else if (!peeking) goal = station(focused);
    camera.updateProjectionMatrix();
  }
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

  let last = 0, slow = 0, sampled = 0;
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
    if (crowd) for (const n of crowd.npcs) n.f.obj.visible = !focused || peeking || n.f.obj.position.distanceTo(camera.position) > 2.4;
    for (const c of crew) {
      c.f.update(dt); c.next -= dt;
      if (c.f === server && serveFlash > 0) { serveFlash -= dt; continue; }
      if (c.next <= 0) { c.f.set(c.poses[Math.floor(Math.random() * c.poses.length)]); c.next = 2 + Math.random() * 3.5; }
    }
    friend.update(dt);
    roofSign.rotation.y = Math.sin(t * .5) * .015;
    bulbs.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(t * 2 + i) * .2));
    for (const c of clouds) c.g.position.x = ((c.x0 + t * c.speed + 60) % 120) - 60;
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
    renderer.render(scene, camera);
    placeLabels(w, h);
  }

  let raf = 0, visible = true;
  const start = performance.now();
  const tick = () => { if (!visible || !alive) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) tick(); });
  io.observe(canvas);
  tick();

  return {
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
