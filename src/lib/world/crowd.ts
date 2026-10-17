// Neighbors come and go around the truck. Everything is randomized (who arrives, when, how they
// wait, where they go after) so the street never visibly loops. Movement is velocity-smoothed and
// steers around obstacles and other people, so nobody jitters or walks through things.
import * as THREE from 'three';
import type { Person, Mobility } from './people';

export interface Seat { pos: THREE.Vector3; face: number; taken: boolean }
type State = 'enter' | 'queue' | 'order' | 'leave' | 'sit' | 'gone' | 'pass';
interface Npc { f: Person; state: State; path: THREE.Vector3[]; vel: THREE.Vector3; timer: number; slot: number; seat?: Seat; served: boolean; best: number; stuck: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const Y = .14;

export class Crowd {
  npcs: Npc[] = [];
  private spawnIn = 0;
  private serving: Npc | null = null;
  private d = new THREE.Vector3();
  private want = new THREE.Vector3();
  constructor(
    private scene: THREE.Object3D,
    private opts: {
      window: THREE.Vector3; queueDir: THREE.Vector3; seats: Seat[]; exits: THREE.Vector3[]; entries: THREE.Vector3[];
      max: number; minZ: number; obstacles: { x: number; z: number; r: number }[];
      meal: () => THREE.Object3D; onServe: () => void; onOrder: () => void; make: (mobility: Mobility) => Person;
    },
  ) {
    for (let i = 0; i < 8; i++) this.spawn(i < 5 ? 'queue' : i < 7 ? 'sit' : 'pass');
  }
  limit(n: number) { this.opts.max = n; }
  private slotPos(i: number) { return this.opts.window.clone().addScaledVector(this.opts.queueDir, i * .95); }
  private queue() { return this.npcs.filter((n) => n.state === 'queue' || n.state === 'enter' || n.state === 'order').sort((a, b) => a.slot - b.slot); }
  private faceWindow(p: THREE.Vector3) { return Math.atan2(this.opts.window.x - p.x, (this.opts.window.z - .8) - p.z); }

  private spawn(start: State = 'enter') {
    const r = Math.random(), mobility: Mobility = r < .14 ? 'chair' : r < .26 ? 'cane' : 'walk';
    const f = this.opts.make(mobility);
    this.scene.add(f.obj);
    const n: Npc = { f, state: start, path: [], vel: new THREE.Vector3(), timer: 0, slot: 0, served: false, best: Infinity, stuck: 0 };
    if (start === 'sit') {
      const seat = mobility === 'walk' ? this.opts.seats.find((s) => !s.taken) : undefined;
      if (seat) { seat.taken = true; n.seat = seat; f.obj.position.copy(seat.pos); f.obj.rotation.y = seat.face; n.timer = rand(12, 40); f.set('sit'); }
      else n.state = 'enter';
    }
    if (start === 'pass') {
      // A passer-by strolling across the plaza.
      const a = pick(this.opts.entries), b = pick(this.opts.exits.filter((e) => Math.sign(e.x) !== Math.sign(a.x))) ?? pick(this.opts.exits);
      f.obj.position.copy(a); n.path = [new THREE.Vector3(rand(-6, 6), Y, rand(this.opts.minZ + 4, this.opts.minZ + 12)), b.clone()]; n.state = 'leave'; f.set('walk');
    } else if (n.state !== 'sit') {
      n.slot = this.queue().length;
      const target = this.slotPos(n.slot);
      if (start === 'queue') { f.obj.position.copy(target); n.state = 'queue'; f.set('idle'); f.obj.rotation.y = this.faceWindow(target); }
      else { f.obj.position.copy(pick(this.opts.entries)); n.path = [target]; f.set('walk'); }
    }
    this.npcs.push(n);
  }

  update(dt: number) {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.npcs.length < this.opts.max) { this.spawn(this.queue().length < 6 ? 'enter' : 'pass'); this.spawnIn = rand(1.5, 3.5); }

    for (const n of this.npcs) {
      const o = n.f.obj;
      n.f.update(dt);
      if (n.path.length) { this.move(n, dt); continue; }
      n.vel.multiplyScalar(.8);
      n.timer -= dt;
      if (n.state === 'queue') {
        if (n.timer <= 0) { n.timer = rand(3, 7); n.f.set(Math.random() < .25 ? 'nod' : 'idle'); }
        if (n.slot === 0 && !this.serving) { this.serving = n; n.state = 'order'; n.timer = rand(1.4, 2.4); o.rotation.y = this.faceWindow(o.position); n.f.set('idle'); this.opts.onOrder(); }
      } else if (n.state === 'order') {
        if (n.timer <= 0 && !n.served) {
          n.served = true; n.timer = rand(1.4, 2.2); this.opts.onServe(); n.f.set('reach');
          const m = this.opts.meal(); m.position.set(0, -.04, .05); n.f.carry(m);
        } else if (n.timer <= 0) this.depart(n);
      } else if (n.state === 'sit' && n.timer <= 0) {
        const sp = n.seat!.pos; o.position.set(sp.x - Math.sin(o.rotation.y) * .6, Y, sp.z - Math.cos(o.rotation.y) * .6);
        n.seat!.taken = false; n.seat = undefined; n.f.carry(null); this.toExit(n);
      }
    }
    this.npcs = this.npcs.filter((n) => { if (n.state === 'gone') { n.f.obj.removeFromParent(); return false; } return true; });
  }

  private move(n: Npc, dt: number) {
    const o = n.f.obj, t = n.path[0];
    const d = this.d.subVectors(t, o.position).setY(0), dist = d.length();
    if (dist < .08) { n.path.shift(); n.best = Infinity; n.stuck = 0; if (!n.path.length) this.arrive(n); return; }
    if (dist < n.best - .1) { n.best = dist; n.stuck = 0; }
    else if ((n.stuck += dt) > 2) { n.path.unshift(new THREE.Vector3(o.position.x + rand(-.8, .8), Y, Math.min(this.opts.minZ + 3.5, o.position.z + 1.5))); n.best = Infinity; n.stuck = 0; }
    const speed = (n.f.rolling ? .75 : n.f.usesCane ? .55 : 1) * Math.min(1, .45 + dist);
    const want = this.want.copy(d).normalize();
    const finalStep = n.path.length === 1 && dist < 1.2;
    for (const ob of this.opts.obstacles) {
      const ox = o.position.x - ob.x, oz = o.position.z - ob.z, od = Math.hypot(ox, oz), gap = od - ob.r;
      if (gap > .7 || od < 1e-4 || (finalStep && Math.hypot(t.x - ob.x, t.z - ob.z) < ob.r + .5)) continue;
      const push = (.7 - Math.max(0, gap)) * 1.6, side = want.x * oz - want.z * ox > 0 ? 1 : -1;
      want.x += (ox / od) * push - (oz / od) * side * push; want.z += (oz / od) * push + (ox / od) * side * push;
    }
    let blocked = 0;
    for (const m of this.npcs) {
      if (m === n || m.state === 'sit') continue;
      const mx = o.position.x - m.f.obj.position.x, mz = o.position.z - m.f.obj.position.z, md = Math.hypot(mx, mz);
      if (md < .8 && md > 1e-4) { want.x += (mx / md) * (.8 - md) * 2.5; want.z += (mz / md) * (.8 - md) * 2.5; }
      if (md < .65 && (-mx * d.x - mz * d.z) / (md * dist) > .7 && m.path.length === 0) blocked = Math.max(blocked, 1 - md / .65);
    }
    want.setY(0).normalize().multiplyScalar(speed * (1 - blocked * .9));
    // Velocity smoothing: steering changes ease in instead of snapping frame to frame (no jitter).
    n.vel.lerp(want, 1 - Math.exp(-dt * 4));
    o.position.addScaledVector(n.vel, dt);
    o.position.z = Math.max(this.opts.minZ, o.position.z);
    if (n.vel.lengthSq() > .01) {
      const yaw = Math.atan2(n.vel.x, n.vel.z), dy = Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y));
      o.rotation.y += dy * (1 - Math.exp(-dt * 5));
    }
    n.f.set(n.f.hand.children.length ? 'carry' : 'walk');
  }

  private depart(n: Npc) {
    this.serving = null;
    for (const m of this.queue()) if (m !== n) { m.slot = Math.max(0, m.slot - 1); m.path = [this.slotPos(m.slot)]; if (m.state !== 'enter') m.state = 'queue'; }
    const seat = n.f.rolling ? undefined : Math.random() < .55 ? this.opts.seats.find((s) => !s.taken) : undefined;
    if (seat) {
      seat.taken = true; n.seat = seat; n.state = 'leave';
      const back = new THREE.Vector3(-Math.sin(seat.face) * .7, 0, -Math.cos(seat.face) * .7);
      n.path = [seat.pos.clone().add(back).setY(Y), seat.pos.clone().add(back.multiplyScalar(.3)).setY(Y)];
    } else this.toExit(n);
  }
  private toExit(n: Npc) {
    n.state = 'leave';
    const e = pick(this.opts.exits), p = n.f.obj.position;
    n.path = [new THREE.Vector3((p.x + e.x) / 2 + rand(-1.5, 1.5), Y, Math.max(p.z, e.z) + rand(.5, 1.5)), e.clone()];
  }
  private arrive(n: Npc) {
    const o = n.f.obj;
    if (n.state === 'enter' || n.state === 'queue') { n.state = 'queue'; n.timer = rand(.5, 2); n.f.set('idle'); o.rotation.y = this.faceWindow(o.position); }
    else if (n.state === 'leave' && n.seat) { n.state = 'sit'; n.timer = rand(15, 45); o.position.copy(n.seat.pos); o.rotation.y = n.seat.face; n.f.carry(null); n.f.set('sit'); }
    else if (n.state === 'leave') n.state = 'gone';
  }
}
