// Small shared helpers for the /hearth inner pages. Browser-side; the data itself always comes from store.ts.
import { KITCHENS, ROLES, type Kitchen, type RoleId, type Signup } from './store';

export const STRIPE_LINK = 'https://donate.stripe.com/REPLACE_ME';
export const MAIL = 'info@freemealsonwheels.com';
export const SATURDAYS_SHOWN = 8;

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', opts);
}
export const longDate = (d: string) => fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' });
export const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export const kitchenName = (k: Kitchen) => KITCHENS[k];
export const roleOf = (id: RoleId) => ROLES.find((r) => r.id === id)!;
export const isKitchen = (k: unknown): k is Kitchen => typeof k === 'string' && k in KITCHENS;
export const isRole = (r: unknown): r is RoleId => typeof r === 'string' && ROLES.some((x) => x.id === r);

// ---- remembering who you are on this device (demo only; real sign-in replaces it) ----
const ME = 'fmow.me.v1';
export interface Me { name: string; email: string; phone: string }
export function getMe(): Partial<Me> { try { return JSON.parse(localStorage.getItem(ME) || '{}'); } catch { return {}; } }
export function setMe(m: Partial<Me>) { try { localStorage.setItem(ME, JSON.stringify({ ...getMe(), ...m })); } catch {} }

// ---- validation ----
export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const validPhone = (v: string) => v.replace(/\D/g, '').length >= 10;

// ---- calendar file ----
function to24(t: string, fallbackAmPm: string) {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)!;
  let h = Number(m[1]); const ap = (m[3] || fallbackAmPm).toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + m[2] + '00';
}
/** "7:00 – 10:00 AM" or "11:00 AM – 1:00 PM" into start and end as HHMMSS. */
export function shiftClock(time: string) {
  const [a, b] = time.split(/\s*[–-]\s*/);
  const endAp = (b.match(/AM|PM/i) || ['AM'])[0];
  return { start: to24(a, endAp), end: to24(b, endAp) };
}
export function icsFor(s: Pick<Signup, 'kitchen' | 'date' | 'role' | 'id'>) {
  const r = roleOf(s.role), { start, end } = shiftClock(r.time), day = s.date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Free Meals on Wheels//Shift//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${s.id}@freemealsonwheels.com`, `DTSTAMP:${stamp}`,
    `SUMMARY:Free Meals on Wheels: ${r.name}`,
    `DTSTART:${day}T${start}`, `DTEND:${day}T${end}`,
    `LOCATION:${kitchenName(s.kitchen)} kitchen (address to be confirmed)`,
    `DESCRIPTION:${r.note} Wear closed-toe shoes\\, tie back long hair and arrive 10 minutes early.`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
export function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const downloadIcs = (s: Pick<Signup, 'kitchen' | 'date' | 'role' | 'id'>) => download(`free-meals-${s.date}-${s.role}.ics`, icsFor(s), 'text/calendar');
export const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// ---- small hatched role icons (the hatch patterns live in HearthLayout) ----
const ink = 'stroke="#2a211c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
export const ROLE_ICONS: Record<RoleId, string> = {
  cook: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><path d="M16 29h32v17a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill="url(#hx-gold)" ${ink}/><path d="M12 29h40" ${ink}/><path d="M12 33H8M52 33h4" ${ink}/><path d="M26 22c-4-4 0-6-1-10M34 22c-4-4 0-6-1-10M42 22c-4-4 0-6-1-10" stroke="#5a7d6a" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  pack: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><path d="M10 24l22 10 22-10-22-10z" fill="url(#hx-paper)" ${ink}/><path d="M10 24v22l22 10V34z" fill="url(#hx-green)" ${ink}/><path d="M54 24v22L32 56V34z" fill="url(#hx-gold)" ${ink}/><path d="M21 19l22 10" ${ink}/></svg>`,
  deliver: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><path d="M6 42v-9l9-2 8-11h20l10 11 7 2v9z" fill="url(#hx-gold)" ${ink}/><path d="M25 22l-5 9h12V22zM35 22v9h14l-8-9z" fill="url(#hx-paper)" ${ink}/><circle cx="20" cy="43" r="6" fill="#f6f1e6" ${ink}/><circle cx="46" cy="43" r="6" fill="#f6f1e6" ${ink}/></svg>`,
  clean: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><path d="M15 30h34l-4 24H19z" fill="url(#hx-green)" ${ink}/><path d="M13 30h38" ${ink}/><path d="M20 30c0-14 24-14 24 0" ${ink}/><circle cx="27" cy="16" r="3" stroke="#5a7d6a" stroke-width="1.5"/><circle cx="37" cy="12" r="2" stroke="#5a7d6a" stroke-width="1.5"/><circle cx="44" cy="19" r="2.5" stroke="#5a7d6a" stroke-width="1.5"/></svg>`,
};

// ---- grass and marigolds behind the footer: the same painter as /hearth, loaded after first paint ----
export function paintFooter(cv: HTMLCanvasElement | null) {
  if (!cv) return;
  const go = async () => {
    const [{ footJob }, { clock }] = await Promise.all([import('./hearth/backdrops'), import('./hearth/engine')]);
    const r = cv.getBoundingClientRect(), w = Math.round(r.width) || 1200, h = Math.round(r.height) || 280, d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.ceil(w * d); cv.height = Math.ceil(h * d);
    const job = footJob(cv, w, h, d);
    const step = () => {
      clock.deadline = performance.now() + 9;
      if (job.next().done) { cv.classList.add('on'); return; }
      requestAnimationFrame(step);
    };
    step();
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  idle ? idle(go) : setTimeout(go, 120);
}
