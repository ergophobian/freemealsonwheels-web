// Neighbors come and go around the truck. Everything is randomized (who arrives, when, how they
// wait, where they go after) so the street never visibly loops.
import * as THREE from 'three';
import { type Assets, type CharacterId } from './assets';

export type Anim = 'idle' | 'walk' | 'sit' | 'pick-up' | 'emote-yes' | 'holding-both' | 'holding-right' | 'interact-right' | 'interact-left'
  | 'wheelchair-sit' | 'wheelchair-move-forward' | 'wheelchair-look-left' | 'wheelchair-look-right' | 'crouch';

export class Actor {
  obj = new THREE.Group();
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  cur?: THREE.AnimationAction;
  hand?: THREE.Object3D;
  chair?: THREE.Object3D;
  constructor(public id: CharacterId, assets: Assets, height: number) {
    const { obj, clips } = assets.character(id);
    const b = new THREE.Box3().setFromObject(obj), s = height / (b.max.y - b.min.y || 1);
    obj.scale.setScalar(s); this.obj.add(obj);
    this.mixer = new THREE.AnimationMixer(obj);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.hand = obj.getObjectByName('arm-right') ?? undefined;
  }
  play(name: Anim, fade = .3, speed = 1) {
    const a = this.actions.get(name); if (!a || a === this.cur) return;
    a.reset().setEffectiveTimeScale(speed).fadeIn(fade).play();
    if (name === 'pick-up' || name === 'emote-yes' || name === 'interact-right' || name === 'interact-left') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    this.cur?.fadeOut(fade); this.cur = a;
  }
  carry(o: THREE.Object3D | null) {
    if (!this.hand) return;
    this.hand.children.filter((c) => c.userData.carried).forEach((c) => c.removeFromParent());
    if (o) { o.userData.carried = true; this.hand.add(o); }
  }
}

type State = 'enter' | 'queue' | 'order' | 'leave' | 'sit' | 'gone';
interface Npc { a: Actor; state: State; path: THREE.Vector3[]; speed: number; timer: number; slot: number; seat?: Seat; rolling: boolean; cane: boolean; served: boolean; best: number; stuck: number }
export interface Seat { pos: THREE.Vector3; face: number; taken: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export class Crowd {
  npcs: Npc[] = [];
  private spawnIn = 0;
  private serving: Npc | null = null;
  private v = new THREE.Vector3();
  private steer = new THREE.Vector3();
  constructor(
    private scene: THREE.Object3D,
    private assets: Assets,
    private opts: {
      window: THREE.Vector3; queueDir: THREE.Vector3; seats: Seat[]; exits: THREE.Vector3[]; entries: THREE.Vector3[];
      max: number; height: number; exclude: CharacterId[]; obstacles: { x: number; z: number; r: number }[]; meal: () => THREE.Object3D;
      onServe: (who: Actor) => void; onOrder: (who: Actor) => void;
    },
  ) {
    // Start mid-scene: a few already in line, a couple already eating.
    for (let i = 0; i < 4; i++) this.spawn(i < 3 ? 'queue' : 'sit');
  }
  private slotPos(i: number) { return this.opts.window.clone().addScaledVector(this.opts.queueDir, i * 1.45).add(new THREE.Vector3(rand(-.08, .08), 0, rand(-.08, .08))); }
  private queue() { return this.npcs.filter((n) => n.state === 'queue' || n.state === 'enter' || n.state === 'order').sort((a, b) => a.slot - b.slot); }

  private spawn(start: State = 'enter') {
    const used = new Set(this.npcs.map((n) => n.a.id));
    const pool = this.assets.characters.filter((c) => !this.opts.exclude.includes(c) && !used.has(c));
    if (!pool.length) return;
    const a = new Actor(pick(pool), this.assets, this.opts.height * rand(.94, 1.04));
    // Disabled neighbors move the way they really move: chair users stay in their chairs, cane users take their time.
    const roll = Math.random(), rolling = roll < .16, cane = !rolling && roll < .3;
    if (cane) { const c = this.assets.cane(); c.scale.setScalar(1.6); c.position.set(0, -.3, .05); a.obj.getObjectByName('arm-left')?.add(c); }
    if (rolling) { a.chair = this.assets.wheelchair(); a.chair.scale.setScalar(1.9); a.obj.add(a.chair); a.obj.children[0].position.set(0, .3, -.05); }
    this.scene.add(a.obj);
    const n: Npc = { a, state: start, path: [], speed: rolling ? rand(.7, .9) : cane ? rand(.45, .6) : rand(.9, 1.25), timer: 0, slot: 0, rolling, cane, served: false, best: Infinity, stuck: 0 };
    if (start === 'sit') {
      const seat = this.opts.seats.find((s) => !s.taken);
      if (seat) { seat.taken = true; n.seat = seat; a.obj.position.copy(seat.pos); a.obj.rotation.y = seat.face; n.timer = rand(10, 40); a.play('sit', 0); a.carry(null); }
      else n.state = 'enter';
    }
    if (n.state !== 'sit') {
      const q = this.queue(); n.slot = q.length;
      const target = this.slotPos(n.slot);
      if (start === 'queue') { a.obj.position.copy(target); n.state = 'queue'; a.play(rolling ? 'wheelchair-sit' : 'idle', 0); a.obj.rotation.y = this.faceWindow(target); }
      else { a.obj.position.copy(pick(this.opts.entries)); n.path = [target]; a.play(rolling ? 'wheelchair-move-forward' : 'walk', 0); }
    }
    if (cane) n.a.actions.get('walk')?.setEffectiveTimeScale(.6);
    this.npcs.push(n);
  }

  private faceWindow(p: THREE.Vector3) { return Math.atan2(this.opts.window.x - p.x, (this.opts.window.z - .6) - p.z); }

  update(dt: number) {
    this.spawnIn -= dt;
    const q = this.queue();
    if (this.spawnIn <= 0 && q.length < 4 && this.npcs.length < this.opts.max) { this.spawn(); this.spawnIn = rand(1.5, 4.5); }

    for (const n of this.npcs) {
      n.a.mixer.update(dt);
      const o = n.a.obj;
      if (n.path.length) {
        const t = n.path[0], d = this.v.subVectors(t, o.position).setY(0), dist = d.length();
        if (dist < .06) { n.path.shift(); n.best = Infinity; n.stuck = 0; if (!n.path.length) this.arrive(n); }
        else if ((n.stuck += dt) > 1.6 && dist > n.best - .15) {
          // Wedged between obstacles: step out into the open plaza, then carry on.
          n.path.unshift(new THREE.Vector3(o.position.x + rand(-.6, .6), .14, Math.min(6.4, o.position.z + 1.6)));
          n.best = Infinity; n.stuck = 0;
        }
        else {
          // Steer around tables, signs and each other instead of walking through them.
          const dir = d.normalize(), steer = this.steer.copy(dir); let blocked = false;
          const finalStep = n.path.length === 1 && dist < 1.4;
          for (const ob of this.opts.obstacles) {
            const ox = o.position.x - ob.x, oz = o.position.z - ob.z, od = Math.hypot(ox, oz), gap = od - ob.r;
            if (gap > .9 || od < 1e-4) continue;
            if (finalStep && Math.hypot(t.x - ob.x, t.z - ob.z) < ob.r + .6) continue;
            const push = (.9 - Math.max(0, gap)) * 2.2, side = dir.x * oz - dir.z * ox > 0 ? 1 : -1;
            steer.x += (ox / od) * push + (-oz / od) * side * push * .8;
            steer.z += (oz / od) * push + (ox / od) * side * push * .8;
          }
          for (const m of this.npcs) {
            if (m === n || m.state === 'sit') continue;
            const mx = o.position.x - m.a.obj.position.x, mz = o.position.z - m.a.obj.position.z, md = Math.hypot(mx, mz);
            if (md < .95 && md > 1e-4) { steer.x += (mx / md) * (.95 - md) * 5; steer.z += (mz / md) * (.95 - md) * 5; }
            // Someone right ahead: wait a beat rather than walk into them.
            if (md < .7 && (-mx * dir.x - mz * dir.z) / md > .6) blocked = true;
          }
          steer.y = 0; steer.normalize();
          if (dist < n.best - .15) { n.best = dist; n.stuck = 0; }
          o.position.addScaledVector(steer, Math.min(dist, n.speed * dt) * (blocked ? .15 : 1));
          o.position.z = Math.max(1.85, o.position.z);
          const yaw = Math.atan2(steer.x, steer.z), dy = Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y));
          o.rotation.y += dy * Math.min(1, dt * 8);
        }
        continue;
      }
      n.timer -= dt;
      if (n.state === 'queue') {
        // Small, varied idle life while waiting: glance around, nod, shuffle.
        if (n.timer <= 0) {
          n.timer = rand(2.5, 6);
          if (!n.rolling) n.a.play(!n.cane && Math.random() < .25 ? 'emote-yes' : 'idle', .4);
          else n.a.play(Math.random() < .5 ? 'wheelchair-look-left' : 'wheelchair-look-right', .4);
          o.rotation.y = this.faceWindow(o.position) + rand(-.5, .5);
        }
        if (n.a.cur && n.a.cur.loop === THREE.LoopOnce && !n.a.cur.isRunning()) n.a.play(n.rolling ? 'wheelchair-sit' : 'idle');
        if (n.slot === 0 && !this.serving) { this.serving = n; n.state = 'order'; n.timer = rand(1.4, 2.4); o.rotation.y = this.faceWindow(o.position); this.opts.onOrder(n.a); }
      } else if (n.state === 'order') {
        if (n.timer <= 0 && !n.served) {
          n.served = true; n.timer = rand(1.4, 2.4);
          this.opts.onServe(n.a);
          n.a.carry(this.mealInHand());
          if (!n.rolling) n.a.play(n.cane || Math.random() < .5 ? 'emote-yes' : 'pick-up', .25);
        } else if (n.timer <= 0) this.depart(n);
      } else if (n.state === 'sit') {
        if (n.timer <= 0) { const sp = n.seat!.pos; o.position.set(sp.x - Math.sin(o.rotation.y) * .75, .14, sp.z - Math.cos(o.rotation.y) * .75); n.seat!.taken = false; n.seat = undefined; n.a.carry(null); this.toExit(n); }
      }
    }
    // Remove anyone who has left the street.
    this.npcs = this.npcs.filter((n) => { if (n.state === 'gone') { n.a.obj.removeFromParent(); return false; } return true; });
  }

  limit(n: number) { this.opts.max = n; }
  private mealInHand() { const m = this.opts.meal(); m.position.set(0, -.25, .12); m.rotation.y = Math.PI / 2; return m; }

  private depart(n: Npc) {
    this.serving = null;
    // Everyone behind steps up.
    for (const m of this.queue()) if (m !== n) { m.slot = Math.max(0, m.slot - 1); m.path = [this.slotPos(m.slot)]; m.state = m.state === 'enter' ? 'enter' : 'queue'; m.a.play(m.rolling ? 'wheelchair-move-forward' : 'walk', .25); }
    const seat = !n.rolling && Math.random() < .55 ? this.opts.seats.find((s) => !s.taken) : undefined;
    n.a.play(n.rolling ? 'wheelchair-move-forward' : 'walk', .3);
    if (seat) { seat.taken = true; n.seat = seat; n.state = 'leave'; const back = new THREE.Vector3(-Math.sin(seat.face) * .75, 0, -Math.cos(seat.face) * .75); n.path = [seat.pos.clone().add(back).setY(.14), seat.pos.clone().setY(.14)]; }
    else this.toExit(n);
  }
  private toExit(n: Npc) {
    n.state = 'leave'; n.seat = undefined;
    const e = pick(this.opts.exits);
    n.path = [new THREE.Vector3((n.a.obj.position.x + e.x) / 2 + rand(-1.5, 1.5), 0, Math.max(n.a.obj.position.z, e.z) + rand(.5, 2)), e.clone()];
    n.a.play(n.rolling ? 'wheelchair-move-forward' : 'walk', .3);
  }
  private arrive(n: Npc) {
    const o = n.a.obj;
    if (n.state === 'enter' || n.state === 'queue') { n.state = 'queue'; n.timer = rand(.5, 2); n.a.play(n.rolling ? 'wheelchair-sit' : 'idle', .3); o.rotation.y = this.faceWindow(o.position); }
    else if (n.state === 'leave' && n.seat) { n.state = 'sit'; o.position.y = n.seat.pos.y; n.timer = rand(15, 45); o.position.copy(n.seat.pos); o.rotation.y = n.seat.face; n.a.carry(null); n.a.play('sit', .3); }
    else if (n.state === 'leave') n.state = 'gone';
  }
}
