// Hatch engine for /hearth. A hidden flat "reference" (colour + tag canvases) is drawn from simple shapes,
// then re-painted as thousands of short, slightly curved hatch strokes whose direction follows a per-region
// angle field with patchy changes, lit by warm/cool lights, cross-hatched in the shadows.
export type Ctx = CanvasRenderingContext2D;
export type V3 = [number, number, number];

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const sstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a)));

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeNoise(seed: number) {
  const r = rng(seed), T = new Float32Array(64 * 64);
  for (let i = 0; i < T.length; i++) T[i] = r();
  const at = (x: number, y: number) => T[((y & 63) << 6) | (x & 63)];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), xf), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
  };
}
const hash2 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function hex(h: string): V3 {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mixc = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// region kinds (tag blue channel = kind * 16)
export const K = { base: 0, fig: 1, bg: 2, fine: 3, glow: 4, flat: 5, sky: 6, prop: 7 };
const KIND_LEN = [0.95, 0.72, 1.4, 0.6, 0.8, 1, 2.1, 0.75];
const KIND_WID = [1, 0.82, 1.2, 0.8, 1, 1, 1.7, 0.85];
const KIND_CELL = [0.42, 0.14, 0.5, 0.5, 0.25, 0.3, 0.12, 0.2]; // patch angle change amplitude (rad)
const KIND_FORM = [0.55, 1, 0.12, 0.3, 0, 0, 0, 0.32];

export type Tag = { a?: number; k?: number; id?: number };
export type PathFn = (c: Ctx) => void;
type Fill = string | ((c: Ctx) => string | CanvasGradient);

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d', { willReadFrequently: true })!];
}

/** Two aligned canvases: flat colour, and a tag map (R = hatch angle, G = region id, B = kind). */
export class Ref {
  cv: HTMLCanvasElement; tv: HTMLCanvasElement; cc: Ctx; tc: Ctx; n = 0;
  constructor(public w: number, public h: number, public s: number, public ox: number, public oy: number) {
    [this.cv, this.cc] = mk(w, h); [this.tv, this.tc] = mk(w, h);
    this.cc.setTransform(s, 0, 0, s, ox, oy); this.tc.setTransform(s, 0, 0, s, ox, oy);
  }
  nid() { this.n++; return 1 + ((this.n * 37) % 254); }
  save() { this.cc.save(); this.tc.save(); }
  restore() { this.cc.restore(); this.tc.restore(); }
  tr(x: number, y: number) { this.cc.translate(x, y); this.tc.translate(x, y); }
  rot(a: number) { this.cc.rotate(a); this.tc.rotate(a); }
  sc(x: number, y = x) { this.cc.scale(x, y); this.tc.scale(x, y); }
  clip(path: PathFn) { for (const c of [this.cc, this.tc]) { path(c); c.clip(); } }
  tagStyle(t: Tag, id: number) {
    const a = t.a ?? -0.3, ab = Math.round((((a % Math.PI) + Math.PI) % Math.PI) / Math.PI * 255);
    return `rgb(${ab},${id},${(t.k ?? 0) * 16})`;
  }
  fill(path: PathFn, color: Fill, t: Tag = {}) {
    const id = t.id ?? this.nid();
    const cc = this.cc, tc = this.tc;
    cc.fillStyle = typeof color === 'function' ? color(cc) : color; path(cc); cc.fill();
    tc.fillStyle = this.tagStyle(t, id); path(tc); tc.fill();
    return id;
  }
  line(path: PathFn, width: number, color: string, t: Tag = {}) {
    const id = t.id ?? this.nid();
    for (const [c, st] of [[this.cc, color], [this.tc, this.tagStyle(t, id)]] as [Ctx, string][]) {
      c.strokeStyle = st; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; path(c); c.stroke();
    }
    return id;
  }
}

// ---- path helpers --------------------------------------------------------------------------
export const P = {
  poly: (pts: number[][]): PathFn => (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); },
  /** closed smooth blob through points */
  blob: (pts: number[][]): PathFn => (c) => {
    const n = pts.length; c.beginPath();
    const m = (i: number) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = m(n - 1); c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const q = m(i); c.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    c.closePath();
  },
  ell: (x: number, y: number, rx: number, ry: number, rot = 0): PathFn => (c) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); },
  rect: (x: number, y: number, w: number, h: number): PathFn => (c) => { c.beginPath(); c.rect(x, y, w, h); },
  rr: (x: number, y: number, w: number, h: number, r: number): PathFn => (c) => { c.beginPath(); c.roundRect(x, y, w, h, r); },
  cap: (x0: number, y0: number, x1: number, y1: number, w: number): PathFn => (c) => {
    const a = Math.atan2(y1 - y0, x1 - x0), r = w / 2; c.beginPath();
    c.arc(x0, y0, r, a + Math.PI / 2, a + Math.PI * 1.5); c.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2); c.closePath();
  },
  /** open polyline / curve helper for Ref.line */
  path: (pts: number[][]): PathFn => (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); },
  quad: (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): PathFn => (c) => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); },
};

// ---- field (read back reference data) ------------------------------------------------------
export interface Field {
  w: number; h: number; col: Uint8ClampedArray; tag: Uint8ClampedArray;
  rcx: Float32Array; rcy: Float32Array; rrx: Float32Array; rry: Float32Array; // per-region centroid and half extents
  edge: Int16Array; ne: number; // boundary samples: x, y, nx, ny, kind
}

export function* prepField(ref: Ref): Generator<void, Field> {
  const { w, h } = ref;
  const col = ref.cc.getImageData(0, 0, w, h).data; yield;
  const tag = ref.tc.getImageData(0, 0, w, h).data; yield;
  const cnt = new Float32Array(256), sx = new Float32Array(256), sy = new Float32Array(256);
  const x0 = new Float32Array(256).fill(1e9), x1 = new Float32Array(256).fill(-1e9), y0 = new Float32Array(256).fill(1e9), y1 = new Float32Array(256).fill(-1e9);
  const edge: number[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (col[i + 3] < 128) continue;
      const g = tag[i + 1];
      cnt[g]++; sx[g] += x; sy[g] += y;
      if (x < x0[g]) x0[g] = x; if (x > x1[g]) x1[g] = x; if (y < y0[g]) y0[g] = y; if (y > y1[g]) y1[g] = y;
      if ((tag[i + 2] >> 4 <= K.fig || tag[i + 2] >> 4 === K.prop) && x > 4 && y > 4 && x < w - 5 && y < h - 5) {
        let nx = 0, ny = 0;
        const d = 3;
        if (tag[(y * w + x + d) * 4 + 1] !== g) nx++;
        if (tag[(y * w + x - d) * 4 + 1] !== g) nx--;
        if (tag[((y + d) * w + x) * 4 + 1] !== g) ny++;
        if (tag[((y - d) * w + x) * 4 + 1] !== g) ny--;
        if (nx || ny) edge.push(x, y, nx * 8, ny * 8, tag[i + 2] >> 4);
      }
    }
    if ((y & 127) === 0) yield;
  }
  const rcx = new Float32Array(256), rcy = new Float32Array(256), rrx = new Float32Array(256), rry = new Float32Array(256);
  for (let g = 0; g < 256; g++) if (cnt[g]) { rcx[g] = sx[g] / cnt[g]; rcy[g] = sy[g] / cnt[g]; rrx[g] = Math.max(6, (x1[g] - x0[g]) / 2); rry[g] = Math.max(6, (y1[g] - y0[g]) / 2); }
  return { w, h, col, tag, rcx, rcy, rrx, rry, edge: Int16Array.from(edge), ne: edge.length / 5 };
}

// ---- looks ---------------------------------------------------------------------------------
export type Light = { x: number; y: number; r: number; c: V3; k: number };
export type Look = {
  amb: V3; shadow: V3; lights: Light[]; accents: V3[]; seed: number;
  mask: (u: number, v: number, x: number, y: number) => number;
  density?: number; // overall stroke density multiplier
  rim?: V3;
};

/** Ragged island silhouette. Returns > 0 inside. */
export function islandMask(seed: number, o: { px?: number; py?: number; top?: number; bot?: number; side?: number; rag?: number } = {}) {
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 7), n3 = makeNoise(seed + 13);
  const px = o.px ?? 4.2, py = o.py ?? 3.4, top = o.top ?? 0.97, bot = o.bot ?? 0.985, side = o.side ?? 0.985, rag = o.rag ?? 1;
  return (u: number, v: number, x: number, y: number) => {
    const dx = Math.abs(2 * u - 1) / side;
    const dy = 2 * v - 1; const ay = Math.abs(dy) / (dy < 0 ? top : bot);
    const s = Math.pow(dx, px) + Math.pow(ay, py);
    const edge = 1 - s;
    const up = dy < 0 ? 0.5 : 1; // calmer, softer top edge
    const wob = ((n1(x / 46, y / 34) - 0.5) * 0.34 + (n2(x / 14, y / 9) - 0.5) * 0.22 * up + (n3(x / 5, y / 26) - 0.5) * 0.16 * (dy < 0 ? 0.2 : 1)) * (dy < 0 ? 0.7 : 1);
    return edge * 0.9 + wob * rag - 0.04;
  };
}

type Pass = { role: 'block' | 'hatch' | 'detail' | 'shadow' | 'light' | 'edge' | 'fleck'; len: number; wid: number; cover: number; jit: number; alpha: [number, number]; bend: number };
const PASSES: Pass[] = [
  { role: 'block', len: 34, wid: 11, cover: 1.0, jit: 0.08, alpha: [0.96, 1], bend: 0.12 },
  { role: 'hatch', len: 17, wid: 2.3, cover: 3.3, jit: 0.13, alpha: [0.88, 1], bend: 0.22 },
  { role: 'detail', len: 9.5, wid: 1.7, cover: 2.4, jit: 0.2, alpha: [0.82, 1], bend: 0.3 },
  { role: 'shadow', len: 12, wid: 1.9, cover: 2.0, jit: 0.14, alpha: [0.75, 0.95], bend: 0.25 },
  { role: 'light', len: 11, wid: 1.8, cover: 1.4, jit: 0.14, alpha: [0.7, 0.95], bend: 0.25 },
  { role: 'edge', len: 11, wid: 2.4, cover: 0, jit: 0.15, alpha: [0.8, 1], bend: 0.2 },
  { role: 'fleck', len: 6, wid: 2.2, cover: 0.25, jit: 0.3, alpha: [0.8, 1], bend: 0.3 },
];

export const clock = { deadline: 0 };

export class Painter {
  f!: Field; lx: number[] = []; ly: number[] = []; lr: number[] = [];
  done = false; started = false; sc: number; firstMark = 0;
  constructor(public ref: Ref, public look: Look, public ctx: Ctx, public dpr: number, public onFirst?: () => void) {
    this.sc = clamp(ref.s / 0.85, 0.62, 1.25) ** 0.65;
    for (const L of look.lights) { this.lx.push(L.x * ref.s + ref.ox); this.ly.push(L.y * ref.s + ref.oy); this.lr.push(L.r * ref.s); }
  }

  private lightAt(x: number, y: number, o: Float32Array) {
    let r = this.look.amb[0], g = this.look.amb[1], b = this.look.amb[2], vx = 0, vy = 0;
    const Ls = this.look.lights;
    for (let i = 0; i < Ls.length; i++) {
      const dx = this.lx[i] - x, dy = this.ly[i] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.001, f0 = 1 - d / this.lr[i];
      if (f0 <= 0) continue;
      const f = f0 * f0 * Ls[i].k, c = Ls[i].c;
      r += c[0] * f; g += c[1] * f; b += c[2] * f;
      const wgt = f * (c[0] + c[1] + c[2]); vx += (dx / d) * wgt; vy += (dy / d) * wgt;
    }
    const m = Math.hypot(vx, vy) + 1e-6;
    o[0] = r; o[1] = g; o[2] = b; o[3] = vx / m; o[4] = vy / m; o[5] = clamp(m * 0.25, 0, 1.2);
  }

  private cell = (x: number, y: number, size: number) => {
    const ix = Math.floor((x + 0.35 * size * Math.sin(y * 0.043)) / size), iy = Math.floor((y + 0.35 * size * Math.sin(x * 0.037)) / size);
    return hash2(ix, iy) * 2 - 1;
  };

  /** march along direction until region id changes */
  private reach(x: number, y: number, ca: number, sa: number, maxLen: number, g0: number) {
    const f = this.f, w = f.w, h = f.h;
    let t = 0;
    while (t < maxLen) {
      const nt = t + 2, px = Math.round(x + ca * nt), py = Math.round(y + sa * nt);
      if (px < 0 || py < 0 || px >= w || py >= h) break;
      const i = (py * w + px) * 4;
      if (f.tag[i + 1] !== g0 || f.col[i + 3] < 128) break;
      t = nt;
    }
    return t;
  }

  private tmp = new Float32Array(6);

  /** one stroke attempt at canvas px position */
  mark(P: Pass, x: number, y: number, r: () => number, ctx = this.ctx) {
    const f = this.f, w = f.w, h = f.h;
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    const i = (yi * w + xi) * 4;
    if (f.col[i + 3] < 128) return;
    const mv = this.look.mask(x / w, y / h, x, y);
    if (mv <= 0 || r() > sstep(0, 0.1, mv)) return;
    const edgeS = lerp(0.38, 1, sstep(0, 0.26, mv));
    const g = f.tag[i + 1], kind = f.tag[i + 2] >> 4;
    let ang = (f.tag[i] / 255) * Math.PI;
    const L = this.tmp; this.lightAt(x, y, L);
    // form shading from the region centroid and the dominant light direction
    let shade = 0;
    const form = KIND_FORM[kind] ?? 0.4;
    if (form > 0) {
      const nx = clamp((x - f.rcx[g]) / f.rrx[g], -1, 1), ny = clamp((y - f.rcy[g]) / f.rry[g], -1, 1);
      shade = clamp((nx * L[3] + ny * L[4]) * 1.15 * L[5] * 1.3 + (L[5] < 0.05 ? -(nx * 0.35) : 0), -1, 1) * form;
    }
    const lit = L[5];
    // role filters
    switch (P.role) {
      case 'shadow': if (shade > -0.12 || r() > -shade * 1.4) return; break;
      case 'light': if (kind === K.glow) break; if ((shade < 0.12 && lit < 0.35) || r() > Math.max(shade, lit * 0.6) * 1.3) return; break;
      case 'fleck': if (kind === K.glow || kind === K.sky) return; break;
    }
    // angle: region angle, patchy offset, jitter
    const cellAmp = KIND_CELL[kind] ?? 0.4;
    ang += this.cell(x, y, 46 * this.sc) * cellAmp + (r() - 0.5) * 0.22;
    if (P.role === 'shadow') ang += 1.05 + (r() - 0.5) * 0.3;
    else if (P.role === 'detail') ang += (r() - 0.5) * 0.9;
    const sc = this.sc * edgeS;
    let len = P.len * (KIND_LEN[kind] ?? 1) * sc * (0.7 + 0.6 * r()), wid = P.wid * (KIND_WID[kind] ?? 1) * sc * (0.75 + 0.5 * r());
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let a = len / 2, b = len / 2;
    if (kind !== K.sky) {
      a = this.reach(x, y, ca, sa, len / 2, g); b = this.reach(x, y, -ca, -sa, len / 2, g);
      if (a + b < 2.5) { if (P.role === 'block' || r() > 0.4) { a = 1.4; b = 1.4; } }
      if (a + b < len * 0.5) wid *= clamp((a + b) / (len * 0.5), 0.55, 1);
    }
    // colour
    let cr = f.col[i], cg = f.col[i + 1], cb = f.col[i + 2];
    const j = P.jit;
    if (kind === K.glow) {
      const m = 1 + (r() - 0.35) * j * 1.6; cr *= m; cg *= m * (1 + (r() - 0.5) * 0.08); cb *= m;
    } else {
      let lr = L[0], lg = L[1], lb = L[2];
      if (P.role === 'light') { lr *= 1.25; lg *= 1.2; lb *= 1.1; }
      cr *= lr; cg *= lg; cb *= lb;
      if (shade < 0) {
        const s = -shade, sh = this.look.shadow;
        const k = 1 - 0.3 * s; cr = lerp(cr * k, cr * sh[0], s * 0.65); cg = lerp(cg * k, cg * sh[1], s * 0.65); cb = lerp(cb * k, cb * sh[2], s * 0.65);
      } else { const k = 1 + 0.2 * shade; cr *= k; cg *= k * 1.02; cb *= k * 0.96; }
      if (P.role === 'shadow') { cr *= 0.62; cg *= 0.7; cb *= 0.86; }
      if (P.role === 'light') { cr = cr * 0.9 + 34; cg = cg * 0.9 + 26; cb = cb * 0.9 + 8; }
      const m = 1 + (r() - 0.5) * j * 1.2;
      cr *= m * (1 + (r() - 0.5) * j * 0.5); cg *= m; cb *= m * (1 + (r() - 0.5) * j * 0.5);
      const acc = this.look.accents;
      if (acc.length && (P.role === 'fleck' ? true : r() < 0.05)) {
        const A = acc[(r() * acc.length) | 0], t = P.role === 'fleck' ? 0.55 : 0.22;
        cr = lerp(cr, A[0], t); cg = lerp(cg, A[1], t); cb = lerp(cb, A[2], t);
      }
    }
    const fade = 1 - sstep(0, 0.34, mv);
    if (fade > 0) { const t = Math.min(1, fade * 1.35) * (0.55 + 0.45 * r()); cr = lerp(cr, 238, t); cg = lerp(cg, 230, t); cb = lerp(cb, 212, t); }
    this.draw(ctx, x, y, ca, sa, a, b, wid, cr, cg, cb, lerp(P.alpha[0], P.alpha[1], r()) * (1 - fade * 0.4), P.bend * (r() - 0.5) * 2 * len, r() < 0.14 && wid > 2.2);
    if (!this.firstMark) { this.firstMark = performance.now(); this.onFirst?.(); }
  }

  draw(ctx: Ctx, x: number, y: number, ca: number, sa: number, a: number, b: number, wid: number, cr: number, cg: number, cb: number, alpha: number, bend: number, thread: boolean) {
    const x0 = x - ca * b, y0 = y - sa * b, x1 = x + ca * a, y1 = y + sa * a;
    const R = (v: number) => (v < 0 ? 0 : v < 168 ? v | 0 : v > 330 ? 255 : (168 + (v - 168) * 0.54) | 0);
    ctx.globalAlpha = alpha; ctx.lineWidth = wid; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgb(${R(cr)},${R(cg)},${R(cb)})`;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 - sa * bend, (y0 + y1) / 2 + ca * bend, x1, y1); ctx.stroke();
    if (thread) { // a thin lighter "thread" highlight along the stroke
      ctx.lineWidth = wid * 0.32; ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = `rgb(${R(cr * 1.12 + 14)},${R(cg * 1.1 + 12)},${R(cb * 1.08 + 8)})`;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 0.5); ctx.quadraticCurveTo((x0 + x1) / 2 - sa * bend, (y0 + y1) / 2 + ca * bend - 0.5, x1, y1 - 0.5); ctx.stroke();
    }
  }

  /** soft glow strokes around each light, additive */
  private glow(r: () => number) {
    const ctx = this.ctx, Ls = this.look.lights;
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < Ls.length; li++) {
      const L = Ls[li], n = Math.round(260 * L.k * this.look.density! * clamp(this.lr[li] / 220, 0.4, 2.2));
      for (let i = 0; i < n; i++) {
        const ang = r() * TAU, d = Math.pow(r(), 1.3) * this.lr[li] * 0.9, x = this.lx[li] + Math.cos(ang) * d, y = this.ly[li] + Math.sin(ang) * d;
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= this.f.w || yi >= this.f.h || this.f.col[(yi * this.f.w + xi) * 4 + 3] < 128) continue;
        const mv = this.look.mask(x / this.f.w, y / this.f.h, x, y); if (mv <= 0.05) continue;
        const fall = 1 - d / this.lr[li], al = 0.07 * fall * fall * (0.6 + 0.8 * r());
        const t = ang + Math.PI / 2 + (r() - 0.5) * 0.6, len = (16 + r() * 22) * this.sc;
        const R = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
        ctx.globalAlpha = al; ctx.lineWidth = (5 + r() * 5) * this.sc; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgb(${R(L.c[0] * 190)},${R(L.c[1] * 190)},${R(L.c[2] * 190)})`;
        ctx.beginPath(); ctx.moveTo(x - Math.cos(t) * len / 2, y - Math.sin(t) * len / 2); ctx.lineTo(x + Math.cos(t) * len / 2, y + Math.sin(t) * len / 2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private *edges(P: Pass, r: () => number): Generator<void> {
    const f = this.f, n = Math.round(f.ne * 1.1 * this.look.density!);
    const rim = this.look.rim ?? [255, 214, 140];
    for (let k = 0; k < n; k++) {
      if (!(k & 31) && performance.now() > clock.deadline) yield;
      const e = ((r() * f.ne) | 0) * 5; if ((f.edge[e + 4] === K.base && r() < 0.7) || (f.edge[e + 4] === K.prop && r() < 0.35)) continue; const x = f.edge[e] + (r() - 0.5) * 2, y = f.edge[e + 1] + (r() - 0.5) * 2, nx = f.edge[e + 2], ny = f.edge[e + 3];
      const nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl; // outward normal
      const i = (Math.round(y) * f.w + Math.round(x)) * 4;
      const L = this.tmp; this.lightAt(x, y, L);
      const facing = ux * L[3] + uy * L[4];
      let cr = f.col[i], cg = f.col[i + 1], cb = f.col[i + 2];
      const sh = this.look.shadow;
      if (facing > 0.35 && L[5] > 0.25) { const t = clamp(L[5] * 0.7, 0, 0.75); cr = lerp(cr * L[0], rim[0], t); cg = lerp(cg * L[1], rim[1], t); cb = lerp(cb * L[2], rim[2], t); }
      else { void sh; const q = f.edge[e + 4] === K.prop ? 0.66 : 1; cr *= lerp(1, 0.36, q); cg *= lerp(1, 0.34, q); cb *= lerp(1, 0.42, q); }
      const ang = Math.atan2(ux, -uy) + (r() - 0.5) * 0.3, len = (P.len * (0.7 + 0.6 * r())) * this.sc;
      this.draw(this.ctx, x, y, Math.cos(ang), Math.sin(ang), len / 2, len / 2, P.wid * this.sc * (0.8 + 0.4 * r()), cr, cg, cb, 0.55 + 0.4 * r(), (r() - 0.5) * 3, false);
    }
  }

  /** Paint everything, yielding when the frame budget is spent. */
  *run(): Generator<void> {
    const ref = this.ref;
    this.look.density ??= 1;
    this.f = yield* prepField(ref);
    this.ctx.save();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const area = ref.w * ref.h * 0.62 * this.look.density!;
    for (let pi = 0; pi < PASSES.length; pi++) {
      const P = PASSES[pi], r = rng(this.look.seed + pi * 977);
      if (P.role === 'edge') {
        yield* this.edges(P, r); continue;
      }
      const n = Math.ceil((P.cover * area) / (P.len * P.wid * this.sc * this.sc));
      const total = P.role === 'shadow' || P.role === 'light' ? n * 1.0 : n;
      for (let i = 0; i < total; i++) {
        const u = (0.5 + (i + 1) * 0.7548776662466927) % 1, v = (0.5 + (i + 1) * 0.5698402909980532) % 1;
        this.mark(P, u * ref.w + (r() - 0.5) * P.len * 0.5, v * ref.h + (r() - 0.5) * P.len * 0.4, r);
        if (!(i & 63) && performance.now() > clock.deadline) yield;
      }
      if (P.role === 'hatch') { this.glow(r); }
      yield;
    }
    this.ctx.restore();
    this.done = true;
  }
}

/** Drive generators with a per-frame time budget. */
export class Slicer {
  q: { g: Generator<void>; done?: () => void; tag?: string }[] = []; running = false; budget = 8; onTick?: () => void;
  add(g: Generator<void>, done?: () => void, tag?: string, front = false) { const j = { g, done, tag }; front ? this.q.unshift(j) : this.q.push(j); this.kick(); }
  bump(tag: string) { const hit = this.q.filter((j) => j.tag === tag); if (hit.length) this.q = [...hit, ...this.q.filter((j) => j.tag !== tag)]; }
  clear() { this.q.length = 0; }
  kick() { if (!this.running) { this.running = true; requestAnimationFrame(this.tick); } }
  tick = () => {
    const end = performance.now() + this.budget;
    clock.deadline = end;
    while (this.q.length && performance.now() < end) {
      const j = this.q[0];
      if (j.g.next().done) { this.q.shift(); j.done?.(); }
    }
    this.onTick?.();
    if (this.q.length) requestAnimationFrame(this.tick); else this.running = false;
  };
}
