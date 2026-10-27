// Flat reference props for the hearth scenes. Everything draws into a Ref in design coordinates.
import { P, K, TAU, rng, type Ref, type Ctx } from './engine';

export const C = {
  paper: '#f6f1e6', cream: '#efe3c4', cream2: '#e3d1a6', sage: '#98aa8c', sage2: '#7d9684', sageD: '#5f7a6c',
  teal: '#3f7b7d', teal2: '#2f6068', tealD: '#224850', brick: '#b3563c', brick2: '#9a4631', brickD: '#7a3526',
  red: '#a3302a', marig: '#eba21e', saff: '#dc8226', turm: '#c99a2e', ochre: '#c3924a', brown: '#6c4a38', brownD: '#4a3226',
  steel: '#cdd5d5', steelD: '#98a6a9', steelL: '#eef2f0', ink: '#2a211c', navy: '#2c3f5c', indigo: '#26344f', char: '#38353a',
  woodL: '#cfa26c', wood: '#a87a4c', woodD: '#7f5a3c', brass: '#c9993a', brassD: '#9b7126', brassL: '#e8c46a', leaf: '#5d7f4f',
};

export const grad = (x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => (c: Ctx) => {
  const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, col]) => g.addColorStop(t, col)); return g;
};
export const radial = (x: number, y: number, r0: number, r1: number, stops: [number, string][]) => (c: Ctx) => {
  const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([t, col]) => g.addColorStop(t, col)); return g;
};

/** running-bond brick wall inside a box; `ragged` shortens right ends */
export function bricks(r: Ref, x0: number, y0: number, x1: number, y1: number, o: { w?: number; h?: number; seed?: number; cols?: string[]; mortar?: string; fadeX?: boolean } = {}) {
  const w = o.w ?? 54, h = o.h ?? 21, R = rng(o.seed ?? 5), cols = o.cols ?? [C.brick, C.brick2, '#a85a42', '#8f4b38', '#b96a4a', '#a0503a'];
  r.fill(P.rect(x0, y0, x1 - x0, y1 - y0), o.mortar ?? '#bfae88', { k: K.fine, a: 0 });
  for (let j = 0, y = y0; y < y1 - 2; j++, y += h) {
    const off = (j % 2) * (w / 2);
    for (let x = x0 - off; x < x1; x += w) {
      const bx = Math.max(x0, x + 1.5), bw = Math.min(x1, x + w - 1.5) - bx;
      if (bw < 8) continue;
      if (o.fadeX && R() < (x - x0) / (x1 - x0) * 0.55 && x > x0 + (x1 - x0) * 0.6) continue;
      r.fill(P.rect(bx, y + 1.5, bw, h - 3), cols[(R() * cols.length) | 0], { k: K.fine, a: (R() - 0.5) * 0.3 });
    }
  }
}

export function marigolds(r: Ref, pts: [number, number][], o: { n?: number; sz?: number; seed?: number; hang?: boolean } = {}) {
  // pts: control points of a quadratic (3 points). draws string + blossoms
  const [a, b, c] = pts, R = rng(o.seed ?? 3), n = o.n ?? 20, sz = o.sz ?? 7.5;
  r.line(P.quad(a[0], a[1], b[0], b[1], c[0], c[1]), 2.2, '#5a6b3e', { k: K.fine, a: 0 });
  const at = (t: number): [number, number] => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
  for (let i = 0; i <= n; i++) {
    const [x, y] = at(i / n);
    if (R() < 0.35) r.fill(P.ell(x + (R() - 0.5) * 6, y - 3, sz * 0.55, sz * 0.3, R() - 0.5), C.leaf, { k: K.fine, a: 0.4 });
    const col = R() < 0.55 ? C.marig : R() < 0.6 ? C.saff : '#f2c24a';
    r.fill(P.ell(x, y + sz * 0.25, sz * (0.9 + R() * 0.25), sz * (0.85 + R() * 0.2)), col, { k: K.fine, a: R() * 3 });
    if (R() < 0.28) r.fill(P.ell(x + 1, y + sz * 0.15, sz * 0.38, sz * 0.38), '#b2481c', { k: K.fine, a: 1 });
    if (o.hang && i % 3 === 1) { // short hanging strands
      const L = 10 + R() * 22;
      for (let k = 0; k < Math.floor(L / 8); k++) r.fill(P.ell(x, y + 6 + k * 8, sz * 0.7, sz * 0.7), k % 2 ? C.saff : C.marig, { k: K.fine, a: 1 });
    }
  }
}

export function bulbs(r: Ref, pts: [number, number][], n: number, o: { sz?: number; seed?: number; col?: string } = {}) {
  const [a, b, c] = pts, R = rng(o.seed ?? 9), sz = o.sz ?? 6;
  r.line(P.quad(a[0], a[1], b[0], b[1], c[0], c[1]), 1.6, '#2c2824', { k: K.fine, a: 0 });
  const out: [number, number][] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n, x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1];
    r.fill(P.rect(x - 1.5, y, 3, 5), '#2c2824', { k: K.fine, a: 1.5 });
    r.fill(P.ell(x, y + 5 + sz * 0.8, sz * 0.8, sz), o.col ?? (R() < 0.5 ? '#ffd27a' : '#ffbd5a'), { k: K.glow, a: 1.2 });
    out.push([x, y + 5 + sz * 0.8]);
  }
  return out;
}

const cyl = (x0: number, x1: number, c0: string, c1: string, hi: string) => grad(x0, 0, x1, 0, [[0, c1], [0.2, hi], [0.55, c0], [1, c1]]);

export function steelPot(r: Ref, x: number, base: number, w: number, h: number, o: { brass?: boolean; dark?: boolean; lid?: boolean; food?: string } = {}) {
  const c0 = o.dark ? '#6a727a' : o.brass ? C.brass : C.steel, c1 = o.dark ? '#363c42' : o.brass ? C.brassD : C.steelD, hi = o.dark ? '#c3ccd1' : o.brass ? C.brassL : C.steelL;
  const top = base - h, rx = w / 2, id = r.nid();
  const body = cyl(x - rx, x + rx, c0, c1, hi);
  r.fill(P.rect(x - rx, top, w, h - 8), body, { k: K.prop, a: 0.04, id });
  r.fill(P.ell(x, base - 8, rx, 10), body, { k: K.prop, a: 0.04, id });
  r.fill(P.rect(x - rx, top + h * 0.5, w, h * 0.07), c1, { k: K.prop, a: 0.04, id: r.nid() });
  r.line(P.quad(x - rx, top + h * 0.12, x - rx - 26, top + h * 0.2, x - rx, top + h * 0.4), 6, c1, { k: K.prop, a: 1.4 });
  r.line(P.quad(x + rx, top + h * 0.12, x + rx + 26, top + h * 0.2, x + rx, top + h * 0.4), 6, c1, { k: K.prop, a: 1.4 });
  r.fill(P.ell(x, top, rx + 3, 12), hi, { k: K.prop, a: 0.04 });
  if (o.lid) {
    r.fill(P.ell(x, top - 3, rx - 3, 11), c0, { k: K.prop, a: 0.04 });
    r.fill(P.ell(x, top - 14, 8, 8), c1, { k: K.prop, a: 1 });
  } else {
    r.fill(P.ell(x, top + 1, rx - 5, 9), '#3b2a18', { k: K.fine, a: 0.05 });
    r.fill(P.ell(x, top + 2, rx - 11, 6), o.food ?? '#d9a13a', { k: K.fine, a: 0.1 });
  }
}

/** stack of steel tiffin tiers with a clip bar and carry handle; (x, base) bottom centre */
export function tiffin(r: Ref, x: number, base: number, w: number, tiers = 3, o: { th?: number; tint?: string; lid?: number } = {}) {
  const th = o.th ?? w * 0.4, top = base - th * tiers - (o.lid ?? 0);
  const body = cyl(x - w / 2, x + w / 2, o.tint ?? C.steel, C.steelD, C.steelL);
  for (let i = 0; i < tiers; i++) {
    const y = base - th * (i + 1);
    r.fill(P.rr(x - w / 2, y + 1 - (i === tiers - 1 ? (o.lid ?? 0) : 0), w, th - 1, th * 0.22), body, { k: K.prop, a: 0.05 });
    r.fill(P.rect(x - w / 2 + 1, y + th - 3 - (i === tiers - 1 ? (o.lid ?? 0) : 0), w - 2, 3), '#6f7e82', { k: K.fine, a: 0 });
  }
  r.fill(P.rect(x + w / 2 - 7, top + 3, 4, base - top - 6), '#6f7e82', { k: K.fine, a: 1.57 });
  r.line(P.quad(x - w * 0.34, top + 2, x, top - th * 1.0, x + w * 0.34, top + 2), 3.4, '#6f7e82', { k: K.fine, a: 0 });
  r.fill(P.ell(x, top - th * 0.04, w * 0.1, th * 0.1), '#6f7e82', { k: K.fine, a: 0 });
  return { top, x };
}

/** stainless prep counter: top strip, front panel, an undershelf with hotel pans */
export function steelCounter(r: Ref, x0: number, x1: number, top: number, base: number, o: { pans?: boolean; seed?: number } = {}) {
  const R = rng(o.seed ?? 4);
  r.fill(P.rect(x0, top + 10, x1 - x0, base - top - 10), grad(0, top, 0, base, [[0, '#b9c3c6'], [0.5, '#9aa7ab'], [1, '#7e8c91']]), { k: K.prop, a: 0.02 });
  r.fill(P.rect(x0 - 4, top, x1 - x0 + 8, 12), grad(0, top, 0, top + 12, [[0, '#f0f4f2'], [1, '#c3cdcf']]), { k: K.prop, a: 0 });
  r.fill(P.rect(x0 + 8, top + 26, x1 - x0 - 16, 3), '#6f7e82', { k: K.fine, a: 0 });
  if (o.pans !== false) {
    r.fill(P.rect(x0 + 10, top + 34, x1 - x0 - 20, base - top - 44), '#3a4247', { k: K.fine, a: 0 });
    for (let x = x0 + 16; x < x1 - 60; x += 64) {
      r.fill(P.rect(x, base - 32, 56, 22), '#c9d1d3', { k: K.prop, a: 0 });
      r.fill(P.rect(x + 3, base - 36, 50, 8), ['#d8a238', '#b8503a', '#6d9a5c', '#e7d9a8'][(R() * 4) | 0], { k: K.fine, a: 0.1 });
    }
  }
  r.fill(P.rect(x0 + 2, base - 4, 8, 8), '#59646a', { k: K.fine, a: 0 }); r.fill(P.rect(x1 - 10, base - 4, 8, 8), '#59646a', { k: K.fine, a: 0 });
}

export function hotelPans(r: Ref, x: number, base: number, w: number, n = 3, cols: string[] = ['#d8a238', '#b8503a', '#6d9a5c']) {
  for (let i = 0; i < n; i++) {
    const y = base - i * 15;
    r.fill(P.rect(x - w / 2, y - 14, w, 14), grad(0, y - 14, 0, y, [[0, '#e3e9e8'], [1, '#98a6a9']]), { k: K.prop, a: 0 });
    if (i === n - 1) r.fill(P.rect(x - w / 2 + 3, y - 18, w - 6, 6), cols[(i + 1) % cols.length], { k: K.fine, a: 0.1 });
  }
}

export function crate(r: Ref, x: number, base: number, w: number, h: number, produce: string, o: { leafy?: boolean } = {}) {
  r.fill(P.rect(x - w / 2, base - h, w, h), '#b78a55', { k: K.prop, a: 0 });
  for (let k = 1; k < 3; k++) r.fill(P.rect(x - w / 2, base - h + (h * k) / 3 - 1.5, w, 3), '#7f5a3c', { k: K.fine, a: 0 });
  r.fill(P.rect(x - w / 2 - 2, base - h - 2, w + 4, 5), '#8f6a42', { k: K.fine, a: 0 });
  const n = Math.floor(w / 15);
  for (let i = 0; i < n; i++) r.fill(P.ell(x - w / 2 + 9 + i * (w - 18) / Math.max(1, n - 1), base - h - 6 - (i % 2) * 4, 9, o.leafy ? 12 : 8.5), produce, { k: K.fine, a: i });
}

export function whiteboard(r: Ref, x: number, y: number, w: number, h: number) {
  r.fill(P.rr(x - 6, y - 6, w + 12, h + 12, 5), '#9aa7ab', { k: K.prop, a: 0 });
  r.fill(P.rect(x, y, w, h), '#f3f0e6', { k: K.fine, a: 0.1 });
  r.fill(P.rect(x, y, w, 22), '#a8382b', { k: K.fine, a: 0 });
  const R = rng(9);
  for (let i = 0; i < 4; i++) {
    const yy = y + 40 + i * ((h - 52) / 4);
    r.line(P.path([[x + 12, yy], [x + w - 12, yy]]), 1.8, '#9aa0a0', { k: K.fine, a: 0 });
    r.fill(P.ell(x + 22, yy - 8, 6, 6), ['#a8382b', '#3f7b7d', '#eba21e', '#3f7b7d'][i], { k: K.fine, a: 0 });
    for (let k = 0; k < 3; k++) r.fill(P.rect(x + 40 + k * ((w - 60) / 3), yy - 15, 18 + R() * 20, 7), '#cbd0cf', { k: K.fine, a: 0 });
  }
  r.fill(P.rect(x + w - 44, y + h - 40, 30, 30), '#f2c24a', { k: K.fine, a: 0.3 });
  r.fill(P.rect(x + 14, y + h - 18, w - 80, 6), '#6f7e82', { k: K.fine, a: 0 });
}

export function tiles(r: Ref, x0: number, y0: number, x1: number, y1: number, w: number, h: number, a: string, b: string) {
  r.fill(P.rect(x0, y0, x1 - x0, y1 - y0), '#b9b4a0', { k: K.fine, a: 0 });
  let j = 0;
  for (let y = y0; y < y1; y += h, j++) for (let x = x0 + (j % 2) * (w / 2) - w / 2; x < x1; x += w) {
    const bx = Math.max(x0, x + 1.5), bw = Math.min(x1, x + w - 1.5) - bx;
    if (bw > 4) r.fill(P.rect(bx, y + 1.5, bw, h - 3), (((x / w) | 0) + j) % 3 ? a : b, { k: K.fine, a: 0 });
  }
}

export function box(r: Ref, x: number, base: number, w: number, h: number, col: string, lid = C.cream) {
  r.fill(P.rect(x - w / 2, base - h, w, h), col, { k: K.base, a: 0.05 });
  r.fill(P.rect(x - w / 2 - 2, base - h - 4, w + 4, 8), lid, { k: K.base, a: 0 });
  r.fill(P.rect(x - 1.5, base - h, 3, h), '#00000022' as string, { k: K.fine, a: 1.57 });
}

export function thali(r: Ref, x: number, y: number, w: number, o: { food?: boolean; cols?: string[] } = {}) {
  r.fill(P.ell(x, y, w / 2, w * 0.14), C.steelD, { k: K.prop, a: 0 });
  r.fill(P.ell(x, y - 1, w / 2 - 3, w * 0.12), C.steel, { k: K.prop, a: 0 });
  if (o.food !== false) {
    const cols = o.cols ?? ['#e7c35a', '#f2ead0', '#c9893a'];
    r.fill(P.ell(x - w * 0.2, y - 2, w * 0.17, w * 0.07), cols[0], { k: K.fine, a: 0.2 });
    r.fill(P.ell(x + w * 0.12, y - 2, w * 0.2, w * 0.08), cols[1], { k: K.fine, a: 0.1 });
    r.fill(P.ell(x, y - 4, w * 0.14, w * 0.06), cols[2], { k: K.fine, a: 0.1 });
  }
}

export function rotiStack(r: Ref, x: number, y: number, w: number, n = 3) {
  for (let i = 0; i < n; i++) r.fill(P.ell(x, y - i * 5, w / 2, w * 0.13), i % 2 ? '#e8cf92' : '#f0dba5', { k: K.fine, a: 0.1 * i });
  r.fill(P.ell(x + w * 0.1, y - (n - 1) * 5, w * 0.12, w * 0.05), '#b98a42', { k: K.fine, a: 0.3 });
}

export function diya(r: Ref, x: number, y: number, s = 1) {
  r.fill(P.blob([[x - 11 * s, y - 4 * s], [x, y - 7 * s], [x + 11 * s, y - 4 * s], [x + 7 * s, y + 5 * s], [x - 7 * s, y + 5 * s]]), '#b8603a', { k: K.base, a: 0.1 });
  r.fill(P.ell(x, y - 4 * s, 9 * s, 2.5 * s), '#7a3a22', { k: K.fine, a: 0 });
  r.fill(P.ell(x, y - 11 * s, 3.2 * s, 6.5 * s), '#ffd05a', { k: K.glow, a: 1.57 });
  r.fill(P.ell(x, y - 9.5 * s, 1.5 * s, 3.4 * s), '#fff0b8', { k: K.glow, a: 1.57 });
}

/** chalk rangoli: radial petals + dots on a foreshortened ellipse */
export function rangoli(r: Ref, cx: number, cy: number, rx: number, ry: number, seed = 4) {
  const R = rng(seed), cols = ['#f3eadb', C.marig, C.red, '#3a8a86', '#f3eadb'];
  r.save(); r.tr(cx, cy); r.sc(1, ry / rx);
  r.fill(P.ell(0, 0, rx, rx), '#a8432f', { k: K.fine, a: 0 });
  r.fill(P.ell(0, 0, rx * 0.93, rx * 0.93), '#f3ead6', { k: K.fine, a: 0 });
  const petals = (n: number, r0: number, len: number, wid: number, col: string, rot = 0) => {
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; r.fill(P.ell(Math.cos(a) * r0, Math.sin(a) * r0, len, wid, a), col, { k: K.fine, a: a * 0.5 }); }
  };
  petals(12, rx * 0.72, rx * 0.22, rx * 0.1, cols[1]);
  petals(12, rx * 0.72, rx * 0.12, rx * 0.05, cols[0], 0.26);
  petals(8, rx * 0.48, rx * 0.18, rx * 0.09, cols[2], 0.2);
  petals(8, rx * 0.48, rx * 0.1, rx * 0.04, cols[0], 0.2);
  petals(6, rx * 0.26, rx * 0.12, rx * 0.06, cols[3]);
  r.fill(P.ell(0, 0, rx * 0.11, rx * 0.11), cols[1], { k: K.fine, a: 0 });
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; r.fill(P.ell(Math.cos(a) * rx * 0.9, Math.sin(a) * rx * 0.9, rx * 0.03, rx * 0.03), cols[i % 2 ? 0 : 2], { k: K.fine, a: 0 }); }
  void R;
  r.restore();
}

export function windowFrame(r: Ref, x: number, y: number, w: number, h: number, sky: [number, string][], o: { sill?: boolean; cols?: number; rows?: number; frame?: string; skyline?: boolean; seed?: number } = {}) {
  const f = o.frame ?? '#e9dcb8', b = 9;
  r.fill(P.rect(x - b, y - b, w + 2 * b, h + 2 * b), f, { k: K.base, a: 0.05 });
  const id = r.fill(P.rect(x, y, w, h), grad(0, y, 0, y + h, sky), { k: K.glow, a: 0.12 });
  if (o.skyline) {
    const R = rng(o.seed ?? 8); let px = x;
    while (px < x + w) {
      const bw = 26 + R() * 40, bh = 20 + R() * 60;
      r.fill(P.rect(px, y + h - bh, Math.min(bw, x + w - px), bh), '#2c3550', { k: K.fine, a: 1.57 });
      for (let k = 0; k < 3; k++) if (R() < 0.55) r.fill(P.rect(px + 5 + R() * (bw - 14), y + h - bh + 6 + R() * (bh - 14), 4, 5), R() < 0.5 ? '#ffc766' : '#ffdf9a', { k: K.glow, a: 0 });
      px += bw;
    }
  }
  void id;
  const cols = o.cols ?? 2, rows = o.rows ?? 2;
  for (let i = 1; i < cols; i++) r.fill(P.rect(x + (w * i) / cols - 3, y, 6, h), f, { k: K.fine, a: 1.57 });
  for (let i = 1; i < rows; i++) r.fill(P.rect(x, y + (h * i) / rows - 3, w, 6), f, { k: K.fine, a: 0 });
  if (o.sill !== false) r.fill(P.rect(x - b - 14, y + h + b - 2, w + 2 * b + 28, 13), '#d6c59b', { k: K.base, a: 0 });
}

export function woodTable(r: Ref, x0: number, x1: number, top: number, front: number, legBase: number, o: { cloth?: string; clothTrim?: string; legs?: boolean } = {}) {
  if (o.cloth) {
    r.fill(P.rect(x0, top, x1 - x0, 12), '#e8dcc0', { k: K.base, a: 0 });
    r.fill(P.poly([[x0, top + 10], [x1, top + 10], [x1 + 8, legBase], [x0 - 8, legBase]]), o.cloth, { k: K.bg, a: 1.5 });
    if (o.clothTrim) r.fill(P.poly([[x0 - 6, legBase - 22], [x1 + 6, legBase - 22], [x1 + 8, legBase - 12], [x0 - 8, legBase - 12]]), o.clothTrim, { k: K.fine, a: 0 });
    return;
  }
  r.fill(P.rect(x0, top, x1 - x0, front - top), C.woodL, { k: K.base, a: 0.02 });
  r.fill(P.rect(x0, front - 2, x1 - x0, 20), C.wood, { k: K.base, a: 0.02 });
  if (o.legs !== false) {
    r.fill(P.rect(x0 + 8, front + 16, 16, legBase - front - 16), C.woodD, { k: K.base, a: 1.57 });
    r.fill(P.rect(x1 - 24, front + 16, 16, legBase - front - 16), C.woodD, { k: K.base, a: 1.57 });
  }
}
