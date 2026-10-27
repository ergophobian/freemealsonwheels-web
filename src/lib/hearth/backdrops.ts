// Page-level painted backdrops, drawn once with the same stroke engine: a soft hatched sky behind the hero,
// and grass + marigolds growing up from the bottom edge behind the footer.
import { Ref, Painter, clock, P, K, rng, makeNoise, hex, TAU, clamp, lerp, sstep, type Look } from './engine';
import { grad } from './props';

export function skyJob(cv: HTMLCanvasElement, w: number, h: number) {
  const ref = new Ref(w, h, 1, 0, 0);
  const nz = makeNoise(21);
  ref.fill(P.rect(0, 0, w, h), grad(0, 0, 0, h, [[0, '#cbd8d3'], [0.32, '#dfe5d8'], [0.62, '#f0ebdb'], [0.9, '#f6f1e6'], [1, '#f6f1e6']]), { k: K.sky, a: -0.1 });
  const R = rng(4);
  for (let i = 0; i < 22; i++) {
    const x = R() * w, y = 40 + R() * h * 0.5, rx = 120 + R() * 220, ry = 22 + R() * 46;
    ref.fill(P.ell(x, y, rx, ry, (R() - 0.5) * 0.15), i % 3 ? 'rgba(250,244,228,0.7)' : 'rgba(168,190,186,0.45)', { k: K.sky, a: -0.08 + (R() - 0.5) * 0.12 });
  }
  // soft sage-teal drifts either side of where the island sits (the middle stays calm for the text)
  for (let i = 0; i < 16; i++) {
    const left = i % 2 === 0, x = left ? w * (0.02 + R() * 0.26) : w * (0.72 + R() * 0.26), y = h * (0.36 + R() * 0.38);
    ref.fill(P.ell(x, y, 150 + R() * 220, 26 + R() * 44, (R() - 0.5) * 0.2), i % 3 ? '#c3d2ca' : '#d5ddcf', { k: K.sky, a: -0.1 + (R() - 0.5) * 0.18 });
  }
  const look: Look = {
    amb: [1, 1, 1], shadow: [1, 1, 1], lights: [], accents: [hex('#c4d3cc'), hex('#eadfc4')], seed: 77, density: 0.55,
    mask: (u, v) => 1 - sstep(0.7, 1, v) * 0 + (nz(u * 9, v * 9) - 0.5) * 0, // stays 1: the gradient itself ends at paper colour
  };
  const ctx = cv.getContext('2d')!;
  const p = new Painter(ref, look, ctx, 1);
  return p.run();
}

/** grass and marigolds from the bottom edge, blade strokes painted back to front */
export function* footJob(cv: HTMLCanvasElement, w: number, h: number, dpr: number): Generator<void> {
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = rng(515), nz = makeNoise(33), nz2 = makeNoise(34);
  const greens = ['#7f9a7a', '#6c8c6e', '#8ea87f', '#5a7d6a', '#9bb08a', '#4f7468', '#a3b48a'].map(hex);
  const warm = ['#c9a14a', '#b88a3a', '#a7a05a'].map(hex);
  const blooms = ['#eba21e', '#dc8226', '#f2c24a', '#c8432b', '#e8b53a'].map(hex);
  const rgb = (c: number[], m = 1, k = 0) => `rgb(${clamp(c[0] * m + k, 0, 255) | 0},${clamp(c[1] * m + k, 0, 255) | 0},${clamp(c[2] * m + k, 0, 255) | 0})`;
  const heightAt = (x: number) => { const a = nz(x / 160, 3), b = nz2(x / 45, 9); return h * (0.2 + 0.62 * Math.pow(a, 1.4) + 0.14 * b); };
  const layers = [
    { n: Math.round(w * 0.55), hs: 1.0, alpha: 0.5, dark: 1.12, wid: 2.4 },
    { n: Math.round(w * 0.8), hs: 0.78, alpha: 0.75, dark: 1.0, wid: 3.0 },
    { n: Math.round(w * 1.0), hs: 0.52, alpha: 0.95, dark: 0.88, wid: 3.6 },
  ];
  const blades: { x: number; top: number }[] = [];
  let count = 0;
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const x = R() * (w + 40) - 20, hh = heightAt(x) * L.hs * (0.45 + 0.7 * R());
      const lean = (nz(x / 90 + 5, 1) - 0.5) * 70 + (R() - 0.5) * 30;
      const base = h + 4, topY = base - hh, topX = x + lean;
      const g = R() < 0.14 ? warm[(R() * warm.length) | 0] : greens[(R() * greens.length) | 0];
      const m = L.dark * (0.9 + R() * 0.25);
      ctx.globalAlpha = L.alpha * (0.75 + 0.25 * R()) * (0.4 + 0.6 * sstep(0, 0.35, (base - topY) / h * 1.6));
      ctx.strokeStyle = rgb(g, m, 0); ctx.lineWidth = L.wid * (0.7 + 0.6 * R()); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + lean * 0.15, base - hh * 0.6, topX, topY); ctx.stroke();
      // a second, lighter hatch tick for texture
      if (R() < 0.5) { ctx.globalAlpha *= 0.7; ctx.lineWidth *= 0.45; ctx.strokeStyle = rgb(g, m * 1.18, 16); ctx.beginPath(); ctx.moveTo(x + 1, base - hh * 0.1); ctx.quadraticCurveTo(x + lean * 0.2, base - hh * 0.6, topX + 1, topY + 3); ctx.stroke(); }
      if (L.hs > 0.7 && R() < 0.05) blades.push({ x: topX, top: topY });
      if (!(++count & 255) && performance.now() > clock.deadline) yield;
    }
    yield;
  }
  // marigolds on stems: short radial hatch around a centre
  for (const b of blades.concat(Array.from({ length: Math.round(w / 70) }, () => { const x = R() * w; return { x, top: h - heightAt(x) * 0.5 * (0.5 + R()) }; }))) {
    const c = blooms[(R() * blooms.length) | 0], rr = 7 + R() * 7;
    ctx.globalAlpha = 0.95; ctx.strokeStyle = rgb(greens[1], 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x, h + 2); ctx.quadraticCurveTo(b.x + (R() - 0.5) * 12, h - (h - b.top) * 0.5, b.x, b.top + 3); ctx.stroke();
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * TAU + R() * 0.3, d = rr * (0.25 + 0.75 * R());
      ctx.strokeStyle = rgb(c, 0.82 + R() * 0.3, R() * 14); ctx.lineWidth = 2.4 * (0.7 + R() * 0.6); ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * d * 0.2, b.top + Math.sin(a) * d * 0.2); ctx.lineTo(b.x + Math.cos(a) * d, b.top + Math.sin(a) * d * 0.85); ctx.stroke();
    }
    ctx.fillStyle = rgb(hex('#8a4a1c')); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(b.x, b.top, 2.2, 0, TAU); ctx.fill();
    if (!(++count & 7) && performance.now() > clock.deadline) yield;
  }
  // a soft ground wash along the bottom edge, in short horizontal hatch
  for (let i = 0; i < w * 0.9; i++) {
    const x = R() * w, y = h - R() * 22;
    ctx.globalAlpha = 0.7 * R(); ctx.strokeStyle = rgb(greens[(R() * 7) | 0], 0.72);
    ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + R() * 10, y + (R() - 0.5) * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  void lerp;
}
