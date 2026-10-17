// Volunteer data layer. Temporary browser-only version (localStorage).
// Swap these functions for Firebase calls later; the UI only talks to this file.

export type Kitchen = 'san_jose' | 'san_ramon';
export type RoleId = 'cook' | 'pack' | 'deliver' | 'clean';

export interface Role { id: RoleId; name: string; time: string; note: string; capacity: number }
export interface Signup {
  id: string; kitchen: Kitchen; date: string; role: RoleId;
  name: string; email: string; phone: string; party: number; firstTime: boolean;
  status: 'booked' | 'waitlist' | 'cancelled'; createdAt: string; cancelReason?: string;
}

export const KITCHENS: Record<Kitchen, string> = { san_jose: 'San Jose', san_ramon: 'San Ramon' };

export const ROLES: Role[] = [
  { id: 'cook', name: 'Cooking and prepping', time: '7:00 – 10:00 AM', note: 'Chop, stir and cook with our kitchen leads.', capacity: 12 },
  { id: 'pack', name: 'Packing and boxing', time: '9:30 – 11:00 AM', note: 'Portion and pack meals for the road. Great for families.', capacity: 10 },
  { id: 'deliver', name: 'Delivery', time: '11:00 AM – 1:00 PM', note: 'Drive meals to neighbors. You need a car.', capacity: 8 },
  { id: 'clean', name: 'Kitchen clean up', time: '11:00 AM – 12:00 PM', note: 'Reset the kitchen for next week.', capacity: 4 },
];

const KEY = 'fmow.signups.v1';

function load(): Signup[] {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') ?? seed(); } catch { return []; }
}
function save(all: Signup[]) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} }

// Demo data so spot counts look real.
function seed(): Signup[] {
  const names = ['Priya S.', 'Marcus L.', 'Ana G.', 'Dev K.', 'Hannah W.', 'Omar R.', 'Lily C.', 'Raj P.', 'Sofia M.', 'Ben T.'];
  const out: Signup[] = [];
  upcomingSaturdays(4).forEach((date, w) => {
    (Object.keys(KITCHENS) as Kitchen[]).forEach((kitchen, k) => {
      ROLES.forEach((r, i) => {
        const n = Math.max(0, r.capacity - 2 - ((w * 3 + k * 2 + i * 5) % (r.capacity + 1)));
        for (let j = 0; j < n; j++) out.push({
          id: crypto.randomUUID(), kitchen, date, role: r.id, name: names[(j + i) % names.length],
          email: 'demo@example.com', phone: '', party: 1, firstTime: false, status: 'booked', createdAt: new Date().toISOString(),
        });
      });
    });
  });
  save(out);
  return out;
}

export function upcomingSaturdays(count = 6): string[] {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return Array.from({ length: count }, (_, i) => {
    const x = new Date(d); x.setDate(d.getDate() + i * 7);
    return x.toISOString().slice(0, 10);
  });
}

export function spotsTaken(kitchen: Kitchen, date: string, role: RoleId): number {
  return load().filter((s) => s.kitchen === kitchen && s.date === date && s.role === role && s.status === 'booked')
    .reduce((n, s) => n + s.party, 0);
}

export function spotsLeft(kitchen: Kitchen, date: string, role: RoleId): number {
  const cap = ROLES.find((r) => r.id === role)!.capacity;
  return Math.max(0, cap - spotsTaken(kitchen, date, role));
}

export function book(input: Omit<Signup, 'id' | 'status' | 'createdAt'>): Signup {
  const status = spotsLeft(input.kitchen, input.date, input.role) >= input.party ? 'booked' : 'waitlist';
  const s: Signup = { ...input, id: crypto.randomUUID(), status, createdAt: new Date().toISOString() };
  save([...load(), s]);
  return s;
}

export function cancel(id: string, reason?: string) { save(load().map((s) => (s.id === id ? { ...s, status: 'cancelled', cancelReason: reason } : s))); }

export function listSignups(kitchen: Kitchen, date: string): Signup[] {
  return load().filter((s) => s.kitchen === kitchen && s.date === date && s.status !== 'cancelled');
}

export function resetDemo() { try { localStorage.removeItem(KEY); } catch {} }

// Volunteer account helpers (temporary: matched by email; Firebase Auth replaces this).
export function signupsFor(email: string): Signup[] {
  const e = email.trim().toLowerCase();
  return load().filter((s) => s.email.toLowerCase() === e && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
}

export function reschedule(id: string, patch: Partial<Pick<Signup, 'kitchen' | 'date' | 'role' | 'party'>>): Signup | null {
  const all = load(), s = all.find((x) => x.id === id); if (!s) return null;
  const next = { ...s, ...patch };
  const free = spotsLeft(next.kitchen, next.date, next.role) + (s.kitchen === next.kitchen && s.date === next.date && s.role === next.role && s.status === 'booked' ? s.party : 0);
  next.status = free >= next.party ? 'booked' : 'waitlist';
  save(all.map((x) => (x.id === id ? next : x)));
  return next;
}
