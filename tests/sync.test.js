// The online layout: workouts as whole strings by year, days trained by
// year for Life Hub, everything else in main.

import { test, eq, ok } from './harness.js';
import { applyMerge, diff, fromDocs, patchesFor, same, toDocs } from '../src/core/sync.js';
import * as W from '../src/core/workout.js';

const DEL = Symbol('del');

function state() {
  const s = W.emptyState();
  s.exercises = { squats: { name: 'Squats', setting: '5:3' } };
  s.sessions = {
    '2022-12-04~notes0': { day: '2022-12-04', type: 'push', archive: true, items: [] },
    '2026-10-16~x': { day: '2026-10-16', type: 'legs', open: true, items: [{ ex: 'squats', sets: [{ r: 10, kg: 40, done: true }] }] },
  };
  s.history = { '2026-10-16': { firstAt: 1, lastAt: 2 } };
  return s;
}

test('documents: main, a log per year (each workout one string), days per year', () => {
  const d = toDocs(state());
  eq(Object.keys(d).sort(), ['2026', 'log-2022', 'log-2026', 'main']);
  eq(typeof d['log-2026'].sessions['2026-10-16~x'], 'string');
  eq(d['2026'], { history: { '2026-10-16': { firstAt: 1, lastAt: 2 } } }, 'Life Hub reads exactly this');
  ok(!('sessions' in d.main) && !('history' in d.main));
  ok(same(fromDocs(d), state()), 'and back again');
});

test('a tick is one change to one workout, written whole, plus the day', () => {
  const a = state();
  const b = W.toggleSet(W.addSet(a, '2026-10-16~x', 0), '2026-10-16~x', 0, 1, 5);
  const ops = diff(a, b);
  eq(ops.map((o) => o.path.join('.')), ['history.2026-10-16.lastAt', 'sessions.2026-10-16~x']);
  const p = patchesFor(ops, DEL);
  eq(p.map((x) => x.id).sort(), ['2026', 'log-2026']);
  const log = p.find((x) => x.id === 'log-2026');
  eq(typeof log.data.sessions['2026-10-16~x'], 'string');
});

test('patches applied to the documents give the new state', () => {
  const a = state();
  let b = W.finishWorkout(a, '2026-10-16~x', 9);
  b = W.updateExercise(b, 'squats', { setting: null, rest: 120 });
  b = W.deleteSession(b, '2022-12-04~notes0');
  const docs = toDocs(a);
  for (const w of patchesFor(diff(a, b), DEL)) docs[w.id] = applyMerge(docs[w.id] || {}, w.data, DEL);
  ok(same(fromDocs(docs), b));
});

test('a damaged workout online is left out, not the whole log', () => {
  const d = toDocs(state());
  d['log-2026'].sessions['2026-10-17~bad'] = '{not json';
  const s = fromDocs(d);
  ok(s.sessions['2026-10-16~x'] && !s.sessions['2026-10-17~bad']);
});
