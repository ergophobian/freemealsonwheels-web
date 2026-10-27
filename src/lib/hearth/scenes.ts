// The four moments of one meal. Each scene draws flat reference shapes in design space (1400 x 660),
// plus the lights that colour the hatching, ink details, idle-life drawing, and "actors": moving parts
// (arms, tools, heads, a walking figure) that are painted as small cached hatch sprites per keyframe.
// The story lives in the central 640 px (x 395 to 1020); the rest is room and street.
import { P, K, hex, islandMask, type Ref, type Ctx, type Look } from './engine';
import { figure, faceInk, type Pose, type Fig } from './figures';
import { C, grad, bricks, marigolds, bulbs, steelPot, tiffin, box, thali, rotiStack, diya, rangoli, windowFrame, steelCounter, hotelPans, crate, whiteboard, tiles } from './props';
import { steam, glowPulse, flame, twinkle } from './live';

export const DW = 1400, DH = 660;

export interface Actor {
  box: [number, number, number, number]; // design-space bounds that hold every keyframe
  frames: number;
  draw(r: Ref, k: number): Pose | void;
  ink?(c: Ctx, k: number, pose?: Pose): void;
  at(t: number): { k: number; dx?: number; dy?: number; alpha?: number };
  restT?: number; // time whose pose is baked into stills
}
export interface Scene {
  id: string; label: string; caption: string; alt: string;
  focus?: number; look: Look; draw(r: Ref): void; ink?(c: Ctx): void; live?(c: Ctx, t: number): void; actors?: Actor[];
}

const SKIN = ['#b3714a', '#9a5f3e', '#c48560', '#8a5233', '#d29a73', '#7a4a30'];
const ACC = [hex(C.teal), hex(C.brick), hex(C.marig), hex(C.ochre), hex(C.sage)];
const BRAND = '#a8382b'; // the Donate red: every volunteer wears it
const GLOVE = '#74b6c6';
const NET = 'net' as const;

const tri = (t: number, period: number) => { const p = ((t / period) % 1 + 1) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };
const pingK = (t: number, period: number, n: number) => Math.round(tri(t, period) * (n - 1));
const cycK = (t: number, period: number, n: number) => Math.floor((((t / period) % 1) + 1) % 1 * n);

function patches(r: Ref, y0: number, y1: number, a: string, b: string, n = 15) {
  for (let i = 0; i < n; i++) r.fill(P.ell(50 + i * (DW / n) + (i % 3) * 22, y0 + ((i * 53) % (y1 - y0)), 76, 40, 0.3 * (i % 5)), i % 2 ? a : b, { k: K.bg, a: 1.2 + (i % 4) * 0.25 });
}
const crew = (o: Fig): Fig => ({ apron: BRAND, badge: true, hairStyle: NET, ...o });

// ---- 1. Cook ----------------------------------------------------------------------------------
function cook(): Scene {
  let pLead: Pose | null = null, pChop: Pose | null = null, pRoll: Pose | null = null, pPort: Pose | null = null, pStir: Pose | null = null;
  const look: Look = {
    amb: [0.56, 0.65, 0.76], shadow: [0.55, 0.62, 0.95], accents: ACC, seed: 11, rim: [255, 190, 110],
    lights: [
      { x: 490, y: 440, r: 330, c: [1.4, 0.7, 0.28], k: 1.0 },
      { x: 490, y: 250, r: 200, c: [1.25, 0.92, 0.5], k: 0.65 },
      { x: 990, y: 220, r: 420, c: [0.72, 0.78, 1.0], k: 0.55 },
    ],
    mask: islandMask(3, { px: 3.2, py: 2.6, top: 0.9, bot: 0.92, rag: 0.85 }),
  };
  const STIR: Fig = crew({ x: 690, y: 566, R: 27, turn: 0.75, dir: -1, shadow: 'rgba(30,22,20,0.4)', skin: SKIN[0], hair: '#241a17', top: '#e9dfc4', sleeve: 'short', glove: GLOVE,
    bottom: '#2c3a52', tilt: -0.07, lean: -10, stance: 0.5, hands: { L: [640, 340], R: [734, 424] } });
  const LEAD: Fig = crew({ x: 797, y: 580, R: 26, turn: 0.45, dir: 1, shadow: 'rgba(30,22,20,0.4)', skin: SKIN[5], hair: BRAND, hairStyle: 'cap', top: '#7f93a8', sleeve: 'long',
    bottom: '#3a3550', tilt: 0.05, hands: { L: [770, 424], R: [908, 336] } });
  const CHOP: Fig = crew({ x: 900, y: 581, R: 23, cut: 0, skin: SKIN[2], hair: '#241a17', top: '#e9dfc4', sleeve: 'short', glove: GLOVE, tilt: 0.06, hands: { L: [872, 424], R: [928, 404] } });
  const ROLL: Fig = crew({ x: 1012, y: 581, R: 24, cut: 0, skin: SKIN[3], hair: '#ece8e0', top: '#86a283', sleeve: 'short', glove: GLOVE, tilt: -0.05, hands: { L: [976, 424], R: [1046, 424] } });
  const PORT: Fig = crew({ x: 1128, y: 581, R: 24, cut: 0, skin: SKIN[1], hair: '#241a17', top: '#7f93a8', sleeve: 'short', glove: GLOVE, tilt: -0.08, hands: { L: [1092, 424], R: [1164, 426] } });
  const CARRY: Fig = crew({ x: 0, y: 640, R: 22, turn: 0.5, dir: -1, shadow: 'rgba(20,16,14,0.4)', skin: SKIN[4], hair: '#241a17', top: '#e9dfc4', sleeve: 'short', glove: GLOVE, bottom: '#2c3a52' });
  const bounce = (k: number) => (k % 2 ? -3 : 0);
  const stirH = (k: number): [number, number] => { const a = (k / 8) * Math.PI * 2; return [640 + 13 * Math.cos(a), 340 + 6 * Math.sin(a)]; };
  const choppers = (k: number): [number, number] => [928, 396 + 18 * tri(k, 6)];
  const carryX0 = 450; // pose baked into stills
  return {
    id: 'cook', label: 'Cook', focus: 765,
    caption: 'Before the city wakes, a kitchen light comes on and the volunteers start cooking.',
    alt: 'A hatched drawing of a volunteer crew in a community kitchen before dawn, all in matching red aprons and hairnets: one stirs a big steel stockpot on the range, a lead with a clipboard points the way, others chop and roll rotis at a steel prep table, and a teenager carries a tray across the room, under a sign-up board and a window strung with marigolds.',
    look,
    draw(r) {
      // wall, tile, window
      r.fill(P.rect(0, 0, DW, 470), grad(0, 0, 0, 470, [[0, '#2f6068'], [0.6, '#3f7b7d'], [1, '#4a8782']]), { k: K.bg, a: 1.45 });
      patches(r, 90, 300, C.sage2, C.teal2, 16);
      tiles(r, 0, 300, DW, 470, 38, 26, '#b4bdad', '#a1ac9d');
      r.fill(P.rect(0, 294, DW, 9), '#a8a690', { k: K.fine, a: 0 });
      windowFrame(r, 920, 96, 180, 190, [[0, '#2b3f5a'], [0.45, '#5f78a0'], [0.8, '#e9a870'], [1, '#f6cf8a']], { skyline: true, seed: 6 });
      marigolds(r, [[850, 102], [1010, 168], [1170, 100]], { n: 18, sz: 12, seed: 4, hang: true });
      whiteboard(r, 690, 66, 150, 132);
      // steel rack with hotel pans and produce, left
      [[130, 'x'], [320, 'x']].forEach(([x]) => r.fill(P.rect(x as number - 3, 150, 6, 245), '#8a98a0', { k: K.fine, a: 1.57 }));
      [150, 250, 350].forEach((y) => r.fill(P.rect(124, y, 202, 6), '#aab6bb', { k: K.prop, a: 0 }));
      hotelPans(r, 180, 150, 80, 4); hotelPans(r, 270, 150, 70, 3, ['#6d9a5c', '#d8a238']);
      crate(r, 175, 250, 84, 40, '#e07a2a'); crate(r, 268, 250, 78, 40, '#b8402e');
      crate(r, 180, 350, 84, 40, '#6d9a5c', { leafy: true }); hotelPans(r, 275, 350, 76, 4);
      // hood and range
      r.fill(P.rect(460, 30, 60, 125), grad(460, 0, 520, 0, [[0, C.steelD], [0.4, C.steelL], [1, C.steelD]]), { k: K.prop, a: 1.57 });
      r.fill(P.poly([[395, 150], [585, 150], [660, 228], [320, 228]]), grad(320, 0, 660, 0, [[0, C.steelD], [0.35, C.steelL], [0.7, C.steel], [1, C.steelD]]), { k: K.prop, a: 0.25 });
      r.fill(P.rect(320, 226, 340, 11), C.steelD, { k: K.prop, a: 0 });
      r.fill(P.ell(490, 241, 100, 5), '#ffe0a8', { k: K.glow, a: 0 });
      // floor
      r.fill(P.rect(0, 470, DW, DH - 470), grad(0, 470, 0, DH, [[0, '#575049'], [0.5, '#6f6358'], [1, '#85735f']]), { k: K.bg, a: 0.02 });
      r.fill(P.rect(0, 466, DW, 10), '#3b332e', { k: K.fine, a: 0 });
      // left counter and crates on the floor
      steelCounter(r, 110, 355, 392, 470, { seed: 2 });
      crate(r, 164, 530, 90, 46, '#e07a2a'); crate(r, 262, 536, 84, 42, '#6d9a5c', { leafy: true });
      // range with the big stockpot
      r.fill(P.rect(350, 396, 280, 74), grad(350, 0, 630, 0, [[0, '#586870'], [0.5, '#8c9aa0'], [1, '#586870']]), { k: K.prop, a: 1.57 });
      r.fill(P.rr(386, 412, 208, 54, 9), '#241f22', { k: K.base, a: 0 });
      r.fill(P.rr(394, 420, 192, 40, 6), grad(0, 420, 0, 460, [[0, '#ffd48a'], [0.5, '#f4952f'], [1, '#c44d16']]), { k: K.glow, a: 0.05 });
      r.line(P.path([[400, 412], [580, 412]]), 4, C.steelL, { k: K.fine, a: 0 });
      [372, 410, 570, 608].forEach((x) => r.fill(P.ell(x, 405, 6, 6), '#3a4247', { k: K.fine, a: 0 }));
      r.fill(P.rect(340, 386, 300, 12), grad(340, 0, 640, 0, [[0, C.steelD], [0.5, C.steelL], [1, C.steelD]]), { k: K.prop, a: 0 });
      steelPot(r, 490, 388, 160, 104, { dark: true, lid: false });
      // prep line: roti station, chopper and portioner behind a long steel table
      pChop = figure(r, { ...CHOP, omit: ['R'] });
      pRoll = figure(r, { ...ROLL, omit: ['L', 'R'] });
      pPort = figure(r, PORT);
      steelCounter(r, 820, 1190, 428, 560, { seed: 7 });
      r.fill(P.rr(862, 418, 76, 10, 3), '#c99a62', { k: K.fine, a: 0 }); // chopping board
      [[878, 416], [892, 414], [905, 416]].forEach(([x, y]) => r.fill(P.ell(x, y, 8, 7), '#e8d6a8', { k: K.fine, a: x }));
      r.fill(P.ell(1012, 424, 44, 8), '#efe3c4', { k: K.fine, a: 0 }); // dough disc
      hotelPans(r, 1102, 428, 64, 3, ['#e7c35a', '#b8503a', '#efe3c4']);
      rotiStack(r, 1158, 424, 44, 4);
      // the lead and a clipboard
      pLead = figure(r, { ...LEAD, omit: ['R'] });
      r.fill(P.rr(752, 400, 38, 52, 3), '#8f6a42', { k: K.prop, a: 0.3 });
      r.fill(P.rect(757, 408, 28, 38), '#f3f0e6', { k: K.fine, a: 0 });
      // the stirrer
      pStir = figure(r, { ...STIR, omit: ['L'] });
    },
    ink(c) {
      if (pStir) faceInk(c, pStir, { eyes: 'dots', smile: 0.4 });
      if (pLead) faceInk(c, pLead, { eyes: 'dots', smile: 0.9 });
      if (pChop) faceInk(c, pChop, { eyes: 'down', smile: 0.5 });
      if (pRoll) faceInk(c, pRoll, { eyes: 'closed', smile: 1.2 });
      if (pPort) faceInk(c, pPort, { eyes: 'down', smile: 0.4 });
      // handwriting on the roster board
      c.strokeStyle = 'rgba(60,50,48,0.7)'; c.lineWidth = 1.6; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const x = 730 + k * 36, y = 106 + i * 19; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 5, y - 5, x + 9, y + 4, x + 14, y - 2); c.bezierCurveTo(x + 18, y - 5, x + 22, y + 3, x + 26 - (k * 2), y - 1); c.stroke(); }
    },
    actors: [
      { // stirring arm with the long steel paddle
        box: [470, 280, 290, 150], frames: 8,
        draw(r, k) {
          const H = stirH(k), T: [number, number] = [506 + 5 * Math.cos((k / 8) * 6.28), 326 + 3 * Math.sin((k / 8) * 6.28)];
          const E: [number, number] = [T[0] + (H[0] - T[0]) * 1.4, T[1] + (H[1] - T[1]) * 1.4];
          r.line(P.path([T, E]), 8, C.steelL, { k: K.fine, a: 0.1 });
          r.fill(P.ell(T[0], T[1], 14, 8, 0.2), C.steel, { k: K.fine, a: 0 });
          figure(r, { ...STIR, only: ['L'], hands: { L: H } });
        },
        at: (t) => ({ k: cycK(t, 2.4, 8) }),
      },
      { // lead points the way, small and steady
        box: [800, 290, 130, 110], frames: 4,
        draw(r, k) { figure(r, { ...LEAD, only: ['R'], hands: { R: [908 + k * 2, 336 - k * 3] } }); },
        at: (t) => ({ k: pingK(t, 2.6, 4) }),
      },
      { // chopping
        box: [880, 330, 80, 112], frames: 6,
        draw(r, k) {
          const H = choppers(k);
          r.line(P.path([H, [H[0] - 15, 424]]), 5, '#e8eeee', { k: K.fine, a: 1.2 });
          r.line(P.path([[H[0] + 3, H[1] - 8], H]), 6, '#5a3e2a', { k: K.fine, a: 1.2 });
          figure(r, { ...CHOP, only: ['R'], hands: { R: H } });
        },
        at: (t) => ({ k: cycK(t, 0.9, 6) % 6 }),
      },
      { // rolling rotis: both arms push the pin
        box: [940, 330, 140, 110], frames: 8,
        draw(r, k) {
          const m = 11 * Math.sin((k / 8) * Math.PI * 2);
          r.line(P.path([[972 + m, 422], [1052 + m, 422]]), 10, '#c99a62', { k: K.fine, a: 0 });
          r.fill(P.ell(970 + m, 422, 6, 7), '#8f6a42', { k: K.fine, a: 0 }); r.fill(P.ell(1054 + m, 422, 6, 7), '#8f6a42', { k: K.fine, a: 0 });
          figure(r, { ...ROLL, only: ['L', 'R'], hands: { L: [976 + m, 424], R: [1046 + m, 424] } });
        },
        at: (t) => ({ k: cycK(t, 1.6, 8) }),
      },
      { // someone carries a tray of rotis across the room
        box: [330, 330, 190, 330], frames: 2, restT: 0,
        draw(r, k) {
          const dy = bounce(k);
          const H1: [number, number] = [carryX0 - 52, 472 + dy], H2: [number, number] = [carryX0 - 28, 476 + dy];
          const p = figure(r, { ...CARRY, x: carryX0, y: 640 + dy, stance: k ? 0.75 : 0.15, hands: { L: H1, R: H2 } });
          r.fill(P.rect(carryX0 - 78, 462 + dy, 96, 12), '#cfd7d8', { k: K.prop, a: 0 });
          r.fill(P.ell(carryX0 - 30, 458 + dy, 36, 9), '#efe3c4', { k: K.fine, a: 0 });
          [[-52, 455], [-30, 452], [-8, 456]].forEach(([dx, y]) => r.fill(P.ell(carryX0 + dx, y + dy, 12, 6), '#e8cf92', { k: K.fine, a: 0.3 }));
          figure(r, { ...CARRY, x: carryX0, y: 640 + dy, stance: k ? 0.75 : 0.15, hands: { L: H1, R: H2 }, only: ['L', 'R'] });
          return p;
        },
        ink(c, k, p) { void k; if (p) faceInk(c, p, { eyes: 'dots', smile: 0.8 }); },
        at: (t) => { const p = ((t / 13) % 1 + 1) % 1; const f = Math.min(1, p * 30, (1 - p) * 30); return { k: Math.floor(t * 3) % 2, dx: p * 540 - 0, alpha: f }; },
      },
    ],
    live(c, t) {
      steam(c, 495, 292, t, { h: 160, n: 4, spread: 24, seed: 0 });
      glowPulse(c, 490, 440, 220, t, '255,150,60', 0.2, 1);
      glowPulse(c, 490, 250, 120, t, '255,210,140', 0.14, 4);
      flame(c, 428, 386, t, 0.9, 1); flame(c, 552, 386, t, 0.9, 2);
    },
  };
}

// ---- 2. Pack ----------------------------------------------------------------------------------
function pack(): Scene {
  const faces: [Pose, 'down' | 'closed' | 'dots', number][] = [];
  const look: Look = {
    amb: [0.84, 0.9, 0.93], shadow: [0.6, 0.67, 0.92], accents: ACC, seed: 23, rim: [255, 214, 150],
    lights: [
      { x: 660, y: 230, r: 520, c: [1.4, 1.08, 0.62], k: 1.0 },
      { x: 400, y: 380, r: 240, c: [1.1, 0.9, 0.6], k: 0.3 },
    ],
    mask: islandMask(7, { px: 3.2, py: 2.6, top: 0.9, bot: 0.92, rag: 0.85 }),
  };
  const P1: Fig = crew({ x: 446, y: 604, R: 26, cut: 0, skin: SKIN[3], hair: '#21171a', top: '#e9dfc4', sleeve: 'short', glove: GLOVE, tilt: 0.1, lean: 8, hands: { L: [440, 420], R: [506, 448] } });
  const P2: Fig = crew({ x: 612, y: 606, R: 26.5, cut: 0, skin: SKIN[0], hair: '#241a17', top: '#7f93a8', sleeve: 'short', glove: GLOVE, tilt: 0.13, lean: 6, hands: { L: [580, 416], R: [646, 416] } });
  const P3: Fig = crew({ x: 776, y: 602, R: 25.5, cut: 0, skin: SKIN[5], hair: '#ece8e0', top: '#3f5a7a', sleeve: 'long', glove: GLOVE, tilt: -0.1, lean: -6, hands: { L: [668, 338], R: [872, 380] } });
  return {
    id: 'pack', label: 'Pack',
    caption: 'Every meal is packed by hand and checked, so it is still hot when it leaves the kitchen.',
    alt: 'A hatched drawing of three volunteers in matching red aprons, hairnets and gloves packing meals at a long table in morning light: one ladles dal into a steel tiffin, one lifts a tiffin lid, an older volunteer rests a hand on his shoulder and sets a box on a growing stack.',
    look,
    draw(r) {
      faces.length = 0;
      r.fill(P.rect(0, 0, DW, 470), grad(0, 0, 0, 470, [[0, '#a3b89e'], [1, '#86a388']]), { k: K.bg, a: 1.45 });
      patches(r, 70, 300, '#a9bda1', '#7f9e86', 14);
      r.fill(P.rect(0, 330, DW, 140), grad(0, 330, 0, 470, [[0, '#3f7b7d'], [1, '#2f6068']]), { k: K.bg, a: 1.5 });
      r.fill(P.rect(0, 322, DW, 10), '#e6d8b4', { k: K.base, a: 0 });
      windowFrame(r, 560, 84, 200, 208, [[0, '#f9e8b8'], [0.5, '#f6c680'], [1, '#f0a35f']], { cols: 2, rows: 2 });
      r.fill(P.poly([[560, 292], [560, 262], [598, 252], [640, 270], [690, 248], [730, 262], [760, 256], [760, 292]]), '#b58a62', { k: K.fine, a: 1.57 });
      marigolds(r, [[500, 90], [660, 150], [820, 88]], { n: 16, sz: 12, seed: 9, hang: true });
      r.fill(P.rect(1090, 250, 280, 9), C.woodD, { k: K.fine, a: 0 });
      [1130, 1190, 1250].forEach((x, i) => tiffin(r, x, 250, 40, 3 - (i % 2)));
      steelPot(r, 1320, 250, 50, 46, { lid: true });
      r.fill(P.rect(90, 230, 250, 9), C.woodD, { k: K.fine, a: 0 });
      [140, 200, 262, 320].forEach((x, i) => r.fill(P.rr(x - 20, 230 - 38 - (i % 2) * 8, 40, 38 + (i % 2) * 8, 6), i % 2 ? C.cream : '#c9893a', { k: K.base, a: 1.57 }));
      r.fill(P.rect(0, 470, DW, DH - 470), grad(0, 470, 0, DH, [[0, '#8a6a52'], [1, '#b08a60']]), { k: K.bg, a: 0.02 });
      r.fill(P.rect(0, 466, DW, 10), '#5b4538', { k: K.fine, a: 0 });
      faces.push([figure(r, { ...P1, omit: ['L'] }), 'down', 0.5]);
      faces.push([figure(r, { ...P2, omit: ['L', 'R'] }), 'down', 0.3]);
      faces.push([figure(r, { ...P3, omit: ['R'] }), 'closed', 1.2]);
      // the work table, seen a little from above
      r.fill(P.poly([[330, 440], [1010, 440], [1040, 534], [296, 534]]), '#b98a58', { k: K.bg, a: 0.04 });
      r.fill(P.poly([[296, 534], [1040, 534], [1046, 548], [290, 548]]), '#8f6a42', { k: K.fine, a: 0 });
      r.fill(P.poly([[296, 548], [1040, 548], [1046, 616], [290, 616]]), '#7a5a3a', { k: K.bg, a: 1.55 });
      [330, 520, 710, 900, 1030].forEach((x) => r.fill(P.rect(x - 6, 556, 12, 60), '#5e432b', { k: K.fine, a: 1.57 }));
      r.fill(P.poly([[330, 440], [1010, 440], [1012, 446], [328, 446]]), '#d4aa78', { k: K.fine, a: 0 });
      steelPot(r, 372, 484, 104, 80, { dark: true, lid: false, food: '#e0b040' });
      thali(r, 516, 482, 68, { food: false }); r.fill(P.ell(516, 477, 24, 6), '#e0b040', { k: K.fine, a: 0.1 });
      tiffin(r, 612, 488, 64, 3);
      tiffin(r, 706, 504, 62, 2);
      tiffin(r, 470, 528, 70, 3); tiffin(r, 566, 530, 70, 3);
      thali(r, 780, 496, 66); rotiStack(r, 828, 490, 48, 4);
      [[900, 3], [958, 2], [1016, 1]].forEach(([x, n]) => { for (let k = 0; k < n; k++) box(r, x, 500 - k * 36, 54, 33, k % 2 ? '#d9b88a' : '#e8dcc0', k % 2 ? C.teal : C.brick); });
    },
    ink(c) { faces.forEach(([p, e, s]) => faceInk(c, p, { eyes: e, smile: s })); },
    actors: [
      { // ladling dal into a tiffin tier
        box: [370, 340, 200, 140], frames: 6,
        draw(r, k) {
          const s = Math.sin((k / 6) * Math.PI * 2), H: [number, number] = [452 + 14 * s, 420 + 6 * Math.cos((k / 6) * Math.PI * 2)];
          r.line(P.path([[H[0] - 42, H[1] + 6], [H[0] + 32, H[1] - 6]]), 5, C.steelL, { k: K.fine, a: 0 });
          r.fill(P.ell(H[0] - 46, H[1] + 10, 14, 9, 0.3), C.steel, { k: K.fine, a: 0 });
          figure(r, { ...P1, only: ['L'], hands: { L: H } });
        },
        at: (t) => ({ k: cycK(t, 2.4, 6) }),
      },
      { // lifting the lid of a tiffin
        box: [545, 325, 140, 110], frames: 6,
        draw(r, k) {
          const lift = 14 * tri(k, 6) * 1; const y = 411 - 4 - lift * 1.0;
          r.fill(P.rr(581, y - 4, 62, 8, 3), '#cfd7d8', { k: K.prop, a: 0 });
          figure(r, { ...P2, only: ['L', 'R'], hands: { L: [580, y + 4], R: [646, y + 4] } });
        },
        at: (t) => ({ k: pingK(t, 2.2, 6) }),
      },
      { // setting one more box on the growing stack
        box: [810, 320, 150, 120], frames: 6,
        draw(r, k) {
          const lift = 18 * tri(k, 6);
          box(r, 900, 392 - lift, 54, 33, '#d9b88a', C.brick);
          figure(r, { ...P3, only: ['R'], hands: { R: [868, 378 - lift] } });
        },
        at: (t) => ({ k: pingK(t, 2.8, 6) }),
      },
    ],
    live(c, t) {
      steam(c, 372, 410, t, { h: 140, n: 3, spread: 20, seed: 0 });
      steam(c, 516, 470, t, { h: 70, n: 2, spread: 12, seed: 1, a: 0.28 });
      steam(c, 612, 396, t, { h: 50, n: 1, spread: 8, seed: 2, a: 0.24 });
      glowPulse(c, 660, 232, 280, t, '255,205,120', 0.1, 2);
    },
  };
}

// ---- 3. Deliver -------------------------------------------------------------------------------
function deliver(): Scene {
  let elder: Pose | null = null, vol: Pose | null = null;
  const G = 540; // ground line of the facade
  const look: Look = {
    amb: [0.92, 0.96, 0.98], shadow: [0.6, 0.66, 0.93], accents: ACC, seed: 37, rim: [255, 220, 160],
    lights: [
      { x: 250, y: 20, r: 1100, c: [1.1, 0.98, 0.72], k: 0.55 },
      { x: 945, y: 400, r: 240, c: [1.5, 0.96, 0.5], k: 0.95 },
    ],
    mask: islandMask(12, { px: 3.2, py: 2.6, top: 0.9, bot: 0.92, rag: 0.85 }),
  };
  const V: Fig = crew({ x: 752, y: 586, R: 26, turn: 0.7, dir: 1, shadow: 'rgba(40,34,30,0.35)', skin: SKIN[0], hair: BRAND, hairStyle: 'cap', top: '#e9dfc4', sleeve: 'short', glove: GLOVE, bottom: '#2c3a52', tilt: 0.1, lean: 8, stance: 0.5 });
  const E: Fig = { x: 950, y: G, R: 24, turn: 0.55, dir: -1, skin: SKIN[3], hair: '#eeeae2', hairStyle: 'white', top: '#3a4a66', sleeve: 'long', bottom: '#4a3b57', tilt: -0.1, lean: -14, bendBody: -4, crouch: 16,
    shawl: { c: '#e9dfc4', trim: '#dc8226', tail: true } };
  const handoff = (s: number) => { const T = 850 + 12 * s; return { T, vR: [T - 22, 394] as [number, number], vL: [T - 42, 412] as [number, number], eL: [T + 31 + 2 * s, 396] as [number, number], eR: [T + 41 + 2 * s, 413] as [number, number] }; };
  return {
    id: 'deliver', label: 'Deliver', focus: 780,
    caption: 'Someone is already waiting. A hot meal is handed over at the door, still warm.',
    alt: 'A hatched drawing of a bright morning street: a volunteer in a red apron and cap carries a steel tiffin from the team van to an elder in a shawl who waits smiling in a doorway under a marigold string, with a chalk rangoli on the doorstep.',
    look,
    draw(r) {
      r.fill(P.rect(0, 0, DW, 560), grad(0, 0, 0, 560, [[0, '#bcd3d0'], [0.55, '#e3e6d3'], [1, '#f3ead0']]), { k: K.sky, a: -0.1 });
      for (let i = 0; i < 9; i++) r.fill(P.ell(60 + i * 170, 70 + (i % 3) * 50, 130, 24, 0), 'rgba(250,244,228,0.75)', { k: K.sky, a: -0.1 });
      r.fill(P.blob([[0, 380], [120, 340], [260, 360], [420, 326], [560, 362], [700, 350], [700, G], [0, G]]), '#9db5ae', { k: K.bg, a: -0.15 });
      for (let i = 0; i < 5; i++) { const x = 30 + i * 100, y0 = 380 - (i % 3) * 16; r.fill(P.rect(x, y0, 72, G - y0), i % 2 ? '#a8b8a2' : '#c2b99a', { k: K.fine, a: 1.57 }); r.fill(P.poly([[x - 4, y0], [x + 76, y0], [x + 58, y0 - 22], [x + 14, y0 - 22]]), '#9a5a44', { k: K.fine, a: 0.2 }); }
      r.fill(P.rect(108, 300, 18, G - 300), '#6c4a38', { k: K.fine, a: 1.57 });
      [[118, 262, 112, 82], [52, 304, 82, 58], [186, 308, 86, 60], [118, 214, 72, 52]].forEach(([x, y, rx, ry], i) => r.fill(P.ell(x, y, rx, ry, 0.2 * i), i % 2 ? '#7f9a7a' : '#6c8c6e', { k: K.bg, a: 0.6 + i * 0.4 }));
      r.fill(P.rect(640, 30, 760, G - 30), grad(0, 40, 0, G, [[0, '#a8b99d'], [1, '#98ac92']]), { k: K.bg, a: 1.5 });
      for (let i = 0; i < 8; i++) r.fill(P.ell(700 + i * 95, 100 + ((i * 77) % 220), 60, 34, 0.2 * i), i % 2 ? '#b6c6aa' : '#8fa68b', { k: K.bg, a: 1.3 });
      bricks(r, 640, 400, 1400, G + 2, { seed: 12, w: 54, h: 21 });
      r.fill(P.rect(640, 392, 760, 12), '#e6d8b4', { k: K.base, a: 0 });
      windowFrame(r, 1140, 120, 110, 150, [[0, '#cfe0dc'], [1, '#f3ead0']], { cols: 2, rows: 3, frame: '#2f6068', sill: true });
      r.fill(P.rect(1116, 290, 158, 26), '#7f5a3c', { k: K.base, a: 0 });
      for (let i = 0; i < 12; i++) r.fill(P.ell(1126 + i * 12.5, 290 - (i % 3) * 3, 8, 7), i % 3 ? C.marig : C.saff, { k: K.fine, a: i });
      for (let i = 0; i < 7; i++) r.fill(P.ell(1128 + i * 22, 298, 6, 12, 0.4), C.leaf, { k: K.fine, a: 1 });
      r.fill(P.rect(850, 196, 190, G - 196), '#2f6068', { k: K.base, a: 1.57 });
      r.fill(P.rect(866, 212, 158, G - 212), grad(0, 212, 0, G, [[0, '#c98a3a'], [0.5, '#f1b45a'], [1, '#f6cf86']]), { k: K.glow, a: 1.5 });
      r.fill(P.poly([[836, 146], [1054, 146], [1078, 216], [812, 216]]), C.cream, { k: K.base, a: 0.3 });
      for (let i = 0; i < 6; i++) r.fill(P.poly([[836 + i * 36.3, 146], [836 + i * 36.3 + 18.2, 146], [812 + i * 44.3 + 22, 216], [812 + i * 44.3, 216]]), C.brick, { k: K.base, a: 1.4 });
      for (let i = 0; i < 6; i++) r.fill(P.ell(812 + i * 44.3 + 22, 216, 22, 10), i % 2 ? C.cream : C.brick, { k: K.base, a: 0 });
      marigolds(r, [[868, 228], [945, 258], [1022, 228]], { n: 10, sz: 10, seed: 6, hang: true });
      r.fill(P.rect(0, G, DW, DH - G), grad(0, G, 0, DH, [[0, '#b4ab98'], [1, '#8f8e86']]), { k: K.bg, a: 0.02 });
      r.fill(P.rect(0, G - 4, DW, 8), '#6e6a60', { k: K.fine, a: 0 });
      r.fill(P.rect(0, 610, DW, 3), '#7d7a70', { k: K.fine, a: 0 });
      // the team van, with a simple wordmark stripe (no logo)
      const vx = 250, vy = 400;
      r.fill(P.ell(vx + 190, 556, 215, 16), 'rgba(50,46,42,0.4)', { k: K.flat, a: 0 });
      r.fill(P.blob([[vx, vy + 50], [vx + 4, vy + 6], [vx + 70, vy - 6], [vx + 372, vy - 6], [vx + 380, vy + 140], [vx + 6, vy + 146]]), '#eee5cc', { k: K.base, a: 0.1 });
      r.fill(P.poly([[vx + 10, vy + 8], [vx + 86, vy + 2], [vx + 96, vy + 58], [vx + 12, vy + 62]]), '#35656b', { k: K.glow, a: 1.2 });
      r.fill(P.rect(vx + 110, vy + 6, 90, 52), '#35656b', { k: K.glow, a: 1.2 });
      r.fill(P.rect(vx + 4, vy + 76, 376, 26), BRAND, { k: K.base, a: 0 });
      [[18, 30], [54, 18], [78, 40], [124, 16], [146, 28], [180, 14], [200, 44], [250, 22], [278, 34], [318, 20]].forEach(([dx, w]) => r.fill(P.rr(vx + dx + 10, vy + 84, w, 10, 3), '#f4ecd8', { k: K.fine, a: 0 }));
      r.fill(P.rect(vx + 4, vy + 104, 376, 7), C.teal, { k: K.base, a: 0 });
      r.fill(P.rect(vx + 140, vy - 18, 70, 12), C.marig, { k: K.base, a: 0 });
      r.fill(P.poly([[vx + 372, vy + 2], [vx + 408, vy - 4], [vx + 408, vy + 136], [vx + 372, vy + 140]]), '#d4c9aa', { k: K.base, a: 1.57 });
      r.fill(P.rect(vx + 330, vy + 70, 44, 66), '#d9b88a', { k: K.fine, a: 0 });
      [[vx + 82, vy + 146], [vx + 306, vy + 146]].forEach(([x, y]) => { r.fill(P.ell(x, y, 38, 38), '#2b2724', { k: K.base, a: 0.5 }); r.fill(P.ell(x, y, 17, 17), C.steel, { k: K.base, a: 0 }); });
      vol = figure(r, { ...V, omit: ['L', 'R'] });
      elder = figure(r, { ...E, omit: ['L', 'R'] });
      rangoli(r, 950, 566, 110, 26, 4);
    },
    ink(c) { if (elder) faceInk(c, elder, { eyes: 'closed', smile: 1.5 }); if (vol) faceInk(c, vol, { eyes: 'dots', smile: 0.9 }); },
    actors: [
      { // the hand-off: tiffin, two volunteer hands, two elder hands
        box: [770, 295, 200, 175], frames: 6,
        draw(r, k) {
          const h = handoff(tri(k, 6));
          tiffin(r, h.T, 430, 58, 3);
          figure(r, { ...V, only: ['L', 'R'], hands: { L: h.vL, R: h.vR } });
          figure(r, { ...E, only: ['L', 'R'], hands: { L: h.eL, R: h.eR } });
        },
        at: (t) => ({ k: pingK(t, 3, 6) }),
      },
    ],
    live(c, t) {
      steam(c, 856, 358, t, { h: 70, n: 2, spread: 8, seed: 1, a: 0.3 });
      glowPulse(c, 945, 400, 160, t, '255,190,100', 0.12, 3);
    },
  };
}

// ---- 4. Share ---------------------------------------------------------------------------------
function share(): Scene {
  let bulbPts: [number, number][] = [];
  const poses: Record<string, Pose> = {};
  const look: Look = {
    amb: [0.46, 0.56, 0.74], shadow: [0.55, 0.6, 0.95], accents: [hex(C.teal), hex(C.marig), hex(C.brick), hex(C.ochre), hex('#5a6fa0')], seed: 51, rim: [255, 200, 120],
    lights: [
      { x: 500, y: 150, r: 380, c: [1.55, 0.95, 0.42], k: 1.0 },
      { x: 900, y: 150, r: 380, c: [1.55, 0.95, 0.42], k: 1.0 },
      { x: 690, y: 256, r: 190, c: [1.5, 0.85, 0.35], k: 0.9 },
      { x: 700, y: 440, r: 320, c: [1.3, 0.82, 0.4], k: 0.5 },
    ],
    mask: islandMask(18, { px: 3.2, py: 2.6, top: 0.9, bot: 0.92, rag: 0.85 }),
  };
  const NEI1: Fig = { x: 430, y: 606, R: 26, turn: 0.3, dir: 1, cut: 0, skin: SKIN[0], hair: '#241a17', hairStyle: 'short', top: '#3f7b7d', sleeve: 'short', lean: -3, hands: { L: [398, 446], R: [462, 446] } };
  const SERVER: Fig = crew({ x: 548, y: 612, R: 28, turn: 0.36, dir: 1, cut: 0, skin: SKIN[2], hair: '#241a17', top: '#e9dfc4', sleeve: 'short', glove: GLOVE, tilt: 0.1, lean: 6, hands: { L: [512, 452], R: [600, 436] } });
  const ELDER: Fig = { x: 668, y: 606, R: 26, turn: 0.35, dir: -1, cut: 0, skin: SKIN[5], hair: '#ece8e0', hairStyle: 'white', top: '#2f3f5f', sleeve: 'long', tilt: 0.16, lean: 8,
    shawl: { c: '#e2962c', trim: '#a3302a', tail: false }, hands: { L: [636, 468], R: [704, 468] } };
  const WOMAN: Fig = { x: 790, y: 606, R: 26, turn: 0.36, dir: 1, cut: 0, skin: SKIN[1], hair: '#241a17', hairStyle: 'bun', top: '#b9502f', sleeve: 'short', tilt: 0.12, lean: 4, hands: { L: [716, 346], R: [846, 452] } };
  const MAN: Fig = { x: 905, y: 606, R: 26.5, turn: 0.36, dir: -1, cut: 0, skin: SKIN[4], hair: '#241a17', hairStyle: 'short', top: '#d9a02c', sleeve: 'short', lean: 0, hands: { L: [882, 452], R: [952, 446] } };
  const KID: Fig = { x: 0, y: 640, R: 21, kid: true, turn: 0.3, dir: -1, shadow: 'rgba(20,16,20,0.4)', skin: SKIN[4], hair: '#1f1716', hairStyle: 'short', top: '#3f7b7d', sleeve: 'short', bottom: '#3a3550', tilt: 0.12 };
  const passPlate = (s: number) => { const x = 852 + 16 * s, y = 450 - 8 * Math.sin(s * Math.PI); return { x, y, wh: [x - 30, y + 8] as [number, number], mh: [x + 32, y + 10] as [number, number] }; };
  const kidX = 930;
  return {
    id: 'share', label: 'Share',
    caption: 'By night, there are more people at the table than there were at dawn.',
    alt: 'A hatched drawing of an evening meal under a string of warm lights: a volunteer in a red apron ladles food for a smiling elder, a woman passes a plate to a laughing man, neighbors turn to talk, and a child carefully carries a plate to the table, with a single diya glowing on the window sill.',
    look,
    draw(r) {
      r.fill(P.rect(0, 0, DW, 470), grad(0, 0, 0, 470, [[0, '#22405a'], [0.55, '#2f5e6c'], [1, '#3a706f']]), { k: K.bg, a: 1.45 });
      patches(r, 90, 380, '#3d6a78', '#2c5460', 16);
      r.fill(P.rect(110, 250, 250, 9), C.woodD, { k: K.fine, a: 0 });
      [150, 200, 250, 300, 340].forEach((x, i) => r.fill(P.ell(x, 244 - (i % 2) * 2, 20, 6), i % 2 ? C.steel : C.cream, { k: K.base, a: 0 }));
      [160, 230, 300].forEach((x, i) => r.fill(P.rr(x - 18, 200 - i * 2, 36, 44, 8), i % 2 ? '#c9893a' : C.cream, { k: K.base, a: 1.57 }));
      r.fill(P.rect(1050, 250, 300, 9), C.woodD, { k: K.fine, a: 0 });
      [1090, 1140, 1190, 1240, 1290, 1330].forEach((x, i) => r.fill(P.ell(x, 244 - (i % 2) * 2, 20, 6), i % 2 ? C.steel : C.cream, { k: K.base, a: 0 }));
      [1100, 1170, 1240, 1310].forEach((x, i) => r.fill(P.rr(x - 18, 200 - i * 2, 36, 44, 8), i % 2 ? '#c9893a' : C.cream, { k: K.base, a: 1.57 }));
      windowFrame(r, 600, 54, 190, 186, [[0, '#1d2c4c'], [0.5, '#3c4f7c'], [0.82, '#c9825a'], [1, '#efb26a']], { skyline: true, seed: 14 });
      marigolds(r, [[540, 60], [695, 112], [850, 58]], { n: 16, sz: 11.5, seed: 12, hang: true });
      bulbPts = [
        ...bulbs(r, [[130, 70], [420, 230], [700, 130]], 10, { seed: 2, sz: 7 }),
        ...bulbs(r, [[700, 130], [980, 230], [1270, 70]], 10, { seed: 3, sz: 7 }),
      ];
      r.fill(P.rect(0, 470, DW, DH - 470), grad(0, 470, 0, DH, [[0, '#5a483e'], [1, '#7d6049']]), { k: K.bg, a: 0.02 });
      r.fill(P.rect(0, 466, DW, 10), '#352a26', { k: K.fine, a: 0 });
      diya(r, 690, 252, 1.5);
      poses.nei = figure(r, { ...NEI1, omit: ['head'] });
      poses.server = figure(r, { ...SERVER, omit: ['R'] });
      poses.elder = figure(r, ELDER);
      poses.woman = figure(r, { ...WOMAN, omit: ['R'] });
      poses.man = figure(r, { ...MAN, omit: ['head', 'L'] });
      // table plane, cloth, food
      r.fill(P.poly([[352, 440], [970, 440], [1000, 514], [326, 514]]), '#d9ad52', { k: K.bg, a: 0.05 });
      r.fill(P.poly([[326, 514], [1000, 514], [1002, 560], [324, 560]]), '#c4973f', { k: K.bg, a: 1.5 });
      r.fill(P.poly([[324, 538], [1002, 538], [1002, 552], [324, 552]]), '#8f3a2c', { k: K.fine, a: 0 });
      r.fill(P.poly([[352, 440], [970, 440], [972, 446], [350, 446]]), '#b08a38', { k: K.fine, a: 0 });
      [[430, 474, 0], [548, 476, 1], [668, 478, 2]].forEach(([x, y], i) => thali(r, x, y, 84, { cols: i % 2 ? ['#e7c35a', '#f2ead0', '#b8503a'] : undefined }));
      thali(r, 790, 480, 84); thali(r, 905, 478, 84, { cols: ['#e7c35a', '#f2ead0', '#b8503a'] });
      steelPot(r, 612, 508, 74, 46, { brass: true, lid: false, food: '#e0a83a' });
      [[388, 494], [488, 504], [740, 500], [850, 504], [960, 498]].forEach(([x, y]) => r.fill(P.rr(x - 8, y - 24, 16, 26, 4), C.steelL, { k: K.prop, a: 1.57 }));
      rotiStack(r, 742, 468, 46, 4);
    },
    ink(c) {
      faceInk(c, poses.server, { eyes: 'down', smile: 0.8 });
      faceInk(c, poses.elder, { eyes: 'closed', smile: 1.7 });
      faceInk(c, poses.woman, { eyes: 'closed', smile: 1.3 });
    },
    actors: [
      { // a neighbour turns to chat: head tilts side to side
        box: [360, 236, 150, 112], frames: 5,
        draw(r, k) { return figure(r, { ...NEI1, only: ['head'], tilt: (k - 2) * 0.1 }); },
        ink(c, k, p) { if (p) faceInk(c, p, { eyes: 'closed', smile: 1.4, look: k - 2 }); },
        at: (t) => ({ k: pingK(t, 4.2, 5) }), restT: 2.1,
      },
      { // the server ladles from the pot to the elder's plate
        box: [520, 325, 200, 165], frames: 6,
        draw(r, k) {
          const s = tri(k, 6), H: [number, number] = [600 + 50 * s, 440 - 18 * Math.sin(s * Math.PI)];
          r.line(P.path([[H[0] - 8, H[1] - 6], [H[0] + 6, H[1] + 38]]), 5, C.steelL, { k: K.fine, a: 1.5 });
          r.fill(P.ell(H[0] + 8, H[1] + 42, 13, 8, 0.3), C.steel, { k: K.fine, a: 0 });
          figure(r, { ...SERVER, only: ['R'], hands: { R: H } });
        },
        at: (t) => ({ k: pingK(t, 3.4, 6) }),
      },
      { // plate passes from her hand to his
        box: [790, 330, 190, 170], frames: 6,
        draw(r, k) {
          const pp = passPlate(tri(k, 6));
          r.fill(P.ell(pp.x, pp.y + 8, 48, 13), '#e9eeee', { k: K.prop, a: 0 });
          r.fill(P.ell(pp.x - 2, pp.y + 5, 34, 9), '#e7b640', { k: K.fine, a: 0.2 });
          r.fill(P.ell(pp.x + 12, pp.y + 4, 14, 7), '#f6efd8', { k: K.fine, a: 0.1 });
          r.fill(P.ell(pp.x - 14, pp.y + 3, 8, 5), '#b8503a', { k: K.fine, a: 0.1 });
          figure(r, { ...WOMAN, only: ['R'], hands: { R: pp.wh } });
          figure(r, { ...MAN, only: ['L'], hands: { L: pp.mh } });
        },
        at: (t) => ({ k: pingK(t, 3.2, 6) }),
      },
      { // he laughs and looks across the table
        box: [840, 236, 130, 112], frames: 5,
        draw(r, k) { return figure(r, { ...MAN, only: ['head'], tilt: 0.12 - k * 0.06 }); },
        ink(c, k, p) { if (p) faceInk(c, p, { eyes: 'closed', smile: 1.8, look: 2 - k }); },
        at: (t) => ({ k: pingK(t, 3.6, 5) }), restT: 0.2,
      },
      { // the child carries a plate across, carefully
        box: [kidX - 80, 400, 150, 250], frames: 2, restT: 1.4,
        draw(r, k) {
          const dy = k ? -2 : 0, x = kidX, sp = { ...KID, x, y: 640 + dy, stance: k ? 0.6 : 0.1, hands: { L: [x - 30, 540 + dy] as [number, number], R: [x - 12, 545 + dy] as [number, number] } };
          const p = figure(r, sp);
          r.fill(P.ell(x - 22, 548 + dy, 28, 7), C.steel, { k: K.prop, a: 0 });
          r.fill(P.ell(x - 22, 545 + dy, 18, 5), '#f0dba5', { k: K.fine, a: 0 });
          r.fill(P.ell(x - 14, 543 + dy, 8, 4), '#b8503a', { k: K.fine, a: 0 });
          figure(r, { ...sp, only: ['L', 'R'] });
          return p;
        },
        ink(c, k, p) { void k; if (p) faceInk(c, p, { eyes: 'dots', smile: 1.1 }); },
        at: (t) => { const p = ((t / 11) % 1 + 1) % 1; return { k: Math.floor(t * 3) % 2, dx: -p * 280, alpha: Math.min(1, p * 30, (1 - p) * 30) }; },
      },
    ],
    live(c, t) {
      twinkle(c, bulbPts, t, 0.5);
      flame(c, 690, 244, t, 1.3, 3);
      glowPulse(c, 690, 240, 120, t, '255,160,70', 0.22, 5);
      steam(c, 612, 462, t, { h: 70, n: 2, spread: 10, seed: 2, a: 0.26 });
    },
  };
}

export const scenes: Scene[] = [cook(), pack(), deliver(), share()];
void [diya, bricks];
