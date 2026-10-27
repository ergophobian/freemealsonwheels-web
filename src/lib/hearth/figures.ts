// Simple, soft, blocky people for the hearth vignettes: joints from a few targets, thick round limbs, no faces.
import { P, K, TAU, lerp, type Ref, type Ctx } from './engine';

export type HairStyle = 'short' | 'bun' | 'long' | 'braid' | 'white' | 'cover' | 'cap' | 'net' | 'none';
export type Part = 'L' | 'R' | 'head' | 'body';
export interface Fig {
  x: number; y: number; R?: number;
  turn?: number; dir?: 1 | -1;
  skin: string; skinShade?: string; hair: string; hairStyle?: HairStyle;
  top: string; topDark?: string; bottom?: string; shoes?: string; sleeve?: 'long' | 'short';
  tunic?: boolean; apron?: string; shawl?: { c: string; trim: string; tail?: boolean };
  lean?: number; tilt?: number; cut?: number; // cut: skip everything below this y (hidden behind a table)
  hands?: { L?: [number, number]; R?: [number, number] }; bend?: { L?: number; R?: number };
  glove?: string; badge?: boolean; omit?: Part[]; only?: Part[];
  stance?: number; crouch?: number; kid?: boolean; bendBody?: number; shadow?: string; behind?: (r: Ref) => void; sit?: boolean;
}
export interface Pose { head: [number, number]; R: number; hands: { L: [number, number]; R: [number, number] }; shoulders: { L: [number, number]; R: [number, number] }; neck: [number, number]; hip: [number, number]; tilt: number; dir: number; turn: number; }

function ik(s: [number, number], h: [number, number], l1: number, l2: number, side: number): [number, number] {
  let dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy) || 0.01;
  const dd = Math.min(d, l1 + l2 - 0.5), a = (dd * dd + l1 * l1 - l2 * l2) / (2 * dd), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  dx /= d; dy /= d;
  const e1: [number, number] = [s[0] + dx * a - dy * hh, s[1] + dy * a + dx * hh], e2: [number, number] = [s[0] + dx * a + dy * hh, s[1] + dy * a - dx * hh];
  void side; return e1[1] > e2[1] ? e1 : e2; // the elbow hangs low
}

export function figure(r: Ref, f: Fig): Pose {
  const R = f.R ?? 18, dir = f.dir ?? 1, turn = f.turn ?? 0, kid = !!f.kid;
  const H = kid ? 10.2 : 13; // heights in head radii
  const u = (hh: number) => (hh / 13) * (H / 13) * 13; void u;
  const k = kid ? 0.78 : 1; // body proportion for kids (bigger head)
  const sk = (v: number) => f.y - v * R * k - (kid ? 0 : 0);
  const cr = f.crouch ?? 0;
  const hipY = sk(6.3), shY = sk(10.3) + cr, headY = (kid ? sk(10.3) - 1.45 * R : sk(12.1)) + cr * 1.35, neckY = shY - 0.45 * R;
  const lean = f.lean ?? 0, bb = f.bendBody ?? 0;
  const cx = f.x + lean + bb * 0.5, hx = f.x + lean * 1.4 + bb + dir * turn * 0.4 * R;
  const sw = lerp(1.95, 0.9, turn) * R * (kid ? 0.58 : 1), hw = lerp(1.5, 0.85, turn) * R * (kid ? 0.8 : 1);
  const shL: [number, number] = [cx - sw * (turn > 0.5 && dir > 0 ? 0.7 : 1), shY], shR: [number, number] = [cx + sw * (turn > 0.5 && dir < 0 ? 0.7 : 1), shY];
  const hip: [number, number] = [f.x, hipY];
  const head: [number, number] = [hx, headY], neck: [number, number] = [cx + (hx - cx) * 0.4, neckY];
  const skin = f.skin, skinD = f.skinShade ?? f.skin;
  const long = f.sleeve === 'long';
  const ua = 2.0 * R * k, fa = 1.9 * R * k;
  const defHand = (side: -1 | 1): [number, number] => [(side < 0 ? shL[0] : shR[0]) + side * 0.3 * R, shY + 3.7 * R * k];
  const hL = f.hands?.L ?? defHand(-1), hR = f.hands?.R ?? defHand(1);
  const bendL = f.bend?.L ?? 1, bendR = f.bend?.R ?? -1;
  const elL = ik(shL, hL, ua, fa, bendL), elR = ik(shR, hR, ua, fa, bendR);
  const cut = f.cut ?? 1e9; // legs are drawn only while f.y < cut; pass cut: 0 to hide legs (behind a table)
  const aw = 1.0 * R * k, fw = 0.86 * R * k;
  const ang = (a: number[], b: number[]) => Math.atan2(b[1] - a[1], b[0] - a[0]);

  const has = (p: Part) => (f.only ? f.only.includes(p) : !(f.omit && f.omit.includes(p)));
  const handC = f.glove ?? skin;
  if (has('body')) f.behind?.(r);
  if (has('body') && f.shadow && f.y < cut) r.fill(P.ell(f.x, f.y + 3, R * 2.6, R * 0.55), f.shadow, { k: K.flat, a: 0 });

  const arm = (sh: [number, number], el: [number, number], h: [number, number], near: boolean) => {
    const id = r.nid();
    const sleeveC = f.top;
    r.fill(P.cap(sh[0], sh[1], el[0], el[1], aw), sleeveC, { a: ang(sh, el), k: K.fig });
    r.fill(P.cap(el[0], el[1], h[0], h[1], fw), long ? sleeveC : skin, { a: ang(el, h), k: K.fig });
    if (!long) { // short sleeve cuff
      const t = 0.22; r.fill(P.cap(el[0], el[1], lerp(el[0], h[0], t), lerp(el[1], h[1], t), fw * 1.12), sleeveC, { a: ang(el, h), k: K.fig, id });
    }
    r.fill(P.ell(h[0], h[1], 0.46 * R, 0.5 * R), handC, { a: ang(el, h) + 0.5, k: K.fig });
    void near;
  };

  // legs
  if (has('body') && f.y < cut) {
    const st = (f.stance ?? 0) * R, w = turn > 0.4 ? 0.5 : 0.8;
    const fl: [number, number] = [f.x - hw * w - st * dir * (turn > 0.4 ? -1 : 1) * 0.5, f.y - 0.3 * R], fr: [number, number] = [f.x + hw * w + st * dir * (turn > 0.4 ? 1 : 1) * 0.5, f.y - 0.3 * R];
    const hl: [number, number] = [f.x - hw * 0.55, hipY], hr: [number, number] = [f.x + hw * 0.55, hipY];
    const bendDir = dir;
    const kl = ik(hl, fl, 3.1 * R * k, 3.1 * R * k, bendDir > 0 ? -1 : 1), kr = ik(hr, fr, 3.1 * R * k, 3.1 * R * k, bendDir > 0 ? -1 : 1);
    const pants = f.bottom ?? '#2c3a52', shoes = f.shoes ?? '#3a2a22';
    for (const [h0, k0, ft] of [[hl, kl, fl], [hr, kr, fr]] as [number[], number[], number[]][]) {
      r.fill(P.cap(h0[0], h0[1], k0[0], k0[1], 1.5 * R * k), pants, { a: ang(h0, k0), k: K.fig });
      r.fill(P.cap(k0[0], k0[1], ft[0], ft[1], 1.22 * R * k), pants, { a: ang(k0, ft), k: K.fig });
      r.fill(P.ell(ft[0] + dir * 0.55 * R, ft[1] + 0.15 * R, 0.95 * R * k, 0.38 * R), shoes, { a: 0, k: K.fig });
    }
  }
  // back-side hair (long / braid) behind the body
  const hs = f.hairStyle ?? 'short';
  const tilt = f.tilt ?? 0;
  const withHead = (fn: () => void) => { r.save(); r.tr(neck[0], neck[1]); r.rot(tilt); r.tr(-neck[0], -neck[1]); fn(); r.restore(); };
  if (has('head') && (hs === 'long' || hs === 'braid')) withHead(() => {
    const bx = head[0] - dir * (0.55 + 0.35 * turn) * R * (turn > 0.5 ? 1 : 0), by = head[1];
    if (hs === 'long') r.fill(P.blob([[head[0] - 1.15 * R, by - 0.2 * R], [head[0], by - 1.15 * R], [head[0] + 1.15 * R, by - 0.2 * R], [head[0] + 1.2 * R, by + 3.2 * R], [head[0] - 1.2 * R, by + 3.2 * R]]), f.hair, { a: 1.5, k: K.fig });
    else r.fill(P.cap(bx, by + 0.4 * R, bx - dir * 0.15 * R, by + 4.2 * R, 0.62 * R), f.hair, { a: 1.5, k: K.fig });
  });

  // far arm first (the one behind the body)
  const farL = turn > 0.4 && dir > 0; // facing right: left arm is far
  const farR = turn > 0.4 && dir < 0;
  if (farL && has('L')) arm(shL, elL, hL, false);
  if (farR && has('R')) arm(shR, elR, hR, false);

  // neck + torso
  if (has('body')) {
  r.fill(P.cap(neck[0], neck[1], head[0], head[1] + 0.5 * R, 0.62 * R), f.skinShade ?? skinD, { a: Math.PI / 2, k: K.fig });
  const tw = [[shL[0] - 0.1 * R, shL[1]], [shR[0] + 0.1 * R, shR[1]], [cx + hw * 1.05, hipY + 0.8 * R], [cx - hw * 1.05, hipY + 0.8 * R]];
  const tid = r.nid();
  r.fill(P.poly(tw), f.top, { a: Math.PI / 2, k: K.fig, id: tid });
  r.line(P.poly(tw), 0.9 * R, f.top, { a: Math.PI / 2, k: K.fig, id: tid });
  if (f.tunic && f.y < cut) {
    const tb = f.y - 3.0 * R * k;
    const tun = [[cx - hw * 1.05, hipY - 0.6 * R], [cx + hw * 1.05, hipY - 0.6 * R], [cx + hw * 1.45, tb], [cx - hw * 1.45, tb]];
    r.fill(P.poly(tun), f.top, { a: Math.PI / 2, k: K.fig, id: tid });
  }
  if (f.apron) {
    const ap = [[cx - hw * 0.95, shY + 0.9 * R], [cx + hw * 0.95, shY + 0.9 * R], [cx + hw * 1.45, hipY + 3.0 * R], [cx - hw * 1.45, hipY + 3.0 * R]];
    r.fill(P.poly(ap), f.apron, { a: Math.PI / 2, k: K.fig });
    r.fill(P.cap(cx - hw * 0.9, shY + 0.6 * R, cx + hw * 0.9, shY + 0.6 * R, 0.28 * R), f.apron, { a: 0, k: K.fig });
  }
  if (f.shawl) {
    const s = f.shawl;
    const sh = [[shL[0] - 0.7 * R, shL[1] - 0.35 * R], [cx, shY - 0.9 * R], [shR[0] + 0.7 * R, shR[1] - 0.35 * R], [shR[0] + 0.95 * R, shY + 4.3 * R], [cx + 0.35 * R, shY + 2.4 * R], [cx - 0.35 * R, shY + 2.4 * R], [shL[0] - 0.95 * R, shY + 4.3 * R]];
    const sid = r.fill(P.blob(sh), s.c, { a: 1.35, k: K.fig });
    // trim border running along the hem
    r.line(P.path([[shL[0] - 0.95 * R, shY + 4.0 * R], [cx - 0.4 * R, shY + 2.2 * R]]), 0.32 * R, s.trim, { a: 0.5, k: K.fig });
    r.line(P.path([[shR[0] + 0.95 * R, shY + 4.0 * R], [cx + 0.4 * R, shY + 2.2 * R]]), 0.32 * R, s.trim, { a: -0.5, k: K.fig });
    if (s.tail) r.fill(P.blob([[shR[0] + 0.5 * R, shY + 1.5 * R], [shR[0] + 1.4 * R, shY + 3 * R], [shR[0] + 1.2 * R, shY + 7.2 * R], [shR[0] + 0.2 * R, shY + 7.4 * R], [shR[0] + 0.1 * R, shY + 3.5 * R]]), s.c, { a: 1.5, k: K.fig, id: sid });
  }
  if (f.badge) { // volunteer lanyard and badge
    const bx = cx + dir * turn * 0.5 * R;
    r.line(P.path([[bx - 0.35 * R, shY - 0.1 * R], [bx, shY + 1.9 * R]]), 0.16 * R, '#2f6068', { a: 1.4, k: K.fine });
    r.line(P.path([[bx + 0.35 * R, shY - 0.1 * R], [bx, shY + 1.9 * R]]), 0.16 * R, '#2f6068', { a: 1.7, k: K.fine });
    r.fill(P.rr(bx - 0.5 * R, shY + 1.8 * R, 1.0 * R, 1.25 * R, 0.1 * R), '#f4efe2', { a: 1.57, k: K.prop });
    r.fill(P.rect(bx - 0.5 * R, shY + 1.8 * R, 1.0 * R, 0.32 * R), '#eba21e', { a: 0, k: K.fine });
  }
  }

  // head
  if (has('head')) withHead(() => {
    const hr = R * (kid ? 1.06 : 1);
    r.fill(P.ell(head[0], head[1], 0.93 * hr, 1.04 * hr), skin, { a: -0.9, k: K.fig });
    const hairFill = f.hair;
    const hid = r.nid();
    const cap = (cover: number) => { // hair cap: top part of head, extended to the back if turned
      r.save();
      const back = -dir;
      r.clip((c: Ctx) => {
        c.beginPath(); c.rect(head[0] - 2 * R, head[1] - 2 * R, 4 * R, 2 * R * cover + 0.0 * R);
        if (turn > 0.5) c.rect(head[0] + (back > 0 ? 0.05 * R : -2 * R), head[1] - 2 * R, 1.95 * R, 3.4 * R * 0.62);
      });
      r.fill(P.ell(head[0] + back * 0.06 * R * turn, head[1] - 0.04 * R, 1.0 * hr, 1.08 * hr), hairFill, { a: 0.5, k: K.fig, id: hid });
      r.restore();
    };
    if (hs === 'short' || hs === 'white' || hs === 'long' || hs === 'braid') cap(0.55);
    else if (hs === 'bun') {
      cap(0.55);
      const bx = turn > 0.5 ? head[0] - dir * 0.9 * R : head[0], by = turn > 0.5 ? head[1] - 0.7 * R : head[1] - 1.25 * R;
      r.fill(P.ell(bx, by, 0.52 * R, 0.5 * R), hairFill, { a: 0.5, k: K.fig, id: hid });
    } else if (hs === 'cover') {
      r.fill(P.blob([[head[0] - 1.12 * R, head[1] + 0.2 * R], [head[0] - 1.0 * R, head[1] - 0.9 * R], [head[0], head[1] - 1.35 * R], [head[0] + 1.0 * R, head[1] - 0.9 * R], [head[0] + 1.12 * R, head[1] + 0.2 * R], [head[0] + 0.7 * R, head[1] + 1.5 * R], [head[0] - 0.7 * R, head[1] + 1.5 * R]]), hairFill, { a: 1.2, k: K.fig, id: hid });
      r.fill(P.ell(head[0] + dir * 0.1 * R, head[1] + 0.25 * R, 0.62 * R, 0.78 * R), skin, { a: -0.9, k: K.fig });
    } else if (hs === 'cap') { // a ball cap in the hair colour, with a brim toward the way he faces
      r.save(); r.clip((c: Ctx) => { c.beginPath(); c.rect(head[0] - 2 * R, head[1] - 2 * R, 4 * R, 1.75 * R); });
      r.fill(P.ell(head[0], head[1] - 0.05 * R, 1.04 * hr, 1.1 * hr), hairFill, { a: 0.5, k: K.fig, id: hid });
      r.restore();
      r.fill(P.ell(head[0] + dir * (0.35 + 0.5 * turn) * R, head[1] - 0.28 * R, (0.75 + 0.35 * turn) * R, 0.2 * R), hairFill, { a: 0, k: K.fig, id: hid });
    } else if (hs === 'net') { // hairnet: a pale cap over the hair
      cap(0.55);
      r.save(); r.clip((c: Ctx) => { c.beginPath(); c.rect(head[0] - 2 * R, head[1] - 2 * R, 4 * R, 1.62 * R); });
      r.fill(P.ell(head[0] - dir * 0.04 * R * turn, head[1] - 0.06 * R, 1.03 * hr, 1.1 * hr), '#eee8d8', { a: 0.5, k: K.fig });
      r.restore();
      r.line(P.path([[head[0] - 0.98 * R, head[1] - 0.38 * R], [head[0] + 0.98 * R, head[1] - 0.38 * R]]), 0.1 * R, '#c9c2ad', { a: 0, k: K.fine });
    }
  });

  // near arms (always in front of torso)
  if (!farL && has('L')) arm(shL, elL, hL, true);
  if (!farR && has('R')) arm(shR, elR, hR, true);
  void TAU;
  return { head, R, hands: { L: hL, R: hR }, shoulders: { L: shL, R: shR }, neck, hip, tilt, dir, turn };
}

/** tiny hand-inked face marks on top of the hatching */
export function faceInk(c: Ctx, p: Pose, o: { smile?: number; eyes?: 'closed' | 'dots' | 'down'; look?: number } = {}) {
  const R = p.R, [hx, hy] = p.head, sm = o.smile ?? 1, eyes = o.eyes ?? 'closed';
  c.save(); c.translate(p.neck[0], p.neck[1]); c.rotate(p.tilt); c.translate(-p.neck[0], -p.neck[1]);
  c.strokeStyle = 'rgba(40,22,16,0.85)'; c.fillStyle = 'rgba(40,22,16,0.9)'; c.lineCap = 'round'; c.lineWidth = Math.max(1.5, R * 0.09);
  const ex = p.dir * p.turn * 0.5 * R + (o.look ?? 0) * R * 0.1, y = hy + 0.14 * R, dx = 0.4 * R * (1 - p.turn * 0.25);
  for (const sx of [-1, 1]) {
    const x = hx + ex + sx * dx; c.beginPath();
    if (eyes === 'dots') { c.arc(x, y, Math.max(1.3, R * 0.06), 0, TAU); c.fill(); }
    else if (eyes === 'down') { c.moveTo(x - R * 0.15, y); c.quadraticCurveTo(x, y + R * 0.1, x + R * 0.15, y); c.stroke(); }
    else { c.moveTo(x - R * 0.17, y + R * 0.03); c.quadraticCurveTo(x, y - R * 0.18, x + R * 0.17, y + R * 0.03); c.stroke(); }
  }
  c.beginPath(); c.lineWidth = Math.max(1.4, R * 0.08);
  c.moveTo(hx + ex - R * 0.26, hy + 0.52 * R); c.quadraticCurveTo(hx + ex, hy + (0.52 + 0.3 * sm) * R, hx + ex + R * 0.26, hy + 0.52 * R); c.stroke();
  c.restore();
}
