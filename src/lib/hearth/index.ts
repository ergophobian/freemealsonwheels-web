// /hearth controller: paints the four moments progressively, caches them as bitmaps, turns between them
// with a re-hatch wipe, and brings the figures to life with small cached hatch sprites per keyframe.
// HTML and CSS never wait on any of this.
import { Ref, Painter, Slicer, clamp, lerp } from './engine';
import { scenes, DW, DH } from './scenes';
import { Wipe } from './transition';
import { skyJob, footJob } from './backdrops';

type Spr = { cv: HTMLCanvasElement; bx: number; by: number; w: number; h: number };
type S = { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; state: 0 | 1 | 2; spr: Spr[][]; sprLeft: number; full: HTMLCanvasElement | null };

export function boot() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const island = $('h-island'), cv = $<HTMLCanvasElement>('h-cv'), lv = $<HTMLCanvasElement>('h-live'), av = $<HTMLCanvasElement>('h-act');
  if (!island || !cv || !lv || !av) return;
  const q = new URLSearchParams(location.search);
  const freeze = q.get('freeze') === '1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinned = q.get('t') !== null;
  const still = (freeze || reduced) && !pinned;
  const W0 = performance.now();
  const hs = ((window as unknown as { __hearth: Record<string, unknown> }).__hearth = { t: { boot: W0 } as Record<string, number>, ready: false, act: false, all: false, foot: false, sky: false, cur: 0, tick: (_: number) => {} });
  const tm = hs.t as Record<string, number>;
  const dctx = cv.getContext('2d')!, lctx = lv.getContext('2d')!, actx = av.getContext('2d')!;
  const slicer = new Slicer();
  let cur = clamp((parseInt(q.get('stop') ?? '1', 10) || 1) - 1, 0, scenes.length - 1);
  let W = 0, H = 0, s = 1, wFocus = 0, dpr = 1, gen = 0;
  const OX = (i: number) => W / 2 - lerp(DW / 2, scenes[i].focus ?? DW / 2, wFocus) * s; // each moment can centre its own crop on a phone
  let scn: S[] = [];
  let wipe: Wipe | null = null, wiping = false, fading: { from: HTMLCanvasElement; t0: number } | null = null;
  let visible = true, actT0 = performance.now();
  const manual = q.get('t'); // ?t=1.3 pins the idle animation to a time (for deterministic shots)

  const caption = $('h-cap'), handle = $('h-handle'), scrub = $('h-scrub');
  const stops = Array.from(document.querySelectorAll<HTMLElement>('.h-stop'));

  // ---- layout and painting ---------------------------------------------------------------------
  function layout() {
    W = Math.round(island!.getBoundingClientRect().width) || 1000;
    const visW = lerp(690, DW, clamp((W - 390) / (1100 - 390)));
    s = W / visW; wFocus = 1 - clamp((W - 390) / (1100 - 390)); H = Math.round(DH * s);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    island!.style.height = H + 'px';
    for (const c of [cv!, lv!, av!]) { c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
  }

  function* spriteJob(i: number, ai: number, k: number, g: number): Generator<void> {
    const sc = scenes[i], A = sc.actors![ai];
    const ox = OX(i), bx = Math.floor(A.box[0] * s + ox), by = Math.floor(A.box[1] * s), w = Math.ceil(A.box[2] * s) + 2, h = Math.ceil(A.box[3] * s) + 2;
    const spr: Spr = { cv: document.createElement('canvas'), bx, by, w, h };
    spr.cv.width = Math.ceil(w * dpr); spr.cv.height = Math.ceil(h * dpr);
    const ctx = spr.cv.getContext('2d')!;
    const ref = new Ref(w, h, s, ox - bx, -by);
    const pose = A.draw(ref, k) || undefined; yield;
    const p = new Painter(ref, { ...sc.look, mask: () => 1, density: 1, seed: sc.look.seed + 131 * (ai * 13 + k + 1) }, ctx, dpr);
    yield* p.run();
    if (A.ink) { ctx.save(); ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - bx), dpr * -by); A.ink(ctx, k, pose); ctx.restore(); }
    if (g !== gen) return;
    const st = scn[i]; st.spr[ai][k] = spr; st.sprLeft--;
    if (st.sprLeft === 0) {
      tm['act' + i] = performance.now() - W0;
      if (i === cur) { hs.act = true; if (still || !wiping) show(); if (pinned) hs.tick(parseFloat(manual!)); }
    }
  }

  function startScene(i: number, front = false) {
    const sc = scenes[i], g = gen;
    const hi = document.createElement('canvas'); hi.width = Math.ceil(W * dpr); hi.height = Math.ceil(H * dpr);
    const acts = sc.actors ?? [];
    const st: S = { cv: hi, ctx: hi.getContext('2d')!, state: 1, spr: acts.map(() => []), sprLeft: acts.reduce((a, b) => a + b.frames, 0), full: null };
    scn[i] = st;
    const job = (function* () {
      const ref = new Ref(W, H, s, OX(i), 0);
      sc.draw(ref); yield;
      const painter = new Painter(ref, { ...sc.look, density: sc.look.density ?? 1 }, st.ctx, dpr, () => {
        if (g !== gen) return;
        if (i === cur) { tm.first = performance.now() - W0; island!.classList.add('is-painting'); }
      });
      yield* painter.run();
      if (sc.ink) { st.ctx.save(); st.ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * OX(i), 0); sc.ink(st.ctx); st.ctx.restore(); }
    })();
    slicer.add(job, () => {
      if (g !== gen) return;
      st.state = 2;
      tm['scene' + i] = performance.now() - W0;
      if (i === cur) { show(); hs.ready = true; island!.classList.remove('is-painting'); island!.classList.add('is-done'); }
      if (!acts.length) { hs.act = hs.act || i === cur; }
      if (scenes.every((_, k) => scn[k]?.state === 2)) { hs.all = true; tm.all = performance.now() - W0; }
    }, 's' + i, front);
    acts.forEach((a, ai) => { for (let k = 0; k < a.frames; k++) slicer.add(spriteJob(i, ai, k, g), undefined, 's' + i); });
  }

  /** the scene with its moving parts baked at their rest pose (for stills and as the target of a turn) */
  function composeFull(i: number): HTMLCanvasElement {
    const st = scn[i];
    if (st.full) return st.full;
    const c = document.createElement('canvas'); c.width = st.cv.width; c.height = st.cv.height;
    const x = c.getContext('2d')!; x.drawImage(st.cv, 0, 0);
    drawActors(x, i, 0, true);
    st.full = c; return c;
  }

  function drawActors(x: CanvasRenderingContext2D, i: number, t: number, rest = false) {
    const st = scn[i], acts = scenes[i].actors; if (!st || !acts) return;
    x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    acts.forEach((A, ai) => {
      const a = A.at((rest ? 0 : t) + (A.restT ?? 0)), spr = st.spr[ai][a.k];
      if (!spr) return;
      x.globalAlpha = a.alpha ?? 1;
      x.drawImage(spr.cv, spr.bx + (a.dx ?? 0) * s, spr.by + (a.dy ?? 0) * s, spr.w, spr.h);
    });
    x.restore();
  }

  function show() {
    const st = scn[cur]; if (!st) return;
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, cv!.width, cv!.height);
    const useFull = still && st.sprLeft === 0 && st.state === 2;
    dctx.drawImage(useFull ? composeFull(cur) : st.cv, 0, 0);
  }

  slicer.onTick = () => { if (!wiping && scn[cur]?.state === 1) show(); };

  function init() {
    gen++; slicer.clear(); layout(); scn = []; wipe = null; wiping = false; hs.ready = false; hs.act = false; hs.all = false;
    dctx.clearRect(0, 0, cv!.width, cv!.height); lctx.clearRect(0, 0, lv!.width, lv!.height); actx.clearRect(0, 0, av!.width, av!.height);
    island!.classList.remove('is-done');
    slicer.budget = 9;
    startScene(cur, true);
    queueRest(gen);
  }

  function queueRest(g: number) {
    const sky = $<HTMLCanvasElement>('h-sky');
    if (sky) {
      const w = Math.min(Math.round(sky.getBoundingClientRect().width) || 1200, 1600), h = Math.round(Math.min(Math.max(innerHeight * 0.95, 700), 900));
      sky.width = w; sky.height = h;
      slicer.add(skyJob(sky, w, h), () => { if (g === gen) { sky.classList.add('on'); hs.sky = true; } }, 'sky');
    }
    for (const i of scenes.map((_, i) => i).filter((i) => i !== cur)) {
      slicer.add((function* () { yield; if (g === gen && !scn[i]) startScene(i); })(), undefined, 'late' + i);
    }
    const foot = $<HTMLCanvasElement>('h-foot');
    if (foot) {
      const r = foot.getBoundingClientRect(), w = Math.round(r.width) || 1200, h = Math.round(r.height) || 300, d = Math.min(devicePixelRatio || 1, 2);
      foot.width = Math.ceil(w * d); foot.height = Math.ceil(h * d);
      slicer.add(footJob(foot, w, h, d), () => { if (g === gen) { foot.classList.add('on'); hs.foot = true; } }, 'foot');
    }
  }

  // ---- turning ---------------------------------------------------------------------------------
  function ui(i: number) {
    handle?.style.setProperty('--p', String(i / (scenes.length - 1)));
    scrub?.setAttribute('aria-valuenow', String(i + 1));
    scrub?.setAttribute('aria-valuetext', scenes[i].label + ', step ' + (i + 1) + ' of ' + scenes.length);
    stops.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    if (caption) { caption.classList.add('swap'); setTimeout(() => { caption.textContent = scenes[i].caption; caption.classList.remove('swap'); }, freeze ? 0 : 200); }
    cv!.setAttribute('aria-label', scenes[i].alt);
    (hs as { cur: number }).cur = i;
  }

  function go(to: number) {
    to = clamp(to, 0, scenes.length - 1);
    if (to === cur) return;
    const dir: 1 | -1 = to > cur ? 1 : -1;
    const from = document.createElement('canvas'); from.width = cv!.width; from.height = cv!.height;
    const fx = from.getContext('2d')!; fx.drawImage(cv!, 0, 0); fx.drawImage(av!, 0, 0);
    cur = to; ui(cur);
    lctx.clearRect(0, 0, lv!.width, lv!.height); actx.clearRect(0, 0, av!.width, av!.height);
    hs.act = scn[cur]?.sprLeft === 0;
    if (!scn[cur]) startScene(cur, true); else slicer.bump('s' + cur);
    const ready = scn[cur].state === 2;
    if (still || !ready) { wiping = false; wipe = null; if (ready) show(); else dctx.clearRect(0, 0, cv!.width, cv!.height); return; }
    if (reduced) { fading = { from, t0: performance.now() }; wiping = true; requestAnimationFrame(fadeLoop); return; }
    wipe ??= new Wipe(W, H, dpr);
    wipe.start(from, scn[cur].sprLeft === 0 ? composeFull(cur) : scn[cur].cv, dir, performance.now(), cur + 3);
    wiping = true; requestAnimationFrame(wipeLoop);
  }
  function endTurn() { wiping = false; actT0 = performance.now(); show(); animate(performance.now(), true); }
  function wipeLoop(now: number) {
    if (!wiping || !wipe?.active) return;
    if (wipe.frame(now, dctx, cv!.width, cv!.height)) { endTurn(); return; }
    requestAnimationFrame(wipeLoop);
  }
  function fadeLoop(now: number) {
    if (!fading) return;
    const t = clamp((now - fading.t0) / 320);
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, cv!.width, cv!.height);
    dctx.globalAlpha = 1 - t; dctx.drawImage(fading.from, 0, 0); dctx.globalAlpha = t; dctx.drawImage(scn[cur].cv, 0, 0); dctx.globalAlpha = 1;
    if (t < 1) requestAnimationFrame(fadeLoop); else { fading = null; wiping = false; show(); }
  }

  // ---- input -----------------------------------------------------------------------------------
  $('h-prev')?.addEventListener('click', () => go(cur - 1));
  $('h-next')?.addEventListener('click', () => go(cur + 1));
  stops.forEach((b, k) => b.addEventListener('click', () => go(k)));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    if (e.key === 'ArrowRight' && (visible || t === scrub)) { go(cur + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && (visible || t === scrub)) { go(cur - 1); e.preventDefault(); }
    else if (e.key === 'Home' && t === scrub) { go(0); e.preventDefault(); }
    else if (e.key === 'End' && t === scrub) { go(scenes.length - 1); e.preventDefault(); }
  });
  let dx0: number | null = null;
  island.addEventListener('pointerdown', (e) => { dx0 = e.clientX; island.setPointerCapture(e.pointerId); island.classList.add('drag'); });
  island.addEventListener('pointermove', (e) => {
    if (dx0 === null) return;
    const d = e.clientX - dx0;
    cv.style.transform = av.style.transform = `translateX(${clamp(d * 0.16, -26, 26)}px)`;
    if (Math.abs(d) > 64) { go(cur + (d < 0 ? 1 : -1)); dx0 = e.clientX; }
  });
  const endDrag = () => { dx0 = null; island.classList.remove('drag'); cv.style.transform = av.style.transform = ''; };
  island.addEventListener('pointerup', endDrag); island.addEventListener('pointercancel', endDrag);
  if (scrub) {
    let down = false;
    const at = (e: PointerEvent) => { const r = scrub.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width); };
    scrub.addEventListener('pointerdown', (e) => { down = true; scrub.setPointerCapture(e.pointerId); scrub.classList.add('drag'); const v = at(e); handle?.style.setProperty('--p', String(v)); go(Math.round(v * (scenes.length - 1))); });
    scrub.addEventListener('pointermove', (e) => { if (!down) return; const v = at(e); handle?.style.setProperty('--p', String(v)); go(Math.round(v * (scenes.length - 1))); });
    const up = () => { if (!down) return; down = false; scrub.classList.remove('drag'); handle?.style.setProperty('--p', String(cur / (scenes.length - 1))); };
    scrub.addEventListener('pointerup', up); scrub.addEventListener('pointercancel', up);
  }

  // ---- idle life: figure sprites, then steam and glow ------------------------------------------
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(island);
  let last = 0;
  function animate(now: number, force = false) {
    if (!force && (!visible || document.hidden || wiping || still || scn[cur]?.state !== 2)) return;
    const t = manual !== null ? parseFloat(manual) : (now - actT0) / 1000;
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, av!.width, av!.height);
    if (scn[cur].sprLeft === 0) drawActors(actx, cur, t);
    const L = scenes[cur].live;
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lv!.width, lv!.height);
    if (L) { lctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * OX(cur), 0); L(lctx, t + 5); }
  }
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (now - last < 70) return; last = now; // about 14 fps
    animate(now);
  }
  hs.tick = (t: number) => { // deterministic frames for screenshots: draws the animation at time t (seconds)
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, av!.width, av!.height);
    if (scn[cur].sprLeft === 0) drawActors(actx, cur, t);
    const L = scenes[cur].live; lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lv!.width, lv!.height);
    if (L) { lctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * OX(cur), 0); L(lctx, t + 5); }
  };
  if (!still && !freeze) requestAnimationFrame(loop);

  const foot = $('h-foot');
  if (foot) new IntersectionObserver((es) => { if (es[0].isIntersecting) slicer.bump('foot'); }, { rootMargin: '900px' }).observe(foot);

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.rv').forEach((n) => io.observe(n));

  // ---- go ----------------------------------------------------------------------------------
  ui(cur);
  if (caption) caption.textContent = scenes[cur].caption;
  init();
  let rw = W, rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { const w = Math.round(island.getBoundingClientRect().width); if (Math.abs(w - rw) > 24) { rw = w; init(); } }, 300); });
}
