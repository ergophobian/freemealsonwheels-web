// The whole site is one 3D world: a Free Meals on Wheels food truck on a sunny Saturday street.
// People and objects around it are the navigation; clicking one zooms in and opens its card.
// Characters and food are CC0 models by Kenney (kenney.nl).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadAssets, type Assets, type FoodId } from './world/assets';
import { Actor, Crowd, type Seat } from './world/crowd';

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type View = { pos: [number, number, number]; look: [number, number, number]; fov?: number };

const C = {
  green: '#2F6B4A', greenDark: '#1F4D34', orange: '#E8681C', cream: '#FBF3E4', gold: '#E2C27A',
  grass: '#9DC07E', paving: '#E9DFCF', road: '#6E7276', wood: '#B07A4A', ink: '#26312B', tire: '#2B2B2B', glass: '#BFDCE3',
  skin: '#C68A62',
};
// The truck is built at 1 unit and scaled up so it towers a little over the people around it.
const S = 1.15;
const HEIGHT = 1.72;

const OVERVIEW: View = { pos: [2.6, 6.6, 22.5], look: [.4, 1.8, 1.5] };
const OVERVIEW_NARROW: View = { pos: [1, 8, 29], look: [.2, 2.2, 1.5] };
const ANCHORS: Record<StationId, [number, number, number]> = {
  volunteer: [-.58, 3.1, 1.1], donate: [2.5, 1.85, 2.7], about: [5.2, 2.5, 2.9], resources: [-5.4, 3.2, 4.8], contact: [7, 2.7, 3.8],
};

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: 0, ...extra });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
const rbox = (w: number, h: number, d: number, r = .05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

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

const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// A friendly rounded character with a tapered body, shoes, hands and a few hair styles.


function tree(scene: THREE.Object3D, x: number, z: number, s: number, kind: 'round' | 'pine' = 'round') {
  const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = rnd() * 6; scene.add(t);
  t.add(mesh(new THREE.CylinderGeometry(.1, .16, 1.6, 10), std('#8A6340'), 0, .8, 0));
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) t.add(mesh(new THREE.ConeGeometry(.9 - i * .22, 1.1, 16), std(['#3F6E4E', '#4D7D55', '#5C8C5C'][i]), 0, 1.6 + i * .6, 0));
  } else {
    const cols = ['#5E8F55', '#73A15F', '#4D7D4C', '#86B06A'];
    for (let i = 0; i < 5; i++) t.add(mesh(new THREE.IcosahedronGeometry(.62 - i * .05, 3), std(cols[i % 4], { roughness: .9 }), Math.sin(i * 2.4) * .45, 1.9 + i * .28, Math.cos(i * 2.4) * .4));
  }
  return t;
}

export interface TruckApi { focus(id: StationId | null, peek?: boolean): void; rect(id: 'about' | 'contact'): DOMRect; give(amount: number): void; dispose(): void }

export function mountTruck(
  canvas: HTMLCanvasElement,
  labels: Partial<Record<StationId, HTMLElement>>,
  onSelect: (id: StationId) => void,
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
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9FCBE0'); g.addColorStop(.55, '#D9EAEE'); g.addColorStop(1, '#F7EBDA');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 4, 256);
  scene.fog = new THREE.Fog('#EAF0EC', 30, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.add(new THREE.HemisphereLight('#FFF3E2', '#B7B98F', .85));
  const sun = new THREE.DirectionalLight('#FFE2BC', 2.8); sun.position.set(-8, 12, 9); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(tier > 1 ? 2048 : 1024); sun.shadow.radius = 5; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);

  // ——— Ground: road behind the truck, curb, a paved plaza in front, grass beyond.
  const ground = mesh(new THREE.CircleGeometry(80, 64), std(C.grass, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.castShadow = false; scene.add(ground);
  const roadTex = canvasTex((c, w, h) => {
    c.fillStyle = C.road; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .05})`; c.fillRect(rnd() * w, rnd() * h, 2, 2); }
    c.fillStyle = '#F1E6C8'; for (let x = 0; x < w; x += 128) c.fillRect(x, h / 2 - 4, 70, 8);
  }, 1024, 128, [6, 1]);
  const road = mesh(new THREE.PlaneGeometry(70, 6), std('#ffffff', { map: roadTex, roughness: .95 }), 0, .01, -1.9); road.rotation.x = -Math.PI / 2; road.castShadow = false; scene.add(road);
  const pavTex = canvasTex((c, w, h) => {
    c.fillStyle = C.paving; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,130,100,.25)'; c.lineWidth = 3;
    for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke(); }
  }, 512, 512, [14, 4]);
  const plaza = mesh(new THREE.BoxGeometry(34, .14, 9), std('#ffffff', { map: pavTex, roughness: .95 }), 0, .07, 5.6); plaza.castShadow = false; scene.add(plaza);
  scene.add(mesh(new THREE.BoxGeometry(34, .16, .25), std('#D6CCBB'), 0, .08, 1.1));
  const farWalk = mesh(new THREE.BoxGeometry(70, .12, 3), std('#E3D9C8'), 0, .06, -6.4); farWalk.castShadow = false; scene.add(farWalk);

  // ——— Storefronts across the street.
  const shopCols = ['#F4E3C3', '#CFE0C8', '#E9B99A', '#F2D27E', '#D8CFE6', '#F6EEE0', '#BFD7DA', '#E8C6B0'];
  const winM = std('#FFF1D2', { emissive: '#FFD98E', emissiveIntensity: .25, roughness: .2 });
  for (let i = 0; i < 9; i++) {
    const w = 3 + rnd() * 1.2, h = 3.2 + rnd() * 2.4, x = -17 + i * 4.2;
    const b = new THREE.Group(); b.position.set(x, 0, -9.5); scene.add(b);
    b.add(mesh(rbox(w, h, 3, .12), std(shopCols[i % shopCols.length], { roughness: .85 }), 0, h / 2, 0));
    b.add(mesh(rbox(w + .15, .25, 3.15, .06), std('#FFFFFF', { roughness: .6 }), 0, h + .05, 0));
    b.add(mesh(rbox(w * .7, 1.2, .06, .03), winM, 0, 1.1, 1.52));
    const aw = canvasTex((c, cw, ch) => { const a = ['#E8681C', '#2F6B4A', '#C9826B', '#4A6FA5'][i % 4]; for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#FFF8EC' : a; c.fillRect(k * cw / 8, 0, cw / 8, ch); } }, 256, 32);
    const awn = mesh(new THREE.BoxGeometry(w * .8, .03, .7), std('#ffffff', { map: aw }), 0, 1.95, 1.8); awn.rotation.x = .35; b.add(awn);
    for (let k = 0; k < Math.floor(h / 1.2) - 1; k++) for (const sx of [-.28, .28]) b.add(mesh(rbox(.55, .6, .05, .03), winM, sx * w, 2.8 + k * 1.1, 1.52));
  }
  for (let i = 0; i < 14; i++) tree(scene, -26 + i * 4 + rnd(), -14 - rnd() * 4, 1.2 + rnd() * .6, i % 3 ? 'round' : 'pine');

  // ——— The truck.
  const truck = new THREE.Group(); truck.scale.setScalar(S); scene.add(truck);
  const green = std(C.green, { roughness: .35, metalness: .15 }), orange = std(C.orange, { roughness: .45 }), cream = std(C.cream, { roughness: .6 });
  const chrome = std('#E6E3DC', { metalness: .8, roughness: .25 });
  // The body is built around a real serving window, so the crew stands inside it.
  for (const [w, h, x, y] of [[4.6, .62, -.1, 1.01], [4.6, .68, -.1, 2.66], [.85, 1.02, -1.975, 1.82], [1.65, 1.02, 1.375, 1.82]] as const)
    truck.add(mesh(rbox(w, h, 1.7, .18), green, x, y, 0));
  truck.add(mesh(new THREE.BoxGeometry(2.12, 1.02, .06), green, -.5, 1.82, -.82));
  truck.add(mesh(rbox(4.64, .26, 1.74, .1), orange, -.1, .95, 0));
  truck.add(mesh(rbox(4.5, .14, 1.6, .06), cream, -.1, 3.04, 0));
  truck.add(mesh(rbox(1.3, 1.7, 1.66, .26), green, 2.75, 1.55, 0));
  truck.add(mesh(rbox(1.34, .26, 1.7, .1), orange, 2.75, .95, 0));
  const glassM = std(C.glass, { roughness: .05, metalness: .3, envMapIntensity: 1.5 });
  truck.add(mesh(rbox(.06, .62, 1.32, .03), glassM, 3.41, 1.95, 0));
  truck.add(mesh(rbox(.7, .55, .04, .02), glassM, 2.8, 1.98, .83));
  truck.add(mesh(rbox(.08, .3, 1.2, .04), chrome, 3.44, 1.2, 0));
  for (let k = 0; k < 4; k++) truck.add(mesh(new THREE.BoxGeometry(.02, .02, 1), std('#9A9890'), 3.49, 1.1 + k * .07, 0));
  for (const z of [.6, -.6]) truck.add(mesh(new THREE.SphereGeometry(.1, 16, 12), std('#FFF6D8', { emissive: '#FFE7A8', emissiveIntensity: .8 }), 3.43, 1.15, z));
  truck.add(mesh(rbox(.14, .14, 1.86, .05), chrome, 3.46, .72, 0));
  truck.add(mesh(rbox(.14, .14, 1.86, .05), chrome, -2.42, .72, 0));
  for (const z of [.92, -.92]) { truck.add(mesh(new THREE.BoxGeometry(.04, .04, .18), std(C.ink), 3.2, 2.05, z * .95)); truck.add(mesh(rbox(.06, .22, .14, .03), std(C.ink), 3.2, 2.05, z * 1.07)); }
  const plate = canvasTex((c, w, h) => { c.fillStyle = '#FFFDF6'; c.fillRect(0, 0, w, h); c.fillStyle = C.greenDark; c.font = '700 64px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('FREE MEAL', w / 2, 80); }, 320, 110);
  const plateM = new THREE.Mesh(new THREE.PlaneGeometry(.36, .12), new THREE.MeshStandardMaterial({ map: plate })); plateM.position.set(3.54, .72, 0); plateM.rotation.y = Math.PI / 2; truck.add(plateM);
  truck.add(mesh(rbox(.04, 1.2, .7, .02), std('#2A5E41', { roughness: .4 }), 2.18, 1.55, .85));
  truck.add(mesh(rbox(.6, .3, .7, .08), std('#DCD8CF', { metalness: .4, roughness: .4 }), -1.2, 3.25, 0));
  const vent = mesh(new THREE.CylinderGeometry(.09, .09, .4, 16), chrome, .9, 3.3, -.3); truck.add(vent);
  for (const [x, z] of [[-1.5, .78], [-1.5, -.78], [2.6, .78], [2.6, -.78]]) {
    const arch = mesh(new THREE.TorusGeometry(.5, .07, 8, 24, Math.PI), std(C.greenDark), x, .45, z * 1.11); truck.add(arch);
    const w = mesh(new THREE.CylinderGeometry(.42, .42, .3, 32), std(C.tire, { roughness: .9 }), x, .42, z); w.rotation.x = Math.PI / 2; truck.add(w);
    const hub = mesh(new THREE.CylinderGeometry(.2, .2, .32, 24), chrome, x, .42, z); hub.rotation.x = Math.PI / 2; truck.add(hub);
  }

  // Serving window: interior with shelves and pots, orange frame, counter, prop rods, striped awning.
  const winX = -.5;
  // The window sits a little low so neighbors can see over the counter.
  const win = new THREE.Group(); win.position.y = -.18; truck.add(win);
  const interior = mesh(new THREE.PlaneGeometry(2.1, 1.05), std('#F3E3C6'), winX, 2.0, -.6); win.add(interior);
  win.add(mesh(new THREE.BoxGeometry(2.1, .04, 1.6), std('#D9C9AC'), winX, 1.47, 0));
  for (const y of [2.3]) win.add(mesh(new THREE.BoxGeometry(1.9, .03, .2), std(C.wood), winX, y, -.48));
  for (let k = 0; k < 6; k++) win.add(mesh(new THREE.CylinderGeometry(.06, .06, .12, 12), std(['#E8681C', '#2F6B4A', '#E2C27A'][k % 3]), winX - .8 + k * .32, 2.37, -.48));
  for (const [w, h, x, y] of [[2.3, .1, winX, 2.55], [.1, 1.1, winX - 1.1, 2.0], [.1, 1.1, winX + 1.1, 2.0]] as const)
    win.add(mesh(rbox(w, h, .1, .04), orange, x, y, .87));
  win.add(mesh(rbox(2.4, .08, .5, .03), std(C.wood, { roughness: .6 }), winX, 1.48, 1.02));
  for (const x of [-.8, .8, -.3]) win.add(mesh(rbox(.26, .12, .2, .03), cream, winX + x, 1.58, 1.1));
  const awningTex = canvasTex((c, w, h) => { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? C.cream : C.orange; c.fillRect(i * w / 10, 0, w / 10, h); } }, 512, 64);
  const awning = mesh(new THREE.BoxGeometry(2.6, .04, .9), std('#ffffff', { map: awningTex, roughness: .8 }), winX, 2.82, 1.25); awning.rotation.x = .32; win.add(awning);
  for (const x of [-1.2, 1.2]) { const rod = mesh(new THREE.CylinderGeometry(.015, .015, .9, 6), chrome, winX + x, 2.7, 1.3); rod.rotation.x = 1.25; win.add(rod); }
  const valanceTex = canvasTex((c, w, h) => { for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? C.cream : C.orange; c.beginPath(); c.arc(i * w / 20 + w / 40, 0, w / 40, 0, Math.PI); c.fill(); } }, 1024, 64);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .16), new THREE.MeshStandardMaterial({ map: valanceTex, transparent: true, side: THREE.DoubleSide }));
  valance.position.set(winX, 2.6, 1.68); win.add(valance);

  // Branding.
  const brandTex = canvasTex((c) => {
    c.fillStyle = C.cream; heart(c, 100, 60, 130);
    c.font = '600 92px Inter, system-ui, sans-serif'; c.fillText('Free Meals on Wheels', 200, 150);
    c.fillStyle = C.gold; c.font = '500 46px Inter, system-ui, sans-serif'; c.fillText('Fresh, hot meals · free for all', 204, 215);
  }, 1300, 260);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .48), new THREE.MeshStandardMaterial({ map: brandTex, transparent: true, roughness: .6 }));
  brand.position.set(-.55, 1.1, .855); brand.scale.setScalar(.85); truck.add(brand);
  const backBrand = brand.clone(); backBrand.rotation.y = Math.PI; backBrand.position.z = -.855; truck.add(backBrand);
  const menuTex = canvasTex((c, w, h) => {
    c.fillStyle = '#24372D'; c.fillRect(0, 0, w, h);
    c.fillStyle = C.gold; c.font = '700 54px Inter, sans-serif'; c.fillText("Today's menu", 30, 70);
    c.fillStyle = C.cream; c.font = '400 36px Inter, sans-serif';
    ['Rajma chawal', 'Veggie pasta', 'Fresh fruit', 'Chai'].forEach((s, i) => { c.fillText(s, 30, 140 + i * 56); c.fillText('Free', w - 110, 140 + i * 56); });
  }, 520, 380);
  truck.add(mesh(rbox(.8, .6, .04, .02), std(C.wood), -2.05, 2.0, .86));
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(.72, .52), new THREE.MeshStandardMaterial({ map: menuTex })); menu.position.set(-2.05, 2.0, .885); truck.add(menu);
  const roofSign = new THREE.Group(); roofSign.position.set(-.3, 3.45, 0); truck.add(roofSign);
  roofSign.add(mesh(rbox(2.2, .62, .14, .06), cream));
  const roofTex = canvasTex((c) => {
    c.fillStyle = C.orange; heart(c, 110, 40, 150);
    c.fillStyle = C.greenDark; c.font = '700 120px Inter, system-ui, sans-serif'; c.fillText('Free meals', 220, 165);
  }, 900, 250);
  const roofFace = new THREE.Mesh(new THREE.PlaneGeometry(2, .55), new THREE.MeshStandardMaterial({ map: roofTex, transparent: true }));
  roofFace.position.z = .075; roofSign.add(roofFace);
  for (const x of [-.8, .8]) roofSign.add(mesh(new THREE.CylinderGeometry(.03, .03, .3, 8), std(C.ink), x, -.45, 0));

  // ——— Our story: a sandwich board near the cab.
  const board = new THREE.Group(); board.position.set(5.2, .14, 2.9); board.rotation.y = -.4; scene.add(board);
  const boardTex = canvasTex((c, w, h) => {
    c.fillStyle = '#24372D'; c.fillRect(0, 0, w, h);
    c.fillStyle = C.gold; c.font = '700 64px Inter, system-ui, sans-serif'; c.fillText('Our story', 40, 90);
    c.fillStyle = C.cream; c.font = '400 38px Inter, system-ui, sans-serif';
    ['Every Saturday since 2020', '300+ meals a week', '400+ volunteers', '100% of gifts to meals'].forEach((s, i) => c.fillText(s, 40, 170 + i * 62));
  }, 600, 440);
  for (const s of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(.06, 1.7, .06), std(C.wood), s * .42, .85, 0); leg.rotation.z = s * -.08; board.add(leg); }
  board.add(mesh(rbox(1.05, .8, .06, .03), std(C.wood), 0, 1.45, .02));
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(.95, .7), new THREE.MeshStandardMaterial({ map: boardTex, roughness: .9 }));
  boardFace.position.set(0, 1.45, .056); board.add(boardFace);

  // ——— Picnic tables: one is yours in the "Get a meal" view, the rest fill up with neighbors.
  const woodM = std(C.wood, { roughness: .8 });
  const umbTex = canvasTex((c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? C.cream : C.green; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.fill(); } }, 256, 256);
  const seats: Seat[] = [];
  const table = (x: number, z: number, rot: number, umbrella: boolean, skip: [number, number][] = []) => {
    const t = new THREE.Group(); t.position.set(x, .14, z); t.rotation.y = rot; scene.add(t);
    t.add(mesh(rbox(1.9, .08, .85, .03), woodM, 0, .78, 0));
    for (const bz of [-.68, .68]) t.add(mesh(rbox(1.9, .06, .3, .02), woodM, 0, .45, bz));
    for (const bx of [-.72, .72]) t.add(mesh(new THREE.BoxGeometry(.08, .78, 1.7), woodM, bx, .39, 0));
    if (umbrella) {
      t.add(mesh(new THREE.CylinderGeometry(.03, .03, 2.3, 8), std('#E6E3DC', { metalness: .8, roughness: .25 }), 0, 1.15, 0));
      t.add(mesh(new THREE.ConeGeometry(1.4, .5, 8, 1, true), std('#ffffff', { map: umbTex, side: THREE.DoubleSide }), 0, 2.35, 0));
    }
    t.updateMatrixWorld(true);
    for (const sx of [-.45, .45]) for (const sz of [-.68, .68]) {
      if (skip.some(([a, b]) => a === sx && b === sz)) continue;
      seats.push({ pos: t.localToWorld(new THREE.Vector3(sx, -.14 + SIT_Y, sz * 1.18)), face: rot + (sz > 0 ? Math.PI : 0), taken: false });
    }
    return t;
  };
  // Kenney's sit pose rests on the floor, so seated people are lifted to bench height.
  const SIT_Y = .5;
  const picnic = table(-5.4, 4.8, .25, true, [[.45, .68], [.45, -.68], [-.45, .68], [-.45, -.68]]);
  table(-8.6, 7.4, -.3, false);
  table(9.6, 7.2, .4, true);


  // ——— Contact: a community bulletin board on posts.
  const bulletin = new THREE.Group(); bulletin.position.set(7, .14, 3.8); bulletin.rotation.y = -.55; scene.add(bulletin);
  for (const x of [-.85, .85]) bulletin.add(mesh(new THREE.BoxGeometry(.1, 2.4, .1), std(C.wood), x, 1.2, 0));
  bulletin.add(mesh(rbox(1.9, 1.2, .1, .03), std('#8A5E3C'), 0, 1.75, 0));
  bulletin.add(mesh(new THREE.BoxGeometry(1.75, 1.05, .04), std('#C9A06A', { roughness: 1 }), 0, 1.75, .05));
  bulletin.add(mesh(new THREE.ConeGeometry(1.15, .35, 4, 1), std(C.green), 0, 2.55, 0)).rotation.y = Math.PI / 4;
  const noteCols = ['#FFF7E6', '#FDE2C8', '#DDEFD6', '#FFF1A8', '#E3ECF7', '#FFFFFF'];
  for (let i = 0; i < 9; i++) {
    const w = .28 + rnd() * .14, h = .22 + rnd() * .14;
    const n = mesh(new THREE.PlaneGeometry(w, h), std(noteCols[i % noteCols.length], { side: THREE.DoubleSide }), -.65 + (i % 4) * .42 + rnd() * .06, 1.45 + Math.floor(i / 4) * .32 + rnd() * .05, .075);
    n.rotation.z = (rnd() - .5) * .25; bulletin.add(n);
    bulletin.add(mesh(new THREE.SphereGeometry(.022, 8, 6), std(['#E8681C', '#2F6B4A', '#D94F4F'][i % 3]), n.position.x, n.position.y + h / 2 - .03, .09));
  }

  const flowerCols = ['#F2A65A', '#E86A6A', '#F6D365', '#FFFFFF', '#C79BE0'];
  const planter = (x: number, z: number, w = 1.2) => {
    const p = new THREE.Group(); p.position.set(x, .14, z); scene.add(p);
    p.add(mesh(rbox(w, .45, .5, .06), std('#C98A55', { roughness: .8 }), 0, .22, 0));
    for (let i = 0; i < 4; i++) p.add(mesh(new THREE.IcosahedronGeometry(.2, 2), std('#5E8F55'), -w / 2 + .2 + i * (w - .4) / 3, .55, 0));
    for (let i = 0; i < 9; i++) p.add(mesh(new THREE.SphereGeometry(.05, 8, 6), std(flowerCols[i % 5]), (rnd() - .5) * w * .85, .68 + rnd() * .1, (rnd() - .5) * .3));
  };
  planter(8.8, 2.4); planter(-2.6, 7.4, 1.6); planter(3, 7.6, 1.6); planter(-8.2, 3.2);


  // ——— Street lamps, trees, bushes, string lights, bike rack.
  const lamp = (x: number, z: number) => {
    const l = new THREE.Group(); l.position.set(x, .14, z); scene.add(l);
    l.add(mesh(new THREE.CylinderGeometry(.05, .07, 3.4, 10), std(C.greenDark, { metalness: .3, roughness: .5 }), 0, 1.7, 0));
    l.add(mesh(new THREE.SphereGeometry(.2, 16, 12), std('#FFF6DE', { emissive: '#FFE4A8', emissiveIntensity: .6 }), 0, 3.5, 0));
    l.add(mesh(new THREE.CylinderGeometry(.24, .2, .08, 16), std(C.greenDark), 0, 3.68, 0));
  };
  lamp(-9, 1.6); lamp(10, 1.6); lamp(-3, -5.6); lamp(6, -5.6);
  tree(scene, -9.5, 6, 1.3); tree(scene, 11, 6.5, 1.4); tree(scene, -12.5, 2, 1.1, 'pine'); tree(scene, 13.5, 2.5, 1.2, 'pine'); tree(scene, -7.5, 9, 1); tree(scene, 9, 10, 1.1);
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, x = side * (10 + rnd() * 8), z = 4 + rnd() * 8;
    scene.add(mesh(new THREE.IcosahedronGeometry(.35 + rnd() * .3, 2), std(['#5E8F55', '#73A15F', '#86B06A'][i % 3], { roughness: .9 }), x, .25, z));
  }
  const pole = (x: number, z: number) => scene.add(mesh(new THREE.CylinderGeometry(.04, .05, 3.2, 8), std(C.ink), x, 1.6, z));
  pole(-6.5, 2); pole(7, 2.2);
  const bulbs: THREE.Mesh[] = [];
  for (const [a, b] of [[new THREE.Vector3(-6.5, 3.15, 2), new THREE.Vector3(-2.75, 3.5, 1.05)], [new THREE.Vector3(2.55, 3.35, 1.05), new THREE.Vector3(7, 3.15, 2.2)]] as const) {
    const mid = a.clone().lerp(b, .5); mid.y -= .45;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .008, 4), std(C.ink)));
    for (let i = 1; i < 10; i++) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#FFF1C9', emissive: '#FFD27A', emissiveIntensity: 1.4 }));
      bl.position.copy(curve.getPoint(i / 10)); bl.position.y -= .06; scene.add(bl); bulbs.push(bl);
    }
  }
  const bike = new THREE.Group(); bike.position.set(-8.4, .14, 1.9); bike.rotation.y = .2; scene.add(bike);
  for (const x of [-.45, .45]) { const w = mesh(new THREE.TorusGeometry(.3, .025, 8, 32), std(C.ink), x, .33, 0); bike.add(w); }
  const bar = mesh(new THREE.CylinderGeometry(.02, .02, .9, 6), std(C.orange), 0, .5, 0); bar.rotation.z = Math.PI / 2; bike.add(bar);
  bike.add(mesh(new THREE.CylinderGeometry(.02, .02, .45, 6), std(C.orange), -.1, .62, 0));
  bike.add(mesh(rbox(.2, .05, .1, .02), std(C.ink), -.12, .86, 0));
  bike.add(mesh(rbox(.3, .25, .25, .04), std(C.wood), .5, .8, 0));

  // ——— Clouds and birds.
  const clouds: THREE.Group[] = [];
  const cloudM = std('#FFFFFF', { roughness: 1, emissive: '#ffffff', emissiveIntensity: .25 });
  for (let i = 0; i < 6; i++) {
    const cl = new THREE.Group(); cl.position.set(-30 + i * 12, 11 + rnd() * 4, -24 - rnd() * 8); scene.add(cl);
    for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(1 + rnd() * .8, 16, 12), cloudM); p.position.set(k * 1.1 - 2.2, Math.sin(k) * .4, rnd()); p.scale.y = .7; cl.add(p); }
    clouds.push(cl);
  }
  const birds = Array.from({ length: 5 }, () => {
    const b = new THREE.Group();
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.35, .02, .1), std(C.ink)); w.position.x = s * .17; b.add(w); }
    scene.add(b); return b;
  });

  // ——— Steam from the window and the roof vent.
  const steamM = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: .3, depthWrite: false });
  const steam = Array.from({ length: 14 }, (_, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 8), steamM.clone()); s.userData.src = i % 2; scene.add(s); return s; });

  // A dog who wags.
  const dog = new THREE.Group(); dog.position.set(4, .14, 3.9); dog.rotation.y = -1; scene.add(dog);
  const fur = std('#C9955C', { roughness: .9 });
  dog.add(mesh(new THREE.CapsuleGeometry(.14, .38, 6, 12), fur, 0, .34, 0));
  dog.children[0].rotation.z = Math.PI / 2;
  const dogHead = new THREE.Group(); dogHead.position.set(.3, .5, 0); dog.add(dogHead);
  dogHead.add(mesh(new THREE.SphereGeometry(.13, 16, 12), fur));
  dogHead.add(mesh(new THREE.SphereGeometry(.06, 12, 8), std(C.ink), .13, -.02, 0));
  for (const z of [-.08, .08]) { const ear = mesh(new THREE.SphereGeometry(.06, 12, 8), std('#8A5E3C'), -.02, .06, z * 1.4); ear.scale.set(.6, 1.3, .5); dogHead.add(ear); }
  for (const [x, z] of [[.18, .08], [.18, -.08], [-.18, .08], [-.18, -.08]]) dog.add(mesh(new THREE.CapsuleGeometry(.04, .16, 4, 8), fur, x, .13, z));
  const tail = new THREE.Group(); tail.position.set(-.3, .42, 0); dog.add(tail);
  const tailM = mesh(new THREE.CapsuleGeometry(.03, .18, 4, 8), fur, 0, .1, 0); tail.add(tailM); tail.rotation.z = .7;


  // ——— Donation jar on the counter: open-topped, so every gift can be seen landing.
  // It sits on its own little table out front, with a hand-lettered sign.
  const giving = new THREE.Group(); giving.position.set(2.5, .14, 2.7); scene.add(giving);
  giving.add(mesh(new THREE.CylinderGeometry(.42, .42, .05, 32), std(C.wood, { roughness: .6 }), 0, .86, 0));
  giving.add(mesh(new THREE.CylinderGeometry(.04, .06, .84, 12), std(C.greenDark), 0, .43, 0));
  giving.add(mesh(new THREE.CylinderGeometry(.22, .25, .03, 24), std(C.greenDark), 0, .015, 0));
  const signTex = canvasTex((c, w, h) => {
    c.fillStyle = '#24372D'; c.fillRect(0, 0, w, h); c.fillStyle = '#F07B4A'; heart(c, w / 2, 26, 60);
    c.fillStyle = C.cream; c.textAlign = 'center'; c.font = '700 52px Caveat, cursive'; c.fillText('Every coin is', w / 2, 140); c.fillText('a warm dinner', w / 2, 196);
  }, 320, 240);
  const sign = new THREE.Group(); sign.position.set(.2, .89, -.12); sign.rotation.set(-.25, -.35, 0); giving.add(sign);
  sign.add(mesh(rbox(.34, .26, .02, .01), std(C.wood), 0, .13, 0));
  sign.add(mesh(new THREE.PlaneGeometry(.3, .22), std('#ffffff', { map: signTex }), 0, .13, .012));
  const vase = mesh(new THREE.CylinderGeometry(.04, .05, .14, 16), std('#DDEDEA', { roughness: .2 }), -.24, .96, -.1); giving.add(vase);
  for (let i = 0; i < 5; i++) giving.add(mesh(new THREE.SphereGeometry(.035, 10, 8), std(['#F2A65A', '#E86A6A', '#F6D365', '#FFFFFF', '#C79BE0'][i]), -.24 + Math.sin(i * 1.3) * .05, 1.1 + (i % 2) * .04, -.1 + Math.cos(i * 1.3) * .04));
  const jar = new THREE.Group(); jar.position.set(-.02, .885, .05); jar.scale.setScalar(1.25); giving.add(jar);
  jar.add(mesh(new THREE.CylinderGeometry(.14, .13, .34, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .95, roughness: .04, thickness: .08, ior: 1.4, transparent: true, opacity: .45, side: THREE.DoubleSide }), 0, .17, 0));
  jar.add(mesh(new THREE.TorusGeometry(.14, .012, 8, 40), std('#ffffff', { roughness: .1, transparent: true, opacity: .6 }), 0, .34, 0)).rotation.x = Math.PI / 2;
  jar.add(mesh(new THREE.CylinderGeometry(.13, .13, .01, 32), std('#d8d2c4'), 0, .005, 0));
  const ribbon = mesh(new THREE.TorusGeometry(.142, .018, 8, 40), std(C.orange), 0, .25, 0); ribbon.rotation.x = Math.PI / 2; jar.add(ribbon);
  const jarTag = canvasTex((c, w, h) => { c.fillStyle = C.cream; c.fillRect(0, 0, w, h); c.fillStyle = C.orange; heart(c, w / 2, 14, 54); c.fillStyle = C.greenDark; c.font = '600 26px Caveat, Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Thank you', w / 2, 106); }, 160, 128);
  const tag = mesh(new THREE.PlaneGeometry(.15, .12), std('#ffffff', { map: jarTag }), .02, .2, .16); tag.rotation.set(0, .1, .05); jar.add(tag);
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

  // ——— Steam over the soup at your seat.
  const steamM2 = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: .3, depthWrite: false });
  const bowlSteam = Array.from({ length: 6 }, () => { const s = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), steamM2.clone()); scene.add(s); return s; });

  // ——— First-person hands for the volunteer view, holding the next meal.
  const hands = new THREE.Group(); hands.visible = false; hands.scale.setScalar(.6);
  const sleeve = std(C.green), skinM = std(C.skin, { roughness: .55 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * .17, -.2, -.38); arm.rotation.x = -.15; hands.add(arm);
    arm.add(mesh(new THREE.CapsuleGeometry(.04, .2, 6, 12), sleeve, 0, 0, .08)).rotation.x = Math.PI / 2;
    arm.add(mesh(new THREE.SphereGeometry(.045, 16, 12), skinM, 0, 0, -.08));
  }
  const handBox = mesh(rbox(.26, .09, .18, .03), std('#FFFDF6'), 0, -.15, -.5); hands.add(handBox);
  handBox.add(mesh(new THREE.BoxGeometry(.262, .02, .182), std(C.orange), 0, 0, 0));
  scene.add(hands);
  let handPush = -1;

  // ——— People and food, once the models arrive.
  let crowd: Crowd | null = null, server: Actor | null = null, cook: Actor | null = null, founder: Actor | null = null, friend: Actor | null = null;
  const helpers: { a: Actor; next: number; pool: string[] }[] = [];
  let assets: Assets | null = null;
  const place = (o: THREE.Object3D, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
  // Lighter devices download fewer characters (each carries its own animations).
  loadAssets('/models', tier > 1 ? undefined : ['male-c', 'female-b', 'male-e', 'female-d', 'male-a', 'female-a', 'male-b', 'female-f', 'male-d']).then((A) => {
    if (!alive) return;
    assets = A;
    // Volunteers inside the truck.
    server = new Actor('male-c', A, HEIGHT / S); place(server.obj, win, winX - .45, .66, .25); server.play('idle', 0);
    cook = new Actor('female-b', A, HEIGHT / S); place(cook.obj, win, winX + .5, .66, -.15, -.6); cook.play('idle', 0);
    helpers.push({ a: cook, next: 1, pool: ['interact-left', 'interact-right', 'pick-up', 'idle', 'emote-yes'] });
    // Food on the counter and shelves.
    const F = (id: FoodId, size: number, x: number, y: number, z: number, ry = 0) => place(A.food(id, size), win, x, y, z, ry);
    F('styrofoam-dinner', .26, winX + .35, 1.53, 1.08, .2); F('styrofoam-dinner', .26, winX + .62, 1.53, 1.1, -.1); F('styrofoam-dinner', .26, winX + .48, 1.62, 1.09, .05);
    F('pot-stew', .3, winX + .78, 1.52, .55); F('loaf-round', .18, winX + .1, 1.52, 1.12); F('apple', .07, winX + .3, 1.52, 1.18); F('orange', .07, winX + .38, 1.52, 1.12);
    for (let i = 0; i < 5; i++) F((['pumpkin-basic', 'cabbage', 'carrot', 'tomato', 'corn'] as FoodId[])[i], .14, winX - .8 + i * .38, 2.32, -.48, rnd() * 3);
    // Your seat: a warm tray, and a friend across the table.
    const tray: [FoodId, number, number, number][] = [['plate-dinner', .34, .45, .22], ['bowl-soup', .2, .4, .2], ['loaf-round', .13, .62, .12], ['apple', .07, .25, .35], ['mug', .1, .7, .34], ['utensil-spoon', .16, .2, .18]];
    for (const [id, sz, x, z] of tray) place(A.food(id, sz), picnic, x, .83, z, rnd() * .4);
    for (const [id, sz, x, z] of [['plate-dinner', .34, .45, -.25], ['salad', .18, .45, -.25], ['cup-tea', .09, .2, -.3]] as [FoodId, number, number, number][]) place(A.food(id, sz), picnic, x, .83, z);
    friend = new Actor('female-d', A, HEIGHT); place(friend.obj, picnic, .45, SIT_Y - .14, -.95); friend.play('sit', 0);
    founder = new Actor('male-a', A, HEIGHT); place(founder.obj, scene, 4.5, .14, 3.4, -.4); founder.play('idle', 0);
    // Tables already set with food.
    for (const s of seats) place(A.food((['salad', 'sandwich', 'bowl-broth', 'pie', 'rice-ball'] as FoodId[])[Math.floor(rnd() * 5)], .16), scene, s.pos.x - Math.sin(s.face) * .35, .97, s.pos.z - Math.cos(s.face) * .35);
    crowd = new Crowd(scene, A, {
      window: new THREE.Vector3(winX * S - .2, .14, 2.4), queueDir: new THREE.Vector3(-.88, 0, .48), seats,
      entries: [new THREE.Vector3(-16, .14, 7.5), new THREE.Vector3(16, .14, 7), new THREE.Vector3(-16, .14, 3), new THREE.Vector3(16, .14, 9)],
      exits: [new THREE.Vector3(-17, .14, 6), new THREE.Vector3(17, .14, 8), new THREE.Vector3(-17, .14, 9), new THREE.Vector3(17, .14, 4)],
      obstacles: [
        { x: 2.5, z: 2.7, r: .55 }, { x: 5.2, z: 2.9, r: .65 }, { x: 4.5, z: 3.4, r: .45 }, { x: 4, z: 3.9, r: .4 }, { x: 7, z: 3.8, r: 1.05 },
        { x: -5.4, z: 4.8, r: 1.25 }, { x: -8.6, z: 7.4, r: 1.25 }, { x: 9.6, z: 7.2, r: 1.25 },
        { x: -2.6, z: 7.4, r: .9 }, { x: 3, z: 7.6, r: .9 }, { x: 8.8, z: 2.4, r: .7 }, { x: -8.2, z: 3.2, r: .7 }, { x: -8.4, z: 1.9, r: .6 },
        { x: -9, z: 1.6, r: .25 }, { x: 10, z: 1.6, r: .25 }, { x: -6.5, z: 2, r: .25 }, { x: 7, z: 2.2, r: .25 },
      ],
      max: tier > 1 ? 9 : 6, height: HEIGHT, exclude: ['male-c', 'female-b', 'male-e', 'female-d', 'male-a'],
      meal: () => A.food('styrofoam-dinner', .3),
      onOrder: () => server?.play('emote-yes', .25),
      onServe: () => { server?.play('interact-right', .2); handPush = 0; },
    });
  }).catch(() => {});

  // ——— Picking.
  const targets: Record<StationId, THREE.Object3D[]> = { volunteer: [interior], donate: [giving], about: [board], resources: [picnic], contact: [bulletin] };
  const owner = new Map<THREE.Object3D, StationId>();
  const claim = () => { owner.clear(); for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) list.forEach((o) => o.traverse((c) => owner.set(c, id))); };
  claim();

  // ——— Views. Volunteer and Get a meal are first person; Donate is a close-up of the jar.
  const W = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z)).toArray() as View['pos'];
  truck.updateMatrixWorld(true); win.updateMatrixWorld(true); picnic.updateMatrixWorld(true); board.updateMatrixWorld(true); bulletin.updateMatrixWorld(true);
  const VIEWS: Record<StationId, View> = {
    volunteer: { pos: W(win, winX - .3, 2.05, -.35), look: [winX * S - .4, 1.5, 2.8], fov: 56 },
    donate: { pos: [3.15, 1.66, 4.2], look: [2.45, 1.2, 2.7], fov: 32 },
    about: { pos: W(board, 0, 1.45, 1.25), look: W(board, 0, 1.45, 0), fov: 40 },
    resources: { pos: W(picnic, .45, 1.3, 1.15), look: W(picnic, .45, 1.05, -.5), fov: 56 },
    contact: { pos: W(bulletin, 0, 1.75, 2.2), look: W(bulletin, 0, 1.75, 0), fov: 40 },
  };

  // ——— Camera: free look on desktop (drag to look around), eased flights to each station.
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 200);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .5, zoomSpeed: .6,
    minDistance: 9, maxDistance: 30, minPolarAngle: .9, maxPolarAngle: 1.38, minAzimuthAngle: -.75, maxAzimuthAngle: .75,
  });
  let narrow = false, peeking = false, focused: StationId | null = null, flying = true, shift = 0, fovGoal = 30;
  const baseFov = () => (narrow ? 40 : 30);
  const overview = () => (narrow ? OVERVIEW_NARROW : OVERVIEW);
  const station = (id: StationId, peek = false): View => {
    const v = VIEWS[id];
    // Browsing on a phone: look at each station from outside; first person starts once it's opened.
    if (peek) { const a = ANCHORS[id]; return { pos: [a[0] + .8, a[1] + 1.4, a[2] + 7.5], look: [a[0], a[1] - 1.2, a[2]] }; }
    if (narrow && v.fov) return { pos: v.pos, look: [v.look[0], v.look[1] - .5, v.look[2]], fov: v.fov + 10 };
    if (!narrow || v.fov) return v;
    const l = v.look;
    return { pos: [v.pos[0] + (v.pos[0] - l[0]) * 1.1, v.pos[1] + 1.4, v.pos[2] + (v.pos[2] - l[2]) * 1.1], look: [l[0], l[1] - .5, l[2]] };
  };
  let goal = overview();
  camera.position.set(...goal.pos); controls.target.set(...goal.look);
  if (!reduce) camera.position.set(goal.pos[0] - 6, goal.pos[1] + 8, goal.pos[2] + 10);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; narrow = w / h < 1;
    if (!focused) { goal = overview(); flying = true; fovGoal = baseFov(); }
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
    const list = [...Object.values(targets).flat(), ...(server ? [server.obj, cook!.obj] : []), ...(founder ? [founder.obj, dog] : [])];
    for (const hit of ray.intersectObjects(list, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o) { if (owner.has(o)) return owner.get(o)!; if (o === server?.obj || o === cook?.obj) return 'volunteer'; if (o === founder?.obj || o === dog) return 'about'; o = o.parent; }
    }
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
    if (focused || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
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

  let last = 0, alive = true;
  let slow = 0, sampled = 0;
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
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.6);
    controls.enabled = !focused && !narrow && !flying;
    if (flying) {
      camera.position.lerp(v.set(...goal.pos), k);
      controls.target.lerp(v2.set(...goal.look), k);
      if (camera.position.distanceTo(v) < .03 && controls.target.distanceTo(v2) < .03) flying = !!focused;
      camera.lookAt(controls.target);
    } else controls.update();
    if (Math.abs(camera.fov - fovGoal) > .01) { camera.fov += (fovGoal - camera.fov) * k; camera.updateProjectionMatrix(); }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pov = focused === 'volunteer' || focused === 'resources' || focused === 'donate', full = focused === 'about' || focused === 'contact';
    shift += ((narrow || !focused || full || peeking ? 0 : pov ? .12 : .2) - shift) * k;
    camera.setViewOffset(w, h, shift * w, 0, w, h);

    // First person: you are the volunteer at the window.
    const inTruck = focused === 'volunteer' && camera.position.distanceTo(v.set(...VIEWS.volunteer.pos)) < .6;
    if (server) server.obj.visible = !inTruck; if (cook) cook.obj.visible = !inTruck;
    hands.visible = inTruck;
    if (inTruck) {
      hands.position.copy(camera.position); hands.quaternion.copy(camera.quaternion);
      if (handPush >= 0) { handPush += dt / .9; if (handPush > 1) handPush = -1; }
      const p = handPush < 0 ? 0 : Math.sin(handPush * Math.PI);
      hands.children.forEach((c, i) => { if (c !== handBox) c.position.z = -.38 - p * .25; void i; });
      handBox.position.z = -.5 - p * .3; handBox.visible = handPush < .5;
      hands.position.y += Math.sin(t * 1.5) * .004 - .06;
    }

    // Life.
    crowd?.update(dt);
    // Nobody walks through a first-person camera.
    if (crowd) for (const n of crowd.npcs) n.a.obj.visible = !focused || n.a.obj.position.distanceTo(camera.position) > 1.8;
    for (const a of [server, founder, friend]) a?.mixer.update(dt);
    for (const hp of helpers) {
      hp.a.mixer.update(dt); hp.next -= dt;
      if (hp.next <= 0) { hp.a.play(hp.pool[Math.floor(Math.random() * hp.pool.length)] as never, .35); hp.next = 1.5 + Math.random() * 3; }
    }
    if (server?.cur && server.cur.loop === THREE.LoopOnce && !server.cur.isRunning()) server.play('idle', .4);
    if (founder) { if (focused === 'about' && founder.cur !== founder.actions.get('emote-yes')) founder.play('emote-yes'); else if (focused !== 'about' && founder.cur && !founder.cur.isRunning()) founder.play('idle'); }
    if (friend && Math.random() < dt * .08) friend.play('emote-yes', .4);
    if (friend?.cur && friend.cur.loop === THREE.LoopOnce && !friend.cur.isRunning()) friend.play('sit', .4);

    tail.rotation.x = Math.sin(t * 12) * .6; dogHead.rotation.z = Math.sin(t * 1.3) * .15;
    roofSign.rotation.y = Math.sin(t * .5) * .02;
    bulbs.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 2 + i) * .25));
    clouds.forEach((c, i) => (c.position.x = ((-30 + i * 12 + t * .25 + 40) % 80) - 40));
    birds.forEach((b, i) => {
      const p = (t * .02 + i * .13) % 1;
      b.position.set(-25 + p * 50, 9 + i * .4 + Math.sin(t + i) * .4, -12 - i);
      b.children[0].rotation.z = Math.sin(t * 8 + i) * .5; b.children[1].rotation.z = -Math.sin(t * 8 + i) * .5;
    });
    steam.forEach((s, i) => {
      const age = (t * .28 + i / steam.length) % 1, src = s.userData.src;
      s.position.set(src ? .9 * S + Math.sin(age * 6 + i) * .1 : (winX + .75) * S + Math.sin(age * 5 + i) * .1, (src ? 3.5 * S : 2.1 * S) + age * 1.4, src ? -.3 * S : 1.0 * S);
      s.scale.setScalar(.8 + age * 3); (s.material as THREE.MeshStandardMaterial).opacity = .5 * (1 - age);
    });
    const bowl = v.copy(picnic.localToWorld(v2.set(.4, 1, .2)));
    bowlSteam.forEach((s, i) => {
      const age = (t * .3 + i / bowlSteam.length) % 1;
      s.position.set(bowl.x + Math.sin(age * 6 + i) * .03, bowl.y + age * .45, bowl.z);
      s.scale.setScalar(.6 + age * 2.4); (s.material as THREE.MeshStandardMaterial).opacity = .28 * (1 - age);
    });
    // Gifts falling into the jar, and hearts rising out of it.
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i]; f.v += dt * 2.2; f.o.position.y -= f.v * dt; f.o.rotation.x += f.spin * dt;
      if (f.o.position.y <= .02 + Math.floor(pile.length / 9) * .012) { falling.splice(i, 1); f.o.removeFromParent(); addToPile(f.o); }
    }
    for (let i = hearts.length - 1; i >= 0; i--) {
      const hh = hearts[i]; hh.age += dt / 2.4;
      hh.s.position.y += dt * .22; hh.s.position.x += Math.sin(hh.age * 8) * .002 + hh.dx * dt;
      hh.s.material.opacity = Math.sin(Math.min(1, hh.age) * Math.PI);
      if (hh.age >= 1) { hh.s.removeFromParent(); hearts.splice(i, 1); }
    }
    for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) {
      if (id === 'volunteer' || id === 'donate') continue;
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
    rect(id) {
      // Where the real board sits on screen, so the full-screen board can grow out of it.
      const [o, w, h, y, z] = id === 'about' ? [board, .95, .7, 1.45, .056] : [bulletin, 1.75, 1.05, 1.75, .05];
      const r = canvas.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.copy(o.localToWorld(v2.set(sx * w / 2, y + sy * h / 2, z))).project(camera);
        const px = r.left + (v.x * .5 + .5) * r.width, py = r.top + (-v.y * .5 + .5) * r.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return new DOMRect(x0, y0, x1 - x0, y1 - y0);
    },
    focus(id, peek = false) {
      const stay = id === 'about' || id === 'contact';
      if (stay) { focused = id; peeking = false; goal = { pos: camera.position.toArray() as View['pos'], look: controls.target.toArray() as View['look'] }; flying = true; return; }
      focused = id; peeking = peek; goal = id ? station(id, peek) : overview(); flying = true;
      fovGoal = (id && !peek && goal.fov) || baseFov();
      if (reduce) { camera.fov = fovGoal; camera.updateProjectionMatrix(); frame(8); }
    },
    give(amount) {
      // A coin (and the odd bill) for every five dollars, capped so it stays a gentle shower.
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
