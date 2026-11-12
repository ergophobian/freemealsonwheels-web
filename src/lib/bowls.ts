// The site's art: one simple shape (a bowl of food) drawn again and again, each time with a different kind of
// hand-made mark: pen hatching, net, weave, terrazzo, running stitch, jaali, vines, scallops and so on. Every tile is
// drawn live on a <canvas data-tile="bowl"> from a seed, stroke by stroke, the first time it scrolls into view, and
// then it is still. Clicking a tile draws it again another way. No images, no libraries.
//
// All drawing happens in a 100 x 100 space so a tile looks the same at any size.

type R = () => number;
type Op = () => void;
type C = CanvasRenderingContext2D;
interface K { c: C; r: R; ops: Op[]; clip: Path2D | null }
type Style = (k: K, a: string, b: string) => void;
// ground, ink on the ground, figure, ink on the figure, a second accent
type Pal = [string, string, string, string, string];

export const rng = (seed: number): R => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (r: R, a: number, b: number) => a + r() * (b - a);
const TAU = Math.PI * 2;

const add = (k: K, fn: Op) => {
  const cl = k.clip, c = k.c;
  k.ops.push(cl ? () => { c.save(); c.clip(cl); fn(); c.restore(); } : fn);
};

// a pen line through points, smoothed
function pen(c: C, p: number[], col: string, w: number, a = 1) {
  c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length - 2; i += 2) c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  c.lineTo(p[p.length - 2], p[p.length - 1]);
  c.stroke(); c.globalAlpha = 1;
}
// a slightly unsteady straight line, as points
function wl(r: R, x0: number, y0: number, x1: number, y1: number, j = 0.4, n = 4): number[] {
  const p = [x0, y0];
  for (let i = 1; i < n; i++) { const t = i / n; p.push(x0 + (x1 - x0) * t + rr(r, -j, j), y0 + (y1 - y0) * t + rr(r, -j, j)); }
  p.push(x1, y1);
  return p;
}
function blobPts(r: R, x: number, y: number, rad: number, n = 9): number[] {
  const p: number[] = [], rot = r() * TAU, sq = rr(r, 0.7, 1);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = rad * rr(r, 0.78, 1.15); p.push(x + Math.cos(a + rot) * d, y + Math.sin(a + rot) * d * sq); }
  return p;
}
function fillBlob(c: C, p: number[], col: string, a = 1) {
  const n = p.length / 2;
  c.globalAlpha = a; c.fillStyle = col; c.beginPath();
  c.moveTo((p[0] + p[2 * (n - 1)]) / 2, (p[1] + p[2 * (n - 1) + 1]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * j]) / 2, (p[2 * i + 1] + p[2 * j + 1]) / 2); }
  c.fill(); c.globalAlpha = 1;
}

/* ------------------------------------------------------------------ the kinds of mark */

const hatch: Style = (k, a) => {
  const n = 8, s = 100 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * s + rr(k.r, -2, 2), cy = (j + 0.5) * s + rr(k.r, -2, 2), ang = k.r() * Math.PI, m = 7 + Math.floor(k.r() * 4);
    const dx = Math.cos(ang), dy = Math.sin(ang), L: number[][] = [];
    for (let q = 0; q < m; q++) {
      const o = (q - (m - 1) / 2) * 1.3, len = s * 0.6 * rr(k.r, 0.8, 1.3), px = cx - dy * o, py = cy + dx * o;
      L.push(wl(k.r, px - dx * len, py - dy * len, px + dx * len, py + dy * len, 0.5));
    }
    add(k, () => L.forEach((p) => pen(k.c, p, a, 0.42)));
  }
};
const net: Style = (k, a) => {
  for (let d = -100; d < 200; d += 2.7) {
    const p = wl(k.r, d, -2, d + 104, 102, 0.6, 7), q = wl(k.r, d, -2, d - 104, 102, 0.6, 7);
    add(k, () => { pen(k.c, p, a, 0.32); pen(k.c, q, a, 0.32); });
  }
};
const waves: Style = (k, a) => {
  let ph = k.r() * 6;
  for (let y = 1; y < 100; y += 2.1) {
    ph += rr(k.r, -0.5, 0.5);
    const p: number[] = [], amp = rr(k.r, 0.5, 1.1);
    for (let x = -2; x <= 102; x += 3.5) p.push(x, y + Math.sin(x * 0.27 + ph) * amp + rr(k.r, -0.15, 0.15));
    add(k, () => pen(k.c, p, a, 0.34));
  }
};
const weave: Style = (k, a, b) => {
  const n = 9, s = 100 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const hor = (i + j) % 2 === 0, L: [number[], number][] = [];
    for (let q = 0; q < 5; q++) {
      const o = (q + 0.5) * (s / 5);
      L.push([hor ? wl(k.r, i * s + 0.4, j * s + o, (i + 1) * s - 0.4, j * s + o, 0.3) : wl(k.r, i * s + o, j * s + 0.4, i * s + o, (j + 1) * s - 0.4, 0.3), rr(k.r, 0.3, 0.95)]);
    }
    const col = k.r() < 0.16 ? b : a;
    add(k, () => L.forEach(([p, al]) => pen(k.c, p, col, s / 5.6, al)));
  }
};
const terrazzo: Style = (k, a, b) => {
  const n = 7, s = 100 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (k.r() < 0.1) continue;
    const x = (i + 0.5) * s + rr(k.r, -3.5, 3.5), y = (j + 0.5) * s + rr(k.r, -3.5, 3.5), rad = s * rr(k.r, 0.3, 0.56);
    const p = blobPts(k.r, x, y, rad), col = k.r() < 0.56 ? a : b, st = [wl(k.r, x - rad * 0.6, y - rad * 0.2, x + rad * 0.6, y - rad * 0.3, 0.4), wl(k.r, x - rad * 0.5, y + rad * 0.2, x + rad * 0.5, y + rad * 0.15, 0.4)];
    add(k, () => { fillBlob(k.c, p, col); st.forEach((q) => pen(k.c, q, '#fff', 0.5, 0.16)); });
  }
};
const dots: Style = (k, a) => {
  const s = 6.6;
  for (let j = 0; j * s < 104; j++) {
    const row: [number, number, number][] = [];
    for (let i = -1; i * s < 104; i++) row.push([i * s + (j % 2 ? s / 2 : 0) + rr(k.r, -0.4, 0.4), j * s + rr(k.r, -0.4, 0.4), 1.1 + 1.25 * (0.5 + 0.5 * Math.sin(j * 0.9 + i * 0.4))]);
    add(k, () => { for (const [x, y, rad] of row) { k.c.fillStyle = a; k.c.beginPath(); k.c.ellipse(x, y, rad, rad * 0.9, 0.4, 0, TAU); k.c.fill(); } });
  }
};
const stripes: Style = (k, a, b) => {
  const cols = [a, b, '#d9482b', '#e0b23a', '#2f8f7a', '#1c2f6b', a];
  for (let x = 0; x < 100;) {
    const w = rr(k.r, 1.3, 3.2), p = wl(k.r, x + w / 2, -2, x + w / 2, 102, 0.25), col = cols[Math.floor(k.r() * cols.length)];
    add(k, () => pen(k.c, p, col, w * 0.84));
    x += w;
  }
};
const bands: Style = (k, a, b) => {
  const th = -0.62, dx = Math.cos(th), dy = Math.sin(th);
  for (let t = -80; t < 80;) {
    const w = [0.8, 0.8, 2.4, 5.5, 8][Math.floor(k.r() * 5)], col = k.r() < 0.5 ? a : b, o = t + w / 2;
    const cx = 50 - dy * o, cy = 50 + dx * o, p = wl(k.r, cx - dx * 90, cy - dy * 90, cx + dx * 90, cy + dy * 90, 0.35, 6);
    const dry = wl(k.r, cx - dx * 90, cy - dy * 90 + w * 0.2, cx + dx * 90, cy + dy * 90 + w * 0.2, 0.5, 6);
    add(k, () => { pen(k.c, p, col, w); if (w > 2) pen(k.c, dry, '#fff', 0.35, 0.22); });
    t += w + rr(k.r, 1.2, 5);
  }
};
const stitch: Style = (k, a, b) => {
  for (let y = 2; y < 100; y += 3.5) {
    const ph = k.r() * 6, L: number[][] = [];
    for (let x = -1 + k.r() * 3; x < 101; x += 4.3) { const yy = y + Math.sin(x * 0.09 + ph) * 0.7; L.push([x, yy + rr(k.r, -0.2, 0.2), x + 2.7, yy + rr(k.r, -0.2, 0.2)]); }
    add(k, () => L.forEach((p) => pen(k.c, p, a, 0.6)));
  }
  for (let f = 0; f < 6; f++) {
    const x = rr(k.r, 8, 92), y = rr(k.r, 8, 92), rot = k.r() * TAU, P: number[][] = [];
    for (let q = 0; q < 6; q++) { const an = rot + (q / 6) * TAU; P.push([x + Math.cos(an) * 0.8, y + Math.sin(an) * 0.8, x + Math.cos(an) * 3, y + Math.sin(an) * 3]); }
    add(k, () => { P.forEach((p) => pen(k.c, p, b, 1.25)); k.c.fillStyle = a; k.c.beginPath(); k.c.arc(x, y, 0.8, 0, TAU); k.c.fill(); });
  }
};
const lattice: Style = (k, a) => {
  for (let d = -110; d < 210; d += 17) {
    const L = [wl(k.r, d, -2, d + 62, 102, 0.3, 5), wl(k.r, d + 1, -2, d + 63, 102, 0.3, 5), wl(k.r, d, -2, d - 62, 102, 0.3, 5), wl(k.r, d + 1, -2, d - 61, 102, 0.3, 5)];
    add(k, () => L.forEach((p) => pen(k.c, p, a, 0.36)));
  }
  for (let q = 0; q < 14; q++) {
    const D: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) D.push([k.r() * 100, k.r() * 100, rr(k.r, 0.2, 0.5)]);
    add(k, () => { k.c.fillStyle = a; k.c.globalAlpha = 0.55; for (const [x, y, s] of D) { k.c.beginPath(); k.c.arc(x, y, s, 0, TAU); k.c.fill(); } k.c.globalAlpha = 1; });
  }
};
const jaali: Style = (k, a) => {
  const s = 20;
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const x = i * s + (j % 2 ? 0 : s / 2) - 5, y = j * s * 0.86 + 2, L: number[][] = [];
    for (const rot of [0, Math.PI / 4]) {
      const p: number[] = [];
      for (let q = 0; q <= 4; q++) { const an = rot + q * (TAU / 4); p.push(x + Math.cos(an) * 8.4 + rr(k.r, -0.15, 0.15), y + Math.sin(an) * 8.4 + rr(k.r, -0.15, 0.15)); }
      L.push(p);
    }
    const hex: number[] = [];
    for (let q = 0; q <= 6; q++) { const an = q * (TAU / 6); hex.push(x + Math.cos(an) * 3.1, y + Math.sin(an) * 3.1); }
    add(k, () => { for (const p of L) { k.c.strokeStyle = a; k.c.lineWidth = 0.5; k.c.beginPath(); k.c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) k.c.lineTo(p[q], p[q + 1]); k.c.stroke(); } pen(k.c, hex, a, 0.4); });
  }
};
const vines: Style = (k, a) => {
  for (let v = 0; v < 4; v++) {
    const x0 = 13 + v * 25 + rr(k.r, -4, 4), ph = k.r() * 6, amp = rr(k.r, 5, 9), stem: number[] = [];
    const at = (y: number) => x0 + Math.sin(y * 0.075 + ph) * amp;
    for (let y = 104; y >= -4; y -= 5) stem.push(at(y), y);
    add(k, () => pen(k.c, stem, a, 0.7));
    for (let y = 96; y > 2; y -= 8.5) {
      const x = at(y), side = Math.round(y / 8.5) % 2 ? 1 : -1, an = side > 0 ? rr(k.r, -0.9, -0.2) : Math.PI + rr(k.r, 0.2, 0.9), L = rr(k.r, 5.5, 8);
      const ex = x + Math.cos(an) * L, ey = y + Math.sin(an) * L, nx = -Math.sin(an) * 1.9, ny = Math.cos(an) * 1.9, mx = (x + ex) / 2, my = (y + ey) / 2;
      const bud = k.r() < 0.3;
      add(k, () => {
        const c = k.c; c.strokeStyle = a; c.lineWidth = 0.45;
        if (bud) {
          pen(c, [x, y, mx, my, ex, ey], a, 0.45);
          c.beginPath(); c.arc(ex, ey, 2.7, 0, TAU); c.stroke();
          for (const t of [-0.5, 0, 0.5]) pen(c, [ex + Math.cos(an + t) * 2.7, ey + Math.sin(an + t) * 2.7, ex + Math.cos(an + t) * 4.2, ey + Math.sin(an + t) * 4.2], a, 0.45);
          for (const t of [0.8, 2.2, 3.6, 5]) pen(c, [ex + Math.cos(t) * 0.6, ey + Math.sin(t) * 0.6, ex + Math.cos(t) * 1.9, ey + Math.sin(t) * 1.9], a, 0.32);
        } else {
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx + nx, my + ny, ex, ey); c.quadraticCurveTo(mx - nx, my - ny, x, y); c.stroke();
          pen(c, [x, y, ex, ey], a, 0.3);
        }
      });
    }
  }
};
const cracks: Style = (k, a) => {
  const walk = (x: number, y: number, an: number, w: number, depth: number) => {
    const p = [x, y], kids: [number, number, number][] = [], n = 9 + Math.floor(k.r() * 9);
    for (let i = 0; i < n; i++) {
      an += rr(k.r, -0.55, 0.55); x += Math.cos(an) * 5; y += Math.sin(an) * 5; p.push(x, y);
      if (depth < 2 && k.r() < 0.24) kids.push([x, y, an + (k.r() < 0.5 ? 1 : -1) * rr(k.r, 0.6, 1.1)]);
    }
    add(k, () => pen(k.c, p, a, w));
    kids.forEach(([kx, ky, ka]) => walk(kx, ky, ka, w * 0.68, depth + 1));
  };
  for (let s = 0; s < 7; s++) { const top = s % 2 === 0; walk(rr(k.r, 5, 95), top ? -2 : 102, (top ? 1 : -1) * Math.PI / 2 + rr(k.r, -0.5, 0.5), 2.1, 0); }
};
const scallops: Style = (k, a) => {
  const sx = 9, sy = 6.6;
  for (let j = -1; j * sy < 106; j++) {
    const row: number[] = [];
    for (let i = -1; i * sx < 106; i++) row.push(i * sx + (j % 2 ? sx / 2 : 0) + rr(k.r, -0.2, 0.2));
    const y = j * sy;
    add(k, () => { const c = k.c; c.strokeStyle = a; for (const x of row) { c.lineWidth = 0.5; c.beginPath(); c.arc(x, y, sx / 2, 0, Math.PI); c.stroke(); c.lineWidth = 0.32; c.beginPath(); c.arc(x, y, sx / 3.4, 0.15, Math.PI - 0.15); c.stroke(); } });
  }
};
const curls: Style = (k, a) => {
  const s = 8.2;
  for (let j = 0; j * s < 104; j++) {
    const L: number[][] = [];
    for (let i = 0; i * s < 104; i++) {
      const x = i * s + rr(k.r, -2.4, 2.4), y = j * s + rr(k.r, -2.4, 2.4), rot = k.r() * TAU, dir = k.r() < 0.5 ? 1 : -1, p: number[] = [];
      for (let t = 0; t < 5.4; t += 0.45) { const rad = 0.4 + t * 0.44; p.push(x + Math.cos(rot + t * dir) * rad, y + Math.sin(rot + t * dir) * rad); }
      L.push(p);
    }
    add(k, () => L.forEach((p) => pen(k.c, p, a, 0.45)));
  }
};
const rings: Style = (k, a, b) => {
  let ph = k.r() * 6, n = 0;
  for (let rad = 5; rad < 118; rad += 2.3) {
    ph += rr(k.r, -0.25, 0.25);
    const p: number[] = [], amp = rr(k.r, 0.5, 1.4);
    for (let t = Math.PI * 0.96; t <= Math.PI * 2.04; t += 0.09) { const d = rad + Math.sin(t * 6 + ph) * amp + Math.sin(t * 13 + ph * 2) * amp * 0.4; p.push(50 + Math.cos(t) * d, 93 + Math.sin(t) * d); }
    const col = n++ % 4 === 3 ? b : a;
    add(k, () => pen(k.c, p, col, 0.36));
  }
};
const speckle: Style = (k, a) => {
  for (let q = 0; q < 26; q++) {
    const D: [number, number, number, number][] = [];
    for (let i = 0; i < 90; i++) D.push([k.r() * 100, k.r() * 100, rr(k.r, 0.18, 0.62), k.r() * 3]);
    add(k, () => { k.c.fillStyle = a; for (const [x, y, s, an] of D) { k.c.beginPath(); k.c.ellipse(x, y, s * 1.6, s * 0.7, an, 0, TAU); k.c.fill(); } });
  }
};
const STYLES: Record<string, Style> = { hatch, net, waves, weave, terrazzo, dots, stripes, bands, stitch, lattice, jaali, vines, cracks, scallops, curls, rings, speckle };

/* ------------------------------------------------------------------ the shapes */

interface Shape { path: Path2D; extra?: (k: K, pal: Pal) => void }

function steam(k: K, col: string, xs: number[], y0: number, y1: number) {
  for (const x of xs) {
    const p: number[] = [], ph = k.r() * 6, amp = rr(k.r, 1.6, 2.6);
    for (let y = y0; y >= y1; y -= 2.6) p.push(x + Math.sin((y0 - y) * 0.27 + ph) * amp * ((y0 - y) / (y0 - y1) + 0.25), y);
    add(k, () => pen(k.c, p, col, 1.5, 0.92));
  }
}

const SHAPES: Record<string, () => Shape> = {
  bowl: () => {
    const p = new Path2D();
    p.moveTo(11, 47); p.lineTo(89, 47); p.lineTo(89, 51.5); p.bezierCurveTo(87, 71, 73, 82, 60, 83.5); p.lineTo(62.5, 89); p.lineTo(37.5, 89); p.lineTo(40, 83.5); p.bezierCurveTo(27, 82, 13, 71, 11, 51.5); p.closePath();
    return { path: p, extra: (k, pal) => steam(k, pal[2], [36, 50, 64], 41, 13) };
  },
  pot: () => {
    const p = new Path2D();
    p.moveTo(20, 48); p.lineTo(80, 48); p.lineTo(80, 78); p.quadraticCurveTo(80, 87, 71, 87); p.lineTo(29, 87); p.quadraticCurveTo(20, 87, 20, 78); p.closePath();
    p.rect(15, 42.5, 70, 6); p.rect(7.5, 51, 9, 5); p.rect(83.5, 51, 9, 5);
    p.moveTo(23, 43); p.quadraticCurveTo(50, 27, 77, 43); p.closePath(); p.rect(46, 28.5, 8, 5);
    return { path: p, extra: (k, pal) => steam(k, pal[2], [30, 70], 25, 7) };
  },
  tiffin: () => {
    const p = new Path2D();
    for (const y of [33, 51, 69]) { p.moveTo(31, y); p.lineTo(69, y); p.lineTo(69, y + 14); p.quadraticCurveTo(69, y + 16.5, 66.5, y + 16.5); p.lineTo(33.5, y + 16.5); p.quadraticCurveTo(31, y + 16.5, 31, y + 14); p.closePath(); }
    p.rect(29, 28, 42, 4.5); p.rect(42, 15.5, 16, 4.6);
    return {
      path: p,
      extra: (k, pal) => { const h = [25, 86, 25, 30, 25, 20, 34, 20, 66, 20, 75, 20, 75, 30, 75, 86]; add(k, () => pen(k.c, h, pal[2], 2.1)); },
    };
  },
  house: () => {
    const p = new Path2D();
    p.moveTo(50, 13); p.lineTo(88, 43); p.lineTo(80.5, 43); p.lineTo(80.5, 89); p.lineTo(19.5, 89); p.lineTo(19.5, 43); p.lineTo(12, 43); p.closePath();
    return {
      path: p,
      extra: (k, pal) => add(k, () => {
        const c = k.c; c.fillStyle = pal[0]; c.fillRect(42, 57, 16, 32); c.fillRect(26, 53, 9.5, 9.5); c.fillRect(64.5, 53, 9.5, 9.5);
        c.fillStyle = pal[2]; c.beginPath(); c.arc(54.6, 74, 1, 0, TAU); c.fill();
        pen(c, [26, 57.7, 35.5, 57.7], pal[2], 0.6); pen(c, [30.7, 53, 30.7, 62.5], pal[2], 0.6); pen(c, [64.5, 57.7, 74, 57.7], pal[2], 0.6); pen(c, [69.2, 53, 69.2, 62.5], pal[2], 0.6);
      }),
    };
  },
  thali: () => {
    const p = new Path2D(); p.arc(50, 51, 39, 0, TAU);
    return {
      path: p,
      extra: (k, pal) => {
        const roti = blobPts(k.r, 45, 67, 13.5, 11);
        add(k, () => { const c = k.c; c.strokeStyle = pal[0]; c.lineWidth = 0.9; c.beginPath(); c.arc(50, 51, 34.5, 0, TAU); c.stroke(); });
        for (const [x, y, rad] of [[33, 39, 8.6], [52, 31, 8.6], [70, 43, 8.6]]) add(k, () => { const c = k.c; c.fillStyle = pal[0]; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); c.fillStyle = pal[4]; c.beginPath(); c.arc(x, y, rad - 2.6, 0, TAU); c.fill(); });
        add(k, () => { fillBlob(k.c, roti, pal[0]); for (const [x, y] of [[41, 63], [49, 70], [44, 72], [50, 62]]) { k.c.fillStyle = pal[3]; k.c.beginPath(); k.c.arc(x, y, 1.1, 0, TAU); k.c.fill(); } });
      },
    };
  },
  lamp: () => {
    const p = new Path2D();
    p.moveTo(17, 59); p.quadraticCurveTo(50, 65, 83, 59); p.bezierCurveTo(79, 79, 63, 86, 50, 86); p.bezierCurveTo(37, 86, 21, 79, 17, 59); p.closePath();
    return {
      path: p,
      extra: (k, pal) => add(k, () => {
        const c = k.c; c.fillStyle = pal[2]; c.beginPath(); c.moveTo(50, 24); c.bezierCurveTo(60, 39, 58, 53, 50, 55.5); c.bezierCurveTo(42, 53, 40, 39, 50, 24); c.fill();
        c.fillStyle = pal[0]; c.beginPath(); c.moveTo(50, 37); c.bezierCurveTo(54.2, 44, 53.4, 50.5, 50, 51.8); c.bezierCurveTo(46.6, 50.5, 45.8, 44, 50, 37); c.fill();
        for (const t of [-1.25, -0.7, 0.7, 1.25]) pen(c, [50 + Math.sin(t) * 19, 40 - Math.cos(t) * 19, 50 + Math.sin(t) * 26, 40 - Math.cos(t) * 26], pal[2], 1, 0.9);
      }),
    };
  },
};

/* ------------------------------------------------------------------ the curated ways to draw a tile */

interface Spec { pal: Pal; gs: string; fs: string }
const SPECS: Spec[] = [
  { pal: ['#efe6d0', '#c9423a', '#2f49a8', '#e9e2cf', '#c9423a'], gs: 'curls', fs: 'hatch' },
  { pal: ['#16171c', '#d9d6cc', '#e9e6dc', '#16171c', '#d9d6cc'], gs: 'net', fs: 'net' },
  { pal: ['#1f3fa0', '#d4a52c', '#f5f1e6', '#5f82d2', '#d4a52c'], gs: 'terrazzo', fs: 'rings' },
  { pal: ['#1d5b3a', '#f2b233', '#f2b233', '#f7f0e0', '#d9482b'], gs: 'stitch', fs: 'weave' },
  { pal: ['#a54a2d', '#74301c', '#f3e7da', '#b98a78', '#74301c'], gs: 'jaali', fs: 'jaali' },
  { pal: ['#f1f0ec', '#a9b1dc', '#3c4fb0', '#1f2c7c', '#a9b1dc'], gs: 'waves', fs: 'waves' },
  { pal: ['#2b46b5', '#f2ecd9', '#f2ecd9', '#2b46b5', '#f2ecd9'], gs: 'vines', fs: 'vines' },
  { pal: ['#f3ead6', '#e07a2c', '#1d1715', '#c8362c', '#1d1715'], gs: 'bands', fs: 'bands' },
  { pal: ['#152228', '#2fb3c4', '#2fb3c4', '#0f171b', '#2fb3c4'], gs: 'speckle', fs: 'cracks' },
  { pal: ['#b8963b', '#6b2a1c', '#3a0f0c', '#b8963b', '#8a6a22'], gs: 'lattice', fs: 'lattice' },
  { pal: ['#e6f0e8', '#7fae9c', '#f5f1e6', '#d9482b', '#1c2f6b'], gs: 'net', fs: 'stripes' },
  { pal: ['#f0d3ba', '#fbf4e8', '#77736e', '#c9c3ba', '#fbf4e8'], gs: 'dots', fs: 'scallops' },
  { pal: ['#12153a', '#3a4190', '#f2b141', '#12153a', '#8a5a10'], gs: 'speckle', fs: 'rings' },
  { pal: ['#ece7d8', '#55565a', '#ece7d8', '#a9a493', '#55565a'], gs: 'hatch', fs: 'net' },
  { pal: ['#efede8', '#b9b9b6', '#5b5c61', '#2c2c30', '#8d8d8d'], gs: 'weave', fs: 'weave' },
  { pal: ['#17140f', '#4a4236', '#e2812a', '#1c150f', '#4a4236'], gs: 'scallops', fs: 'curls' },
  { pal: ['#2f49a8', '#8ea2e6', '#f2ecd9', '#c9423a', '#f2ecd9'], gs: 'dots', fs: 'stitch' },
  { pal: ['#e9c7c1', '#b5564c', '#7a2f3a', '#e9c7c1', '#b5564c'], gs: 'scallops', fs: 'vines' },
];
export const SPEC_COUNT = SPECS.length;

/* ------------------------------------------------------------------ drawing a tile */

const runs = new WeakMap<HTMLCanvasElement, number>();
const widths = new WeakMap<HTMLCanvasElement, number>();
let runId = 0;
const motion = () => document.documentElement.classList.contains('fx-on');

export function drawTile(cv: HTMLCanvasElement, o: { animate?: boolean; delay?: number } = {}) {
  const size = cv.clientWidth;
  if (size < 2) return;
  widths.set(cv, size);
  const dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * dpr);
  const c = cv.getContext('2d');
  if (!c) return;
  const seed = Number(cv.dataset.seed ?? 1), spec = SPECS[((Number(cv.dataset.spec ?? seed) % SPECS.length) + SPECS.length) % SPECS.length];
  const shape = (SHAPES[cv.dataset.tile ?? 'bowl'] ?? SHAPES.bowl)();
  const empty = cv.dataset.empty !== undefined, pal = spec.pal;
  const k: K = { c, r: rng(seed * 7919 + 13), ops: [], clip: null };
  const id = ++runId;
  runs.set(cv, id);

  if (empty) {
    add(k, () => { c.fillStyle = '#1a1e52'; c.fillRect(0, 0, 100, 100); c.setLineDash([2.2, 2.2]); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.8; c.stroke(shape.path); c.setLineDash([]); });
  } else {
    add(k, () => { c.fillStyle = pal[0]; c.fillRect(0, 0, 100, 100); });
    STYLES[spec.gs](k, pal[1], pal[4]);
    k.clip = shape.path;
    add(k, () => { c.fillStyle = pal[2]; c.fillRect(0, 0, 100, 100); });
    STYLES[spec.fs](k, pal[3], pal[4]);
    k.clip = null;
    shape.extra?.(k, pal);
    const g: [number, number, number][] = [];
    for (let i = 0; i < 700; i++) g.push([k.r() * 100, k.r() * 100, k.r()]);
    add(k, () => { for (const [x, y, t] of g) { c.fillStyle = t < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'; c.fillRect(x, y, 0.5, 0.5); } });
  }

  const start = () => {
    if (runs.get(cv) !== id) return;
    cv.width = cv.height = px;
    c.setTransform(px / 100, 0, 0, px / 100, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round';
    cv.classList.add('done');
    if (!o.animate || !motion()) { k.ops.forEach((f) => f()); return; }
    const per = Math.max(1, Math.ceil(k.ops.length / 62));
    let i = 0;
    const step = () => {
      if (runs.get(cv) !== id) return;
      for (let n = 0; n < per && i < k.ops.length; n++) k.ops[i++]();
      if (i < k.ops.length) requestAnimationFrame(step);
    };
    step();
  };
  if (o.delay) setTimeout(start, o.delay); else start();
}

// Draw every tile on the page the first time it comes into view; a click draws it again another way.
export function initTiles() {
  // inner page titles get three tiles beside them
  const set = (document.body.dataset.tiles ?? 'lamp,bowl,house').split(',');
  document.querySelectorAll<HTMLElement>('.ph').forEach((ph) => {
    if (ph.querySelector('.ph-tiles')) return;
    const box = document.createElement('div');
    box.className = 'ph-tiles';
    box.setAttribute('aria-hidden', 'true');
    const base = location.pathname.length * 5;
    set.forEach((s, i) => { const cv = document.createElement('canvas'); cv.dataset.tile = s; cv.dataset.seed = String(base + i * 11 + 2); cv.dataset.spec = String(base + i * 5); box.appendChild(cv); });
    ph.appendChild(box);
  });

  const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-tile]')];
  let wave = 0, waveT = 0;
  const show = (cv: HTMLCanvasElement) => {
    // tiles that arrive together are drawn one after another
    if (cv.dataset.quick !== undefined) return drawTile(cv, { delay: motion() ? Number(cv.dataset.quick) * 6 : 0 });
    clearTimeout(waveT); waveT = window.setTimeout(() => (wave = 0), 120);
    drawTile(cv, { animate: true, delay: Math.min(wave++, 14) * 85 });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); show(e.target as HTMLCanvasElement); } }, { rootMargin: '0px 0px -4% 0px' });
    list.forEach((cv) => io.observe(cv));
  } else list.forEach((cv) => drawTile(cv));

  document.addEventListener('click', (e) => {
    const cv = (e.target as HTMLElement).closest?.('canvas[data-tile]') as HTMLCanvasElement | null;
    if (!cv || cv.dataset.empty !== undefined || cv.closest('[data-noredraw]')) return;
    const cur = Number(cv.dataset.spec ?? cv.dataset.seed ?? 0);
    cv.dataset.spec = String(cur + 1 + Math.floor(Math.random() * (SPECS.length - 1)));
    cv.dataset.seed = String(Math.floor(Math.random() * 100000));
    drawTile(cv, { animate: true });
  });

  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => list.forEach((cv) => { if (cv.classList.contains('done') && Math.abs(cv.clientWidth - (widths.get(cv) ?? 0)) > 6) drawTile(cv); }), 200);
  });
}

// Text and pictures rise into place the first time they scroll into view. Marked up with data-rv; without the
// fx-on class (reduced motion, or no script) everything is simply visible.
export function reveal() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-rv]')];
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || !motion()) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}
