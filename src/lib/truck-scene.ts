// The whole site is one 3D world: a Free Meals on Wheels food truck on a sunny Saturday street.
// People and objects around it are the navigation; clicking one zooms in and opens its card.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type View = { pos: [number, number, number]; look: [number, number, number] };

const C = {
  green: '#2F6B4A', greenDark: '#1F4D34', orange: '#E8681C', cream: '#FBF3E4', gold: '#E2C27A',
  grass: '#9DC07E', paving: '#E9DFCF', road: '#6E7276', wood: '#B07A4A', ink: '#26312B', tire: '#2B2B2B', glass: '#BFDCE3',
  denim: '#4A5A6E', shoe: '#3A3330',
};

const OVERVIEW: View = { pos: [2.2, 5.6, 19.5], look: [.6, 1.5, 1] };
const OVERVIEW_NARROW: View = { pos: [1, 6.5, 24], look: [.4, 1.8, 1] };
const VIEWS: Record<StationId, View> = {
  volunteer: { pos: [.6, 3.4, 9.4], look: [-.4, 1.9, .8] },
  donate: { pos: [1.6, 2.7, 5.8], look: [.5, 1.7, 1] },
  about: { pos: [5.6, 2.1, 6.6], look: [4.3, 1.2, 2.6] },
  resources: { pos: [-4.4, 2.2, 9.4], look: [-5.4, .9, 4.6] },
  contact: { pos: [7.4, 1.9, 7.6], look: [6.6, 1.1, 3.6] },
};
const ANCHORS: Record<StationId, [number, number, number]> = {
  volunteer: [-.5, 2.75, .95], donate: [.6, 2.1, 1.05], about: [4.3, 2.4, 2.6], resources: [-5.4, 2.6, 4.6], contact: [6.6, 1.85, 3.6],
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
type Hair = 'short' | 'bun' | 'long' | 'cap';
function person(o: { shirt: string; skin: string; hair: string; style?: Hair; cap?: string; pants?: string; apron?: boolean; scale?: number }) {
  const g = new THREE.Group(); g.scale.setScalar(o.scale ?? 1);
  const pants = std(o.pants ?? C.denim), skin = std(o.skin, { roughness: .55 }), shirt = std(o.shirt, { roughness: .8 });
  const hips = new THREE.Group(); hips.position.y = .82; g.add(hips);
  const legs: THREE.Group[] = [];
  for (const x of [-.1, .1]) {
    const leg = new THREE.Group(); leg.position.x = x; hips.add(leg); legs.push(leg);
    leg.add(mesh(new THREE.CapsuleGeometry(.075, .58, 6, 12), pants, 0, -.36, 0));
    leg.add(mesh(rbox(.14, .09, .26, .045), std(C.shoe), 0, -.77, .04));
  }
  const body = new THREE.Group(); hips.add(body);
  const torsoGeo = new THREE.LatheGeometry([[0, 0], [.2, 0], [.235, .12], [.25, .38], [.22, .56], [.12, .64], [0, .66]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
  body.add(mesh(torsoGeo, shirt, 0, -.04, 0));
  if (o.apron) {
    body.add(mesh(rbox(.36, .48, .04, .02), std(C.cream), 0, .22, .225));
    body.add(mesh(new THREE.CircleGeometry(.05, 16), std(C.orange), 0, .32, .247));
  }
  body.add(mesh(new THREE.CylinderGeometry(.06, .07, .1, 12), skin, 0, .66, 0));
  const head = new THREE.Group(); head.position.y = .9; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(.2, 32, 24), skin));
  head.add(mesh(new THREE.SphereGeometry(.035, 12, 8), skin, 0, -.02, .2));
  for (const x of [-.19, .19]) head.add(mesh(new THREE.SphereGeometry(.04, 12, 8), skin, x, -.01, 0));
  const hairM = std(o.hair, { roughness: .9 });
  const cap = mesh(new THREE.SphereGeometry(.212, 32, 16, 0, Math.PI * 2, 0, Math.PI * .5), hairM); cap.rotation.x = -.3; head.add(cap);
  if (o.style === 'bun') head.add(mesh(new THREE.SphereGeometry(.09, 16, 12), hairM, 0, .16, -.14));
  if (o.style === 'long') head.add(mesh(new THREE.CapsuleGeometry(.17, .22, 6, 16), hairM, 0, -.12, -.08));
  if (o.style === 'cap' || o.cap) {
    const cm = std(o.cap ?? C.green);
    const c2 = mesh(new THREE.SphereGeometry(.222, 32, 12, 0, Math.PI * 2, 0, Math.PI * .4), cm); c2.position.y = .03; head.add(c2);
    const brim = mesh(new THREE.CylinderGeometry(.15, .15, .02, 24, 1, false, 0, Math.PI), cm, 0, .09, .15); brim.rotation.y = -Math.PI / 2; head.add(brim);
  }
  const eyeM = std(C.ink, { roughness: .3 });
  for (const x of [-.07, .07]) head.add(mesh(new THREE.SphereGeometry(.022, 12, 8), eyeM, x, .03, .185));
  for (const x of [-.11, .11]) head.add(mesh(new THREE.SphereGeometry(.03, 12, 8), std('#E89A86', { transparent: true, opacity: .5 }), x, -.04, .165));
  const smile = mesh(new THREE.TorusGeometry(.045, .009, 6, 16, Math.PI), eyeM, 0, -.075, .185); smile.rotation.z = Math.PI; head.add(smile);
  const arm = (side: 1 | -1) => {
    const s = new THREE.Group(); s.position.set(side * .27, .52, 0); body.add(s);
    s.add(mesh(new THREE.CapsuleGeometry(.065, .2, 6, 12), shirt, 0, -.12, 0));
    const fore = new THREE.Group(); fore.position.y = -.26; s.add(fore);
    fore.add(mesh(new THREE.CapsuleGeometry(.055, .18, 6, 12), skin, 0, -.1, 0));
    fore.add(mesh(new THREE.SphereGeometry(.065, 16, 12), skin, 0, -.24, 0));
    return { s, fore };
  };
  return { g, hips, body, head, legs, armL: arm(-1), armR: arm(1) };
}
type Person = ReturnType<typeof person>;

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

export interface TruckApi { focus(id: StationId | null): void; dispose(): void }

export function mountTruck(
  canvas: HTMLCanvasElement,
  labels: Partial<Record<StationId, HTMLElement>>,
  onSelect: (id: StationId) => void,
): TruckApi | null {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = canvasTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9FCBE0'); g.addColorStop(.55, '#D9EAEE'); g.addColorStop(1, '#F7EBDA');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 4, 256);
  scene.fog = new THREE.Fog('#EAF0EC', 30, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.add(new THREE.HemisphereLight('#fff6ea', '#a9b98f', .8));
  const sun = new THREE.DirectionalLight('#fff0dc', 2.6); sun.position.set(-8, 12, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
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
  const truck = new THREE.Group(); scene.add(truck);
  const green = std(C.green, { roughness: .35, metalness: .15 }), orange = std(C.orange, { roughness: .45 }), cream = std(C.cream, { roughness: .6 });
  const chrome = std('#E6E3DC', { metalness: .8, roughness: .25 });
  truck.add(mesh(rbox(4.6, 2.3, 1.7, .22), green, -.1, 1.85, 0));
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
  truck.add(mesh(new THREE.PlaneGeometry(2.1, 1), std('#F3E3C6'), winX, 2.0, .852));
  for (const y of [2.36]) truck.add(mesh(new THREE.BoxGeometry(1.9, .03, .12), std(C.wood), winX, y, .9));
  for (let k = 0; k < 6; k++) truck.add(mesh(new THREE.CylinderGeometry(.06, .06, .12, 12), std(['#E8681C', '#2F6B4A', '#E2C27A'][k % 3]), winX - .8 + k * .32, 2.43, .9));
  for (const [w, h, x, y] of [[2.3, .1, winX, 2.55], [.1, 1.1, winX - 1.1, 2.0], [.1, 1.1, winX + 1.1, 2.0]] as const)
    truck.add(mesh(rbox(w, h, .1, .04), orange, x, y, .87));
  truck.add(mesh(rbox(2.4, .08, .5, .03), std(C.wood, { roughness: .6 }), winX, 1.48, 1.02));
  for (const x of [-.8, .8, -.3]) truck.add(mesh(rbox(.26, .12, .2, .03), cream, winX + x, 1.58, 1.1));
  const awningTex = canvasTex((c, w, h) => { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? C.cream : C.orange; c.fillRect(i * w / 10, 0, w / 10, h); } }, 512, 64);
  const awning = mesh(new THREE.BoxGeometry(2.6, .04, .9), std('#ffffff', { map: awningTex, roughness: .8 }), winX, 2.82, 1.25); awning.rotation.x = .32; truck.add(awning);
  for (const x of [-1.2, 1.2]) { const rod = mesh(new THREE.CylinderGeometry(.015, .015, .9, 6), chrome, winX + x, 2.7, 1.3); rod.rotation.x = 1.25; truck.add(rod); }
  const valanceTex = canvasTex((c, w, h) => { for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? C.cream : C.orange; c.beginPath(); c.arc(i * w / 20 + w / 40, 0, w / 40, 0, Math.PI); c.fill(); } }, 1024, 64);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .16), new THREE.MeshStandardMaterial({ map: valanceTex, transparent: true, side: THREE.DoubleSide }));
  valance.position.set(winX, 2.6, 1.68); truck.add(valance);

  // Branding.
  const brandTex = canvasTex((c) => {
    c.fillStyle = C.cream; heart(c, 100, 60, 130);
    c.font = '600 92px Inter, system-ui, sans-serif'; c.fillText('Free Meals on Wheels', 200, 150);
    c.fillStyle = C.gold; c.font = '500 46px Inter, system-ui, sans-serif'; c.fillText('Fresh, hot meals · free for all', 204, 215);
  }, 1300, 260);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .48), new THREE.MeshStandardMaterial({ map: brandTex, transparent: true, roughness: .6 }));
  brand.position.set(-.55, 1.2, .855); truck.add(brand);
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
  const board = new THREE.Group(); board.position.set(4.3, .14, 2.6); board.rotation.y = -.4; scene.add(board);
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

  // ——— Picnic area with an umbrella: neighbors sharing a meal.
  const picnic = new THREE.Group(); picnic.position.set(-5.4, .14, 4.6); picnic.rotation.y = .25; scene.add(picnic);
  const woodM = std(C.wood, { roughness: .8 });
  picnic.add(mesh(rbox(1.9, .08, .85, .03), woodM, 0, .78, 0));
  for (const z of [-.68, .68]) picnic.add(mesh(rbox(1.9, .06, .3, .02), woodM, 0, .45, z));
  for (const x of [-.72, .72]) picnic.add(mesh(new THREE.BoxGeometry(.08, .78, 1.7), woodM, x, .39, 0));
  picnic.add(mesh(new THREE.CylinderGeometry(.03, .03, 2.3, 8), chrome, 0, 1.15, 0));
  const umbTex = canvasTex((c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? C.cream : C.green; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.fill(); } }, 256, 256);
  const umb = mesh(new THREE.ConeGeometry(1.4, .5, 8, 1, true), std('#ffffff', { map: umbTex, side: THREE.DoubleSide }), 0, 2.35, 0); picnic.add(umb);
  for (const x of [-.45, .45]) {
    picnic.add(mesh(rbox(.3, .12, .22, .03), cream, x, .88, -.15));
    picnic.add(mesh(new THREE.CylinderGeometry(.05, .045, .14, 16), std(C.orange), x + .22, .89, -.05));
  }

  // ——— Contact: a mailbox among planters.
  const mailbox = new THREE.Group(); mailbox.position.set(6.6, .14, 3.6); scene.add(mailbox);
  mailbox.add(mesh(new THREE.BoxGeometry(.08, 1.05, .08), std(C.wood), 0, .52, 0));
  mailbox.add(mesh(rbox(.34, .32, .52, .12), std(C.orange, { roughness: .35 }), 0, 1.2, 0));
  const flag = mesh(new THREE.BoxGeometry(.02, .22, .07), std(C.green), .19, 1.32, -.1); mailbox.add(flag);
  const flowerCols = ['#F2A65A', '#E86A6A', '#F6D365', '#FFFFFF', '#C79BE0'];
  const planter = (x: number, z: number, w = 1.2) => {
    const p = new THREE.Group(); p.position.set(x, .14, z); scene.add(p);
    p.add(mesh(rbox(w, .45, .5, .06), std('#C98A55', { roughness: .8 }), 0, .22, 0));
    for (let i = 0; i < 4; i++) p.add(mesh(new THREE.IcosahedronGeometry(.2, 2), std('#5E8F55'), -w / 2 + .2 + i * (w - .4) / 3, .55, 0));
    for (let i = 0; i < 9; i++) p.add(mesh(new THREE.SphereGeometry(.05, 8, 6), std(flowerCols[i % 5]), (rnd() - .5) * w * .85, .68 + rnd() * .1, (rnd() - .5) * .3));
  };
  planter(7.8, 3.2); planter(-2.6, 7.4, 1.6); planter(3, 7.6, 1.6); planter(-8.2, 3.2);

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
  for (const [a, b] of [[new THREE.Vector3(-6.5, 3.15, 2), new THREE.Vector3(-2.4, 3.05, .9)], [new THREE.Vector3(2.2, 2.9, .9), new THREE.Vector3(7, 3.15, 2.2)]] as const) {
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

  // ——— People.
  const server = person({ shirt: C.green, skin: '#C68A62', hair: '#2B211C', apron: true, cap: C.orange });
  server.g.position.set(winX - .3, .62, .78); truck.add(server.g); server.legs.forEach((l) => (l.visible = false));
  const cook = person({ shirt: '#F2EDE2', skin: '#8E5B3E', hair: '#1E1714', style: 'bun', apron: true });
  cook.g.position.set(winX + .55, .62, .62); cook.g.rotation.y = -.5; truck.add(cook.g); cook.legs.forEach((l) => (l.visible = false));
  const founder = person({ shirt: '#E9B872', skin: '#9C6C50', hair: '#1E1714', pants: '#5A4A3A' });
  founder.g.position.set(3.3, .14, 3.2); founder.g.rotation.y = .6; scene.add(founder.g);
  const queue = [
    person({ shirt: '#C9826B', skin: '#8E5B3E', hair: '#2B211C', cap: C.green }),
    person({ shirt: '#7D93B2', skin: '#E2B796', hair: '#C28A4A', style: 'long' }),
    person({ shirt: '#A7C4A0', skin: '#C68A62', hair: '#3A2A20', style: 'short', scale: .72 }),
  ];
  queue.forEach((p, i) => { p.g.position.set(-.9 - i * .75, .14, 2.3 + i * .55); p.g.rotation.y = Math.PI + .5 - i * .1; scene.add(p.g); });
  const diners = [
    person({ shirt: '#E7C6D8', skin: '#D7A684', hair: '#7A5236', style: 'bun' }),
    person({ shirt: '#4F7F9E', skin: '#6E4630', hair: '#1E1714' }),
  ];
  diners.forEach((p, i) => {
    picnic.add(p.g); p.g.position.set(i ? .45 : -.45, -.36, i ? -.68 : .68); p.g.rotation.y = i ? 0 : Math.PI;
    p.legs.forEach((l) => { l.rotation.x = -Math.PI / 2; l.position.z = .02; });
  });
  const walker = person({ shirt: '#F2D27E', skin: '#C68A62', hair: '#2B211C', style: 'short' });
  walker.g.position.set(0, .14, 5); scene.add(walker.g);
  const walkerBox = mesh(rbox(.26, .12, .2, .03), cream, 0, -.3, .12); walker.armR.fore.add(walkerBox);

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

  // Donation jar on the counter.
  const jar = new THREE.Group(); jar.position.set(.45, 1.52, 1.05); truck.add(jar);
  jar.add(mesh(new THREE.CylinderGeometry(.13, .13, .32, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: .9, roughness: .05, thickness: .1, transparent: true, opacity: .5, side: THREE.DoubleSide }), 0, .16, 0));
  jar.add(mesh(new THREE.CylinderGeometry(.11, .11, .12, 24), std(C.gold, { metalness: .7, roughness: .3 }), 0, .07, 0));
  jar.add(mesh(new THREE.CylinderGeometry(.14, .14, .04, 32), orange, 0, .33, 0));
  const jarTag = canvasTex((c, w, h) => { c.fillStyle = C.cream; c.fillRect(0, 0, w, h); c.fillStyle = C.orange; heart(c, w / 2, 12, 60); c.fillStyle = C.greenDark; c.font = '700 30px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Give', w / 2, 112); }, 160, 128);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.16, .13), new THREE.MeshStandardMaterial({ map: jarTag })); tag.position.set(0, .18, .132); jar.add(tag);

  // ——— Picking.
  const targets: Record<StationId, THREE.Object3D[]> = {
    volunteer: [server.g, cook.g], donate: [jar], about: [board, founder.g, dog], resources: [picnic], contact: [mailbox],
  };
  const owner = new Map<THREE.Object3D, StationId>();
  for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) list.forEach((o) => o.traverse((c) => owner.set(c, id)));
  const pickables = Object.values(targets).flat();

  // ——— Camera: free look on desktop (drag to look around), eased flights to each station.
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .5, zoomSpeed: .6,
    minDistance: 8, maxDistance: 24, minPolarAngle: .9, maxPolarAngle: 1.38, minAzimuthAngle: -.75, maxAzimuthAngle: .75,
  });
  let narrow = false, focused: StationId | null = null, flying = true, shift = 0;
  const overview = () => (narrow ? OVERVIEW_NARROW : OVERVIEW);
  const station = (id: StationId): View => {
    if (!narrow) return VIEWS[id];
    const v = VIEWS[id], l = v.look;
    // Phones: back off and aim lower so the subject sits above the bottom sheet.
    return { pos: [v.pos[0] + (v.pos[0] - l[0]) * 1.1, v.pos[1] + 1.4, v.pos[2] + (v.pos[2] - l[2]) * 1.1], look: [l[0], l[1] - .5, l[2]] };
  };
  let goal = overview();
  camera.position.set(...goal.pos); controls.target.set(...goal.look);
  // Opening shot: start high and wide, then settle in.
  if (!reduce) camera.position.set(goal.pos[0] - 6, goal.pos[1] + 7, goal.pos[2] + 10);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; narrow = w / h < 1; camera.fov = narrow ? 40 : 30;
    if (!focused) { goal = overview(); flying = true; }
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover: StationId | null = null;
  const pick = (e: PointerEvent): StationId | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(pickables, true)) { const id = owner.get(hit.object); if (id) return id; }
    return null;
  };
  const onMove = (e: PointerEvent) => {
    hover = e.pointerType === 'mouse' ? pick(e) : null;
    canvas.style.cursor = hover ? 'pointer' : focused ? '' : 'grab';
    for (const [id, el] of Object.entries(labels)) el?.classList.toggle('hot', id === hover);
  };
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
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
      el.classList.toggle('off', v.z > 1 || (focused !== null && focused !== id));
    }
  }

  const pose = (p: Person, t: number, ph: number) => { p.head.rotation.y = Math.sin(t * .5 + ph) * .3; p.body.rotation.z = Math.sin(t * 1.2 + ph) * .02; };
  let last = 0;
  function frame(t: number) {
    const dt = Math.min(.05, t - last); last = t;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.6);
    controls.enabled = !focused && !narrow && !flying;
    if (flying) {
      camera.position.lerp(v.set(...goal.pos), k);
      controls.target.lerp(v2.set(...goal.look), k);
      if (camera.position.distanceTo(v) < .05 && controls.target.distanceTo(v2) < .05) flying = !!focused;
      camera.lookAt(controls.target);
    } else controls.update();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    shift += ((narrow || !focused ? 0 : .2) - shift) * k;
    camera.setViewOffset(w, h, shift * w, 0, w, h);

    // Life around the truck.
    server.armR.s.rotation.x = -1.2 + Math.sin(t * 2.2) * .25; server.armR.fore.rotation.x = -.6;
    server.armL.s.rotation.z = focused === 'volunteer' ? -2.6 + Math.sin(t * 7) * .25 : -.15;
    server.head.rotation.y = focused === 'volunteer' ? 0 : Math.sin(t * .6) * .3;
    cook.armL.s.rotation.x = -1 + Math.sin(t * 3) * .3; cook.armR.s.rotation.x = -1 + Math.cos(t * 3) * .3; cook.head.rotation.x = .2;
    founder.armR.s.rotation.x = -.4 + Math.sin(t * 1.5) * .35; founder.armR.fore.rotation.x = -.8;
    founder.armL.s.rotation.z = focused === 'about' ? -2.6 + Math.sin(t * 7) * .25 : 0;
    pose(founder, t, 1);
    queue.forEach((p, i) => { pose(p, t, i * 1.7); p.hips.position.y = .82 + Math.abs(Math.sin(t * 1.6 + i)) * .012; });
    queue[2].armL.s.rotation.z = -.4 + Math.sin(t * 2) * .2;
    diners.forEach((p, i) => { p.armR.s.rotation.x = -1.1 + Math.max(0, Math.sin(t * 1.6 + i * 2)) * .5; p.armR.fore.rotation.x = -1; p.head.rotation.x = Math.sin(t * 1.6 + i * 2) * .08; });
    // The walker strolls the plaza with a fresh meal.
    const wp = (t * .05) % 1, wx = -9 + wp * 18;
    walker.g.position.set(wx, .14, 6.2 + Math.sin(wp * Math.PI * 2) * .4); walker.g.rotation.y = Math.PI / 2;
    walker.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 6 + i * Math.PI) * .45));
    walker.armL.s.rotation.x = Math.sin(t * 6) * .4; walker.armR.s.rotation.x = -.9;
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
      s.position.set(src ? .9 + Math.sin(age * 6 + i) * .1 : winX - .7 + Math.sin(age * 5 + i) * .1, (src ? 3.5 : 2.6) + age * 1.4, src ? -.3 : 1.2);
      s.scale.setScalar(.8 + age * 3); (s.material as THREE.MeshStandardMaterial).opacity = .55 * (1 - age);
    });
    for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) {
      if (id === 'volunteer' || id === 'about') continue;
      const s = id === hover ? 1.05 : 1; list.forEach((o) => o.scale.lerp(v.set(s, s, s), .2));
    }
    renderer.render(scene, camera);
    placeLabels(w, h);
  }

  let raf = 0, visible = true, alive = true;
  const start = performance.now();
  const tick = () => { if (!visible || !alive) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) tick(); });
  io.observe(canvas);
  tick();

  return {
    focus(id) {
      if (!focused && !flying) { goal = { pos: camera.position.toArray() as View['pos'], look: controls.target.toArray() as View['look'] }; }
      focused = id; goal = id ? station(id) : overview(); flying = true;
      if (reduce) frame(8);
    },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      renderer.dispose(); pmrem.dispose();
    },
  };
}
