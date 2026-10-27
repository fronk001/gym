// Brings a log written by older code up to the shape this code expects, as in
// Life Hub (its core/migrate.js): a change to Fred's training reaches his live
// log through here.
//
// Every device runs this on whatever it loads (engine.js), so each step must
// be pure and idempotent: two devices doing it must agree, and a step only
// touches what is still in its old shape. Bump VERSION with each step.

export const VERSION = 2;

const clone = (x) => JSON.parse(JSON.stringify(x));

// 27 Oct 2026, Fred: the efficient plan from his routine review (the "Gym
// Routine Upgrade" report). Same three days and about the same time; small
// exercises go in the rests of big ones (a shared `group` = a superset).
const PLANS = {
  push: [
    { ex: 'incline-db-chest-press', sets: 4, group: 'p1' },
    { ex: 'standing-calf-raises', sets: 4, group: 'p1', isNew: true, note: 'Knees straight, between incline sets' },
    { ex: 'db-bench-press', sets: 4, group: 'p2', isNew: true, note: 'Replaces the chest flys' },
    { ex: 'bent-over-fly-s', sets: 3, group: 'p2' },
    { ex: 'db-side-delt-raises', sets: 4, group: 'p3', isNew: true, note: 'Lateral raises: what makes shoulders look wide' },
    { ex: 'triceps-overhead-extension', sets: 3, group: 'p3' },
    { ex: 'rope-cable-pulls-triceps', sets: 2 },
  ],
  pull: [
    { ex: 'assisted-pull-ups', sets: 3, group: 'p1' },
    { ex: 'db-side-delt-raises', sets: 4, group: 'p1', isNew: true, note: 'Between pull-up sets' },
    { ex: 'lat-pulldown', sets: 3, group: 'p2', isNew: true, note: 'For the lats' },
    { ex: 'cable-face-pulls', sets: 3, group: 'p2', note: 'Moved here from push day' },
    { ex: 'cable-rows-v-bar', sets: 3 },
    { ex: 'barbell-bicep-curls-bent', sets: 3, group: 'p3' },
    { ex: 'db-shrugs', sets: 3, group: 'p3' },
  ],
  legs: [
    { ex: 'squats', sets: 4, group: 'p1' },
    { ex: 'abs', sets: 3, group: 'p1' },
    { ex: 'romanian-deadlift', sets: 4, group: 'p2', isNew: true, note: 'Start light: learn the movement first' },
    { ex: 'standing-calf-raises', sets: 4, group: 'p2', isNew: true, note: 'Replaces the seated calf machine: knees straight' },
    { ex: 'prone-hamstring-curl', sets: 4, group: 'p3' },
    { ex: 'leg-extension', sets: 4, group: 'p3' },
  ],
};

const STEPS = {
  2(s) {
    // Fred's own log only (the demo and an empty log have other exercises).
    if (!s.exercises || !s.exercises['incline-db-chest-press'] || !Array.isArray(s.types)) return;
    if (!s.exercises['standing-calf-raises']) s.exercises['standing-calf-raises'] = { name: 'Standing Calf Raises' };
    if (!s.exercises['romanian-deadlift']) s.exercises['romanian-deadlift'] = { name: 'Romanian Deadlift' };
    for (const t of s.types) {
      if (PLANS[t.id] && !t.plan) t.plan = { since: '2026-10-27', items: clone(PLANS[t.id]) };
    }
  },
};

export function migrate(state) {
  if (!state || (state.version || 1) >= VERSION) return state;
  const s = clone(state);
  for (let v = (s.version || 1) + 1; v <= VERSION; v += 1) STEPS[v](s);
  s.version = VERSION;
  return s;
}
