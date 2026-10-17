// Architectural-model people: slender, faceless, softly colored. Built in code (no downloads) and posed
// procedurally, so they stay light and read as calm and grown-up rather than cartoonish.
import * as THREE from 'three';

export type Pose = 'idle' | 'walk' | 'sit' | 'serve' | 'reach' | 'nod' | 'wave' | 'stir' | 'carry' | 'chair' | 'chair-roll';
export type Mobility = 'walk' | 'cane' | 'chair';

const PALETTES = [
  ['#5B6B7A', '#E8E1D6'], ['#7A5C4F', '#D9CFC2'], ['#3F5A4C', '#E6DED0'], ['#8A7A6A', '#F1EBE2'], ['#4E5560', '#C9B8A6'],
  ['#9A6B53', '#EDE4D8'], ['#6F7F72', '#DCD2C4'], ['#5A4A55', '#E9E2D9'], ['#B48A6E', '#F4EEE6'], ['#405060', '#D6CCBE'],
];
const SKIN = ['#E8C3A6', '#C99B7A', '#A8775A', '#7E5440', '#5E3D2E', '#F0D2BC'];

const mat = (c: string, r = .85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const cap = (r: number, l: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), m); o.castShadow = true; return o; };

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export class Figure {
  obj = new THREE.Group();
  hand: THREE.Object3D;
  pose: Pose = 'idle';
  speed = 1;
  private t = Math.random() * 10;
  private blend = 0;
  private body = new THREE.Group();
  private head: THREE.Mesh;
  private legs: THREE.Group[] = [];
  private shins: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private fores: THREE.Group[] = [];
  private chair?: THREE.Group;
  private cane?: THREE.Mesh;
  constructor(public height = 1.72, opts: { palette?: number; skin?: number; apron?: boolean; mobility?: Mobility; hair?: boolean } = {}) {
    const pal = PALETTES[opts.palette ?? Math.floor(rnd() * PALETTES.length)], top = mat(pal[0]), bottom = mat(pal[1] === '#E8E1D6' ? '#4A4F57' : '#3E434A');
    const skin = mat(SKIN[opts.skin ?? Math.floor(rnd() * SKIN.length)], .6);
    const s = height / 1.72;
    this.obj.add(this.body); this.body.scale.setScalar(s);
    const hips = new THREE.Group(); hips.position.y = .92; this.body.add(hips);
    for (const x of [-.085, .085]) {
      const leg = new THREE.Group(); leg.position.x = x; hips.add(leg); this.legs.push(leg);
      const thigh = cap(.062, .34, bottom); thigh.position.y = -.21; leg.add(thigh);
      const shin = new THREE.Group(); shin.position.y = -.44; leg.add(shin); this.shins.push(shin);
      const calf = cap(.052, .34, bottom); calf.position.y = -.2; shin.add(calf);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(.09, .05, .2), mat('#2E2B29')); shoe.position.set(0, -.44, .04); shoe.castShadow = true; shin.add(shoe);
    }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .38, 4, 12), top); torso.scale.set(1, 1, .72); torso.position.y = .3; torso.castShadow = true; hips.add(torso);
    if (opts.apron) { const a = new THREE.Mesh(new THREE.PlaneGeometry(.24, .5), mat('#F3EEE6')); a.position.set(0, .22, .115); hips.add(a); }
    const neck = cap(.04, .06, skin); neck.position.y = .62; hips.add(neck);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(.105, 20, 16), skin); this.head.scale.set(.92, 1.08, 1); this.head.position.y = .76; this.head.castShadow = true; hips.add(this.head);
    if (opts.hair !== false) { const h = new THREE.Mesh(new THREE.SphereGeometry(.11, 20, 12, 0, Math.PI * 2, 0, Math.PI * .55), mat(['#2B2420', '#4A3A2E', '#8A7766', '#D8D2C8'][Math.floor(rnd() * 4)], 1)); h.position.y = .02; h.rotation.x = -.35; this.head.add(h); }
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * .19, .52, 0); hips.add(arm); this.arms.push(arm);
      const up = cap(.045, .24, top); up.position.y = -.15; arm.add(up);
      const fore = new THREE.Group(); fore.position.y = -.3; arm.add(fore); this.fores.push(fore);
      const lo = cap(.04, .22, skin); lo.position.y = -.14; fore.add(lo);
    }
    this.hand = new THREE.Object3D(); this.hand.position.set(0, -.3, .05); this.fores[1].add(this.hand);
    const mobility = opts.mobility ?? 'walk';
    if (mobility === 'chair') { this.chair = makeChair(); this.obj.add(this.chair); this.pose = 'chair'; }
    if (mobility === 'cane') {
      this.cane = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .86, 6), mat('#3A2E26', .5)); this.cane.castShadow = true;
      this.cane.position.set(0, -.3, .04); this.fores[1].add(this.cane); this.speed = .55;
    }
  }
  get rolling() { return !!this.chair; }
  get usesCane() { return !!this.cane; }
  set(p: Pose) {
    if (this.chair && (p === 'walk' || p === 'idle' || p === 'sit')) p = p === 'walk' ? 'chair-roll' : 'chair';
    if (this.cane && (p === 'wave' || p === 'reach')) p = 'nod';
    if (p !== this.pose) { this.pose = p; this.blend = 0; }
  }
  carry(o: THREE.Object3D | null) {
    this.hand.children.filter((c) => c.userData.carried).forEach((c) => c.removeFromParent());
    if (o) { o.userData.carried = true; this.hand.add(o); }
  }
  update(dt: number) {
    this.t += dt; this.blend = Math.min(1, this.blend + dt * 4);
    const t = this.t, k = 1 - Math.exp(-dt * 10), L = this.legs, S = this.shins, A = this.arms, F = this.fores;
    let lx = [0, 0], sx = [0, 0], ax = [0, 0], az = [0, 0], fx = [-.15, -.15], by = 0, lean = 0, hx = 0, hy = Math.sin(t * .4) * .25;
    const p = this.pose;
    if (p === 'walk' || p === 'carry') {
      const w = t * 6.2 * this.speed, sw = this.cane ? .3 : .5;
      lx = [Math.sin(w) * sw, -Math.sin(w) * sw]; sx = [Math.max(0, -Math.cos(w)) * .7, Math.max(0, Math.cos(w)) * .7];
      ax = [-Math.sin(w) * .35, p === 'carry' ? -.9 : Math.sin(w) * .35]; fx = [-.3, p === 'carry' ? -.7 : -.3];
      by = Math.abs(Math.cos(w)) * .025; hy = 0; lean = this.cane ? .1 : .04;
      if (this.cane) { ax[1] = -.25 + Math.sin(w) * .15; fx[1] = 0; }
    } else if (p === 'sit' || p === 'chair' || p === 'chair-roll') {
      lx = [-1.5, -1.5]; sx = [1.5, 1.5]; ax = [-.5, -.6]; fx = [-.9, -.9]; by = -.45;
      if (p === 'chair-roll') { ax = [-.4 + Math.sin(t * 3) * .4, -.4 + Math.sin(t * 3) * .4]; fx = [-.6, -.6]; }
    } else if (p === 'serve') {
      ax = [-.3, -1.3 + Math.sin(t * 2) * .1]; fx = [-.2, -.5]; lean = .08;
    } else if (p === 'reach') {
      ax = [-.2, -1.25]; fx = [-.2, -.3]; lean = .12;
    } else if (p === 'stir') {
      ax = [-.8, -1 + Math.sin(t * 3) * .15]; az = [0, Math.cos(t * 3) * .2]; fx = [-1, -.9]; lean = .18; hx = .35;
    } else if (p === 'nod') {
      hx = Math.max(0, Math.sin(t * 4)) * .25;
    } else if (p === 'wave') {
      ax = [0, -2.7]; az = [0, Math.sin(t * 7) * .3]; fx = [-.1, -.3];
    }
    if (this.cane && p !== 'walk' && p !== 'carry') { ax[1] = -.2; fx[1] = 0; }
    for (let i = 0; i < 2; i++) {
      L[i].rotation.x += (lx[i] - L[i].rotation.x) * k; S[i].rotation.x += (sx[i] - S[i].rotation.x) * k;
      A[i].rotation.x += (ax[i] - A[i].rotation.x) * k; A[i].rotation.z += ((i ? -1 : 1) * .08 + az[i] - A[i].rotation.z) * k;
      F[i].rotation.x += (fx[i] - F[i].rotation.x) * k;
    }
    if (this.cane) this.cane.rotation.x = -(A[1].rotation.x + F[1].rotation.x);
    const hips = L[0].parent!;
    hips.position.y += ((.92 + by + Math.sin(t * 1.3) * .004) - hips.position.y) * k;
    hips.rotation.x += (lean - hips.rotation.x) * k;
    this.head.rotation.x += (hx - this.head.rotation.x) * k; this.head.rotation.y += (hy - this.head.rotation.y) * k * .5;
    if (this.chair) { this.body.position.set(0, .06, -.04); this.chair.children.forEach((c) => { if (c.userData.wheel && p === 'chair-roll') c.rotation.x += dt * 4; }); }
  }
}

export function makeChair() {
  const g = new THREE.Group(), frame = mat('#3A3F45', .4), seat = mat('#2C2F33');
  const s = new THREE.Mesh(new THREE.BoxGeometry(.42, .05, .42), seat); s.position.y = .5; g.add(s);
  const b = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .04), seat); b.position.set(0, .72, -.2); g.add(b);
  for (const x of [-.25, .25]) {
    const w = new THREE.Group(); w.userData.wheel = true; w.position.set(x, .3, -.05); g.add(w);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(.28, .025, 8, 28), frame); tire.rotation.y = Math.PI / 2; w.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.24, .008, 6, 24), mat('#B9BEC4', .3)); rim.rotation.y = Math.PI / 2; w.add(rim);
    const caster = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .03, 12), frame); caster.rotation.z = Math.PI / 2; caster.position.set(x * .8, .06, .26); g.add(caster);
  }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(.3, .02, .12), frame); foot.position.set(0, .14, .3); g.add(foot);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
