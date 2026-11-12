// Still, generative paintings for the site. Every <canvas data-art="..."> is painted once from a fixed seed with
// thousands of short brush dabs, so the art is identical on every visit and the painting itself never moves. It is only repainted
// when the canvas changes width. The site tells one Saturday: a sleeping street with one kitchen light before dawn,
// the pot, the packing table, the delivery route, the shared table, and the same street at dusk with every window lit.

type C = CanvasRenderingContext2D;
type R = () => number;
type HSL = [number, number, number];
interface P { ctx: C; w: number; h: number; r: R }

// The few places where the finished painting is allowed to breathe: stars, lamps, lit windows and kitchen steam.
// Painters note them here (in canvas px) and paintAll lays a small CSS-only layer over the canvas. The painting itself
// is never redrawn. Nothing is added when the visitor prefers reduced motion.
interface Spot { k: 'star' | 'lamp' | 'win' | 'steam'; x: number; y: number; s: number }
let spots: Spot[] = [];

export const rng = (seed: number): R => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;
const tone = (r: R, [h, s, l]: HSL, dl = 4, dh = 3, a = 1) => hsl(h + (r() - 0.5) * 2 * dh, s, l + (r() - 0.5) * 2 * dl, a);
const rr = (r: R, a: number, b: number) => a + r() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function dab(c: C, x: number, y: number, len: number, wid: number, ang: number, col: string) {
  const dx = (Math.cos(ang) * len) / 2, dy = (Math.sin(ang) * len) / 2;
  c.strokeStyle = col;
  c.lineWidth = wid;
  c.beginPath();
  c.moveTo(x - dx, y - dy);
  c.lineTo(x + dx, y + dy);
  c.stroke();
}

function disc(c: C, x: number, y: number, rad: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, rad, 0, Math.PI * 2);
  c.fill();
}

function glow(c: C, x: number, y: number, rad: number, col: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, col.replace('A', String(a)));
  g.addColorStop(1, col.replace('A', '0'));
  c.fillStyle = g;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

// Solid base plus a layer of dabs inside a rectangle: walls, counters, planks.
function texRect(p: P, x: number, y: number, w: number, h: number, base: HSL, o: { len?: number; wid?: number; ang?: number; aj?: number; dl?: number; dens?: number; a?: number } = {}) {
  const { ctx: c, r } = p;
  c.fillStyle = hsl(...base);
  c.fillRect(x, y, w, h);
  const n = Math.round(((w * h) / 100) * (o.dens ?? 0.5));
  const len = o.len ?? 9, wid = o.wid ?? 2.4, ang = o.ang ?? Math.PI / 2, aj = o.aj ?? 0.15;
  for (let i = 0; i < n; i++) {
    const L = len * rr(r, 0.6, 1.3);
    const px = x + L / 3 + r() * Math.max(0, w - (L * 2) / 3), py = y + L / 3 + r() * Math.max(0, h - (L * 2) / 3);
    dab(c, px, py, L, wid * rr(r, 0.7, 1.2), ang + (r() - 0.5) * 2 * aj, tone(r, base, o.dl ?? 3, 2, o.a ?? 0.8));
  }
}

// Dabs that follow a ring, for steel rims seen from above. Light comes from the top left.
function ring(p: P, x: number, y: number, r0: number, r1: number, base: HSL, shine = 18, dens = 1) {
  const { ctx: c, r } = p;
  c.fillStyle = hsl(...base);
  c.beginPath();
  c.arc(x, y, r1, 0, Math.PI * 2);
  c.arc(x, y, r0, 0, Math.PI * 2, true);
  c.fill();
  const n = Math.round(((Math.PI * (r1 * r1 - r0 * r0)) / 30) * dens);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = rr(r, r0 + 1, r1 - 1);
    const lit = Math.cos(a + Math.PI * 0.75) * shine;
    dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d, rr(r, 4, 9), rr(r, 1.4, 2.6), a + Math.PI / 2, hsl(base[0], base[1], clamp(base[2] + lit + (r() - 0.5) * 8, 4, 97), 0.85));
  }
}

// Dabs scattered inside a circle, optionally swirling.
function fillDisc(p: P, x: number, y: number, rad: number, base: HSL, o: { swirl?: number; len?: number; wid?: number; dens?: number; dl?: number; dh?: number; a?: number } = {}) {
  const { ctx: c, r } = p;
  disc(c, x, y, rad, hsl(...base));
  const n = Math.round(((Math.PI * rad * rad) / 26) * (o.dens ?? 1));
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 0.94;
    const ang = o.swirl === undefined ? r() * Math.PI : a + Math.PI / 2 + o.swirl;
    dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d, (o.len ?? 6) * rr(r, 0.6, 1.4), (o.wid ?? 2.2) * rr(r, 0.7, 1.2), ang, tone(r, base, o.dl ?? 6, o.dh ?? 3, o.a ?? 0.85));
  }
}

function lerpHex(stops: string[], t: number): [number, number, number] {
  const s = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  const a = parseInt(stops[i].slice(1), 16), b = parseInt(stops[i + 1].slice(1), 16);
  const ch = (v: number, k: number) => (v >> k) & 255;
  return [0, 8, 16].reverse().map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * f)) as [number, number, number];
}

/* ------------------------------------------------------------------ street */

interface Street {
  sky: string[]; rows: [HSL, HSL, HSL]; lit: number; ground: number; scale?: number;
  stars?: boolean; moon?: boolean; kitchen?: number; win?: HSL;
}

function street(p: P, o: Street) {
  const { ctx: c, w, h, r } = p;
  const u = clamp(w / 1300, 0.62, 1.2) * (o.scale ?? 1);
  const y0 = h - o.ground;

  // sky: a gradient brushed over with long, nearly level strokes
  const g = c.createLinearGradient(0, 0, 0, y0);
  o.sky.forEach((s, i) => g.addColorStop(i / (o.sky.length - 1), s));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const ns = Math.round((w * y0) / 260);
  for (let i = 0; i < ns; i++) {
    const y = r() * y0, [R, G, B] = lerpHex(o.sky, y / y0), j = (r() - 0.5) * 16;
    dab(c, r() * w, y, rr(r, 26, 80) * u, rr(r, 2, 5) * u, (r() - 0.5) * 0.08, `rgba(${R + j},${G + j},${B + j * 1.3},0.4)`);
  }

  if (o.stars) {
    const n = Math.round((w * y0) / 2600);
    for (let i = 0; i < n; i++) {
      const y = Math.pow(r(), 1.6) * (y0 - 160 * u);
      const sx = r() * w;
      disc(c, sx, y, rr(r, 0.5, 1.35), hsl(220, 40, 92, rr(r, 0.25, 0.9)));
      if (i % 7 === 0 && spots.length < 60) spots.push({ k: 'star', x: sx, y, s: 2 + (i % 3) * 0.6 });
    }
  }
  if (o.moon) {
    const mx = w * 0.82, my = Math.min(h * 0.17, 150), mr = 17 * u;
    c.globalCompositeOperation = 'lighter';
    glow(c, mx, my, 120 * u, 'hsla(45,60%,70%,A)', 0.12);
    c.globalCompositeOperation = 'source-over';
    const m = document.createElement('canvas');
    m.width = m.height = Math.ceil(mr * 2 + 4);
    const mc = m.getContext('2d')!;
    disc(mc, mr + 2, mr + 2, mr, 'hsl(46,70%,88%)');
    mc.globalCompositeOperation = 'destination-out';
    disc(mc, mr + 2 + mr * 0.5, mr + 2 - mr * 0.22, mr * 0.92, '#000');
    c.drawImage(m, mx - mr - 2, my - mr - 2);
  }

  const lights: [number, number, number][] = [];
  const winOff = o.win ?? [232, 22, 20];

  // one house: body, roof, a grid of windows, sometimes a door
  const house = (x: number, bw: number, bh: number, col: HSL, roof: number, wscale: number, near: boolean) => {
    const top = y0 - bh;
    texRect(p, x, top, bw, bh + 2, col, { len: 8 * u, wid: 2.2 * u, dens: 0.35, dl: 2.5 });
    c.fillStyle = hsl(...col);
    if (roof === 0) {
      const rh = bw * rr(r, 0.26, 0.4);
      c.beginPath(); c.moveTo(x - 3 * u, top + 1); c.lineTo(x + bw / 2, top - rh); c.lineTo(x + bw + 3 * u, top + 1); c.fill();
    } else if (roof === 1) {
      c.fillRect(x - 2 * u, top - 4 * u, bw + 4 * u, 5 * u);
    } else {
      const rh = bw * 0.18;
      c.beginPath(); c.moveTo(x - 3 * u, top + 1); c.lineTo(x + bw * 0.22, top - rh); c.lineTo(x + bw * 0.78, top - rh); c.lineTo(x + bw + 3 * u, top + 1); c.fill();
    }
    const ww = 7 * u * wscale, wh = 9 * u * wscale, gx = 9 * u * wscale, gy = 11 * u * wscale;
    const cols = Math.max(1, Math.floor((bw - gx) / (ww + gx))), rows = Math.max(1, Math.floor((bh - gy * (near ? 2.2 : 1)) / (wh + gy)));
    const ox = x + (bw - (cols * ww + (cols - 1) * gx)) / 2;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (r() < 0.12) continue;
      const wx = ox + i * (ww + gx), wy = top + gy + j * (wh + gy);
      if (r() < o.lit) {
        c.fillStyle = hsl(rr(r, 36, 46), 92, rr(r, 62, 74));
        lights.push([wx + ww / 2, wy + wh / 2, 1]);
      } else c.fillStyle = tone(r, winOff, 3, 2);
      c.fillRect(wx, wy, ww, wh);
    }
    if (near && bw > 40 * u && r() < 0.6) {
      const dw = 9 * u, dh = 15 * u, dx = x + rr(r, 0.2, 0.7) * (bw - dw);
      const on = r() < o.lit * 0.6;
      c.fillStyle = on ? hsl(38, 85, 60) : tone(r, winOff, 3, 2);
      c.fillRect(dx, y0 - dh, dw, dh);
      if (on) lights.push([dx + dw / 2, y0 - dh / 2, 0.8]);
    }
  };

  const palm = (x: number, ht: number, col: HSL) => {
    const lean = (r() - 0.5) * 0.5, tx = x + Math.sin(lean) * ht, ty = y0 - ht;
    for (let t = 0; t <= 1; t += 0.03) dab(c, x + (tx - x) * t + Math.sin(t * 3) * 2 * u, y0 - ht * t, 4 * u, 3.2 * u * (1.2 - t * 0.5), Math.PI / 2, tone(r, col, 2, 1));
    for (let f = 0; f < 9; f++) {
      const a = -Math.PI / 2 + (f / 8 - 0.5) * Math.PI * 1.5 + (r() - 0.5) * 0.3, L = rr(r, 18, 28) * u;
      for (let t = 0; t <= 1; t += 0.08) {
        const ang = a + t * t * 1.1 * Math.sign(Math.cos(a) || 1);
        dab(c, tx + Math.cos(a) * L * t, ty + Math.sin(a) * L * t + t * t * 10 * u, 5 * u, 2.6 * u * (1.1 - t * 0.6), ang, tone(r, col, 2, 1));
      }
    }
  };

  const tree = (x: number, rad: number, col: HSL) => {
    c.fillStyle = hsl(...col);
    c.fillRect(x - 2 * u, y0 - rad, 4 * u, rad);
    const n = Math.round(rad * rad * 0.5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      dab(c, x + Math.cos(a) * d, y0 - rad * 1.3 + Math.sin(a) * d * 0.8, 5 * u, 3 * u, r() * Math.PI, tone(r, col, 2.5, 1));
    }
  };

  // three rows of the neighborhood, far to near
  const rowsSpec = [
    { col: o.rows[0], minW: 34, maxW: 70, minH: 70, maxH: 150, ws: 0.8, roof: [1, 1, 2, 0], near: false },
    { col: o.rows[1], minW: 44, maxW: 86, minH: 46, maxH: 92, ws: 0.95, roof: [0, 0, 2, 1], near: false },
    { col: o.rows[2], minW: 54, maxW: 104, minH: 34, maxH: 66, ws: 1.05, roof: [0, 2, 0, 1], near: true },
  ];
  let kitchenX = o.kitchen === undefined ? -1 : o.kitchen * w;
  rowsSpec.forEach((s, ri) => {
    let x = -rr(r, 10, 40) * u;
    while (x < w + 20) {
      const bw = rr(r, s.minW, s.maxW) * u;
      if (ri === 2 && kitchenX >= 0 && x + bw > kitchenX - 70 * u) {
        // the kitchen: a wider low building with one big lit window, a lit door and steam from the vent
        const kw = 150 * u, kh = 74 * u, kx = kitchenX - kw / 2;
        house(kx, kw, kh, s.col, 1, 1, false);
        const bwx = kx + 22 * u, bwy = y0 - kh + 18 * u, bww = 58 * u, bwh = 30 * u;
        c.fillStyle = hsl(42, 95, 70);
        c.fillRect(bwx, bwy, bww, bwh);
        c.fillStyle = hsl(36, 90, 58);
        for (let k = 1; k < 3; k++) c.fillRect(bwx + (bww * k) / 3 - 1 * u, bwy, 2 * u, bwh);
        c.fillRect(bwx, bwy + bwh / 2 - 1 * u, bww, 2 * u);
        c.fillStyle = hsl(40, 92, 66);
        c.fillRect(kx + kw - 40 * u, y0 - 26 * u, 15 * u, 26 * u);
        // figures behind the glass, small and still
        for (let k = 0; k < 3; k++) {
          const fx = bwx + 10 * u + k * 18 * u + rr(r, -2, 2) * u, fy = bwy + bwh;
          c.fillStyle = hsl(235, 30, 22, 0.85);
          c.beginPath(); c.arc(fx, fy - 17 * u, 3.6 * u, 0, Math.PI * 2); c.fill();
          c.fillRect(fx - 5 * u, fy - 13 * u, 10 * u, 13 * u);
        }
        c.fillStyle = hsl(...s.col);
        c.fillRect(kx + kw * 0.7, y0 - kh - 16 * u, 8 * u, 16 * u);
        const vx = kx + kw * 0.7 + 4 * u, vy = y0 - kh - 18 * u;
        for (let k = 0; k < 3; k++) {
          const ph = r() * 6;
          for (let t = 0; t < 1; t += 0.012) {
            const yy = vy - t * 150 * u, xx = vx + Math.sin(t * 7 + ph + k) * (6 + t * 22) * u + k * 6 * u - 6 * u;
            dab(c, xx, yy, 7 * u, (3 + t * 6) * u, Math.PI / 2 + Math.cos(t * 7 + ph) * 0.6, hsl(36, 50, 86, 0.16 * (1 - t)));
          }
        }
        lights.push([bwx + bww / 2, bwy + bwh / 2, 4.2], [kx + kw - 32 * u, y0 - 13 * u, 1.6]);
        spots.push({ k: 'lamp', x: bwx + bww / 2, y: bwy + bwh / 2, s: 150 * u }, { k: 'steam', x: vx, y: vy, s: u });
        x = kx + kw + rr(r, 6, 16) * u;
        kitchenX = -1;
        continue;
      }
      const bh = rr(r, s.minH, s.maxH) * u;
      if (ri === 1 && r() < 0.16) palm(x + bw / 2, rr(r, 90, 130) * u, s.col);
      else if (ri === 2 && r() < 0.14) tree(x + bw / 2, rr(r, 18, 26) * u, s.col);
      else house(x, bw, bh, s.col, s.roof[Math.floor(r() * 4)], s.ws, s.near);
      x += bw + rr(r, -4, ri === 0 ? 4 : 14) * u;
    }
  });

  texRect(p, 0, y0, w, o.ground + 1, o.rows[2], { len: 22 * u, wid: 3 * u, ang: 0, aj: 0.05, dens: 0.18, dl: 1.5 });

  // light: every lit window blooms a little, the kitchen most of all, and spills onto the street
  c.globalCompositeOperation = 'lighter';
  for (const [x, y, k] of lights) glow(c, x, y, 16 * u * k, 'hsla(38,90%,60%,A)', 0.13 + k * 0.03);
  if (o.kitchen === undefined) lights.forEach(([x, y], i) => { if (i % (o.lit > 0.5 ? 9 : 4) === 2) spots.push({ k: 'win', x, y, s: 30 * u }); });
  c.globalCompositeOperation = 'source-over';
  if (o.kitchen !== undefined) {
    const kx = o.kitchen * w;
    const sg = c.createLinearGradient(0, y0, 0, Math.min(h, y0 + o.ground));
    sg.addColorStop(0, 'hsla(40,90%,62%,0.28)');
    sg.addColorStop(1, 'hsla(40,90%,62%,0)');
    c.fillStyle = sg;
    c.beginPath(); c.moveTo(kx - 60 * u, y0); c.lineTo(kx + 70 * u, y0); c.lineTo(kx + 150 * u, h); c.lineTo(kx - 140 * u, h); c.fill();
  }
}

const night = (p: P) => street(p, {
  sky: ['#0b0e22', '#141a3a', '#232a55', '#353a66'], rows: [[234, 26, 22], [235, 30, 15], [236, 34, 9]],
  lit: 0, ground: Math.max(54, p.h * 0.09), stars: true, moon: true, kitchen: p.w < 700 ? 0.62 : 0.7, win: [233, 24, 19],
});
const dawn = (p: P) => street(p, {
  sky: ['#10132a', '#262c5a', '#5b4f80', '#b9798e', '#eba98a'], rows: [[250, 20, 36], [244, 24, 24], [238, 30, 13]],
  lit: 0.18, ground: 18, scale: 0.72, win: [240, 22, 28],
});
const dusk = (p: P) => street(p, {
  sky: ['#141634', '#2b2a5e', '#6a4a7e', '#d0807a', '#f3b97a'], rows: [[262, 18, 34], [252, 22, 22], [240, 30, 12]],
  lit: 0.82, ground: 22, scale: 0.86, win: [244, 22, 26],
});

/* ------------------------------------------------------------------ the day, seen from above */

const FOOD: Record<string, HSL> = { dal: [42, 80, 52], sabzi: [88, 42, 36], palak: [110, 38, 28], curry: [24, 70, 42], rice: [44, 30, 92], raita: [60, 20, 90], roti: [34, 55, 70] };

function rice(p: P, x: number, y: number, rad: number) {
  const { ctx: c, r } = p;
  disc(c, x, y, rad, hsl(44, 25, 88));
  const n = Math.round(rad * rad * 0.9);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 0.95;
    dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d, 3.2, 1.6, r() * Math.PI, hsl(44, rr(r, 15, 35), rr(r, 86, 97)));
  }
}

function roti(p: P, x: number, y: number, rad: number) {
  const { ctx: c, r } = p;
  fillDisc(p, x, y, rad, FOOD.roti, { len: 5, wid: 2.4, dl: 5 });
  for (let i = 0; i < rad * 0.6; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 0.85;
    disc(c, x + Math.cos(a) * d, y + Math.sin(a) * d, rr(r, 1, 3.2), hsl(26, 55, rr(r, 30, 45), 0.8));
  }
}

function pot(p: P) {
  const { ctx: c, w, h, r } = p;
  texRect(p, 0, 0, w, h, [224, 14, 15], { len: 30, wid: 4, ang: 0.4, aj: 0.3, dens: 0.3, dl: 3 });
  for (let i = 0; i < 4; i++) {
    const y = h * (0.18 + i * 0.22);
    for (let x = -10; x < w + 10; x += 7) dab(c, x, y + (r() - 0.5) * 2, 10, 7, 0, tone(r, [220, 8, 8], 2, 1, 0.9));
  }
  const cx = w * 0.45, cy = h * 0.53, R = Math.min(w, h) * 0.4;
  c.globalCompositeOperation = 'lighter';
  glow(c, cx, cy, R * 1.35, 'hsla(22,90%,50%,A)', 0.32);
  c.globalCompositeOperation = 'source-over';
  disc(c, cx + 6, cy + 8, R, 'rgba(0,0,0,0.35)');
  ring(p, cx, cy, R * 0.9, R, [214, 8, 62], 24, 1.2);
  ring(p, cx, cy, R * 0.84, R * 0.9, [216, 10, 34], 10);
  fillDisc(p, cx, cy, R * 0.84, FOOD.dal, { swirl: 0.35, len: 9, wid: 3, dens: 1.1, dl: 7, dh: 4 });
  for (let k = 0; k < 6; k++) {
    const a0 = r() * 6.3, d = rr(r, 0.2, 0.7) * R;
    for (let t = 0; t < 1; t += 0.04) dab(c, cx + Math.cos(a0 + t * 1.6) * d, cy + Math.sin(a0 + t * 1.6) * d, 8, 2.4, a0 + t * 1.6 + Math.PI / 2, hsl(48, 85, 74, 0.55 * Math.sin(t * Math.PI)));
  }
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.3, d = Math.sqrt(r()) * R * 0.55, x = cx - R * 0.12 + Math.cos(a) * d, y = cy - R * 0.08 + Math.sin(a) * d;
    const k = r();
    if (k < 0.45) disc(c, x, y, rr(r, 1.2, 2), hsl(20, 30, 12));
    else if (k < 0.75) dab(c, x, y, rr(r, 3, 5), 2, r() * 3, hsl(110, 50, rr(r, 26, 36)));
    else if (k < 0.85) dab(c, x, y, rr(r, 14, 20), 4, r() * 3, hsl(4, 72, rr(r, 34, 42)));
    else {
      c.fillStyle = hsl(115, 45, rr(r, 18, 26));
      c.beginPath(); c.ellipse(x, y, rr(r, 7, 10), 3.4, r() * 3, 0, Math.PI * 2); c.fill();
    }
  }
  // ladle resting in the pot
  const lx = cx + R * 0.18, ly = cy - R * 0.06, ex = cx + R * 1.45, ey = cy - R * 1.1;
  for (let t = 0; t <= 1; t += 0.01) dab(c, lx + (ex - lx) * t, ly + (ey - ly) * t, 6, 8, Math.atan2(ey - ly, ex - lx), hsl(214, 8, 58 + Math.sin(t * 9) * 4 + 12 * (1 - t)));
  ring(p, lx, ly, R * 0.15, R * 0.2, [214, 8, 66], 20);
  fillDisc(p, lx, ly, R * 0.15, [40, 78, 44], { swirl: 0.2, len: 5 });
  // the rice pot, mostly off the edge
  const rx = w * 1.0, ry = h * 0.02, R2 = R * 0.75;
  ring(p, rx, ry, R2 * 0.9, R2, [214, 8, 60], 22);
  rice(p, rx, ry, R2 * 0.9);
  // steam
  for (let k = 0; k < 7; k++) {
    const sx = cx + rr(r, -0.6, 0.6) * R, sy = cy + rr(r, -0.6, 0.4) * R, ph = r() * 6;
    for (let t = 0; t < 1; t += 0.02) dab(c, sx + Math.sin(t * 5 + ph) * 26, sy - t * R * 0.9, 18, 14, Math.PI / 2 + Math.cos(t * 5 + ph) * 0.5, hsl(40, 30, 96, 0.05 * Math.sin(t * Math.PI)));
  }
}

function tiffins(p: P) {
  const { ctx: c, w, h, r } = p;
  texRect(p, 0, 0, w, h, [212, 10, 74], { len: 60, wid: 3, ang: 0, aj: 0.02, dens: 0.18, dl: 5, a: 0.5 });
  const cell = clamp(Math.min(w, h) / 3.4, 90, 170), cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
  const kinds = ['meal', 'meal', 'meal', 'lid', 'meal', 'lid', 'empty'];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + (j % 2) * 0.5 - 0.25) * cell + rr(r, -6, 6), y = (j + 0.1) * cell * 0.92 + rr(r, -6, 6), R = cell * 0.42;
    disc(c, x + 5, y + 7, R, 'rgba(20,24,40,0.22)');
    const kind = kinds[Math.floor(r() * kinds.length)];
    ring(p, x, y, R * 0.88, R, [212, 8, 70], 18);
    if (kind === 'meal') {
      rice(p, x, y, R * 0.88);
      const f = [FOOD.dal, FOOD.curry, FOOD.palak, FOOD.sabzi][Math.floor(r() * 4)], a0 = r() * 6.3;
      c.save();
      c.beginPath(); c.arc(x, y, R * 0.88, 0, Math.PI * 2); c.clip();
      c.beginPath(); c.moveTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R);
      c.quadraticCurveTo(x + rr(r, -8, 8), y + rr(r, -8, 8), x - Math.cos(a0) * R, y - Math.sin(a0) * R);
      c.arc(x, y, R, a0 + Math.PI, a0 + Math.PI * 2);
      c.fillStyle = hsl(...f); c.fill();
      for (let k = 0; k < R * R * 0.18; k++) {
        const a = a0 + Math.PI + r() * Math.PI, d = Math.sqrt(r()) * R * 0.86;
        dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d, 6, 2.6, r() * 3, tone(r, f, 7, 4, 0.85));
      }
      c.restore();
      if (r() < 0.5) roti(p, x + R * 0.3, y - R * 0.25, R * 0.36);
    } else if (kind === 'lid') {
      ring(p, x, y, R * 0.55, R * 0.88, [212, 9, 64], 26, 1.4);
      fillDisc(p, x, y, R * 0.55, [212, 8, 70], { len: 7, dl: 6 });
      c.save(); c.translate(x, y); c.rotate(rr(r, -0.5, 0.5));
      c.fillStyle = hsl(48, 30, 94); c.fillRect(-R * 0.6, -R * 0.13, R * 1.2, R * 0.26);
      c.strokeStyle = hsl(232, 40, 30, 0.85); c.lineWidth = 1.6; c.beginPath();
      for (let t = 0; t < 1; t += 0.05) c.lineTo(-R * 0.45 + t * R * 0.8, Math.sin(t * 30) * R * 0.04);
      c.stroke(); c.restore();
    } else fillDisc(p, x, y, R * 0.88, [212, 10, 80], { len: 9, dl: 8 });
  }
}

function route(p: P) {
  const { ctx: c, w, h, r } = p;
  texRect(p, 0, 0, w, h, [215, 24, 93], { len: 20, wid: 3, ang: 0, aj: 1.5, dens: 0.1, dl: 1.5, a: 0.5 });
  const rot = -0.14, sp = clamp(w / 7.5, 60, 110), cos = Math.cos(rot), sin = Math.sin(rot);
  const T = (gx: number, gy: number): [number, number] => [w / 2 + gx * cos - gy * sin, h / 2 + gx * sin + gy * cos];
  const n = Math.ceil(Math.max(w, h) / sp) + 2;
  c.save();
  c.translate(w / 2, h / 2); c.rotate(rot); c.translate(-w / 2, -h / 2);
  for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
    const [bx, by] = [w / 2 + i * sp + 6, h / 2 + j * sp * 0.78 + 6], bw = sp - 12, bh = sp * 0.78 - 12;
    if (bx > w * 1.3 || by > h * 1.3 || bx + bw < -w * 0.3 || by + bh < -h * 0.3) continue;
    const park = r() < 0.09;
    texRect(p, bx, by, bw, bh, park ? [104, 26, 80] : [32, 18, rr(r, 85, 88)], { len: 8, wid: 2.4, ang: 0, aj: 1.5, dens: 0.25, dl: 2 });
    if (park) for (let k = 0; k < 9; k++) fillDisc(p, bx + rr(r, 8, bw - 8), by + rr(r, 8, bh - 8), rr(r, 4, 8), [110, 30, 52], { len: 4 });
    else for (let yy = by + 5; yy < by + bh - 10; yy += 15) for (let xx = bx + 5; xx < bx + bw - 10; xx += 15) {
      if (r() < 0.2) continue;
      c.fillStyle = hsl(30, 14, rr(r, 72, 79)); c.fillRect(xx, yy, rr(r, 7, 11), rr(r, 7, 11));
    }
  }
  c.restore();
  // a creek
  const cy0 = h * 0.78;
  for (let x = -20; x < w + 20; x += 3) dab(c, x, cy0 + Math.sin(x / 90) * 22 + Math.sin(x / 33) * 6, 8, 9, 0.1, hsl(205, 48, rr(r, 68, 74)));
  // stops on the grid: start at the kitchen, then visit each door by the nearest street corner
  const cell = (i: number, j: number) => T(i * sp, j * sp * 0.78);
  const doors: [number, number][] = [];
  const span = Math.max(1, Math.floor(w / sp / 2) - 1), vspan = Math.max(1, Math.floor(h / (sp * 0.78) / 2) - 1);
  const want = Math.min(13, (2 * span + 1) * (2 * vspan + 1) - 2);
  while (doors.length < want) {
    const d: [number, number] = [Math.round(rr(r, -span, span)), Math.round(rr(r, -vspan, vspan))];
    if (!doors.some((e) => e[0] === d[0] && e[1] === d[1])) doors.push(d);
  }
  const start: [number, number] = [-span, Math.min(vspan, 0)];
  const order: [number, number][] = [start];
  const left = doors.filter((d) => d[0] !== start[0] || d[1] !== start[1]);
  while (left.length) {
    const [ci, cj] = order[order.length - 1];
    left.sort((a, b) => Math.abs(a[0] - ci) + Math.abs(a[1] - cj) - (Math.abs(b[0] - ci) + Math.abs(b[1] - cj)));
    order.push(left.shift()!);
  }
  const path: [number, number][] = [];
  for (let k = 0; k < order.length; k++) {
    if (k) path.push(cell(order[k][0], order[k - 1][1]));
    path.push(cell(order[k][0], order[k][1]));
  }
  c.lineCap = 'round';
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [bx, by] = path[k], L = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t <= L; t += 3) dab(c, ax + ((bx - ax) * t) / L + rr(r, -0.6, 0.6), ay + ((by - ay) * t) / L + rr(r, -0.6, 0.6), 7, 5, Math.atan2(by - ay, bx - ax), hsl(36, 88, rr(r, 50, 56)));
  }
  order.slice(1).forEach(([i, j]) => {
    const [x, y] = cell(i, j);
    disc(c, x, y, 8.5, hsl(36, 88, 52));
    disc(c, x, y, 5.5, '#fff');
  });
  const [kx, ky] = cell(start[0], start[1]);
  glow(c, kx, ky, 40, 'hsla(38,95%,60%,A)', 0.45);
  disc(c, kx, ky, 14, hsl(234, 40, 18));
  disc(c, kx, ky, 6, hsl(42, 95, 66));
}

function table(p: P) {
  const { ctx: c, w, h, r } = p;
  // planks run the long way
  const ph = 46;
  for (let y = -10; y < h + ph; y += ph) {
    texRect(p, 0, y, w, ph, [24, rr(r, 34, 40), rr(r, 27, 33)], { len: 50, wid: 3, ang: 0, aj: 0.02, dens: 0.3, dl: 4 });
    c.fillStyle = hsl(20, 35, 14, 0.7); c.fillRect(0, y, w, 1.6);
  }
  // an indigo runner down the middle with a printed border
  const ry = h * 0.36, rh = h * 0.28;
  texRect(p, -10, ry, w + 20, rh, [232, 42, 26], { len: 16, wid: 3, ang: 0, aj: 0.1, dens: 0.45, dl: 3 });
  for (let x = 6; x < w; x += 14) { disc(c, x, ry + 9, 2.4, hsl(40, 80, 68, 0.9)); disc(c, x + 7, ry + rh - 9, 2.4, hsl(40, 80, 68, 0.9)); }
  // marigolds and diyas on the runner
  const marigold = (x: number, y: number, rad: number) => {
    const base: HSL = r() < 0.55 ? [28, 95, 52] : [44, 96, 56];
    for (let k = 0; k < rad * 4; k++) {
      const a = r() * 6.3, d = Math.sqrt(r()) * rad;
      dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d, rr(r, 3, 6), rr(r, 2.4, 3.6), a, tone(r, base, 8, 4));
    }
    disc(c, x, y, rad * 0.22, hsl(base[0] - 6, 80, 36));
  };
  const lamps: [number, number][] = [];
  for (let x = 30; x < w; x += rr(r, 46, 80)) {
    const y = ry + rh / 2 + rr(r, -rh * 0.25, rh * 0.25);
    if (r() < 0.22) {
      c.fillStyle = hsl(18, 45, 34); c.beginPath(); c.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = hsl(22, 50, 22); c.beginPath(); c.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2); c.fill();
      lamps.push([x + 4, y - 1]);
    } else marigold(x, y, rr(r, 9, 14));
    if (r() < 0.5) for (let k = 0; k < 4; k++) dab(c, x + rr(r, -24, 24), y + rr(r, -16, 16), 5, 3, r() * 3, hsl(32, 92, 54));
  }
  // places along both sides, cut off by the edges like a photograph
  const R = clamp(h * 0.16, 44, 70), step = R * 2.7;
  [[R * 0.95, 1], [h - R * 0.95, -1]].forEach(([py, side], si) => {
    for (let x = R * (si ? 1.3 : 0.2); x < w + R; x += step + rr(r, -8, 8)) {
      const y = py + rr(r, -4, 4);
      disc(c, x + 5, y + 6, R, 'rgba(20,10,5,0.3)');
      ring(p, x, y, R * 0.86, R, [214, 8, 70], 20);
      fillDisc(p, x, y, R * 0.86, [214, 8, 78], { len: 10, dl: 6 });
      const k1: [number, number] = [x - R * 0.42, y - side * R * 0.38], k2: [number, number] = [x + R * 0.02, y - side * R * 0.5], k3: [number, number] = [x + R * 0.45, y - side * R * 0.34];
      ([[k1, FOOD.dal], [k2, r() < 0.5 ? FOOD.sabzi : FOOD.palak], [k3, FOOD.raita]] as [[number, number], HSL][]).forEach(([[kx, ky], f]) => {
        ring(p, kx, ky, R * 0.2, R * 0.26, [214, 8, 66], 16);
        fillDisc(p, kx, ky, R * 0.2, f, { len: 4, wid: 1.8, dl: 6 });
      });
      rice(p, x - R * 0.12, y + side * R * 0.3, R * 0.3);
      roti(p, x + R * 0.38, y + side * R * 0.28, R * 0.3);
      if (r() < 0.6) {
        const gx = x + R * 1.25, gy = y - side * R * 0.55;
        disc(c, gx, gy, R * 0.22, hsl(205, 30, 80, 0.55));
        ring(p, gx, gy, R * 0.19, R * 0.23, [205, 20, 88], 12, 0.6);
      }
    }
  });
  c.globalCompositeOperation = 'lighter';
  for (const [x, y] of lamps) glow(c, x, y, 70, 'hsla(38,95%,58%,A)', 0.45);
  c.globalCompositeOperation = 'source-over';
  for (const [x, y] of lamps) { disc(c, x, y - 2, 3.4, hsl(46, 100, 82)); disc(c, x, y - 1, 1.6, '#fff'); spots.push({ k: 'lamp', x, y: y - 2, s: 46 }); }
}

// Three hundred bowls, one for each meal handed over this Saturday. One of them is lit.
function meals(p: P) {
  const { ctx: c, w, h, r } = p;
  texRect(p, 0, 0, w, h, [234, 34, 12], { len: 40, wid: 4, ang: 0, aj: 0.05, dens: 0.12, dl: 2 });
  const N = 300, cols = Math.max(12, Math.round(Math.sqrt((N * w) / h))), rows = Math.ceil(N / cols);
  const cell = Math.min(w / cols, h / rows), ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2;
  const lit = Math.floor(rows * 0.6) * cols + Math.floor(cols * 0.68);
  const foods = [FOOD.dal, FOOD.curry, FOOD.sabzi, FOOD.palak, FOOD.dal, FOOD.rice];
  for (let k = 0; k < N; k++) {
    const i = k % cols, j = Math.floor(k / cols), last = rows - 1, inLast = N - last * cols;
    const sx = j === last ? (cols - inLast) / 2 : 0;
    const x = ox + (i + sx + 0.5) * cell + rr(r, -0.06, 0.06) * cell, y = oy + (j + 0.5) * cell + rr(r, -0.06, 0.06) * cell, R = cell * 0.36;
    if (k === lit) {
      c.globalCompositeOperation = 'lighter';
      glow(c, x, y, cell * 1.6, 'hsla(40,95%,58%,A)', 0.5);
      spots.push({ k: 'lamp', x, y, s: cell * 3.4 });
      c.globalCompositeOperation = 'source-over';
    }
    ring(p, x, y, R * 0.8, R, k === lit ? [42, 90, 62] : [222, 10, 48], k === lit ? 14 : 18, 0.8);
    const f = foods[Math.floor(r() * foods.length)];
    fillDisc(p, x, y, R * 0.8, k === lit ? f : [f[0], f[1] * 0.75, f[2] * 0.72], { len: 3.4, wid: 1.6, dl: 6, dens: 1.2 });
  }
}

// A toran: mango leaves and marigolds strung across a doorway.
function toran(p: P) {
  const { ctx: c, w, h, r } = p;
  const sag = (x: number) => 14 + Math.sin((x / w) * Math.PI * 2) * 4 + Math.sin((x / w) * Math.PI) * 10;
  c.strokeStyle = hsl(30, 30, 40, 0.6); c.lineWidth = 1.2; c.beginPath();
  for (let x = 0; x <= w; x += 6) c.lineTo(x, sag(x));
  c.stroke();
  for (let x = 10; x < w; x += 46) {
    const y = sag(x);
    for (const s of [-1, 1]) {
      const a = Math.PI / 2 + s * 0.28 + (r() - 0.5) * 0.2, L = rr(r, 34, 44);
      for (let t = 0; t <= 1; t += 0.05) {
        const wdt = Math.sin(t * Math.PI) * 9 + 1;
        dab(c, x + s * 7 + Math.cos(a) * L * t, y + Math.sin(a) * L * t, 4, wdt, a, hsl(rr(r, 96, 112), 48, rr(r, 26, 34)));
      }
    }
    for (let k = 0; k < 2; k++) {
      const fx = x + 23 + rr(r, -2, 2), fy = sag(fx) + 10 + k * 18, rad = 8;
      const base: HSL = k ? [44, 96, 56] : [28, 95, 52];
      for (let q = 0; q < 34; q++) {
        const a = r() * 6.3, d = Math.sqrt(r()) * rad;
        dab(c, fx + Math.cos(a) * d, fy + Math.sin(a) * d, rr(r, 3, 5), 2.6, a, tone(r, base, 8, 4));
      }
    }
  }
}

// Lay the breathing layer over a finished canvas: plain elements, moved only by CSS (see HearthLayout).
function breathe(cv: HTMLCanvasElement, w: number, h: number) {
  if (cv.nextElementSibling?.classList.contains('fx')) cv.nextElementSibling.remove();
  if (!spots.length || !document.documentElement.classList.contains('fx-on')) return;
  const par = cv.parentElement!;
  if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
  const box = document.createElement('div');
  box.className = 'fx';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = `left:${cv.offsetLeft}px;top:${cv.offsetTop}px;width:${cv.offsetWidth}px;height:${cv.offsetHeight}px`;
  const q = rng(spots.length * 13 + 5);
  const add = (cls: string, x: number, y: number, size: number, dur: number, extra = '') => {
    const i = document.createElement('i');
    i.className = cls;
    i.style.cssText = `left:${((x / w) * 100).toFixed(2)}%;top:${((y / h) * 100).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;--d:${dur.toFixed(2)}s;--o:-${(q() * dur).toFixed(2)}s;${extra}`;
    box.appendChild(i);
  };
  for (const s of spots) {
    if (s.k === 'star') add('star', s.x, s.y, s.s, 3.5 + q() * 5);
    else if (s.k === 'lamp') add('lamp', s.x, s.y, s.s, 4.5 + q() * 2.5);
    else if (s.k === 'win') add('lamp win', s.x, s.y, s.s, 5 + q() * 6);
    else for (let k = 0; k < 4; k++) add('steam', s.x + (k - 1.5) * 5 * s.s, s.y, 46 * s.s, 9, `--o:-${(k * 2.25).toFixed(2)}s;--h:${(-150 * s.s).toFixed(0)}px;--x:${((k % 2 ? 1 : -1) * (14 + k * 5) * s.s).toFixed(0)}px`);
  }
  cv.after(box);
}

// Text and pictures rise into place the first time they scroll into view. Marked up with data-rv; without the
// fx-on class (reduced motion, or no script) everything is simply visible.
export function reveal() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-rv]')];
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || !document.documentElement.classList.contains('fx-on')) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

const painters: Record<string, (p: P) => void> = { night, dawn, dusk, pot, tiffins, route, table, meals, toran };

export function paintAll() {
  // inner page headers get a dawn street behind the title
  document.querySelectorAll<HTMLElement>('.ph').forEach((ph) => {
    if (ph.querySelector('canvas[data-art]')) return;
    const cv = document.createElement('canvas');
    cv.className = 'art';
    cv.dataset.art = 'dawn';
    cv.dataset.seed = String(ph.dataset.seed ?? location.pathname.length * 7);
    cv.setAttribute('aria-hidden', 'true');
    ph.prepend(cv);
  });
  const list = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-art]')];
  const widths = new WeakMap<HTMLCanvasElement, number>();
  const paint = (cv: HTMLCanvasElement) => {
    const b = cv.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    widths.set(cv, b.width);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(b.width * dpr);
    cv.height = Math.round(b.height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    spots = [];
    painters[cv.dataset.art ?? '']?.({ ctx, w: b.width, h: b.height, r: rng(Number(cv.dataset.seed ?? 7)) });
    cv.classList.add('done');
    breathe(cv, b.width, b.height);
  };
  // what is on screen first, the rest straight after
  const onScreen = list.filter((cv) => cv.getBoundingClientRect().top < window.innerHeight);
  onScreen.forEach(paint);
  const rest = list.filter((cv) => !onScreen.includes(cv));
  const next = () => { const cv = rest.shift(); if (cv) { paint(cv); setTimeout(next, 0); } };
  setTimeout(next, 0);
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => list.forEach((cv) => { if (Math.abs(cv.getBoundingClientRect().width - (widths.get(cv) ?? 0)) > 24) paint(cv); }), 220);
  });
}
