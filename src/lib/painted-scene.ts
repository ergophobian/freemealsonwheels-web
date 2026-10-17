// Live watercolor hero: a low-poly Three.js town drawn through a paint shader.
// Paper, grain and the 12 fps "boil" follow the painted-explainers recipe (youtube-automation).
import * as THREE from 'three';

const PAL = {
  paper: '#F6EFE2', ink: '#1F3A2B', green: '#2F6B4A', sage: '#7FA77A', hill: '#A9C58E',
  orange: '#E07A3C', gold: '#E2C27A', cream: '#FFF6E6', rose: '#D98F7A', sky: '#F3E6CF', road: '#C9B79A',
};
const BOIL_FPS = 12;

function lcg(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Paper base with soft ochre blotches, multiplied grain and a warm vignette.
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
  for (let i = 0; i < d.length; i += 4) {
    const v = rg() < .55 ? rg() * rg() * 26 : 0;
    d[i] -= v; d[i + 1] -= v + 1; d[i + 2] -= v + 3;
  }
  c.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    // Hand-drawn boil: the whole frame wobbles a little, re-seeded 12 times a second.
    vec2 uv = vUv + (vec2(fbm(vUv * 9. + uBoil), fbm(vUv * 9. - uBoil + 4.)) - .5) * .006;
    // Pigment bleed: soft average of neighbors.
    vec3 c = texture2D(tScene, uv).rgb * .4;
    c += texture2D(tScene, uv + vec2(px.x * 2., 0)).rgb * .15;
    c += texture2D(tScene, uv - vec2(px.x * 2., 0)).rgb * .15;
    c += texture2D(tScene, uv + vec2(0, px.y * 2.)).rgb * .15;
    c += texture2D(tScene, uv - vec2(0, px.y * 2.)).rgb * .15;
    // Wet edges: pigment pools where color changes.
    float l = lum(texture2D(tScene, uv).rgb);
    float gx = lum(texture2D(tScene, uv + vec2(px.x * 1.5, 0)).rgb) - lum(texture2D(tScene, uv - vec2(px.x * 1.5, 0)).rgb);
    float gy = lum(texture2D(tScene, uv + vec2(0, px.y * 1.5)).rgb) - lum(texture2D(tScene, uv - vec2(0, px.y * 1.5)).rgb);
    float edge = smoothstep(.03, .25, length(vec2(gx, gy)));
    c = mix(c, c * c * 1.1, edge * .45);
    // Granulation and uneven wash.
    float gran = fbm(vUv * uRes / 3.);
    c *= .95 + .08 * gran;
    c = mix(c, c * (.92 + .16 * fbm(vUv * 3. + 7.)), .6);
    // Transparent washes: lift everything toward paper.
    c = mix(c, vec3(1.), .22);
    // Soft posterize toward flat gouache fields.
    c = mix(c, floor(c * 7. + .5) / 7., .25);
    // Paper shows through light areas, multiplies everywhere.
    vec3 paper = texture2D(tPaper, vUv * vec2(uRes.x / uRes.y, 1.) * .9).rgb;
    c = mix(c, vec3(1.), smoothstep(.82, 1., l) * .5) * paper;
    // Warm vignette.
    float v = smoothstep(1.15, .45, length(vUv - .5) * 1.4);
    c *= mix(vec3(.93, .89, .84), vec3(1.), v);
    gl_FragColor = vec4(c, 1.);
  }`;

const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function house(color: string, roof: string, s = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 1 * s, 1.2 * s), mat(color)); body.position.y = .5 * s; g.add(body);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, .8 * s, 4), mat(roof)); top.position.y = 1.4 * s; top.rotation.y = Math.PI / 4; g.add(top);
  const door = new THREE.Mesh(new THREE.BoxGeometry(.3 * s, .5 * s, .05), mat(PAL.green)); door.position.set(0, .25 * s, .61 * s); g.add(door);
  return g;
}

function tree(s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.07 * s, .1 * s, .5 * s, 5), mat('#8a6a48')); trunk.position.y = .25 * s; g.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.5 * s, 0), mat(Math.random() > .5 ? PAL.green : PAL.sage)); crown.position.y = .85 * s; g.add(crown);
  return g;
}

function van() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, .8, .8), mat(PAL.cream)); body.position.set(-.15, .55, 0); g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .78), mat(PAL.cream)); cab.position.set(.85, .45, 0); g.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(.05, .28, .66), mat('#6f9fb0')); glass.position.set(1.15, .58, 0); g.add(glass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.52, .14, .82), mat(PAL.orange)); stripe.position.set(-.15, .45, 0); g.add(stripe);
  const heart = new THREE.Mesh(new THREE.CircleGeometry(.14, 12), new THREE.MeshBasicMaterial({ color: PAL.orange })); heart.position.set(-.2, .72, .41); g.add(heart);
  for (const [x, z] of [[-.6, .4], [.7, .4], [-.6, -.4], [.7, -.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .12, 10), mat(PAL.ink)); w.rotation.x = Math.PI / 2; w.position.set(x, .18, z); g.add(w);
  }
  return g;
}

export function mountPaintedScene(canvas: HTMLCanvasElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false }); } catch { return () => {}; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.Fog(PAL.sky, 30, 70);
  scene.add(new THREE.HemisphereLight('#fff8ea', '#9ab48a', 2.2));
  const sunLight = new THREE.DirectionalLight('#ffd9a8', 2.2); sunLight.position.set(-8, 10, 6); scene.add(sunLight);

  const sun = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: PAL.gold, fog: false }));
  sun.position.set(10, 7.5, -34); scene.add(sun);

  // Rolling hills.
  const ground = new THREE.PlaneGeometry(80, 60, 60, 45); ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    pos.setY(i, r < 9 ? 0 : (Math.sin(x * .25) * Math.cos(z * .2) + 1) * Math.min(1, (r - 9) / 6) * 1.6);
  }
  ground.computeVertexNormals();
  scene.add(new THREE.Mesh(ground, mat(PAL.hill)));
  for (let i = 0; i < 5; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(8 + i * 2, 12, 8), mat(i % 2 ? PAL.sage : PAL.green));
    hill.position.set(-24 + i * 12, -5 + (i % 2), -26 - (i % 3) * 3); hill.scale.y = .55; scene.add(hill);
  }

  // Looping road through town.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6, 0, 2), new THREE.Vector3(-2, 0, 5), new THREE.Vector3(4, 0, 4.5), new THREE.Vector3(7, 0, 0),
    new THREE.Vector3(4, 0, -4), new THREE.Vector3(-2, 0, -4.5), new THREE.Vector3(-7, 0, -2),
  ], true);
  const roadPts = curve.getSpacedPoints(200), road: number[] = [];
  for (let i = 0; i < roadPts.length - 1; i++) {
    const a = roadPts[i], b = roadPts[i + 1], t = curve.getTangentAt(i / 200), n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(.7);
    const tb = curve.getTangentAt((i + 1) / 200), nb = new THREE.Vector3(-tb.z, 0, tb.x).multiplyScalar(.7);
    road.push(a.x + n.x, .02, a.z + n.z, a.x - n.x, .02, a.z - n.z, b.x + nb.x, .02, b.z + nb.z);
    road.push(a.x - n.x, .02, a.z - n.z, b.x - nb.x, .02, b.z - nb.z, b.x + nb.x, .02, b.z + nb.z);
  }
  const roadGeo = new THREE.BufferGeometry(); roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(road, 3)); roadGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ color: PAL.road, side: THREE.DoubleSide })));

  // The kitchen, with a chimney and steam.
  const kitchen = house(PAL.cream, PAL.orange, 1.9); kitchen.position.set(0, 0, 0); scene.add(kitchen);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(.35, .9, .35), mat('#b5552a')); chimney.position.set(.6, 2.9, -.2); scene.add(chimney);
  const steam: THREE.Mesh[] = [];
  const steamMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: .8, flatShading: true });
  for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), steamMat.clone()); scene.add(p); steam.push(p); }

  // Neighborhood around the loop.
  const spots: [number, number, string, string][] = [[-6.5, 5.5, '#F3D9B1', PAL.green], [5.5, 6.8, '#F7E3C6', PAL.rose], [9.5, -2, '#EBD3A8', PAL.green],
    [5, -7, '#F6E7D0', PAL.gold], [-4, -7.5, '#F0DCC0', PAL.rose], [-9.5, -1, '#F7E3C6', PAL.gold], [0.5, 7.5, '#EED8B4', PAL.green]];
  for (const [x, z, c, r] of spots) { const h = house(c, r, .9 + Math.random() * .3); h.position.set(x, 0, z); h.lookAt(0, 0, 0); scene.add(h); }
  const rnd = lcg(3);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = 8.5 + rnd() * 9, t = tree(.8 + rnd() * .7);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 2); scene.add(t);
  }
  for (const [x, z] of [[-2.8, 1.6], [2.8, 1.8], [-2.5, -2.2], [2.6, -2.5]]) { const t = tree(.9); t.position.set(x, 0, z); scene.add(t); }

  const truck = van(); scene.add(truck);

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 140);
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
    // Frame the town to the right on wide screens so the headline has room.
    camera.setViewOffset(w, h, w > 900 ? -w * .22 : 0, w > 900 ? 0 : h * .12, w, h);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let raf = 0, visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduce) loop(); });
  io.observe(canvas);
  const start = performance.now();

  function frame(t: number) {
    const k = (t * .035) % 1, p = curve.getPointAt(k), ahead = curve.getPointAt((k + .01) % 1);
    truck.position.copy(p); truck.position.y = Math.abs(Math.sin(t * 9)) * .03;
    truck.lookAt(ahead.x, truck.position.y, ahead.z); truck.rotateY(-Math.PI / 2);
    steam.forEach((s, i) => {
      const age = ((t * .45 + i / steam.length) % 1);
      s.position.set(.6 + Math.sin(age * 6 + i) * .25, 3.4 + age * 2.4, -.2 + age * .4);
      s.scale.setScalar(.6 + age * 1.6); (s.material as THREE.MeshLambertMaterial).opacity = .85 * (1 - age);
    });
    const orbit = Math.sin(t * .05) * .25 + mouse.x * .25;
    camera.position.set(Math.sin(orbit) * 30, 8 - mouse.y * 1.5, Math.cos(orbit) * 30);
    camera.lookAt(0, 2.6, 0);
    post.uniforms.uBoil.value = Math.floor(t * BOIL_FPS) * 1.37 % 100;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => { if (!visible) return; frame((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    tick();
  }
  if (reduce) frame(4); else loop();

  return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); removeEventListener('pointermove', onMove); renderer.dispose(); };
}
