// Small shared helpers for the inner pages. Browser-side; the data itself always comes from store.ts.
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

// ---- small line icons for the four shift roles (one colour, set by the surrounding .vf-ico) ----
const ln = 'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
export const ROLE_ICONS: Record<RoleId, string> = {
  cook: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" ${ln}><path d="M14 30h36v14a9 9 0 0 1-9 9H23a9 9 0 0 1-9-9z"/><path d="M10 30h44M14 36H8M50 36h6"/><path d="M25 22c-3-4 3-6 0-11M39 22c-3-4 3-6 0-11"/></svg>`,
  pack: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" ${ln}><path d="M10 22l22-10 22 10v22L32 54 10 44z"/><path d="M10 22l22 10 22-10M32 32v22"/></svg>`,
  deliver: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" ${ln}><path d="M6 42V20h30v22M36 28h11l11 11v3H36"/><circle cx="18" cy="46" r="5" fill="#fff"/><circle cx="46" cy="46" r="5" fill="#fff"/></svg>`,
  clean: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" ${ln}><path d="M15 30h34l-4 24H19z"/><path d="M13 30h38"/><path d="M22 30c0-12 20-12 20 0"/><circle cx="26" cy="15" r="2.5"/><circle cx="38" cy="11" r="2"/><circle cx="46" cy="19" r="2"/></svg>`,
};

/** The round marigold tick shown on the sign-up and meal-request confirmations. */
export const TICK_SVG = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#e8a317"/><path d="M14 25l7 7 14-16" stroke="#132a1d" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
