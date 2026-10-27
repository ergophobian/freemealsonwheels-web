// Volunteer data layer. Temporary browser-only version (localStorage).
// Swap these functions for Firebase calls later; the UI only talks to this file.

export type Kitchen = 'san_jose' | 'san_ramon';
export type RoleId = 'cook' | 'pack' | 'deliver' | 'clean';

export interface Role { id: RoleId; name: string; time: string; note: string; capacity: number }
export interface Signup {
  id: string; kitchen: Kitchen; date: string; role: RoleId;
  name: string; email: string; phone: string; party: number; firstTime: boolean;
  status: 'booked' | 'waitlist' | 'cancelled'; createdAt: string; cancelReason?: string;
  // Added for the /hearth sign-up flow. Optional so the older pages keep working untouched.
  hasCar?: boolean; waiverAcceptedAt?: string;
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
        // A few roles are deliberately full so the waitlist state is visible in the demo.
        const full = (w * 2 + k + i) % 6 === 1;
        const n = full ? r.capacity : Math.max(0, r.capacity - 2 - ((w * 3 + k * 2 + i * 5) % (r.capacity + 1)));
        for (let j = 0; j < n; j++) out.push({
          id: crypto.randomUUID(), kitchen, date, role: r.id, name: names[(j + i) % names.length],
          email: 'demo@example.com', phone: '', party: 1, firstTime: j % 4 === 3, status: 'booked', createdAt: new Date().toISOString(),
        });
        if (full) for (let j = 0; j < 2; j++) out.push({
          id: crypto.randomUUID(), kitchen, date, role: r.id, name: names[(j + i + 4) % names.length],
          email: 'demo@example.com', phone: '', party: 1, firstTime: j === 0, status: 'waitlist', createdAt: new Date().toISOString(),
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

export function cancel(id: string, reason?: string) {
  const all = load(), gone = all.find((s) => s.id === id);
  const next = all.map((s) => (s.id === id ? { ...s, status: 'cancelled' as const, cancelReason: reason } : s));
  save(next);
  if (gone?.status === 'booked') promoteWaitlist(gone.kitchen, gone.date, gone.role);
}

/** Moves waitlisted people (oldest first) into any spots that have opened up. */
export function promoteWaitlist(kitchen: Kitchen, date: string, role: RoleId) {
  const all = load();
  const cap = ROLES.find((r) => r.id === role)!.capacity;
  let used = all.filter((s) => s.kitchen === kitchen && s.date === date && s.role === role && s.status === 'booked').reduce((n, s) => n + s.party, 0);
  const queue = all.filter((s) => s.kitchen === kitchen && s.date === date && s.role === role && s.status === 'waitlist')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const promoted = new Set<string>();
  for (const w of queue) if (used + w.party <= cap) { used += w.party; promoted.add(w.id); }
  if (promoted.size) save(all.map((s) => (promoted.has(s.id) ? { ...s, status: 'booked' as const } : s)));
}

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

// ---- Added for the /hearth screens -------------------------------------------------------------------------

export function getSignup(id: string): Signup | undefined { return load().find((s) => s.id === id); }

/** Everything under this email, including cancelled shifts, newest date last (for the history list). */
export function allSignupsFor(email: string): Signup[] {
  const e = email.trim().toLowerCase();
  return load().filter((s) => s.email.toLowerCase() === e).sort((a, b) => a.date.localeCompare(b.date));
}

// Meal requests. TEMPORARY: stored in this browser only, so nothing a neighbour submits actually reaches anyone yet.
// Swap for the real backend (and a way for organisers to see requests) together with the volunteer functions above.
export type MealMode = 'pickup' | 'delivery';
export interface MealRequest {
  id: string; name: string; phone: string; mode: MealMode; address: string; area: Kitchen | 'unsure';
  household: number; diet: string[]; allergies: string; date: string; language: string; notes: string;
  createdAt: string;
}
const MEAL_KEY = 'fmow.mealrequests.v1';

function loadMeals(): MealRequest[] {
  try { return JSON.parse(localStorage.getItem(MEAL_KEY) || 'null') ?? seedMeals(); } catch { return []; }
}
function saveMeals(all: MealRequest[]) { try { localStorage.setItem(MEAL_KEY, JSON.stringify(all)); } catch {} }

function seedMeals(): MealRequest[] {
  const date = upcomingSaturdays(1)[0], now = new Date().toISOString();
  const mk = (name: string, mode: MealMode, area: Kitchen, household: number, diet: string[], language: string, address: string): MealRequest =>
    ({ id: crypto.randomUUID(), name, phone: '(555) 010-0100', mode, address, area, household, diet, allergies: '', date, language, notes: '', createdAt: now });
  const out = [
    mk('Maria G.', 'delivery', 'san_jose', 4, ['Vegetarian'], 'Spanish', '123 Example St (demo)'),
    mk('Tom H.', 'pickup', 'san_jose', 1, [], 'English', ''),
    mk('Anh N.', 'delivery', 'san_ramon', 3, ['No pork'], 'Vietnamese', '456 Sample Ave (demo)'),
  ];
  saveMeals(out);
  return out;
}

export function requestMeal(input: Omit<MealRequest, 'id' | 'createdAt'>): MealRequest {
  const r: MealRequest = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  saveMeals([...loadMeals(), r]);
  return r;
}
export function getMealRequest(id: string): MealRequest | undefined { return loadMeals().find((r) => r.id === id); }
export function listMealRequests(date?: string): MealRequest[] { return loadMeals().filter((r) => !date || r.date === date); }
export function resetMealDemo() { try { localStorage.removeItem(MEAL_KEY); } catch {} }
