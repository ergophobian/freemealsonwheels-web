// The homepage is a painted community kitchen. Objects in the room are the navigation:
// the sign-up clipboard, the donation jar, the delivery van, the corkboard and the door.
import * as THREE from 'three';
import { PAL, lcg, makePaper, makeGlow, PAINT_FRAG, mat, ink, arm, reach } from './painted-scene';

export type StationId = 'volunteer' | 'donate' | 'about' | 'resources' | 'contact';
type View = { pos: [number, number, number]; look: [number, number, number] };

const OVERVIEW: View = { pos: [0, 2.2, 10.6], look: [0, 1.3, -1] };
const VIEWS: Record<StationId, View> = {
  volunteer: { pos: [2.2, 1.6, 3.4], look: [2.55, 1.15, .3] },
  donate: { pos: [1.15, 1.6, 2.2], look: [1.25, 1.12, 0] },
  about: { pos: [-.8, 1.9, 2.4], look: [-1, 1.7, -3] },
  resources: { pos: [2, 2.2, 1.6], look: [2.1, 2.05, -2.9] },
  contact: { pos: [-2.2, 1.6, 2.6], look: [-2.75, 1.3, -2.9] },
};

export interface KitchenApi { focus(id: StationId | null): void; dispose(): void }

export function mountKitchen(
  canvas: HTMLCanvasElement,
  labels: Partial<Record<StationId, HTMLElement>>,
  onSelect: (id: StationId) => void,
): KitchenApi | null {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#F2EEE3');
  scene.add(new THREE.HemisphereLight('#fffaf0', '#d9cdb4', 1.5));
  const key = new THREE.DirectionalLight('#ffe9cf', 1.1); key.position.set(-3, 6, 5); scene.add(key);
  const glowTex = makeGlow();
  const glow = (s: number, o: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(s); return sp;
  };

  // Room: floor, back wall with a window, side wall.
  const room = new THREE.Group(); scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), mat('#E2D9C6')); floor.rotation.x = -Math.PI / 2; floor.position.z = 1; room.add(floor);
  const wallMat = mat('#F2EEE3');
  const wallPiece = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .2), wallMat); m.position.set(x, y, -3.1); room.add(m);
  };
  // Window opening spans x -2..0, y 1.1..2.5.
  wallPiece(12, 4.2, -8, 2.1); wallPiece(14, 4.2, 7, 2.1); wallPiece(2, 1.1, -1, .55); wallPiece(2, 1.7, -1, 3.35);
  const tiles = new THREE.Mesh(new THREE.BoxGeometry(30, .9, .05), mat('#A9C2A2')); tiles.position.set(0, .45, -2.98); room.add(tiles);
  const frameMat = mat('#2F6B4A');
  for (const [w, h, x, y] of [[2.1, .08, -1, 1.1], [2.1, .08, -1, 2.5], [.08, 1.4, -2, 1.8], [.08, 1.4, 0, 1.8], [.05, 1.4, -1, 1.8]] as const) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, .14), frameMat); f.position.set(x, y, -3); room.add(f);
  }

  // Outside the window: sky, a tree and the delivery van.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'varying vec2 vUv; void main() { gl_FragColor = vec4(mix(vec3(1., .88, .7), vec3(.82, .9, .92), smoothstep(.3, .75, vUv.y)), 1.); }',
  }));
  outside.position.set(-1, 3, -9); scene.add(outside);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), mat('#C9C2AE')); street.rotation.x = -Math.PI / 2; street.position.set(-1, .8, -6); scene.add(street);
  for (const [x, z] of [[-3, -7.5], [1.5, -8]] as const) {
    const t = new THREE.Group(), r = lcg(Math.round(x * 7 + 50));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 2, 6), mat(PAL.wood)); trunk.position.y = 1; t.add(trunk);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.5 + r() * .3, 2), mat(['#4F7F58', '#6E9A62', '#8DB06E'][i % 3])); b.position.set((r() - .5) * 1.1, 2.2 + r() * .6, 0); t.add(b); }
    t.position.set(x, .8, z); scene.add(t);
  }
  const van = new THREE.Group();
  const vanBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, .9), mat('#F7F1E4')); vanBody.position.y = .75; van.add(vanBody);
  const vanCab = new THREE.Mesh(new THREE.BoxGeometry(.7, .7, .88), mat('#F7F1E4')); vanCab.position.set(1.4, .6, 0); van.add(vanCab);
  const vanGlass = new THREE.Mesh(new THREE.BoxGeometry(.3, .32, .9), mat('#9CC3CF')); vanGlass.position.set(1.55, .75, 0); van.add(vanGlass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, .12, .92), mat(PAL.scarf)); stripe.position.y = .7; van.add(stripe);
  const heart = new THREE.Mesh(new THREE.CircleGeometry(.16, 16), mat('#2F6B4A')); heart.position.set(-.2, .95, .46); van.add(heart);
  for (const x of [-.6, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .94, 12), mat('#3a3330')); w.rotation.x = Math.PI / 2; w.position.set(x, .22, 0); van.add(w); }
  van.position.set(-1.3, .8, -6.2); scene.add(van); ink(van);

  // Door on the left, corkboard on the right.
  const door = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, .08), mat('#C98A55')); slab.position.y = 1.1; door.add(slab);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.6, .5, .04), mat('#FFF3DE')); panel.position.set(0, 1.6, .05); door.add(panel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), mat(PAL.gold)); knob.position.set(.36, 1.05, .07); door.add(knob);
  const phone = new THREE.Mesh(new THREE.BoxGeometry(.22, .34, .06), mat('#2F6B4A')); phone.position.set(.75, 1.3, .02); door.add(phone);
  door.position.set(-2.8, 0, -2.95); scene.add(door); ink(door);

  const board = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, .05), mat('#C7A06C')); board.add(cork);
  const fr = lcg(3);
  for (const [x, y, c] of [[-.45, .18, '#FFF3DE'], [0, .2, '#F5D8A8'], [.45, .15, '#DDEBD2'], [-.3, -.25, '#FCE3CF'], [.3, -.22, '#FFF3DE']] as const) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(.34, .38), mat(c)); f.position.set(x, y, .03); f.rotation.z = (fr() - .5) * .25; f.userData.ink = false; board.add(f);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(.025, 6, 6), mat(PAL.scarf)); pin.position.set(x, y + .15, .05); pin.userData.ink = false; board.add(pin);
  }
  board.position.set(2.1, 2.05, -2.97); scene.add(board); ink(board);

  // Counter with meals, a pot on the stove, hanging lamps.
  const counter = new THREE.Group();
  const front = new THREE.Mesh(new THREE.BoxGeometry(4.4, .95, .8), mat('#2F6B4A')); front.position.y = .48; counter.add(front);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, .08, .9), mat('#D9B98C')); top.position.y = .99; counter.add(top);
  const meals: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.26, .12, .2), mat(PAL.cream, '#ffd9a0'));
    m.position.set(-.6 + (i % 3) * .3, 1.09 + Math.floor(i / 3) * .13, .1); counter.add(m); meals.push(m);
    const band = new THREE.Mesh(new THREE.BoxGeometry(.265, .03, .205), mat(PAL.scarf)); band.position.copy(m.position); band.userData.ink = false; counter.add(band);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.26, .22, .32, 16), mat('#7D8A8E')); pot.position.set(-1.6, 1.19, -.05); counter.add(pot);
  const stew = new THREE.Mesh(new THREE.CircleGeometry(.24, 16), mat('#D98B3A', '#c06a20')); stew.rotation.x = -Math.PI / 2; stew.position.set(-1.6, 1.34, -.05); stew.userData.ink = false; counter.add(stew);
  counter.position.set(-.3, 0, 0); scene.add(counter); ink(counter);
  const steam = Array.from({ length: 8 }, () => {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true })); scene.add(s); return s;
  });
  for (const x of [-1.6, 0, 1.6]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, 1.2, 4), mat('#3a3330')); cord.position.set(x, 3.6, -.4); scene.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.3, .25, 14, 1, true), new THREE.MeshToonMaterial({ color: '#2F6B4A', side: THREE.DoubleSide })); shade.position.set(x, 2.95, -.4); scene.add(shade);
    const g = glow(1.6, .55); g.position.set(x, 2.8, -.4); scene.add(g);
    const l = new THREE.PointLight('#ffd49a', .7, 3.5, 2); l.position.set(x, 2.7, -.4); scene.add(l);
  }

  // Two volunteers plating behind the counter.
  function person(coat: string, skin: string, hat: string, x: number) {
    const g = new THREE.Group(); g.position.set(x, 0, -.75); scene.add(g);
    const body = new THREE.Group(); body.position.y = .8; g.add(body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .5, 4, 10), mat(coat)); torso.position.y = .45; body.add(torso);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(.36, .5, .05), mat('#FFF3DE')); apron.position.set(0, .35, .24); body.add(apron);
    const head = new THREE.Group(); head.position.y = 1.08; body.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 16), mat(skin)));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat)); cap.position.y = .04; head.add(cap);
    for (const ex of [.065, -.065]) {
      const e = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .04, 2, 6), new THREE.MeshBasicMaterial({ color: '#3a2a20' }));
      e.rotation.z = Math.PI / 2; e.position.set(ex, .0, .18); e.userData.ink = false; head.add(e);
      const b = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#E8907A', transparent: true, opacity: .55 }));
      b.position.set(ex * 1.5, -.05, .17); b.scale.z = .3; b.userData.ink = false; head.add(b);
    }
    const aL = arm(coat, skin, .36, .34); aL.shoulder.position.set(-.27, .78, 0); body.add(aL.shoulder);
    const aR = arm(coat, skin, .36, .34); aR.shoulder.position.set(.27, .78, 0); body.add(aR.shoulder);
    ink(g);
    return { g, body, head, aL, aR };
  }
  const p1 = person('#6F86A6', PAL.skin1, PAL.gold, -1.2);
  const p2 = person('#C9826B', PAL.skin2, '#2F6B4A', .2);

  // The donation jar, with coins and a heart.
  const jar = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .42, 20, 1, true), new THREE.MeshToonMaterial({ color: '#DDEDEA', transparent: true, opacity: .55, side: THREE.DoubleSide }));
  glass.position.y = .21; jar.add(glass);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .05, 20), mat(PAL.gold)); lid.position.y = .44; jar.add(lid);
  const coins = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .14, 16), mat('#E2B85A', '#8a6a20')); coins.position.y = .08; coins.userData.ink = false; jar.add(coins);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.2, .12), mat(PAL.scarf)); tag.position.set(0, .26, .175); tag.userData.ink = false; jar.add(tag);
  jar.position.set(1.3, 1.03, .1); scene.add(jar); ink(lid);
  const jarGlow = glow(.9, .35); jarGlow.position.set(1.3, 1.3, .1); scene.add(jarGlow);

  // The sign-up clipboard on a little easel.
  const clip = new THREE.Group();
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.02, .025, 1.3, 5), mat(PAL.wood)); leg.position.set(s * .22, .62, 0); leg.rotation.z = s * .12; clip.add(leg); }
  const boardC = new THREE.Mesh(new THREE.BoxGeometry(.5, .66, .03), mat('#B9824F')); boardC.position.set(0, 1.25, .05); boardC.rotation.x = -.2; clip.add(boardC);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(.42, .54), mat('#FFFDF6')); sheet.position.set(0, 1.23, .075); sheet.rotation.x = -.2; sheet.userData.ink = false; clip.add(sheet);
  for (let i = 0; i < 6; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(i % 2 ? .22 : .3, .018), new THREE.MeshBasicMaterial({ color: i < 3 ? '#2F6B4A' : '#C9B9A0' }));
    line.position.set(-.04, 1.4 - i * .07, .08 + i * .014); line.rotation.x = -.2; line.userData.ink = false; clip.add(line);
  }
  const clamp1 = new THREE.Mesh(new THREE.BoxGeometry(.18, .06, .04), mat('#9AA3A6')); clamp1.position.set(0, 1.55, .1); clamp1.rotation.x = -.2; clip.add(clamp1);
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .3, 6), mat(PAL.gold)); pencil.position.set(.12, 1.15, .12); pencil.rotation.z = .9; clip.add(pencil);
  clip.position.set(2.55, 0, .35); scene.add(clip); ink(clip);

  const targets: Record<StationId, THREE.Object3D> = { volunteer: clip, donate: jar, about: van, resources: board, contact: door };
  const anchors: Record<StationId, THREE.Vector3> = {
    volunteer: new THREE.Vector3(2.55, 1.75, .35), donate: new THREE.Vector3(1.3, 1.62, .1), about: new THREE.Vector3(-1.1, 2.5, -6.2),
    resources: new THREE.Vector3(2.1, 2.7, -2.95), contact: new THREE.Vector3(-2.8, 2.45, -2.95),
  };
  const owner = new Map<THREE.Object3D, StationId>();
  for (const [id, o] of Object.entries(targets) as [StationId, THREE.Object3D][]) o.traverse((c) => owner.set(c, id));

  // Paint pass.
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  const target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
  const post = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, tPaper: { value: makePaper() }, uRes: { value: new THREE.Vector2() }, uBoil: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    // Encode to sRGB on output so washes stay light instead of muddy.
    fragmentShader: PAINT_FRAG.replace('gl_FragColor = vec4(c, 1.);', 'gl_FragColor = vec4(c, 1.);\n    #include <colorspace_fragment>'),
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  // Camera: eases between the overview and each station.
  let narrow = false;
  const overview = (): View => narrow ? { pos: [.2, 2.3, 12.5], look: [.1, 1.3, -1] } : OVERVIEW;
  const cur = { pos: new THREE.Vector3(...OVERVIEW.pos), look: new THREE.Vector3(...OVERVIEW.look) };
  let goal: View = OVERVIEW, focused: StationId | null = null, shift = -.13;
  // Phones look straight at each station; wide screens use the framed views.
  const station = (id: StationId): View => {
    if (!narrow) return VIEWS[id];
    const l = VIEWS[id].look;
    return { pos: [l[0], l[1] + .85, l[2] + (id === 'about' ? 7.5 : 4.4)], look: [l[0], l[1] + .35, l[2]] };
  };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio(); target.setSize(w * pr, h * pr);
    post.uniforms.uRes.value.set(w * pr, h * pr);
    camera.aspect = w / h; narrow = w / h < 1;
    camera.fov = narrow ? 42 : 32;
    if (!focused) goal = overview();
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  cur.pos.set(...goal.pos); cur.look.set(...goal.look);

  // Pointer: hover highlights, click selects.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover: StationId | null = null;
  const pick = (e: PointerEvent): StationId | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(Object.values(targets), true)) { const id = owner.get(hit.object); if (id) return id; }
    return null;
  };
  const onMove = (e: PointerEvent) => {
    hover = e.pointerType === 'mouse' ? pick(e) : null;
    canvas.style.cursor = hover ? 'pointer' : '';
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

  const v = new THREE.Vector3();
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const [id, el] of Object.entries(labels) as [StationId, HTMLElement][]) {
      v.copy(anchors[id]).project(camera);
      const hidden = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (focused !== null && focused !== id);
      const half = el.offsetWidth / 2 + 8;
      el.style.transform = `translate(${Math.min(w - half, Math.max(half, (v.x * .5 + .5) * w))}px, ${(-v.y * .5 + .5) * h}px) translate(-50%, -100%)`;
      el.classList.toggle('off', hidden);
    }
  }

  let last = 0;
  function frame(t: number) {
    const dt = Math.min(.05, t - last); last = t;
    const k = 1 - Math.exp(-dt * 3.2);
    cur.pos.lerp(v.set(...goal.pos), reduce ? 1 : k);
    cur.look.lerp(v.set(...goal.look), reduce ? 1 : k);
    camera.position.copy(cur.pos); camera.lookAt(cur.look);
    // Wide screens: the room sits right of the headline, and a focused object slides left of the panel.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    shift += ((narrow ? 0 : focused ? .2 : -.13) - shift) * (reduce ? 1 : k);
    camera.setViewOffset(w, h, shift * w, 0, w, h);

    // Plating rhythm: reach for a box, set it down, repeat.
    for (const [p, ph] of [[p1, 0], [p2, 1.7]] as const) {
      const c = (Math.sin(t * 1.4 + ph) + 1) / 2, base = p.g.position.x;
      reach(p.aL, base - .35 + c * .25, 1.12 + Math.sin(t * 2.8 + ph) * .04, -1);
      reach(p.aR, base + .3 + c * .15, 1.1 + c * .06, 1);
      p.body.rotation.z = (c - .5) * .06;
      p.head.rotation.z = Math.sin(t * .7 + ph) * .06;
      p.head.rotation.y = Math.sin(t * .4 + ph) * .25;
    }
    meals.forEach((m, i) => { m.position.y = 1.09 + Math.floor(i / 3) * .13 + Math.max(0, Math.sin(t * 1.4 + i)) * .01; });
    steam.forEach((s, i) => {
      const age = (t * .3 + i / steam.length) % 1;
      s.position.set(-1.9 + Math.sin(age * 6 + i) * .08, 1.4 + age * .9, -.05);
      s.scale.setScalar(.6 + age * 2); (s.material as THREE.MeshBasicMaterial).opacity = .6 * (1 - age);
    });
    van.position.x = -1.5 + Math.sin(t * .25) * .05;
    for (const [id, o] of Object.entries(targets) as [StationId, THREE.Object3D][]) {
      if (id === 'about') continue;
      const s = id === hover ? 1.06 : 1; o.scale.lerp(v.set(s, s, s), .2);
    }
    jarGlow.material.opacity = .3 + Math.sin(t * 2) * .08 + (hover === 'donate' ? .25 : 0);

    post.uniforms.uBoil.value = Math.floor(t * 12) * 1.37 % 100;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    placeLabels();
  }

  let raf = 0, visible = true, alive = true;
  const start = performance.now();
  const tick = () => { if (!visible || !alive) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) tick(); });
  io.observe(canvas);
  tick();

  return {
    focus(id) { focused = id; goal = id ? station(id) : overview(); if (reduce) frame(8); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      renderer.dispose();
    },
  };
}
