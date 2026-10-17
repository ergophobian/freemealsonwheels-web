// Real characters: CC0 Ultimate Modular Men and Women by Quaternius, compressed with meshopt.
// Animations live in one shared file per body type; every character retargets them by bone name.
// Poses the clips don't cover (sitting, a chair user's posture, a cane in hand) are layered on procedurally.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type Pose = 'idle' | 'walk' | 'sit' | 'serve' | 'reach' | 'nod' | 'wave' | 'stir' | 'carry' | 'chair' | 'chair-roll';
export type Mobility = 'walk' | 'cane' | 'chair';
export const MEN = ['casual_2', 'casual_hoodie', 'farmer', 'suit', 'worker', 'beach'] as const;
export const WOMEN = ['casual', 'formal', 'suit', 'worker', 'adventurer'] as const;
export type Kind = `m-${typeof MEN[number]}` | `w-${typeof WOMEN[number]}`;

const SKINS = ['#F1C7A5', '#D9A47E', '#B87B57', '#8E5A3B', '#6A412B', '#4B2E20'];
const HAIR = ['#2A211C', '#3B2C22', '#5A4030', '#8C6A4A', '#C9B49A', '#1B1612'];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (u: string) => new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => loader.load(u, res, undefined, rej));

export interface Cast { kinds: Kind[]; make(kind?: Kind, opts?: PersonOpts): Person }
interface PersonOpts { height?: number; mobility?: Mobility; skin?: number; apron?: boolean; chair?: () => THREE.Object3D }

export async function loadCast(base: string, kinds: Kind[]): Promise<Cast> {
  const [am, aw, ...models] = await Promise.all([load(`${base}/anim-m.glb`), load(`${base}/anim-w.glb`), ...kinds.map((k) => load(`${base}/${k}.glb`))]);
  for (const m of models) m.scene.traverse((c) => { const s = c as THREE.SkinnedMesh; if (s.isMesh) { s.castShadow = true; s.receiveShadow = false; s.frustumCulled = false; } });
  return {
    kinds,
    make(kind = kinds[Math.floor(Math.random() * kinds.length)], opts = {}) {
      const src = models[kinds.indexOf(kind)];
      return new Person(cloneSkinned(src.scene) as THREE.Group, kind.startsWith('m') ? am.animations : aw.animations, opts);
    },
  };
}

const CLIP: Record<Pose, string> = {
  idle: 'Idle_Neutral', walk: 'Walk', carry: 'Walk', sit: 'Idle_Neutral', serve: 'Interact', reach: 'Interact', stir: 'Interact',
  nod: 'Idle', wave: 'Wave', chair: 'Idle_Neutral', 'chair-roll': 'Idle_Neutral',
};

export class Person {
  obj = new THREE.Group();
  hand: THREE.Object3D;
  pose: Pose = 'idle';
  speed = 1;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur?: THREE.AnimationAction;
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private chair?: THREE.Object3D;
  private cane?: THREE.Object3D;
  private t = Math.random() * 10;
  private model: THREE.Group;
  private wasSeated = false;
  private height = 1.72;
  constructor(model: THREE.Group, clips: THREE.AnimationClip[], o: PersonOpts) {
    const h = o.height ?? 1.72; this.height = h;
    const b = new THREE.Box3().setFromObject(model);
    model.scale.multiplyScalar(h / Math.max(.1, b.max.y - b.min.y));
    this.obj.add(model); this.model = model;
    // Recolor skin and hair so the cast covers many skin tones without extra downloads.
    const skin = new THREE.Color(SKINS[o.skin ?? Math.floor(Math.random() * SKINS.length)]), hair = new THREE.Color(HAIR[Math.floor(Math.random() * HAIR.length)]);
    model.traverse((c) => {
      const m = c as THREE.Mesh; if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
        const n = (mat as THREE.MeshStandardMaterial).clone(); n.roughness = Math.max(.55, n.roughness ?? .8); n.metalness = 0;
        if (/^skin/i.test(n.name)) n.color.copy(skin);
        if (/hair|eyebrow|moustache|beard/i.test(n.name)) n.color.copy(hair);
        return n;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
    for (const n of ['UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R', 'Hips', 'Wrist.R', 'Wrist.L', 'Chest', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Head']) this.bones[n] = model.getObjectByName(n) ?? model.getObjectByName(n.replace('.', '')) ?? undefined; // GLTFLoader strips '.' from node names
    this.hand = new THREE.Object3D();
    (this.bones['Wrist.R'] ?? model).add(this.hand);
    this.hand.scale.setScalar(1 / model.scale.x);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    if (o.apron) {
      const chest = this.bones['Chest'];
      if (chest) {
        const a = new THREE.Mesh(new THREE.PlaneGeometry(.34, .62), new THREE.MeshStandardMaterial({ color: '#F1ECE3', roughness: .9, side: THREE.DoubleSide }));
        a.scale.setScalar(1 / model.scale.x); a.position.set(0, -.12 / model.scale.x, .17 / model.scale.x); chest.add(a);
        const tie = new THREE.Mesh(new THREE.PlaneGeometry(.1, .1), new THREE.MeshStandardMaterial({ color: '#2E6649' })); tie.position.set(0, .18, .002); a.add(tie);
      }
    }
    const mobility = o.mobility ?? 'walk';
    if (mobility === 'chair' && o.chair) { this.chair = o.chair(); this.obj.add(this.chair); model.position.set(0, .05, -.06); this.pose = 'chair'; }
    if (mobility === 'cane') {
      this.cane = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .9, 8), new THREE.MeshStandardMaterial({ color: '#3A2E26', roughness: .4 }));
      this.cane.castShadow = true; (this.bones['Wrist.L'] ?? model).add(this.cane); this.cane.scale.setScalar(1 / model.scale.x); this.speed = .55;
    }
    this.play(CLIP[this.pose], 0);
  }
  get rolling() { return !!this.chair; }
  get usesCane() { return !!this.cane; }
  private play(name: string, fade = .35) {
    const a = this.actions.get(name) ?? this.actions.get('Idle'); if (!a || a === this.cur) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    a.time = Math.random() * a.getClip().duration;
    this.cur?.fadeOut(fade); this.cur = a;
  }
  set(p: Pose) {
    if (this.chair && (p === 'walk' || p === 'idle' || p === 'sit' || p === 'carry')) p = p === 'walk' || p === 'carry' ? 'chair-roll' : 'chair';
    if (this.cane && (p === 'wave' || p === 'reach')) p = 'nod';
    if (p === this.pose) return;
    this.pose = p; this.play(CLIP[p]);
    if (this.cur) this.cur.setEffectiveTimeScale(p === 'walk' || p === 'carry' ? this.speed * 1.05 : p === 'stir' ? .8 : 1);
  }
  carry(o: THREE.Object3D | null) {
    this.hand.children.filter((c) => c.userData.carried).forEach((c) => c.removeFromParent());
    if (o) { o.userData.carried = true; this.hand.add(o); }
  }
  update(dt: number) {
    this.t += dt;
    this.mixer.update(dt);
    // Seated people sit behind benches and tables: tuck the legs away and lower the body to seat height.
    const seated = this.pose === 'sit';
    if (seated !== this.wasSeated) {
      this.wasSeated = seated;
      this.model.traverse((c) => { if ((c as THREE.Mesh).isMesh && /Legs|Feet/i.test(c.name)) c.visible = !seated; });
      this.model.position.y = seated ? -this.height * .27 : 0;
    }
  }
}
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), Q4 = new THREE.Quaternion();
