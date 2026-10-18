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
// Realistic cast built with MakeHuman (tools/blender/people.py): each file carries its own retargeted clips.
export const VOLUNTEERS = ['v-maya', 'v-james', 'v-linda', 'v-ravi', 'v-priya'] as const;
export const NEIGHBOURS = ['n-chen', 'n-grace', 'n-amara', 'n-mei', 'n-marcus', 'n-tom', 'n-ruth'] as const;
export type Kind = `m-${typeof MEN[number]}` | `w-${typeof WOMEN[number]}` | typeof VOLUNTEERS[number] | typeof NEIGHBOURS[number];
const isMH = (k: string) => /^[vn]-/.test(k);

const SKINS = ['#F1C7A5', '#D9A47E', '#B87B57', '#8E5A3B', '#6A412B', '#4B2E20'];
const HAIR = ['#2A211C', '#3B2C22', '#5A4030', '#8C6A4A', '#C9B49A', '#1B1612'];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (u: string) => new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => loader.load(u, res, undefined, rej));

export interface Cast { kinds: Kind[]; make(kind?: Kind, opts?: PersonOpts): Person }
interface PersonOpts { height?: number; mobility?: Mobility; skin?: number; apron?: boolean; chair?: () => THREE.Object3D; seatTop?: number; mh?: boolean }

export async function loadCast(base: string, kinds: Kind[]): Promise<Cast> {
  const needQ = kinds.some((k) => !isMH(k));
  const empty = { scene: new THREE.Group(), animations: [] as THREE.AnimationClip[] };
  const [am, aw, ...models] = await Promise.all([needQ ? load(`${base}/anim-m.glb`) : empty, needQ ? load(`${base}/anim-w.glb`) : empty, ...kinds.map((k) => load(isMH(k) ? `${base}/mh/${k}.glb` : `${base}/${k}.glb`))]);
  for (const m of models) m.scene.traverse((c) => { const s = c as THREE.SkinnedMesh; if (s.isMesh) { s.castShadow = true; s.receiveShadow = false; s.frustumCulled = false; } });
  return {
    kinds,
    make(kind = kinds[Math.floor(Math.random() * kinds.length)], opts = {}) {
      const src = models[kinds.indexOf(kind)];
      if (isMH(kind)) return new Person(cloneSkinned(src.scene) as THREE.Group, src.animations, { ...opts, mh: true });
      return new Person(cloneSkinned(src.scene) as THREE.Group, kind.startsWith('m') ? am.animations : aw.animations, opts);
    },
  };
}

const CLIP: Record<Pose, string> = {
  idle: 'Idle_Neutral', walk: 'Walk', carry: 'Walk', sit: 'Idle_Neutral', serve: 'Interact', reach: 'Interact', stir: 'Interact',
  nod: 'Idle', wave: 'Wave', chair: 'Idle_Neutral', 'chair-roll': 'Idle_Neutral',
};

// Universal Animation Library clips on the MakeHuman cast.
const CLIP_MH: Record<Pose, string> = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', carry: 'Walk_Loop', sit: 'Sitting_Idle_Loop', serve: 'Interact', reach: 'PickUp_Table', stir: 'Interact',
  nod: 'Idle_Talking_Loop', wave: 'Idle_Talking_Loop', chair: 'Sitting_Idle_Loop', 'chair-roll': 'Walk_Loop',
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
  private feet: Record<string, THREE.Object3D | undefined> = {};
  private height = 1.72;
  private mh = false;
  private clips = CLIP;
  seatTop = .62;
  constructor(model: THREE.Group, clips: THREE.AnimationClip[], o: PersonOpts) {
    const h = o.height ?? 1.72; this.height = h; this.mh = !!o.mh; if (this.mh) this.clips = CLIP_MH; this.seatTop = o.seatTop ?? .62;
    const b = new THREE.Box3().setFromObject(model);
    if (!o.mh || o.height) model.scale.multiplyScalar(h / Math.max(.1, b.max.y - b.min.y)); // MakeHuman people keep their own height
    else this.height = b.max.y - b.min.y;
    this.obj.add(model); this.model = model;
    // Recolor skin and hair so the cast covers many skin tones without extra downloads.
    const skin = new THREE.Color(SKINS[o.skin ?? Math.floor(Math.random() * SKINS.length)]), hair = new THREE.Color(HAIR[Math.floor(Math.random() * HAIR.length)]);
    model.traverse((c) => {
      const m = c as THREE.Mesh; if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
        const n = (mat as THREE.MeshStandardMaterial).clone(); n.roughness = Math.max(.55, n.roughness ?? .8); n.metalness = 0;
        if (!o.mh && /^skin/i.test(n.name)) n.color.copy(skin);
        if (!o.mh && /hair|eyebrow|moustache|beard/i.test(n.name)) n.color.copy(hair);
        if (o.mh) {
          // MakeHuman exports everything as blended and double-sided; only hair, brows and lashes need cut-outs.
          const cut = /hair|afro|bob|braid|ponytail|bun|eyebrow|eyelash|short|long/i.test(n.name);
          n.transparent = false; n.depthWrite = true; n.alphaTest = cut ? .45 : 0;
          n.side = cut ? THREE.DoubleSide : THREE.FrontSide; n.roughness = .62;
          const cc = n as THREE.MeshPhysicalMaterial; if (cc.clearcoat !== undefined) cc.clearcoat = 0;
        }
        return n;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
    for (const n of ['UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R', 'Hips', 'Wrist.R', 'Wrist.L', 'Chest', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Head']) this.bones[n] = model.getObjectByName(n) ?? model.getObjectByName(n.replace('.', '')) ?? undefined; // GLTFLoader strips '.' from node names
    for (const sd of ['L', 'R']) this.feet[sd] = model.getObjectByName(`Foot${sd}`) ?? model.getObjectByName(`Foot.${sd}`) ?? undefined;
    this.hand = new THREE.Object3D();
    (this.bones['Wrist.R'] ?? model.getObjectByName('hand_r') ?? model).add(this.hand);
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
    this.play(this.clips[this.pose], 0);
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
    this.pose = p; this.play(this.clips[p]);
    if (this.cur) this.cur.setEffectiveTimeScale(p === 'walk' || p === 'carry' ? this.speed * 1.05 : p === 'stir' ? .8 : 1);
  }
  carry(o: THREE.Object3D | null) {
    this.hand.children.filter((c) => c.userData.carried).forEach((c) => c.removeFromParent());
    if (o) { o.userData.carried = true; this.hand.add(o); }
  }
  // Turn a bone (in world space) so the direction from it to its child matches dir. Works on any rest pose.
  private aim(bone: THREE.Object3D | undefined, child: THREE.Object3D | undefined, dir: THREE.Vector3) {
    if (!bone || !child || !bone.parent) return;
    bone.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
    const cur = V2.setFromMatrixPosition(child.matrixWorld).sub(V1.setFromMatrixPosition(bone.matrixWorld)).normalize();
    const delta = Q1.setFromUnitVectors(cur, dir);
    const world = bone.getWorldQuaternion(Q2).premultiply(delta);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(Q3).invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  }
  update(dt: number) {
    this.t += dt;
    this.mixer.update(dt);
    const seated = this.pose === 'sit' && !this.mh; // the MakeHuman cast has a real sitting clip
    if (seated !== this.wasSeated) {
      this.wasSeated = seated;
      // Seat height: pelvis just above the seat; standing pelvis sits at about 53% of height.
      this.model.position.set(0, seated ? this.seatTop + .07 - this.height * .53 : 0, seated ? -.12 : 0);
    }
    if (seated) {
      const q = this.obj.getWorldQuaternion(Q4);
      const fwd = V3.set(0, -.05, 1).applyQuaternion(q).normalize(), down = V4.set(0, -1, .08).applyQuaternion(q).normalize();
      for (const sd of ['L', 'R']) {
        this.aim(this.bones[`UpperLeg.${sd}`], this.bones[`LowerLeg.${sd}`], fwd);
        this.aim(this.bones[`LowerLeg.${sd}`], this.feet[sd], down);
      }
    }
  }
}


const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), Q4 = new THREE.Quaternion();
