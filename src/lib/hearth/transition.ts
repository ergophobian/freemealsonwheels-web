// "Re-hatch" turn: marks of hatching erase the old scene while the new scene is drawn in through
// the same kind of marks (a pattern-filled stroke), sweeping across the island.
import { rng, makeNoise, clamp, sstep, type Ctx } from './engine';

type Mark = { x: number; y: number; a: number; len: number; w: number; t: number; thin: boolean };

export class Wipe {
  marks: Mark[] = [];
  oldC: HTMLCanvasElement; oldX: Ctx; newC: HTMLCanvasElement; newX: Ctx;
  pat: CanvasPattern | null = null;
  iNew = 0; iOld = 0; t0 = 0; dur = 1250; delay = 0.17; active = false; sorted: Mark[] = [];
  constructor(public W: number, public H: number, public dpr: number) {
    const mk = (): [HTMLCanvasElement, Ctx] => { const c = document.createElement('canvas'); c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr); return [c, c.getContext('2d')!]; };
    [this.oldC, this.oldX] = mk(); [this.newC, this.newX] = mk();
  }

  start(display: HTMLCanvasElement, to: HTMLCanvasElement, dir: 1 | -1, now: number, seed = 1) {
    const { W, H, dpr } = this;
    this.oldX.setTransform(1, 0, 0, 1, 0, 0); this.oldX.globalCompositeOperation = 'source-over'; this.oldX.clearRect(0, 0, this.oldC.width, this.oldC.height); this.oldX.drawImage(display, 0, 0);
    this.newX.setTransform(1, 0, 0, 1, 0, 0); this.newX.clearRect(0, 0, this.newC.width, this.newC.height);
    this.newX.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pat = this.newX.createPattern(to, 'no-repeat');
    this.pat?.setTransform(new DOMMatrix().scale(1 / dpr));
    const r = rng(seed * 131 + 7), nz = makeNoise(seed + 90), sp = clamp(W / 1200, 0.6, 1.1) * 15;
    this.marks = [];
    for (let y = -sp; y < H + sp; y += sp * 0.9) for (let x = -sp; x < W + sp; x += sp * 0.95) {
      for (const thin of [false, true]) {
        const px = x + (r() - 0.5) * sp * 1.1, py = y + (r() - 0.5) * sp * 1.1;
        const sweep = (dir > 0 ? px / W : 1 - px / W) * 0.82 + (py / H) * 0.08 * dir + 0.0;
        const t = clamp(sweep * 0.8 + nz(px / 60, py / 60) * 0.12 + r() * 0.08 - (thin ? 0.07 : 0), 0, 1);
        const a = -0.55 + (nz(px / 70 + 9, py / 70) - 0.5) * 1.3 + (r() - 0.5) * 0.25;
        this.marks.push({ x: px, y: py, a, len: thin ? sp * 2.4 : sp * 1.9, w: thin ? 3.4 : sp * 1.15, t, thin });
      }
    }
    this.sorted = this.marks.sort((p, q) => p.t - q.t);
    this.iNew = 0; this.iOld = 0; this.t0 = now; this.active = true;
  }

  /** advance; returns true when finished. Draws into the display context. */
  frame(now: number, dctx: Ctx, dw: number, dh: number): boolean {
    const p0 = clamp((now - this.t0) / this.dur);
    const p = p0 * p0 * (3 - 2 * p0) * (1 + this.delay);
    const { dpr } = this;
    // erase old
    const ox = this.oldX; ox.setTransform(dpr, 0, 0, dpr, 0, 0); ox.globalCompositeOperation = 'destination-out'; ox.lineCap = 'round'; ox.strokeStyle = '#000'; ox.globalAlpha = 1;
    while (this.iOld < this.sorted.length && this.sorted[this.iOld].t <= p) { this.line(ox, this.sorted[this.iOld], 1.25); this.iOld++; }
    const nx = this.newX; nx.setTransform(dpr, 0, 0, dpr, 0, 0); nx.lineCap = 'round'; nx.globalAlpha = 1;
    if (this.pat) nx.strokeStyle = this.pat;
    while (this.iNew < this.sorted.length && this.sorted[this.iNew].t + this.delay <= p) { this.line(nx, this.sorted[this.iNew], 1); this.iNew++; }
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dw, dh);
    dctx.drawImage(this.oldC, 0, 0); dctx.drawImage(this.newC, 0, 0);
    if (p0 >= 1) { this.active = false; return true; }
    return false;
  }

  private line(c: Ctx, m: Mark, grow: number) {
    const ca = Math.cos(m.a) * m.len * 0.5, sa = Math.sin(m.a) * m.len * 0.5;
    c.lineWidth = m.w * grow; c.beginPath(); c.moveTo(m.x - ca, m.y - sa); c.lineTo(m.x + ca, m.y + sa); c.stroke();
  }
}
void sstep;
