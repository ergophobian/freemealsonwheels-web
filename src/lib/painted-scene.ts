// Live watercolor hero: at golden hour, a volunteer hands a warm meal to a neighbor on a bench.
// Paper, grain and the 12 fps "boil" follow the painted-explainers recipe (youtube-automation).
import * as THREE from 'three';

const PAL = {
  paper: '#F6EFE2', ink: '#1F3A2B', coat: '#2F6B4A', scarf: '#E07A3C', blanket: '#C9826B', shirt: '#6F86A6',
  skin1: '#C68A62', skin2: '#8E5B3E', wood: '#8A5E3C', street: '#F1E0CA', city: '#D9AFA2', cityFar: '#E9C7B4',
  cream: '#FFF3DE', trouser: '#3A4652',
};
const BOIL_FPS = 12;

function lcg(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const seg = (x: number, a: number, b: number) => ease((x - a) / (b - a));
const mix2 = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// Paper base with soft ochre blotches and multiplied grain.
function makePaper(w = 1024, h = 1024) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, rnd = lcg(11);
  c.fillStyle = PAL.paper; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * w, y = rnd() * h, r = 60 + rnd() * 260, a = .05 * rnd();
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(160,125,80,${a})`); g.addColorStop(1, 'rgba(160,125,80,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const id = c.getImageData(0, 0, w, h), d = id.data, rg = lcg(5);
  for (let i = 0; i < d.length; i += 4) { const v = rg() < .55 ? rg() * rg() * 26 : 0; d[i] -= v; d[i + 1] -= v + 1; d[i + 2] -= v + 3; }
  c.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d')!, g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(.35, 'rgba(255,200,120,.45)'); g.addColorStop(1, 'rgba(255,180,100,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

const PAINT_FRAG = /* glsl */ `
  uniform sampler2D tScene, tPaper;
  uniform vec2 uRes; uniform float uBoil;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }
  float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }
  float lum(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
  void main() {
    vec2 px = 1. / uRes;
    // Hand-drawn boil, re-seeded 12 times a second.
    vec2 uv = vUv + (vec2(fbm(vUv * 9. + uBoil), fbm(vUv * 9. - uBoil + 4.)) - .5) * .005;
    // Pigment bleed.
    vec3 c = texture2D(tScene, uv).rgb * .4;
    c += texture2D(tScene, uv + vec2(px.x * 2., 0)).rgb * .15;
    c += texture2D(tScene, uv - vec2(px.x * 2., 0)).rgb * .15;
    c += texture2D(tScene, uv + vec2(0, px.y * 2.)).rgb * .15;
    c += texture2D(tScene, uv - vec2(0, px.y * 2.)).rgb * .15;
    // Wet edges.
    float l = lum(texture2D(tScene, uv).rgb);
    float gx = lum(texture2D(tScene, uv + vec2(px.x * 1.5, 0)).rgb) - lum(texture2D(tScene, uv - vec2(px.x * 1.5, 0)).rgb);
    float gy = lum(texture2D(tScene, uv + vec2(0, px.y * 1.5)).rgb) - lum(texture2D(tScene, uv - vec2(0, px.y * 1.5)).rgb);
    float edge = smoothstep(.03, .22, length(vec2(gx, gy)));
    c = mix(c, c * c * 1.1, edge * .5);
    // Granulation, uneven wash, soft gouache steps.
    c *= .95 + .08 * fbm(vUv * uRes / 3.);
    c = mix(c, c * (.92 + .16 * fbm(vUv * 3. + 7.)), .6);
    c = mix(c, floor(c * 10. + .5) / 10., .12);
    // Paper.
    vec3 paper = texture2D(tPaper, vUv * vec2(uRes.x / uRes.y, 1.) * .9).rgb;
    c = mix(c, vec3(1.), .1 + smoothstep(.85, 1., l) * .4) * paper;
    float v = smoothstep(1.2, .45, length(vUv - .5) * 1.4);
    c *= mix(vec3(.9, .84, .8), vec3(1.), v);
    gl_FragColor = vec4(c, 1.);
  }`;

const SKY_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec3 top = vec3(.96, .86, .8), mid = vec3(.98, .79, .64), low = vec3(1., .87, .6);
    vec3 c = mix(low, mid, smoothstep(.0, .35, vUv.y));
    c = mix(c, top, smoothstep(.35, .9, vUv.y));
    vec2 p = vUv * vec2(2.25, 1.);
    float d = distance(p, vec2(1.45, .3));
    c = mix(c, vec3(1., .93, .74), smoothstep(.5, .0, d) * .5);
    c = mix(c, vec3(1., .96, .82), smoothstep(.13, .12, d));
    gl_FragColor = vec4(c, 1.);
  }`;

const mat = (color: string, emissive?: string) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...(emissive ? { emissive, emissiveIntensity: .6 } : {}) });

function limb(r: number, len: number, color: string) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat(color));
  m.position.y = -len / 2; return m;
}

// A two-bone arm posed in its parent's side plane (x right, y up).
function arm(sleeve: string, skin: string, l1: number, l2: number) {
  const shoulder = new THREE.Group(), elbow = new THREE.Group();
  shoulder.add(limb(.075, l1, sleeve)); elbow.position.y = -l1; shoulder.add(elbow);
  elbow.add(limb(.065, l2, sleeve));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), mat(skin)); hand.position.y = -l2 - .05; elbow.add(hand);
  return { shoulder, elbow, l1, l2: l2 + .05 };
}

const tmp = new THREE.Vector3();
// Point the hand at a world-space (x, y) with a planar two-bone solve.
function reach(a: ReturnType<typeof arm>, wx: number, wy: number, bend: 1 | -1) {
  const parent = a.shoulder.parent!;
  parent.updateMatrixWorld(true);
  tmp.set(wx, wy, a.shoulder.getWorldPosition(new THREE.Vector3()).z);
  parent.worldToLocal(tmp);
  const tx = tmp.x - a.shoulder.position.x, ty = tmp.y - a.shoulder.position.y;
  const d = clamp(Math.hypot(tx, ty), .05, a.l1 + a.l2 - .001);
  const a1 = Math.atan2(ty, tx) + bend * Math.acos(clamp((a.l1 * a.l1 + d * d - a.l2 * a.l2) / (2 * a.l1 * d), -1, 1));
  const ex = Math.cos(a1) * a.l1, ey = Math.sin(a1) * a.l1;
  a.shoulder.rotation.z = a1 + Math.PI / 2;
  a.elbow.rotation.z = Math.atan2(ty - ey, tx - ex) - a1;
}

export function mountPaintedScene(canvas: HTMLCanvasElement, progress: () => number = () => 0) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); } catch { return () => {}; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#F6DCC0', 12, 40);
  scene.add(new THREE.HemisphereLight('#fff4e4', '#d8b4a0', 2.3));
  const rim = new THREE.DirectionalLight('#ffe2bd', 1.6); rim.position.set(6, 4, -6); scene.add(rim);
  const key = new THREE.DirectionalLight('#ffe9cf', .9); key.position.set(-4, 5, 6); scene.add(key);

  const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: SKY_FRAG, depthWrite: false,
  }));
  sky.position.set(0, 10, -30); scene.add(sky);

  // Distant city in two soft layers, with a few lit windows.
  const rnd = lcg(7);
  const windowMat = new THREE.MeshBasicMaterial({ color: '#FFE1A8' });
  for (const [z, col, n] of [[-34, PAL.cityFar, 30], [-24, PAL.city, 22]] as const) {
    for (let i = 0; i < n; i++) {
      const w = 1.4 + rnd() * 2.4, h = 1.5 + rnd() * (z < -30 ? 8 : 5);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), mat(col));
      b.position.set(-34 + i * (68 / n) + rnd(), h / 2 - .2, z); scene.add(b);
      if (z > -30) for (let k = 0; k < 3; k++) if (rnd() > .5) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(.18, .26), windowMat);
        win.position.set(b.position.x - w / 3 + rnd() * w * .66, .6 + rnd() * (h - 1), z + .51); scene.add(win);
      }
    }
  }

  // Street, sidewalk, bench, lamp.
  const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), mat(PAL.street)); street.rotation.x = -Math.PI / 2; street.position.z = -5; scene.add(street);
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, .08, .5), mat(PAL.wood)); seat.position.y = .48; bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, .4, .06), mat(PAL.wood)); back.position.set(0, .8, -.24); back.rotation.x = -.12; bench.add(back);
  for (const x of [-.75, .75]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .48, .45), mat(PAL.ink)); leg.position.set(x, .24, 0); bench.add(leg); }
  bench.position.set(1.2, .12, -.1); scene.add(bench);
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 3.6, 6), mat(PAL.ink)); pole.position.y = 1.8; lamp.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#FFE6B0' })); bulb.position.y = 3.6; lamp.add(bulb);
  lamp.position.set(2.7, .12, -.9); scene.add(lamp);

  const glowTex = makeGlow();
  const glowSprite = (s: number, o: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(s); return sp;
  };
  const lampGlow = glowSprite(2.2, .7); lampGlow.position.set(2.7, 3.72, -.9); scene.add(lampGlow);

  // The neighbor, seated on the bench and wrapped in a blanket.
  const neighbor = new THREE.Group(); neighbor.position.set(1.0, .12, 0); scene.add(neighbor);
  const nUpper = new THREE.Group(); nUpper.position.y = .6; neighbor.add(nUpper);
  const nTorso = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .36, 4, 8), mat(PAL.shirt)); nTorso.position.y = .32; nUpper.add(nTorso);
  const blanket = new THREE.Mesh(new THREE.ConeGeometry(.48, .9, 9, 1, true), new THREE.MeshLambertMaterial({ color: PAL.blanket, flatShading: true, side: THREE.DoubleSide }));
  blanket.position.set(.04, .3, 0); nUpper.add(blanket);
  const nHead = new THREE.Group(); nHead.position.set(-.02, .82, 0); nUpper.add(nHead);
  nHead.add(new THREE.Mesh(new THREE.SphereGeometry(.18, 20, 16), mat(PAL.skin2)));
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.215, 20, 16, Math.PI * .15, Math.PI * 1.2), mat(PAL.blanket)); hood.rotation.y = Math.PI * .2; nHead.add(hood);
  for (const z of [.12, -.12]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .36, 4, 8), mat(PAL.trouser)); thigh.rotation.z = Math.PI / 2; thigh.position.set(-.22, .55, z); neighbor.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .34, 4, 8), mat(PAL.trouser)); shin.position.set(-.44, .3, z); neighbor.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.24, .08, .12), mat(PAL.ink)); shoe.position.set(-.5, .06, z); neighbor.add(shoe);
  }
  const nArmNear = arm(PAL.blanket, PAL.skin2, .36, .34); nArmNear.shoulder.position.set(-.08, .6, .2); nUpper.add(nArmNear.shoulder);
  const nArmFar = arm(PAL.blanket, PAL.skin2, .36, .34); nArmFar.shoulder.position.set(-.04, .6, -.2); nUpper.add(nArmFar.shoulder);

  // The volunteer, leaning in with a warm box.
  const giver = new THREE.Group(); giver.position.set(-.5, .12, .05); scene.add(giver);
  const gBody = new THREE.Group(); gBody.position.y = .78; giver.add(gBody);
  const coat = new THREE.Mesh(new THREE.ConeGeometry(.36, .9, 10, 1, true), new THREE.MeshLambertMaterial({ color: PAL.coat, flatShading: true, side: THREE.DoubleSide }));
  coat.position.y = .2; gBody.add(coat);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .32, 4, 8), mat(PAL.coat)); chest.position.y = .5; gBody.add(chest);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(.16, .06, 6, 12), mat(PAL.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = .78; gBody.add(scarf);
  const tailGeo = new THREE.PlaneGeometry(.5, .1, 8, 1); tailGeo.translate(-.25, 0, 0);
  const tail = new THREE.Mesh(tailGeo, new THREE.MeshLambertMaterial({ color: PAL.scarf, side: THREE.DoubleSide })); tail.position.set(-.1, .74, -.1); gBody.add(tail);
  const gHead = new THREE.Group(); gHead.position.set(0, 1.0, 0); gBody.add(gHead);
  gHead.add(new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 16), mat(PAL.skin1)));
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.scarf)); beanie.position.y = .04; gHead.add(beanie);
  for (const z of [.11, -.11]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .55, 4, 8), mat(PAL.trouser)); leg.position.set(0, .36, z); giver.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.26, .09, .13), mat(PAL.ink)); shoe.position.set(.06, .05, z); giver.add(shoe);
  }
  const gArmNear = arm(PAL.coat, PAL.skin1, .4, .38); gArmNear.shoulder.position.set(.04, .66, .22); gBody.add(gArmNear.shoulder);
  const gArmFar = arm(PAL.coat, PAL.skin1, .4, .38); gArmFar.shoulder.position.set(.04, .66, -.22); gBody.add(gArmFar.shoulder);

  // The meal: a warm box with steam and light.
  const box = new THREE.Group(); scene.add(box);
  box.add(new THREE.Mesh(new THREE.BoxGeometry(.34, .2, .26), mat(PAL.cream, '#ffcf8a')));
  box.add(new THREE.Mesh(new THREE.BoxGeometry(.35, .05, .27), mat(PAL.scarf)));
  const boxGlow = glowSprite(1.4, .75); box.add(boxGlow);
  const boxLight = new THREE.PointLight('#ffc98a', 1, 1.6, 2); box.add(boxLight);
  const steam = Array.from({ length: 6 }, () => {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.05, 0), new THREE.MeshBasicMaterial({ color: '#fff7ea', transparent: true }));
    scene.add(s); return s;
  });
  const motes = Array.from({ length: 36 }, (_, i) => { const m = glowSprite(.12 + (i % 4) * .03, 0); scene.add(m); return { m, seed: i * 1.618 }; });

  const camera = new THREE.PerspectiveCamera(28, 1, .1, 120);
  const target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
  const post = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, tPaper: { value: makePaper() }, uRes: { value: new THREE.Vector2() }, uBoil: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: PAINT_FRAG,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  const mouse = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; };
  addEventListener('pointermove', onMove);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio(); target.setSize(w * pr, h * pr);
    post.uniforms.uRes.value.set(w * pr, h * pr);
    camera.aspect = w / h;
    // Wide screens: figures sit right of the headline. Phones: figures sit above it.
    camera.setViewOffset(w, h, w > 900 ? -w * .2 : 0, w > 900 ? 0 : h * .16, w, h);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function frame(t: number) {
    // The handoff plays partway on load; scrolling carries it to the end.
    const h = Math.max(seg(t, .6, 5) * .6, progress());
    const breathe = Math.sin(t * 1.6) * .012;
    const toMid = seg(h, 0, .55), toNeighbor = seg(h, .5, .95), release = seg(h, .82, 1);

    // Box: giver's chest → between them → the neighbor's lap.
    const bp = mix2(mix2([-.12, 1.2], [.3, 1.12], toMid), [.66, 1.0], toNeighbor);
    box.position.set(bp[0], bp[1] + breathe, .3);
    box.rotation.z = Math.sin(t * .9) * .03;

    // Volunteer leans in, then rests a hand on the neighbor's shoulder.
    gBody.rotation.z = -.2 * toMid + .08 * release + breathe;
    gHead.rotation.z = -.12 - .12 * toMid;
    const holdL = [bp[0] - .14, bp[1] - .02];
    reach(gArmNear, ...(mix2(holdL, [-.42, .62], release) as [number, number]), -1);
    reach(gArmFar, ...(mix2(holdL, [.86, 1.32], release) as [number, number]), -1);

    // Neighbor lifts their head and reaches for the meal.
    nHead.rotation.z = -.38 + .32 * toMid + Math.sin(t * 1.2) * .02;
    nUpper.rotation.z = .12 * toMid - .05 * release;
    const holdR = [bp[0] + .14, bp[1] - .03];
    reach(nArmNear, ...(mix2([.72, .74], holdR, seg(h, .3, .7)) as [number, number]), 1);
    reach(nArmFar, ...(mix2([.8, .7], holdR, toNeighbor) as [number, number]), 1);

    // Scarf in the breeze.
    const tp = tailGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) { const x = tp.getX(i); tp.setZ(i, Math.sin(t * 4 + x * 9) * .1 * -x); tp.setY(i, (i < tp.count / 2 ? .05 : -.05) + x * .25); }
    tp.needsUpdate = true;

    // Warmth grows as the meal arrives.
    const warm = .55 + .45 * toNeighbor;
    boxGlow.scale.setScalar(1.1 + warm * 1.2 + Math.sin(t * 2.3) * .06);
    boxLight.intensity = .6 + warm * 1.1;
    steam.forEach((s, i) => {
      const age = (t * .35 + i / steam.length) % 1;
      s.position.set(box.position.x + Math.sin(age * 7 + i) * .06, box.position.y + .14 + age * .55, .02);
      s.scale.setScalar(.6 + age * 1.8); (s.material as THREE.MeshBasicMaterial).opacity = .7 * (1 - age);
    });
    motes.forEach(({ m, seed }) => {
      const age = (t * .08 + seed) % 1, r = .2 + age * 1.6;
      m.position.set(box.position.x + Math.sin(seed * 7 + t * .4) * r * .7, box.position.y + age * 2.6, Math.cos(seed * 5) * .6);
      (m.material as THREE.SpriteMaterial).opacity = Math.sin(age * Math.PI) * (.25 + .75 * warm) * .8;
    });

    camera.position.set(mouse.x * .5 + .2, 1.7 - mouse.y * .3, 11 - h * 1.6);
    camera.lookAt(.3, 1.0, 0);
    post.uniforms.uBoil.value = Math.floor(t * BOIL_FPS) * 1.37 % 100;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }

  let raf = 0, visible = true;
  const start = performance.now();
  const loop = () => {
    cancelAnimationFrame(raf);
    const tick = () => { if (!visible) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    tick();
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduce) loop(); });
  io.observe(canvas);
  const still = () => frame(8);
  if (reduce) { still(); addEventListener('scroll', still, { passive: true }); } else loop();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    removeEventListener('pointermove', onMove); removeEventListener('scroll', still); renderer.dispose();
  };
}
