// Idle life: drawn on a transparent overlay at ~12 fps, in hatch-stroke style. Design coordinates.
import { rng, makeNoise, type Ctx } from './engine';

const nz = makeNoise(41);

export function steam(c: Ctx, x: number, y: number, t: number, o: { h?: number; n?: number; seed?: number; spread?: number; a?: number } = {}) {
  const n = o.n ?? 3, H = o.h ?? 120, spread = o.spread ?? 16, A = o.a ?? 0.34;
  c.lineCap = 'round';
  for (let w = 0; w < n; w++) {
    const ph = (t * 0.22 + w / n + (o.seed ?? 0) * 0.31) % 1, ph0 = w * 2.3 + (o.seed ?? 0);
    for (let k = 0; k < 9; k++) {
      const v = ph - k * 0.045; if (v < 0) break;
      const sx = x + Math.sin(v * 5.2 + ph0) * spread * (0.3 + v) + (nz(v * 3 + w, t * 0.2) - 0.5) * 10, sy = y - v * H;
      const al = Math.sin(Math.PI * Math.min(1, v * 1.1)) * A * (1 - k / 10);
      c.strokeStyle = `rgba(248,240,224,${al.toFixed(3)})`;
      const wid = 3.5 + v * 6;
      for (let j = -1; j <= 1; j++) {
        c.lineWidth = wid * 0.5; c.beginPath();
        c.moveTo(sx - 9 + j * 3.2, sy + 5 + j * 3.2); c.lineTo(sx + 9 + j * 3.2, sy - 6 + j * 3.2); c.stroke();
      }
    }
  }
}

export function glowPulse(c: Ctx, x: number, y: number, r: number, t: number, col: string, a = 0.12, seed = 0) {
  const f = 0.72 + 0.28 * nz(t * 1.7 + seed, seed * 3.1) + 0.12 * Math.sin(t * 7.3 + seed);
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${(a * f).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

export function flame(c: Ctx, x: number, y: number, t: number, s = 1, seed = 0) {
  const f = 0.8 + 0.4 * nz(t * 3 + seed, seed), sw = (nz(t * 2.1 + seed * 2, 4) - 0.5) * 3 * s;
  c.lineCap = 'round';
  for (const [w, h, col] of [[5.5, 15, 'rgba(255,196,86,0.95)'], [3, 9, 'rgba(255,244,196,0.95)']] as [number, number, string][]) {
    c.strokeStyle = col; c.lineWidth = w * s; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sw, y - h * s * f * 0.5, x + sw * 1.6, y - h * s * f); c.stroke();
  }
}

/** twinkle small bulbs: re-stroke a halo that breathes */
export function twinkle(c: Ctx, pts: [number, number][], t: number, a = 0.35) {
  pts.forEach((p, i) => {
    const f = 0.65 + 0.35 * Math.sin(t * 2.2 + i * 1.7) * nz(t * 0.5 + i, i);
    const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 26); g.addColorStop(0, `rgba(255,205,110,${(a * f).toFixed(3)})`); g.addColorStop(1, 'rgba(255,205,110,0)');
    c.fillStyle = g; c.fillRect(p[0] - 26, p[1] - 26, 52, 52);
  });
}

export function hatchBar(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, cols: string[], seed: number, n = 9) {
  const r = rng(seed), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const o = (i / (n - 1) - 0.5) * w;
    c.strokeStyle = cols[(r() * cols.length) | 0]; c.lineWidth = (w / n) * 1.5;
    c.beginPath(); c.moveTo(x0 + nx * o + (r() - 0.5) * 2, y0 + ny * o); c.lineTo(x1 + nx * o, y1 + ny * o + (r() - 0.5) * 2); c.stroke();
  }
}
