// The whole site is one 3D world: the Free Meals on Wheels community kitchen on a sunny street.
// The street, building and kitchen are modelled and lit in Blender (tools/blender/kitchen.py) and baked,
// so the browser only draws textures; people, steam, coins and the story boards are live on top.
// CC0 assets: props and textures from Poly Haven, people by Quaternius (Ultimate Modular Men/Women).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { loadBaked } from './world/baked';
import { loadCast, VOLUNTEERS, NEIGHBOURS, type Person, type Kind, type Pose } from './world/people';
import { Crowd, type Seat } from './world/crowd';
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type V3 = [number, number, number];
type View = { pos: V3; look: V3; fov?: number };

// Where each station's label floats.
const ANCHORS: Record<StationId, V3> = {
  volunteer: [-2.0, 3.05, -.2], donate: [5.6, 1.45, 1.5], about: [-1.0, 2.45, 1.3], resources: [.35, 1.35, 6.4], contact: [-9.0, 2.75, 1.75],
};

function canvasTex(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 256) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
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
const lit = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...extra });

// Table sets on the plaza (x, z, rotation in degrees) as placed in Blender, and their chairs in the set's own frame.
const TABLES: [number, number, number][] = [[-5.4, 3.6, 10], [-2.6, 5.2, -15], [-5.8, 6.6, 25], [.4, 6.4, 0]];
const CHAIRS: [number, number][] = [[.03, -.54], [-.07, .54]], TABLE_TOP: [number, number] = [-.08, -.04];
const setPoint = (t: [number, number, number], p: [number, number]) => {
  const r = THREE.MathUtils.degToRad(t[2]), bx = p[0] * Math.cos(r) - p[1] * Math.sin(r), by = p[0] * Math.sin(r) + p[1] * Math.cos(r);
  return new THREE.Vector3(t[0] + bx, 0, t[1] - by);
};

export interface WorldApi { surfaces(s: Partial<Record<'about' | 'contact', HTMLElement>>): void; focus(id: StationId | null, peek?: boolean): void; give(amount: number): void; dispose(): void }

export function mountWorld(
  canvas: HTMLCanvasElement,
  labels: Partial<Record<StationId, HTMLElement>>,
  onSelect: (id: StationId) => void,
  onArrive: (id: StationId) => void = () => {},
  onReady: (progress: number, done: boolean) => void = () => {},
): WorldApi | null {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const modest = coarse || (navigator.hardwareConcurrency || 4) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  let tier = modest ? 1 : 2;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch { return null; }
  // Lighting is baked, so the only per-frame cost is drawing: phones can afford a sharp pixel ratio.
  const applyTier = () => renderer.setPixelRatio(Math.min(devicePixelRatio, [1, coarse ? 1.75 : 1.25, 1.5][tier]));
  applyTier();
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = .8;

  const scene = new THREE.Scene();
  scene.background = canvasTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7FB2DE'); g.addColorStop(.5, '#B5D2E8'); g.addColorStop(.8, '#E9DCCB'); g.addColorStop(1, '#F3E3CC');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 4, 256);
  scene.fog = new THREE.Fog('#E6DCCD', 45, 120);
  // A small generated room for reflections on coins, the jar and people (baked surfaces ignore it).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .6;
  // People are the only lit objects: a warm late-afternoon sun from the same direction as the bake, and sky fill.
  scene.add(new THREE.HemisphereLight('#D6E6F4', '#B9A285', 1.5));
  const sun = new THREE.DirectionalLight('#FFD9AE', 2.2); sun.position.set(11, 7.2, 16); scene.add(sun);

  let alive = true, revealed = false;
  const parts = { world: false, people: false };
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 240);
  const partDone = (k: keyof typeof parts) => {
    parts[k] = true;
    const n = Object.values(parts).filter(Boolean).length;
    onReady(n / 2, false);
    if (n === 2 && !revealed) {
      revealed = true;
      const finish = () => onReady(1, true);
      (renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }).compileAsync?.(scene, camera).then(finish, finish) ?? finish();
    }
  };

  // ——— Boards: the real story and community pages, drawn onto the boards so zooming in never swaps one for another.
  const logoImg = new Image(); logoImg.src = `${BASE}img/logo-heart.png`;
  const teamImg = new Image(); teamImg.src = `${BASE}img/team.webp`;
  const smileImg = new Image(); smileImg.src = `${BASE}img/smile.webp`;
  const redraws: (() => void)[] = [];
  const redrawAll = () => redraws.forEach((r) => r());
  for (const im of [logoImg, teamImg, smileImg]) im.onload = redrawAll;
  Promise.all(['400 100px "Instrument Serif"', 'italic 400 100px "Instrument Serif"', '400 40px Kalam', '600 30px Inter'].map((f) => document.fonts.load(f))).then(redrawAll).catch(() => {});
  const drawn = (w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const run = () => { c.clearRect(0, 0, w, h); draw(c, w, h); tex.needsUpdate = true; };
    run(); redraws.push(run); return tex;
  };
  const chalkSpeckle = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.save(); c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(0,0,0,${.25 + rnd() * .5})`; c.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); }
    c.restore();
  };
  const storyTex = drawn(1600, 1000, (c, w, h) => {
    const seedSave = seed; seed = 41;
    c.fillStyle = '#26382E'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(230,235,225,${.012 + rnd() * .03})`; c.lineWidth = 30 + rnd() * 90; c.lineCap = 'round'; c.beginPath(); const a2 = rnd() * 6; c.arc(rnd() * w, rnd() * h, 80 + rnd() * 260, a2, a2 + .6 + rnd() * 1.4); c.stroke(); }
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
    c.save(); c.translate(1150, 470); c.rotate(-4 * Math.PI / 180);
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 30; c.shadowOffsetY = 14; c.fillStyle = '#FFFDF7'; c.fillRect(-320, -267, 640, 535); c.shadowColor = 'transparent';
    if (teamImg.complete && teamImg.naturalWidth) { const iw = teamImg.naturalWidth, ih = teamImg.naturalHeight, tw = 604, th = 453, sc = Math.max(tw / iw, th / ih); c.save(); c.beginPath(); c.rect(-302, -249, tw, th); c.clip(); c.drawImage(teamImg, -302 + (tw - iw * sc) / 2, -249 + (th - ih * sc) / 2, iw * sc, ih * sc); c.restore(); }
    c.fillStyle = 'rgba(246,233,196,.8)'; c.rotate(-.05); c.fillRect(-55, -285, 110, 30);
    c.restore();
    seed = seedSave;
  });
  const corkTex = drawn(1760, 1060, (c, w, h) => {
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
  const boards: Partial<Record<'about' | 'contact', { host: THREE.Object3D; w: number; h: number; pw: number }>> = {};

  // ——— Donation jar on the hand-out table: tap an amount and coins drop in while hearts rise.
  const giving = new THREE.Group(); scene.add(giving);
  const jar = new THREE.Group(); jar.scale.setScalar(1.15); giving.add(jar);
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(.14, .13, .34, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#EAF4F2', roughness: .05, metalness: .1, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false })).translateY(.17));
  { const rim = new THREE.Mesh(new THREE.TorusGeometry(.14, .01, 8, 40), lit('#ffffff', { roughness: .1, transparent: true, opacity: .6 })); rim.rotation.x = Math.PI / 2; rim.position.y = .34; jar.add(rim); }
  { const ribbon = new THREE.Mesh(new THREE.TorusGeometry(.142, .014, 8, 40), lit('#1F7A4A')); ribbon.rotation.x = Math.PI / 2; ribbon.position.y = .25; jar.add(ribbon); }
  const signTex = canvasTex((c, w) => {
    c.fillStyle = '#25362D'; c.fillRect(0, 0, w, 240); c.fillStyle = '#E8875A'; heart(c, w / 2, 24, 56);
    c.fillStyle = '#F7F1E6'; c.textAlign = 'center'; c.font = 'italic 500 44px Georgia, serif'; c.fillText('Every coin is', w / 2, 140); c.fillText('a warm dinner', w / 2, 192);
  }, 320, 240);
  { const sign = new THREE.Mesh(new THREE.PlaneGeometry(.26, .2), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(-.26, .12, -.05); sign.rotation.set(-.2, .35, 0); giving.add(sign); }
  const coinGeo = new THREE.CylinderGeometry(.03, .03, .007, 20), coinM = lit('#D9BC7E', { metalness: .85, roughness: .25 });
  const billM = lit('#A9C99A', { roughness: .8, side: THREE.DoubleSide });
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

  // ——— Steam over the stockpots, and a soft contact shadow under every person.
  const steamM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .3, depthWrite: false });
  const POTS: [number, number, number][] = [[-6.07, 1.5, -8.45], [-4.77, 1.45, -8.49], [-3.2, 1.55, -8.4]];
  const steam = Array.from({ length: 15 }, (_, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), steamM.clone()); s.userData.pot = POTS[i % 3]; scene.add(s); return s; });
  const blobTex = canvasTex((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(40,28,18,.45)'); g.addColorStop(1, 'rgba(40,28,18,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64);
  const blobGeo = new THREE.PlaneGeometry(.9, .9).rotateX(-Math.PI / 2), blobM = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const grounded = (p: Person) => { const b = new THREE.Mesh(blobGeo, blobM); b.position.y = .012; b.renderOrder = 1; p.obj.add(b); return p; };
  const mealBox = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .07, .24), lit('#C9A36F', { roughness: .85 })); g.add(b); return g; };

  // ——— The world itself.
  let crowd: Crowd | null = null;
  const seats: Seat[] = [];
  const reserved = TABLES[3];
  TABLES.forEach((t) => {
    const top = setPoint(t, TABLE_TOP);
    for (const ch of CHAIRS) {
      const pos = setPoint(t, ch);
      if (t === reserved) continue;
      seats.push({ pos, face: Math.atan2(top.x - pos.x, top.z - pos.z), taken: false });
    }
  });
  loadBaked(`${BASE}models/kitchen`, renderer).then((w) => {
    if (!alive) return;
    scene.add(w.root);
    const jarAt = w.anchors.jar?.position ?? new THREE.Vector3(5.6, .8, 1.5);
    giving.position.copy(jarAt);
    for (const [id, key, tex, pw] of [['about', 'story', storyTex, 1600], ['contact', 'contact', corkTex, 1760]] as const) {
      const b = w.boards[key]; if (!b) continue;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.copy(b.obj.position).add(new THREE.Vector3(0, 0, .002)); scene.add(face);
      boards[id] = { host: face, w: b.w, h: b.h, pw };
    }
    partDone('world');
  }).catch((e) => { console.error(e); partDone('world'); });

  // ——— People: volunteers cooking and packing inside, one handing out meals at the door, neighbours outside.
  // Realistic MakeHuman cast: volunteers in green tees and neighbours of every age. Lighter devices load fewer.
  const CREW: Kind[] = tier > 1 ? [...VOLUNTEERS] : ['v-maya', 'v-james', 'v-linda'];
  const FOLK: Kind[] = tier > 1 ? [...NEIGHBOURS] : ['n-chen', 'n-amara', 'n-marcus', 'n-ruth'];
  const KINDS: Kind[] = [...CREW, ...FOLK];
  type Station = { x: number; z: number; ry: number; pose: Pose; aisle: number };
  // Two aisles run left to right through the kitchen (behind the island, and between island and packing line),
  // joined at either end of the island. Volunteers walk the aisles, so nobody passes through a counter.
  const AISLE = [-6.95, -4.0], LINKS = [-5.85, .7];
  const STATIONS: Station[] = [
    { x: -5.6, z: -7.7, ry: Math.PI, pose: 'stir', aisle: 0 }, { x: -3.4, z: -7.7, ry: Math.PI, pose: 'stir', aisle: 0 },
    { x: -3.9, z: -6.15, ry: 0, pose: 'reach', aisle: 0 }, { x: -1.9, z: -6.15, ry: 0, pose: 'reach', aisle: 0 },
    { x: .3, z: -7.95, ry: Math.PI, pose: 'reach', aisle: 0 }, { x: 4.25, z: -6.85, ry: Math.PI, pose: 'reach', aisle: 0 },
    { x: -5.85, z: -5.0, ry: -Math.PI / 2, pose: 'reach', aisle: 0 },
    { x: -3.0, z: -4.05, ry: Math.PI, pose: 'reach', aisle: 1 }, { x: 2.9, z: -3.95, ry: 0, pose: 'reach', aisle: 1 }, { x: 4.5, z: -3.95, ry: 0, pose: 'reach', aisle: 1 },
  ];
  type Crew = { p: Person; at: number; path: THREE.Vector3[]; timer: number };
  const crew: Crew[] = [];
  const taken = new Set<number>();
  let mover: Crew | null = null;
  const route = (from: THREE.Vector3, a0: number, st: Station) => {
    const pts: THREE.Vector3[] = [new THREE.Vector3(from.x, 0, AISLE[a0])];
    if (a0 !== st.aisle) {
      const link = LINKS.reduce((b, l) => (Math.abs(from.x - l) + Math.abs(st.x - l) < Math.abs(from.x - b) + Math.abs(st.x - b) ? l : b));
      pts.push(new THREE.Vector3(link, 0, AISLE[a0]), new THREE.Vector3(link, 0, AISLE[st.aisle]));
    }
    pts.push(new THREE.Vector3(st.x, 0, AISLE[st.aisle]), new THREE.Vector3(st.x, 0, st.z));
    return pts;
  };
  let server: Person | null = null, friend: Person | null = null, serveFlash = 0;
  loadCast(`${BASE}models/people`, KINDS).then((cast) => {
    if (!alive) return;
    const crewKinds: Kind[] = CREW.filter((k) => k !== 'v-james');
    const starts = [0, 2, 8, 4, 9, 6];
    crewKinds.forEach((k, i) => {
      const p = grounded(cast.make(k));
      const st = STATIONS[starts[i]]; p.obj.position.set(st.x, 0, st.z); p.obj.rotation.y = st.ry; scene.add(p.obj); p.set(st.pose);
      crew.push({ p, at: starts[i], path: [], timer: 2 + Math.random() * 6 }); taken.add(starts[i]);
    });
    server = grounded(cast.make('v-james'));
    server.obj.position.set(4.25, 0, .72); scene.add(server.obj); server.set('idle');
    const fp = setPoint(reserved, CHAIRS[1]), top = setPoint(reserved, TABLE_TOP);
    friend = cast.make(FOLK.includes('n-amara') ? 'n-amara' : FOLK[0]); friend.obj.position.copy(fp); friend.obj.rotation.y = Math.atan2(top.x - fp.x, top.z - fp.z); scene.add(friend.obj); friend.set('sit');
    crowd = new Crowd(scene, {
      y: 0, minZ: .55, maxZ: 8.2,
      window: new THREE.Vector3(3.95, 0, 2.6), queueDir: new THREE.Vector3(.55, 0, .83), seats,
      entries: [new THREE.Vector3(-24, 0, 3.4), new THREE.Vector3(24, 0, 3.6), new THREE.Vector3(-24, 0, 6.8), new THREE.Vector3(24, 0, 7)],
      exits: [new THREE.Vector3(-25, 0, 3.2), new THREE.Vector3(25, 0, 3.4), new THREE.Vector3(-25, 0, 7), new THREE.Vector3(25, 0, 6.8)],
      obstacles: [
        ...TABLES.map(([x, z]) => ({ x, z, r: .95 })),
        { x: -12.0, z: 5.4, r: 1.05 }, { x: 8.4, z: 4.8, r: 1.1 }, { x: -17.5, z: 5.2, r: 1 }, { x: 13.8, z: 5.4, r: 1.05 },
        { x: 7.6, z: 7.4, r: 1 }, { x: -9.6, z: 7.4, r: 1 }, { x: -6.8, z: 8.2, r: .2 }, { x: -.6, z: 8.2, r: .2 }, { x: 6.8, z: 8.2, r: .2 },
        { x: -1.0, z: 1.33, r: 1 }, { x: 1.1, z: 3.4, r: .5 }, { x: -9.0, z: 1.7, r: 1.35 },
        { x: 3.2, z: 1.55, r: .62 }, { x: 4.3, z: 1.55, r: .62 }, { x: 5.4, z: 1.55, r: .62 }, { x: 5.3, z: 2.55, r: .5 },
        ...[-5.8, -4.5, -2.7, -1.4].map((x) => ({ x, z: .32, r: .55 })), { x: -.25, z: .45, r: .4 }, { x: 2.45, z: .45, r: .4 },
        { x: -8, z: 8.1, r: .35 }, { x: 11.2, z: 8.1, r: .35 }, { x: 9.8, z: 8.1, r: .25 }, { x: -14, z: 8.25, r: .2 }, { x: 14, z: 8.25, r: .2 },
      ],
      max: tier > 1 ? 13 : 9,
      meal: mealBox,
      onOrder: () => server?.set('nod'),
      onServe: () => { server?.set('reach'); serveFlash = 1.2; },
      make: () => grounded(cast.make(FOLK[Math.floor(Math.random() * FOLK.length)])),
    });
    partDone('people');
  }).catch((e) => { console.error(e); partDone('people'); });

  // ——— Picking: simple invisible volumes over each station (the baked world is one merged piece).
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  const hit = (w: number, h: number, d: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); m.position.set(x, y, z); scene.add(m); return m; };
  const targets: Record<StationId, THREE.Object3D[]> = {
    volunteer: [hit(14, 4.4, .6, 0, 2.2, -.1), hit(13.2, .7, .4, 0, 3.9, .1)],
    donate: [hit(3.6, 1.3, 1.2, 4.3, .65, 1.55)],
    about: [hit(2, 2.4, .4, -1, 1.2, 1.3)],
    resources: [hit(2.2, 1.2, 2.2, .35, .6, 6.4)],
    contact: [hit(2.9, 2.6, .5, -9, 1.3, 1.7)],
  };
  const owner = new Map<THREE.Object3D, StationId>();
  for (const [id, list] of Object.entries(targets) as [StationId, THREE.Object3D[]][]) list.forEach((o) => owner.set(o, id));

  // ——— Views.
  // A board view fits the board to about 94% of the screen, square to its face, so the page can take over seamlessly.
  const fitBoard = (id: 'about' | 'contact'): View => {
    const b = boards[id]; const fov = 30, t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const c = b ? b.host.position : new THREE.Vector3(...ANCHORS[id]); const w = b?.w ?? 1.6, h = b?.h ?? 1;
    const d = Math.max(h / .94 / (2 * t), w / .94 / (2 * t * camera.aspect));
    return { pos: [c.x, c.y, c.z + d], look: [c.x, c.y, c.z], fov };
  };
  const seatEye = setPoint(reserved, CHAIRS[0]), friendAt = setPoint(reserved, CHAIRS[1]);
  const views = (): Record<StationId, View> => ({
    // Inside the kitchen, standing by the packing line, looking across the cooks to the stove.
    volunteer: { pos: [5.7, 2.15, -1.2], look: [-2.6, 1.05, -6.6], fov: 58 },
    donate: { pos: [6.7, 1.75, 3.25], look: [5.4, .95, 1.45], fov: 34 },
    about: fitBoard('about'),
    resources: { pos: [seatEye.x, 1.3, seatEye.z + .38], look: [friendAt.x, .92, friendAt.z - .1], fov: 54 },
    contact: fitBoard('contact'),
  });

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .45, zoomSpeed: .6,
    minDistance: 10, maxDistance: 34, minPolarAngle: 1.05, maxPolarAngle: 1.45, minAzimuthAngle: -.55, maxAzimuthAngle: .55,
  });
  let narrow = false, peeking = false, focused: StationId | null = null, flying = true, shift = 0, fovGoal = 36, arrivedFor: StationId | null = null;
  const baseFov = () => (narrow ? 44 : 36);
  // The opening view fits the whole street front (community board on the left to the hand-out table on the right).
  const overview = (): View => {
    const half = narrow ? 4.4 : 9.4, look: V3 = narrow ? [1.4, 1.5, 2.6] : [-1.4, 2.4, 1.5];
    const t = Math.tan(THREE.MathUtils.degToRad(baseFov() / 2)), dist = Math.max(half / (t * camera.aspect), (narrow ? 3.4 : 4.6) / t) * 1.04;
    const dir = new THREE.Vector3(.16, narrow ? .5 : .3, 1).normalize().multiplyScalar(dist);
    return { pos: [look[0] + dir.x, look[1] + dir.y, look[2] + dir.z], look };
  };
  const station = (id: StationId, peek = false): View => {
    if (peek) { const a = ANCHORS[id]; return { pos: [a[0] + .6, a[1] + 1.6, a[2] + 8.5], look: [a[0], a[1] - 1.2, a[2]] }; }
    const v = views()[id];
    // Phones: the card covers the lower part of the screen, so aim lower and the subject sits in the visible top band.
    if (narrow && id === 'volunteer') return { pos: [5.0, 3.5, -1.4], look: [-2.0, -2.4, -6.6], fov: 66 };
    if (narrow && (id === 'resources' || id === 'donate')) return { ...v, look: [v.look[0], v.look[1] - 1, v.look[2]], fov: (v.fov ?? 36) + 12 };
    return v;
  };
  let goal = overview();
  camera.position.set(...goal.pos); controls.target.set(...goal.look);
  if (!reduce) camera.position.set(goal.pos[0] - 6, goal.pos[1] + 6, goal.pos[2] + 10);

  const cssObjs: { id: StationId; o: CSS3DObject; el: HTMLElement }[] = [];
  const css = new CSS3DRenderer();
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1', overflow: 'hidden' });
  css.domElement.className = 'surfaces';
  canvas.after(css.domElement);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); css.setSize(w, h);
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
    const hits = ray.intersectObjects(Object.values(targets).flat(), false);
    return hits.length ? owner.get(hits[0].object) ?? null : null;
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
      el.classList.toggle('off', v.z > 1 || (focused !== null && (!peeking || focused !== id)) || (narrow && focused === null));
    }
  }

  let last = 0, slow = 0, sampled = 0;
  function frame(t: number) {
    const raw = t - last, dt = Math.min(.05, raw); last = t;
    if (tier > 0 && t > 3 && raw < .5) {
      slow += raw > .028 ? 1 : 0; sampled++;
      if (sampled >= 120) { if (slow / sampled > .5) { tier--; applyTier(); resize(); crowd?.limit(tier ? 8 : 6); } slow = sampled = 0; }
    }
    const k = reduce ? 1 : revealed ? 1 - Math.exp(-dt * 2.4) : 0;
    controls.enabled = !focused && !narrow && !flying;
    if (flying) {
      camera.position.lerp(v.set(...goal.pos), k);
      controls.target.lerp(v2.set(...goal.look), k);
      const near = camera.position.distanceTo(v) < .04 && controls.target.distanceTo(v2) < .04;
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

    crowd?.update(dt);
    if (crowd) for (const n of crowd.npcs) n.f.obj.visible = !focused || peeking || n.f.obj.position.distanceTo(camera.position) > 1.6;
    for (const c of crew) {
      c.p.update(dt);
      const o = c.p.obj;
      if (c.path.length) {
        const tgt = c.path[0], d = v.subVectors(tgt, o.position); d.y = 0; const dist = d.length();
        if (dist < .04) { c.path.shift(); if (!c.path.length) { if (mover === c) mover = null; c.p.carry(null); c.p.set(STATIONS[c.at].pose); c.timer = 4 + Math.random() * 7; } }
        else { o.position.addScaledVector(d.normalize(), Math.min(dist, dt * .95)); const yaw = Math.atan2(d.x, d.z); o.rotation.y += Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y)) * Math.min(1, dt * 8); }
        continue;
      }
      const st = STATIONS[c.at];
      o.rotation.y += Math.atan2(Math.sin(st.ry - o.rotation.y), Math.cos(st.ry - o.rotation.y)) * Math.min(1, dt * 4);
      c.timer -= dt;
      if (c.timer <= 0) {
        if (Math.random() < .4 || mover) { c.p.set(Math.random() < .6 ? st.pose : 'idle'); c.timer = 3 + Math.random() * 5; }
        else {
          const free = STATIONS.map((_, i) => i).filter((i) => !taken.has(i));
          const to = free[Math.floor(Math.random() * free.length)];
          if (to !== undefined) {
            mover = c; c.path = route(o.position, st.aisle, STATIONS[to]); taken.delete(c.at); taken.add(to); c.at = to;
            if (to >= 7) c.p.carry(mealBox()); c.p.set(to >= 7 ? 'carry' : 'walk');
          } else c.timer = 2;
        }
      }
    }
    if (server) {
      server.update(dt);
      if (serveFlash > 0 && (serveFlash -= dt) <= 0) server.set('idle');
    }
    friend?.update(dt);
    steam.forEach((s, i) => {
      const p = s.userData.pot as [number, number, number], age = (t * .28 + i / steam.length) % 1;
      s.position.set(p[0] + Math.sin(age * 5 + i) * .12, p[1] + age * 1.1, p[2] + Math.cos(i) * .08);
      s.scale.setScalar(.8 + age * 2.5); (s.material as THREE.MeshBasicMaterial).opacity = .28 * (1 - age);
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
    renderer.render(scene, camera);
    css.domElement.style.transform = `translateX(${-shift * w}px)`;
    for (const c of cssObjs) { const on = focused === c.id && !peeking && camera.position.distanceTo(v.set(...goal.pos)) < 1.5; c.el.style.opacity = on ? '1' : '0'; c.o.visible = on || c.el.style.opacity !== '0'; }
    css.render(scene, camera);
    placeLabels(w, h);
  }

  let raf = 0, visible = true;
  const start = performance.now();
  const tick = () => { if (!visible || !alive) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) tick(); });
  io.observe(canvas);
  tick();
  (window as unknown as { __r: unknown }).__r = renderer;

  const pendingSurfaces: Partial<Record<'about' | 'contact', HTMLElement>> = {};
  const mountSurfaces = () => {
    for (const [id, el] of Object.entries(pendingSurfaces) as ['about' | 'contact', HTMLElement][]) {
      const b = boards[id]; if (!b) continue;
      const o = new CSS3DObject(el); o.position.copy(b.host.position).add(new THREE.Vector3(0, 0, .004)); o.scale.setScalar(b.w / b.pw); scene.add(o);
      cssObjs.push({ id, o, el }); delete pendingSurfaces[id];
    }
  };
  const waitBoards = setInterval(() => { if (!alive) return clearInterval(waitBoards); if (boards.about || boards.contact) { mountSurfaces(); if (!Object.keys(pendingSurfaces).length) clearInterval(waitBoards); } }, 200);

  return {
    surfaces(m) { Object.assign(pendingSurfaces, m); mountSurfaces(); },
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
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose(); clearInterval(waitBoards);
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      renderer.dispose(); pmrem.dispose();
    },
  };
}
