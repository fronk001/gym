// Upgrading a log written by older code: the efficient plan of 27 Oct 2026.

import { test, eq } from './harness.js';
import { migrate, VERSION } from '../src/core/migrate.js';
import * as W from '../src/core/workout.js';

// Enough of Fred's log to be recognised as his.
function fredsLog() {
  const s = W.emptyState();
  s.exercises = { 'incline-db-chest-press': { name: 'Incline DB Chest Press' }, 'db-side-delt-raises': { name: 'DB Side Delt Raises' } };
  return s;
}

test('the efficient plan reaches Fred’s log once: two new exercises, a plan on each day', () => {
  const s = migrate(fredsLog());
  eq(s.version, VERSION);
  eq(s.exercises['standing-calf-raises'], { name: 'Standing Calf Raises' });
  eq(s.exercises['romanian-deadlift'], { name: 'Romanian Deadlift' });
  eq(s.types.map((t) => [t.id, t.plan.since, t.plan.items.length]), [['legs', '2026-10-27', 6], ['push', '2026-10-27', 7], ['pull', '2026-10-27', 7]]);
  eq(s.types[1].plan.items.filter((p) => p.isNew).map((p) => p.ex), ['db-bench-press', 'db-side-delt-raises', 'standing-calf-raises']);
  eq(s.types.some((t) => t.plan.items.some((p) => p.group)), false, 'no pairs: Fred makes his own supersets');
  eq(migrate(s), s, 'run again: nothing changes');
  eq(migrate(fredsLog()), s, 'two devices agree');
});

test('the paired plan of a day already started from keeps its pairs; the others lose them', () => {
  const s = migrate({ ...fredsLog(), version: 1 });
  const v2 = JSON.parse(JSON.stringify(s));
  // As Fred's log stood at version 2: the paired plans, and a legs workout open from one.
  v2.version = 2;
  const paired = (items) => items.map((p, k) => ({ ...p, group: `p${(k >> 1) + 1}` }));
  for (const t of v2.types) t.plan.items = paired(t.plan.items);
  v2.sessions['2026-10-27~a'] = { day: '2026-10-27', type: 'legs', open: true, fromPlan: '2026-10-27', items: [] };
  const m = migrate(v2);
  eq(m.types.map((t) => [t.id, t.plan.items.some((p) => p.group)]), [['legs', true], ['push', false], ['pull', false]]);
  eq(m.sessions, v2.sessions, 'workouts are never touched');
});

test('a plan already there, an exercise he changed and other logs are left alone', () => {
  const s = fredsLog();
  s.exercises['romanian-deadlift'] = { name: 'RDL', note: 'mine' };
  s.types[0].plan = { since: '2026-11-01', items: [] };
  const m = migrate(s);
  eq(m.exercises['romanian-deadlift'], { name: 'RDL', note: 'mine' });
  eq(m.types[0].plan, { since: '2026-11-01', items: [] });
  eq(m.types[1].plan.since, '2026-10-27');
  const other = migrate(W.emptyState());
  eq([other.version, other.types.some((t) => t.plan), Object.keys(other.exercises)], [VERSION, false, []], 'not Fred’s log: no plan');
});
