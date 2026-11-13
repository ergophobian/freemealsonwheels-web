// The site's art: people, drawn live in the browser in the manner of the Free Meals on Wheels logo, which is a loose
// black ink line over flat washes of lavender, butter, mint and sage that sit a little off the line. Every picture is
// a <canvas data-scene="door"> built from a seed: the ink is traced stroke by stroke the first time the picture
// scrolls into view and the colour comes in behind it, then it is still. No images, no libraries.
//
// All drawing happens in a space 100 units tall, so a picture looks the same at any size.

type R = () => number;
type Pt = [number, number];
interface Item { k: 0 | 1; p: Pt[]; col: string; a: number; w: number; len: number; at: number; dash?: boolean }
interface S { r: R; W: number; items: Item[]; len: number; sc: number }

export const rng = (seed: number): R => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (r: R, a: number, b: number) => a + r() * (b - a);
const pick = <T,>(r: R, a: T[]): T => a[Math.floor(r() * a.length)];
const TAU = Math.PI * 2;

const INK = '#1c1a22';
// the four colours inside the logo, plus what people need
const C = { butter: '#f2d988', mint: '#94c8b8', sage: '#c8d0b0', lav: '#c0b0d0', white: '#ffffff', hair: '#322c3b', grey: '#d3d0da', warm: '#fbf1d2', slate: '#6d6682', steel: '#dfe3e6' };
const PASTEL = [C.butter, C.mint, C.sage, C.lav];
const SKIN = ['#ecc9a8', '#dcae86', '#c4926b', '#a06f4f', '#f2d8c0'];

/* ------------------------------------------------------------------ lines and washes */

// a curve through the points (Catmull-Rom)
function smooth(p: Pt[], closed = false, n = 5): Pt[] {
  const L = p.length;
  if (L < 3) return p.slice();
  const g = (i: number) => (closed ? p[(i + L) % L] : p[Math.max(0, Math.min(L - 1, i))]);
  const out: Pt[] = [], segs = closed ? L : L - 1;
  for (let i = 0; i < segs; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
    for (let t = 0; t < n; t++) {
      const u = t / n, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * (2 * b[0] + (c[0] - a[0]) * u + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * u2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * u3),
        0.5 * (2 * b[1] + (c[1] - a[1]) * u + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * u2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * u3),
      ]);
    }
  }
  out.push(closed ? out[0] : p[L - 1]);
  return out;
}
// straight edges, drawn by an unsteady hand
function edges(s: S, p: Pt[], closed: boolean, j: number): Pt[] {
  const out: Pt[] = [], L = p.length, n = closed ? L : L - 1;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % L], m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (5 * s.sc)));
    for (let t = 0; t < m; t++) out.push([a[0] + ((b[0] - a[0]) * t) / m + (t ? rr(s.r, -j, j) : 0), a[1] + ((b[1] - a[1]) * t) / m + (t ? rr(s.r, -j, j) : 0)]);
  }
  out.push(closed ? p[0] : p[L - 1]);
  return out;
}
const plen = (p: Pt[]) => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; };

interface O { w?: number; a?: number; closed?: boolean; st?: boolean; raw?: boolean; j?: number; dash?: boolean; dbl?: boolean; col?: string }

// colour: flat, and a little off the line, as in the logo
function wash(s: S, p: Pt[], col: string, a = 1, st = false) {
  const q = st ? p : smooth(p, true), dx = 1.0 * s.sc, dy = 0.7 * s.sc;
  s.items.push({ k: 0, p: q.map(([x, y]) => [x + dx, y + dy] as Pt), col, a, w: 0, len: 0, at: s.len });
}
function ink(s: S, p: Pt[], o: O = {}) {
  const j = (o.j ?? 0.28) * s.sc;
  const q = o.raw ? p : o.st ? edges(s, p, !!o.closed, j * 0.7) : smooth(p.map(([x, y]) => [x + rr(s.r, -j, j), y + rr(s.r, -j, j)] as Pt), o.closed);
  if (o.closed && !o.st && q.length > 6) q.push(q[1], q[2], q[3]); // the pen runs on a little past where it began
  const len = plen(q);
  s.items.push({ k: 1, p: q, col: o.col ?? INK, a: o.a ?? 1, w: (o.w ?? 0.42) * s.sc, len, at: s.len, dash: o.dash });
  s.len += len;
}
function shape(s: S, p: Pt[], col: string, o: O = {}) {
  wash(s, p, col, o.a ?? 1, o.st);
  ink(s, p, { ...o, a: 1, closed: true });
  if (o.dbl) ink(s, p, { ...o, closed: true, a: 0.45, w: (o.w ?? 0.42) * 0.8, j: 0.5 });
}
function ell(cx: number, cy: number, rx: number, ry = rx, n = 10, rot = 0): Pt[] {
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
}

/* ------------------------------------------------------------------ a person */

interface Per {
  x: number; y: number; h: number; dir?: 1 | -1; skin?: number; hair?: string; hc?: string; top: string; bot?: string;
  long?: boolean; hands?: [Pt | null, Pt | null]; lean?: number; kid?: boolean; upper?: boolean; apron?: boolean; sash?: string;
}

function arm(s: S, sh: Pt, hd: Pt, h: number, col: string, skin: string, kid: boolean, out = 0) {
  const L1 = h * (kid ? 0.17 : 0.2), L2 = h * (kid ? 0.16 : 0.19);
  let dx = hd[0] - sh[0], dy = hd[1] - sh[1], d = Math.hypot(dx, dy);
  const m = L1 + L2 - 0.01;
  if (d > m) { hd = [sh[0] + (dx / d) * m, sh[1] + (dy / d) * m]; dx = hd[0] - sh[0]; dy = hd[1] - sh[1]; d = m; }
  d = Math.max(d, Math.abs(L1 - L2) + 0.01);
  const th = Math.atan2(dy, dx), a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const e1: Pt = [sh[0] + Math.cos(th + a) * L1, sh[1] + Math.sin(th + a) * L1], e2: Pt = [sh[0] + Math.cos(th - a) * L1, sh[1] + Math.sin(th - a) * L1];
  // the elbow points down, or away from the body when the hand stays close in
  const cl = smooth([sh, (out && Math.abs(dx) < h * 0.16 ? e1[0] * out > e2[0] * out : e1[1] > e2[1]) ? e1 : e2, hd], false, 6), n = cl.length, A: Pt[] = [], B: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = cl[Math.max(0, i - 1)], q = cl[Math.min(n - 1, i + 1)], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = -(q[1] - p[1]) / l, ny = (q[0] - p[0]) / l, w = h * (0.054 - 0.022 * (i / (n - 1))) * 0.5;
    A.push([cl[i][0] + nx * w, cl[i][1] + ny * w]); B.push([cl[i][0] - nx * w, cl[i][1] - ny * w]);
  }
  wash(s, [...A, ...B.slice().reverse()], col, 1, true);
  ink(s, A, { raw: true }); ink(s, B, { raw: true });
  shape(s, ell(hd[0], hd[1], h * 0.03, h * 0.03, 7), skin);
}

function person(s: S, o: Per) {
  const { x, y, h } = o, dir = o.dir ?? 1, kid = !!o.kid, lean = o.lean ?? 0;
  const r = h * (kid ? 0.118 : 0.084);
  const ys = y - h * (kid ? 0.69 : 0.785), yh = y - h * (kid ? 0.4 : 0.47);
  const sw = h * (kid ? 0.13 : 0.125), hw = h * (kid ? 0.115 : 0.105);
  const sx = x + lean, hx = sx + lean * 0.4 + dir * r * 0.18, hy = y - h + r;
  const skin = SKIN[(o.skin ?? 1) % SKIN.length], top = o.top, bot = o.bot ?? C.slate;

  if (!o.upper) {
    const lw = hw * 0.98;
    for (const sd of [-1, 1]) {
      const ox = x + sd * hw * 0.53, fx = x + sd * hw * 0.6;
      if (o.long) ink(s, [[fx, y - h * 0.11], [fx, y - h * 0.02]], { st: true });
      else shape(s, [[ox - lw / 2, yh], [ox + lw / 2, yh], [fx + lw * 0.34, y - h * 0.02], [fx - lw * 0.34, y - h * 0.02]], bot, { st: true });
      shape(s, ell(fx + dir * h * 0.024, y - h * 0.008, h * 0.05, h * 0.02, 7), C.hair);
    }
  }
  wash(s, [[hx - r * 0.4, hy + r * 0.5], [hx + r * 0.4, hy + r * 0.5], [sx + h * 0.036, ys + h * 0.02], [sx - h * 0.036, ys + h * 0.02]], skin, 1, true);
  const nk: Pt[] = [[sx + h * 0.034, ys - h * 0.012], [sx + sw, ys + h * 0.032]], nk2: Pt[] = [[sx - sw, ys + h * 0.032], [sx - h * 0.034, ys - h * 0.012]];
  if (o.long && !o.upper) shape(s, [nk[0], nk[1], [x + hw * 1.15, yh], [x + h * 0.175, y - h * 0.1], [x, y - h * 0.085], [x - h * 0.175, y - h * 0.1], [x - hw * 1.15, yh], nk2[0], nk2[1]], top, { dbl: true });
  else shape(s, [nk[0], nk[1], [x + hw * 1.1, yh + h * 0.03], [x, yh + h * 0.055], [x - hw * 1.1, yh + h * 0.03], nk2[0], nk2[1]], top, { dbl: true });
  if (o.sash) shape(s, [[sx - sw * 0.75, ys + h * 0.03], [sx - sw * 0.2, ys], [x + hw * 1.05, yh - h * 0.03], [x + hw * 0.55, yh + h * 0.03]], o.sash, { st: true });
  if (o.apron) {
    const ay = ys + h * 0.11, by = o.long ? y - h * 0.2 : yh + h * 0.14;
    shape(s, [[sx - sw * 0.55, ay], [sx + sw * 0.55, ay], [x + hw * 0.95, by], [x - hw * 0.95, by]], C.white, { st: true });
    ink(s, [[sx - sw * 0.55, ay], [sx - h * 0.03, ys]], { st: true, w: 0.3 }); ink(s, [[sx + sw * 0.55, ay], [sx + h * 0.03, ys]], { st: true, w: 0.3 });
  }
  for (const i of [0, 1]) {
    // an arm that reaches across the body starts nearer the middle, so it does not cut over the chest
    const sd = i ? 1 : -1, hd = o.hands?.[i], cross = !!hd && (hd[0] - sx) * sd < 0;
    const sh: Pt = [sx + sd * sw * (cross ? 0.2 : 0.9), ys + h * (cross ? 0.07 : 0.045)];
    arm(s, sh, hd ?? [sh[0] + sd * h * 0.022, sh[1] + h * (kid ? 0.318 : 0.378)], h, top, skin, kid, cross ? 0 : sd);
  }
  shape(s, ell(hx, hy, r, r * 1.06, 9, 0.3), skin);

  // hair, in units of the head's radius; x runs toward where the person faces
  const M = (px: number, py: number): Pt => [hx + dir * px * r, hy + py * r];
  const arc = (a0: number, a1: number, k = 1.1, ky = k, oy = 0): Pt[] => { const p: Pt[] = []; for (let a = a0; a <= a1; a += 21) p.push(M(Math.cos((a * Math.PI) / 180) * k, Math.sin((a * Math.PI) / 180) * ky + oy)); return p; };
  const hair = o.hair ?? 'short', hc = o.hc ?? (hair === 'grey' ? C.grey : C.hair);
  const cap = () => shape(s, [...arc(160, 330), M(0.5, -0.55), M(-0.3, -0.3), M(-0.55, 0.3)], hc);
  if (hair === 'short' || hair === 'grey') cap();
  else if (hair === 'bun') { shape(s, ell(M(-0.95, -0.95)[0], M(-0.95, -0.95)[1], r * 0.5, r * 0.5, 7), hc); cap(); }
  else if (hair === 'pony') { shape(s, [M(-0.9, -0.4), M(-1.9, 0), M(-2.05, 1.3), M(-1.5, 0.7)], hc); cap(); }
  else if (hair === 'long') shape(s, [M(-0.45, 2.3), M(-1.35, 2.1), M(-1.32, 0.6), ...arc(190, 330), M(0.5, -0.55), M(-0.3, -0.3), M(-0.5, 0.9)], hc);
  else if (hair === 'turban') {
    // wraps that meet at the brow
    shape(s, [M(-1.18, -0.1), M(-1.3, -0.8), M(-0.8, -1.5), M(0, -1.72), M(0.8, -1.5), M(1.25, -0.85), M(1.15, -0.2), M(0.35, -0.5), M(-0.5, -0.38)], hc);
    for (const [ax, ay, bx, by] of [[-1.22, -0.75, -0.4, -0.75], [-0.75, -1.45, -0.1, -1.05], [0.25, -1.68, 0.4, -1.1], [1.15, -0.95, 0.75, -0.8]]) ink(s, [M(ax, ay), M(bx, by), M(0.35, -0.5)], { w: 0.28 });
  } else if (hair === 'scarf') shape(s, [M(-1.3, 2.0), M(-1.27, 0.3), ...arc(180, 360, 1.22), M(1.27, 0.3), M(1.2, 1.9), M(0.75, 1.5), M(0.85, 0), M(0, -0.7), M(-0.85, 0), M(-0.8, 1.6)], hc);
}

/* ------------------------------------------------------------------ things */

function box(s: S, x: number, y: number, w: number, h: number, col = C.butter) {
  shape(s, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col, { st: true });
  ink(s, [[x, y + h * 0.3], [x + w, y + h * 0.3]], { st: true, w: 0.3 });
}
function bag(s: S, x: number, y: number, w: number, h: number, col = C.butter) {
  ink(s, [[x + w * 0.28, y], [x + w * 0.33, y - h * 0.34], [x + w * 0.67, y - h * 0.34], [x + w * 0.72, y]]);
  shape(s, [[x + w * 0.06, y], [x + w * 0.94, y], [x + w, y + h], [x, y + h]], col, { st: true });
  ink(s, [[x + w * 0.2, y + h * 0.22], [x + w * 0.8, y + h * 0.22]], { st: true, w: 0.3 });
}
function steam(s: S, xs: number[], y0: number, y1: number) {
  for (const x of xs) {
    const p: Pt[] = [], ph = s.r() * 6, amp = rr(s.r, 1.2, 2);
    for (let y = y0; y >= y1; y -= 3.2) p.push([x + Math.sin((y0 - y) * 0.3 + ph) * amp * (0.3 + (y0 - y) / (y0 - y1)), y]);
    ink(s, p, { w: 0.34, a: 0.75, j: 0.1 });
  }
}
function ground(s: S, x0: number, x1: number, y: number) {
  ink(s, [[x0, y], [x1, y]], { st: true, j: 0.5 });
  for (let x = x0 + 6; x < x1 - 4; x += rr(s.r, 14, 26)) ink(s, [[x, y + 2.2], [x + rr(s.r, 3, 7), y + 2.2]], { st: true, w: 0.3, a: 0.7 });
}
function backdrop(s: S, x: number, y: number, rx: number, ry: number, col: string, a = 0.42) {
  wash(s, ell(x, y, rx, ry, 9, s.r() * 6).map(([px, py]) => [px + rr(s.r, -rx, rx) * 0.16, py + rr(s.r, -ry, ry) * 0.16] as Pt), col, a);
}
function sun(s: S, x: number, y: number, r: number, col = C.butter) { shape(s, ell(x, y, r, r, 10), col, { w: 0.34 }); }
function pot(s: S, x: number, y: number, w: number, h: number, col = C.sage) {
  const a = w / 2;
  ink(s, [[x - a, y + h * 0.2], [x - a - 3.4, y + h * 0.24], [x - a - 3.2, y + h * 0.42], [x - a * 0.97, y + h * 0.42]]);
  ink(s, [[x + a, y + h * 0.2], [x + a + 3.4, y + h * 0.24], [x + a + 3.2, y + h * 0.42], [x + a * 0.97, y + h * 0.42]]);
  shape(s, [[x - a, y], [x - a * 0.98, y + h * 0.6], [x - a * 0.7, y + h], [x + a * 0.7, y + h], [x + a * 0.98, y + h * 0.6], [x + a, y]], col, { dbl: true });
  shape(s, ell(x, y, a, h * 0.11, 12), C.warm);
}
function doorway(s: S, x: number, y: number, w: number, y1: number) {
  shape(s, [[x - 3, y - 3], [x + w + 3, y - 3], [x + w + 3, y1], [x - 3, y1]], C.white, { st: true });
  shape(s, [[x, y], [x + w, y], [x + w, y1], [x, y1]], C.warm, { st: true });
  shape(s, [[x - 7, y1], [x + w + 7, y1], [x + w + 7, y1 + 3.4], [x - 7, y1 + 3.4]], C.grey, { st: true });
  // a string of marigolds over the door
  const g: Pt[] = [];
  for (let t = 0; t <= 1.001; t += 0.1) g.push([x - 3 + (w + 6) * t, y - 3 + Math.sin(t * Math.PI) * 6.5]);
  ink(s, g, { w: 0.3 });
  g.forEach(([gx, gy], i) => { if (i % 1 === 0) wash(s, ell(gx - 0.6, gy + 0.6, 1.25, 1.25, 6), i % 3 === 1 ? C.mint : C.butter); });
}
function plant(s: S, x: number, y: number, k = 1) {
  for (const [dx, dy, rot] of [[-3.4, -9, -0.5], [0, -11.5, 0], [3.4, -9, 0.5]]) shape(s, ell(x + dx * k, y + dy * k, 1.9 * k, 4.6 * k, 8, rot + Math.PI / 2).map(([px, py]) => [x + dx * k + (px - x - dx * k) * Math.cos(rot) - (py - y - dy * k) * Math.sin(rot), y + dy * k + (px - x - dx * k) * Math.sin(rot) + (py - y - dy * k) * Math.cos(rot)] as Pt), C.sage);
  shape(s, [[x - 3.6 * k, y - 6 * k], [x + 3.6 * k, y - 6 * k], [x + 2.6 * k, y], [x - 2.6 * k, y]], C.lav, { st: true });
}
function house(s: S, x: number, y: number, w: number, h: number, col: string) {
  wash(s, [[x, y - h], [x + w, y - h], [x + w, y], [x, y]], col, 0.6, true);
  ink(s, [[x, y], [x, y - h], [x + w / 2, y - h - w * 0.36], [x + w, y - h], [x + w, y]], { st: true, w: 0.32, a: 0.75 });
  ink(s, [[x + w * 0.38, y], [x + w * 0.38, y - h * 0.5], [x + w * 0.62, y - h * 0.5], [x + w * 0.62, y]], { st: true, w: 0.28, a: 0.75 });
}
function table(s: S, x0: number, x1: number, y: number, y1: number, col = C.white) {
  for (const x of [x0 + 5, x1 - 5]) shape(s, [[x - 1.2, y + 3], [x + 1.2, y + 3], [x + 1, y1], [x - 1, y1]], C.grey, { st: true });
  shape(s, [[x0, y], [x1, y], [x1, y + 4.6], [x0, y + 4.6]], col, { st: true });
}
function plate(s: S, x: number, y: number, col: string) {
  shape(s, ell(x, y, 5.2, 1.5, 10), C.steel, { w: 0.32 });
  wash(s, ell(x - 1.6, y - 0.9, 1.9, 1, 7), col); wash(s, ell(x + 1.2, y - 0.8, 1.7, 0.9, 7), C.sage);
}

/* ------------------------------------------------------------------ the pictures */

interface Scene { ar: number | ((w: number) => number); build: (s: S, cv: HTMLCanvasElement) => void; dur?: number }

const SCENES: Record<string, Scene> = {
  // a meal handed to a family at their door
  door: {
    ar: 1.22,
    build: (s) => {
      backdrop(s, 34, 44, 34, 30, C.lav); backdrop(s, 88, 80, 36, 14, C.sage, 0.5);
      sun(s, 20, 20, 8);
      ink(s, [[70, 12], [70, 88]], { st: true }); ink(s, [[64, 12], [121, 12]], { st: true });
      doorway(s, 80, 28, 30, 88);
      plant(s, 117, 88);
      person(s, { x: 102, y: 88, h: 47, dir: -1, skin: 2, hair: 'grey', top: C.sage, long: true });
      person(s, { x: 91, y: 88.5, h: 50, dir: -1, skin: 1, hair: 'long', top: C.lav, long: true, sash: C.butter, hands: [[74, 60], [76.5, 65]] });
      person(s, { x: 81, y: 90, h: 27, dir: -1, skin: 1, hair: 'pony', top: C.mint, kid: true, hands: [[72.5, 68.5], null] });
      person(s, { x: 46, y: 91, h: 55, dir: 1, skin: 3, hair: 'turban', hc: C.butter, top: C.mint, hands: [[61, 64], [64.5, 60]] });
      bag(s, 61.5, 56, 12, 11.5, C.butter);
      steam(s, [65, 69.5], 49, 34);
      person(s, { x: 24, y: 92, h: 31, dir: 1, skin: 0, hair: 'short', top: C.butter, kid: true, hands: [[23, 78], [32, 78]] });
      box(s, 22.5, 73, 10, 6.5, C.mint);
      ground(s, 4, 118, 92.5);
    },
  },
  // six in the morning: the first pot goes on
  kitchen: {
    ar: 1.25,
    build: (s) => {
      backdrop(s, 62, 44, 44, 32, C.mint, 0.36);
      sun(s, 13, 22, 7.5);
      shape(s, [[46, 82], [80, 82], [80, 92], [46, 92]], C.grey, { st: true });
      ink(s, [[52, 87], [57, 87]], { st: true, w: 0.3 }); ink(s, [[69, 87], [74, 87]], { st: true, w: 0.3 });
      person(s, { x: 37, y: 92, h: 56, dir: 1, skin: 1, hair: 'bun', top: C.lav, apron: true, hands: [[50.5, 51], [54, 45]] });
      person(s, { x: 93, y: 92, h: 58, dir: -1, skin: 3, hair: 'turban', hc: C.lav, top: C.butter, apron: true, hands: [[77.5, 46], [84.5, 45]] });
      pot(s, 63, 60, 31, 22);
      ink(s, [[49, 37], [53, 46], [60, 59]], { w: 0.7 });
      shape(s, [[75, 44], [87, 42.5], [84.5, 48], [78, 48.8]], C.steel);
      for (const [dx, dy] of [[72, 51], [70.5, 54.5], [73.4, 55.5], [69, 51.5]]) wash(s, ell(dx, dy, 0.7, 0.7, 5), C.butter);
      steam(s, [56, 63, 70], 55, 12);
      person(s, { x: 14, y: 92, h: 30, dir: 1, skin: 4, hair: 'pony', top: C.butter, kid: true, hands: [[11.5, 77], [21, 77]] });
      box(s, 10, 72.5, 12.5, 6, C.sage);
      for (const dx of [12.6, 16.2, 19.8]) shape(s, ell(dx, 71.6, 1.7, 1.6, 7), dx === 16.2 ? C.butter : C.lav, { w: 0.3 });
      person(s, { x: 114, y: 92, h: 52, dir: -1, skin: 0, hair: 'short', top: C.sage, apron: true, hands: [[106, 62], [113, 63]] });
      shape(s, ell(108.5, 61, 5, 1.6, 9), C.steel, { w: 0.32 });
      ground(s, 3, 122, 92.5);
    },
  },
  // half past nine: every meal packed by hand
  pack: {
    ar: 1.25,
    build: (s) => {
      backdrop(s, 60, 46, 46, 30, C.butter, 0.34);
      sun(s, 28, 15, 7);
      person(s, { x: 24, y: 92, h: 55, dir: 1, skin: 2, hair: 'scarf', hc: C.lav, top: C.mint, long: true, hands: [[19.5, 56], [31, 56]] });
      person(s, { x: 59, y: 92, h: 58, dir: 1, skin: 0, hair: 'short', top: C.lav, apron: true, hands: [[53, 56.5], [66, 56.5]] });
      person(s, { x: 93, y: 92, h: 54, dir: 1, skin: 3, hair: 'bun', top: C.butter, hands: [[101.5, 46.5], [102.5, 42.5]] });
      table(s, 6, 119, 61, 92);
      box(s, 19, 52, 13, 9, C.butter); steam(s, [23, 28], 50, 38);
      box(s, 53, 53, 13, 8, C.mint);
      box(s, 37, 55, 11, 6, C.sage); box(s, 71, 55, 11, 6, C.butter);
      box(s, 101.5, 54, 13, 7, C.lav); box(s, 102, 47, 13, 7, C.butter); box(s, 102.6, 40, 12.5, 7, C.mint);
      person(s, { x: 43, y: 93, h: 29, dir: 1, skin: 1, hair: 'short', top: C.butter, kid: true, hands: [[40.5, 80], [49, 80]] });
      bag(s, 40.5, 77.5, 8.5, 8, C.white);
      ground(s, 3, 122, 93);
    },
  },
  // the meals leave the kitchen
  van: {
    ar: 1.25,
    build: (s) => {
      backdrop(s, 70, 40, 46, 28, C.lav, 0.34);
      sun(s, 100, 14, 7.5);
      house(s, 2, 56, 13, 13, C.sage); house(s, 107, 55, 13, 12, C.mint);
      shape(s, [[42, 82], [42, 49], [46, 43.5], [91, 43.5], [101, 57], [114, 60.5], [114, 82]], C.white, { st: true, dbl: true });
      wash(s, [[42, 66], [114, 66], [114, 72.5], [42, 72.5]], C.mint, 1, true);
      ink(s, [[42, 66], [114, 66]], { st: true, w: 0.3 }); ink(s, [[42, 72.5], [114, 72.5]], { st: true, w: 0.3 });
      shape(s, [[84, 47], [90, 47], [97.5, 57], [84, 57]], C.steel, { st: true });
      shape(s, [[66, 47], [80, 47], [80, 57], [66, 57]], C.steel, { st: true });
      shape(s, ell(73, 54, 3, 3.2, 8), SKIN[1], { w: 0.32 }); shape(s, [[69.8, 53.5], [70.6, 50.6], [73.4, 49.8], [76, 51], [75, 52.4], [72, 52.4]], C.hair, { w: 0.3 });
      ink(s, [[42, 49], [35, 45.5], [35, 80], [42, 82]], { st: true });
      box(s, 45, 73, 9, 6, C.butter); box(s, 45.5, 67, 9, 6, C.lav);
      for (const wx of [58, 100]) { shape(s, ell(wx, 83, 7, 7, 12), C.hair); shape(s, ell(wx, 83, 2.6, 2.6, 8), C.white, { w: 0.3 }); }
      person(s, { x: 23, y: 91, h: 54, dir: 1, skin: 2, hair: 'pony', top: C.butter, hands: [[25, 66], [35, 66]] });
      box(s, 23.5, 61, 12.5, 7, C.mint); box(s, 24, 54, 12, 7, C.lav);
      person(s, { x: 8, y: 92, h: 30, dir: 1, skin: 3, hair: 'short', top: C.lav, kid: true, hands: [[6.5, 79], [14, 79]] });
      bag(s, 6, 76.5, 8, 7.5, C.white);
      ground(s, 2, 123, 92.5);
      for (const x of [44, 62, 80, 98]) ink(s, [[x, 96.5], [x + 8, 96.5]], { st: true, w: 0.34, a: 0.6 });
    },
  },
  // a knock at the door
  knock: {
    ar: 1.25,
    build: (s) => {
      backdrop(s, 78, 46, 38, 30, C.mint, 0.36); backdrop(s, 30, 82, 30, 12, C.sage, 0.5);
      sun(s, 106, 16, 7.5);
      ink(s, [[52, 12], [52, 88]], { st: true }); ink(s, [[2, 12], [58, 12]], { st: true });
      doorway(s, 14, 28, 30, 88);
      plant(s, 6, 88);
      person(s, { x: 31, y: 88.5, h: 46, dir: 1, skin: 0, hair: 'bun', hc: C.grey, top: C.lav, long: true, sash: C.sage, hands: [[23.5, 68], [50, 63]] });
      ink(s, [[23.5, 67], [22.5, 88.5]], { st: true, w: 0.6 });
      person(s, { x: 77, y: 91, h: 56, dir: -1, skin: 2, hair: 'long', top: C.butter, hands: [[57, 60], [61, 65]] });
      bag(s, 50.5, 56, 12, 11.5, C.mint);
      steam(s, [54.5, 58.5], 49, 35);
      person(s, { x: 99, y: 92, h: 32, dir: -1, skin: 2, hair: 'short', top: C.mint, kid: true, hands: [[92, 78], [100.5, 78]] });
      box(s, 91.5, 73.5, 10, 6.5, C.butter);
      ground(s, 3, 122, 92.5);
    },
  },
  // evening: a family at the table
  table: {
    ar: 1.25,
    build: (s) => {
      backdrop(s, 62, 50, 50, 34, C.lav, 0.4);
      shape(s, ell(108, 14, 6.5, 6.5, 10), C.white, { w: 0.34 }); wash(s, ell(105.5, 12.6, 5.6, 5.6, 9), C.butter);
      ink(s, [[62, 0], [62, 15]], { st: true, w: 0.3 });
      wash(s, ell(62, 24, 15, 12, 10), C.butter, 0.4);
      shape(s, [[55, 21.5], [57.5, 15], [66.5, 15], [69, 21.5]], C.butter, { st: true });
      person(s, { x: 36, y: 89.5, h: 50, dir: 1, skin: 0, hair: 'bun', hc: C.grey, top: C.sage, upper: true, hands: [[31, 63.5], [42, 63.5]] });
      person(s, { x: 62, y: 89.5, h: 54, dir: 1, skin: 3, hair: 'short', top: C.mint, upper: true, hands: [[54, 62.5], [71, 61]] });
      person(s, { x: 88, y: 89.5, h: 51, dir: -1, skin: 1, hair: 'long', top: C.lav, upper: true, sash: C.butter, hands: [[81.5, 63.5], [93, 63.5]] });
      person(s, { x: 14, y: 93, h: 34, dir: 1, skin: 1, hair: 'pony', top: C.butter, kid: true, hands: [null, [23, 66]] });
      person(s, { x: 111, y: 93, h: 30, dir: -1, skin: 3, hair: 'short', top: C.mint, kid: true, hands: [[103.5, 64], null] });
      table(s, 19, 106, 66, 93, C.white);
      plate(s, 36.5, 65.2, C.butter); plate(s, 88, 65.2, C.butter); plate(s, 53, 65.4, C.lav);
      shape(s, [[66, 58.5], [77, 58.5], [75.5, 65.6], [67.5, 65.6]], C.sage); shape(s, ell(71.5, 58.5, 5.5, 1.3, 9), C.warm, { w: 0.32 });
      steam(s, [69.5, 73.5], 56, 40); steam(s, [36.5], 61, 51); steam(s, [88], 61, 51);
      shape(s, ell(24.5, 64.4, 2.6, 1.3, 7), C.butter, { w: 0.3 }); shape(s, ell(102, 63, 2.6, 1.3, 7), C.butter, { w: 0.3 });
      ground(s, 4, 121, 93.5);
    },
  },
  // a long line of neighbors, hand in hand; as many as fit the width
  line: {
    ar: (w) => (w < 620 ? 2.5 : w < 1000 ? 4 : 6),
    build: (s) => {
      const hairs = ['short', 'bun', 'long', 'turban', 'pony', 'scarf', 'grey', 'short'];
      const P: Per[] = [];
      let x = 10;
      while (x < s.W - 8) {
        const kid = P.length % 4 === 2, h = kid ? rr(s.r, 30, 38) : rr(s.r, 52, 62), hair = pick(s.r, hairs);
        P.push({ x, y: 92, h, dir: x < s.W / 2 ? 1 : -1, skin: Math.floor(s.r() * 5), hair, hc: hair === 'turban' || hair === 'scarf' ? pick(s.r, PASTEL) : undefined, top: PASTEL[P.length % 4], long: !kid && s.r() < 0.45, kid, sash: !kid && s.r() < 0.2 ? pick(s.r, PASTEL) : undefined });
        x += kid ? 14.5 : 16.5;
      }
      const hy = (p: Per) => p.y - p.h * (p.kid ? 0.69 : 0.785) + p.h * 0.33;
      P.forEach((p, i) => {
        const a = P[i - 1], b = P[i + 1];
        p.hands = [a ? [(a.x + p.x) / 2, Math.min(hy(a), hy(p)) + 4] : null, b ? [(b.x + p.x) / 2, Math.min(hy(b), hy(p)) + 4] : null];
      });
      P.forEach((p) => person(s, p));
      ground(s, 0, s.W, 92.6);
    },
  },
  // three hundred neighbors; the last one is still waiting
  crowd: {
    ar: (w) => (w < 560 ? 0.75 : 25 / 12),
    dur: 2600,
    build: (s) => {
      const cols = s.W < 100 ? 15 : 25, rows = 300 / cols, cl = 100 / rows;
      s.sc = cl / 22;
      for (let i = 0; i < 300; i++) {
        const kid = s.r() < 0.2, k = kid ? 0.8 : 1;
        const cx = ((i % cols) + 0.5) * cl + rr(s.r, -0.05, 0.05) * cl, cy = (Math.floor(i / cols) + 0.5) * cl + (kid ? 0.07 * cl : 0);
        const r = cl * 0.18 * k, hy = cy - cl * 0.14 * k, sh: Pt[] = [[cx - 0.36 * cl * k, cy + 0.42 * cl], [cx - 0.3 * cl * k, cy + 0.17 * cl], [cx, cy + 0.07 * cl], [cx + 0.3 * cl * k, cy + 0.17 * cl], [cx + 0.36 * cl * k, cy + 0.42 * cl]];
        if (i === 299) {
          wash(s, ell(cx, cy + 0.05 * cl, cl * 0.47, cl * 0.47, 12), C.butter, 0.55);
          ink(s, smooth(sh, false), { raw: true, dash: true }); ink(s, [...ell(cx, hy, r, r, 10), [cx + r, hy]], { dash: true, j: 0 });
          continue;
        }
        wash(s, sh, pick(s.r, PASTEL)); ink(s, sh, { j: 0.2 });
        shape(s, ell(cx, hy, r, r * 1.05, 8), SKIN[Math.floor(s.r() * 5)]);
        const t = s.r(), d = s.r() < 0.5 ? 1 : -1, M = (px: number, py: number): Pt => [cx + d * px * r, hy + py * r];
        if (t < 0.12) wash(s, [M(-1.25, -0.2), M(-0.9, -1.25), M(0, -1.6), M(0.9, -1.25), M(1.25, -0.2), M(0, -0.5)], pick(s.r, PASTEL));
        else if (t < 0.92) {
          const col = t < 0.24 ? C.grey : C.hair;
          wash(s, [M(-1.05, 0.4), M(-1.15, -0.4), M(-0.6, -1.05), M(0.2, -1.2), M(0.95, -0.75), M(0.5, -0.5), M(-0.3, -0.3), M(-0.55, 0.3)], col);
          if (t > 0.62) wash(s, [M(-0.5, 0.2), M(-1.2, 0.1), M(-1.3, 1.5), M(-0.6, 1.5)], col);
          else if (t > 0.5) wash(s, ell(M(-0.95, -0.95)[0], M(-0.95, -0.95)[1], r * 0.45, r * 0.45, 6), col);
        }
      }
    },
  },
};

/* ------------------------------------------------------------------ putting a picture on the page */

const runs = new WeakMap<HTMLCanvasElement, number>();
const widths = new WeakMap<HTMLCanvasElement, number>();
let runId = 0;
const motion = () => document.documentElement.classList.contains('fx-on');

function paint(c: CanvasRenderingContext2D, s: S, prog: number) {
  c.clearRect(0, 0, s.W, 100);
  const cur = prog * s.len, fade = s.len * 0.06 + 1;
  for (const it of s.items) {
    const p = it.p;
    if (it.k === 0) {
      const a = prog >= 1 ? 1 : Math.min(1, (cur - it.at) / fade + 0.001);
      if (a <= 0) continue;
      c.globalAlpha = it.a * a; c.fillStyle = it.col; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
      c.closePath(); c.fill();
    } else {
      const d = cur - it.at;
      if (d <= 0 && prog < 1) continue;
      const n = prog >= 1 || d >= it.len ? p.length : Math.max(2, Math.ceil((p.length * d) / it.len));
      c.globalAlpha = it.a; c.strokeStyle = it.col; c.lineWidth = it.w; c.setLineDash(it.dash ? [it.w * 2.4, it.w * 2.6] : []);
      c.beginPath(); c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < n; i++) c.lineTo(p[i][0], p[i][1]);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
}

export function drawScene(cv: HTMLCanvasElement, animate = false) {
  const sc = SCENES[cv.dataset.scene ?? 'door'] ?? SCENES.door, w = cv.clientWidth;
  if (w < 2) return;
  const ar = typeof sc.ar === 'number' ? sc.ar : sc.ar(w);
  cv.style.aspectRatio = String(ar);
  widths.set(cv, w);
  const c = cv.getContext('2d');
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = 100 * ar;
  const s: S = { r: rng(Number(cv.dataset.seed ?? 1) * 7919 + 13), W, items: [], len: 0, sc: 1 };
  sc.build(s, cv);
  cv.width = Math.round(w * dpr); cv.height = Math.round((w / ar) * dpr);
  c.setTransform(cv.width / W, 0, 0, cv.height / 100, 0, 0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  cv.classList.add('done');
  const id = ++runId;
  runs.set(cv, id);
  if (!animate || !motion()) { paint(c, s, 1); return; }
  const dur = sc.dur ?? 2100, t0 = performance.now();
  const step = (t: number) => {
    if (runs.get(cv) !== id) return;
    const u = Math.min(1, (t - t0) / dur);
    paint(c, s, u < 1 ? 1 - Math.pow(1 - u, 1.6) : 1);
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Draw every picture the first time it comes into view; a click draws it again.
export function initScenes() {
  // every inner page title gets one picture beside it
  const name = document.body.dataset.scene;
  if (name) document.querySelectorAll<HTMLElement>('.ph').forEach((ph) => {
    if (ph.querySelector('.ph-art')) return;
    const cv = document.createElement('canvas');
    cv.className = 'ph-art'; cv.dataset.scene = name; cv.dataset.seed = String(name.length * 7 + 3); cv.setAttribute('aria-hidden', 'true');
    ph.appendChild(cv);
  });
  const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]')];
  list.forEach((cv) => { const sc = SCENES[cv.dataset.scene ?? '']; if (sc) cv.style.aspectRatio = String(typeof sc.ar === 'number' ? sc.ar : sc.ar(cv.clientWidth)); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); drawScene(e.target as HTMLCanvasElement, true); } }, { rootMargin: '0px 0px -8% 0px' });
    list.forEach((cv) => io.observe(cv));
  } else list.forEach((cv) => drawScene(cv));
  document.addEventListener('click', (e) => {
    const cv = (e.target as HTMLElement).closest?.('canvas[data-scene]') as HTMLCanvasElement | null;
    if (!cv || cv.closest('a, [data-noredraw]')) return;
    cv.dataset.seed = String(Math.floor(Math.random() * 100000));
    drawScene(cv, true);
  });
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => list.forEach((cv) => { if (cv.classList.contains('done') && Math.abs(cv.clientWidth - (widths.get(cv) ?? 0)) > 6) drawScene(cv); }), 200);
  });
}

// Text rises into place the first time it scrolls into view. Marked up with data-rv; without the fx-on class
// (reduced motion, or no script) everything is simply visible.
export function reveal() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-rv]')];
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || !motion()) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}
