// The workout log: rotation, "last time", pre-filling, finishing, PRs,
// weight steps, supersets, and the days Life Hub reads.

import { test, eq, ok } from './harness.js';
import * as W from '../src/core/workout.js';

const T0 = Date.parse('2026-10-16T16:00:00Z');

// A small log like Fred's: legs, push, pull, then legs again.
function log() {
  const s = W.emptyState();
  s.exercises = {
    squats: { name: 'Squats' },
    abs: { name: 'Abs' },
    incline: { name: 'Incline DB Chest Press' },
    fly: { name: 'Chest Flat Fly’s' },
    bent: { name: 'Bent-over Fly’s' },
    assisted: { name: 'Assisted Pull-ups', kind: 'assisted' },
    rows: { name: 'Cable Rows (V-bar)', rest: 120 },
    bench: { name: 'Bench Press' },
  };
  s.sessions = {
    '2022-12-04~notes0': { day: '2022-12-04', type: 'push', archive: true, items: [{ ex: 'bench', sets: [{ r: 6, kg: 90 }] }, { ex: 'incline', sets: [{ r: 4, kg: 35 }] }] },
    '2026-10-09~a': { day: '2026-10-09', type: 'legs', items: [{ ex: 'squats', sets: [{ r: 10, kg: 40 }, { r: 9, kg: 60, note: '+ dropdown' }] }, { ex: 'abs', sets: [] }] },
    '2026-10-11~a': { day: '2026-10-11', type: 'push', items: [
      { ex: 'incline', sets: [{ r: 15, kg: 20 }, { r: 12, kg: 22 }, { r: 6, kg: 24 }] },
      { ex: 'fly', group: 'g1', sets: [{ r: 12, kg: 11.3 }, { r: 8, kg: 13.5 }] },
      { ex: 'bent', group: 'g1', sets: [{ r: 10, kg: 9 }, { r: 8, kg: 9 }] },
    ] },
    '2026-10-12~a': { day: '2026-10-12', type: 'pull', items: [{ ex: 'assisted', sets: [{ r: 13, kg: 27 }, { r: 7, kg: 20 }] }, { ex: 'rows', sets: [{ r: 13, kg: 39 }] }] },
  };
  return s;
}

test('the rotation: after back day comes legs, and the archive never counts', () => {
  eq(W.nextType(log()), 'legs');
  const s = log();
  delete s.sessions['2026-10-12~a'];
  eq(W.nextType(s), 'pull');
  eq(W.nextType(W.emptyState()), 'legs', 'nothing yet: the first day');
});

test('a new workout is laid out like the last one of its day, numbers in, nothing ticked', () => {
  const s = W.startWorkout(log(), { type: 'push', day: '2026-10-16', now: T0, id: '2026-10-16~n' });
  const x = s.sessions['2026-10-16~n'];
  eq(x.open, true);
  eq(x.items.map((it) => it.ex), ['incline', 'fly', 'bent']);
  eq(x.items[0].sets, [{ r: 15, kg: 20, done: false }, { r: 12, kg: 22, done: false }, { r: 6, kg: 24, done: false }]);
  eq([x.items[1].group, x.items[2].group], ['g1', 'g1'], 'the superset stays a superset');
});

test('notes describe last time, so they are not copied; an exercise done without numbers gets a set to tick', () => {
  const s = W.startWorkout(log(), { type: 'legs', day: '2026-10-16', now: T0, id: 'n' });
  eq(s.sessions.n.items[0].sets[1], { r: 9, kg: 60, done: false });
  eq(s.sessions.n.items[1].sets, [{ done: false }]);
});

test('a day never done starts empty', () => {
  const s = W.emptyState();
  const n = W.startWorkout(s, { type: 'legs', day: '2026-10-16', now: T0, id: 'n' });
  eq(n.sessions.n.items, []);
});

test('"last time" for an exercise: the last real workout, else the 2022 archive', () => {
  const s = log();
  eq(W.lastTime(s, 'incline').session.day, '2026-10-11');
  eq(W.lastTime(s, 'bench').session.day, '2022-12-04', 'only done in 2022');
  eq(W.lastTime(s, 'squats', '2026-10-09~a'), null, 'nothing before the first time');
  ok(W.lastTime(s, 'abs') === null, 'a time with no sets written down is no "last time"');
});

test('ticking a set marks the day for Life Hub, with times; finishing keeps only ticked sets', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  eq(s.history['2026-10-16'], undefined, 'starting alone is no workout');
  s = W.toggleSet(s, 'n', 0, 0, T0 + 60000);
  eq(s.history['2026-10-16'], { firstAt: T0 + 60000, lastAt: T0 + 60000 });
  s = W.toggleSet(s, 'n', 1, 0, T0 + 600000);
  eq(s.history['2026-10-16'].lastAt, T0 + 600000);
  s = W.finishWorkout(s, 'n', T0 + 3600000);
  const x = s.sessions.n;
  eq(x.open, undefined);
  eq(x.doneAt, T0 + 3600000);
  eq(x.items.map((it) => it.sets), [[{ r: 13, kg: 27 }], [{ r: 13, kg: 39 }]], 'unticked sets dropped, no done flags');
});

test('finishing with nothing ticked leaves no workout and no day', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  s = W.finishWorkout(s, 'n', T0);
  eq(s.sessions.n, undefined);
  eq(s.history['2026-10-16'], undefined);
});

test('a workout logged afterwards marks its date without times (Life Hub counts the date)', () => {
  let s = W.startWorkout(log(), { type: 'legs', day: '2026-10-14', now: T0, id: 'n', live: false });
  s = W.toggleSet(s, 'n', 0, 0, T0);
  eq(s.history['2026-10-14'], { added: T0 });
});

test('deleting the only workout of a day takes the day out of the history', () => {
  let s = W.startWorkout(log(), { type: 'legs', day: '2026-10-16', now: T0, id: 'n' });
  s = W.toggleSet(s, 'n', 0, 0, T0);
  s = W.deleteSession(W.finishWorkout(s, 'n', T0), 'n');
  eq(s.history['2026-10-16'], undefined);
});

test('a workout left open on an earlier day is finished as it stood', () => {
  let s = W.startWorkout(log(), { type: 'legs', day: '2026-10-15', now: T0, id: 'n' });
  s = W.toggleSet(s, 'n', 0, 0, T0);
  s = W.closeStale(s, '2026-10-16', T0 + 1);
  eq(s.sessions.n.open, undefined);
  eq(s.sessions.n.items.length, 1);
  eq(W.closeStale(s, '2026-10-16', T0), s, 'nothing open: the same state back');
});

test('PR: beating every earlier real workout, never the first time, never against 2022', () => {
  let s = W.startWorkout(log(), { type: 'push', day: '2026-10-16', now: T0, id: 'n' });
  s = W.setValue(s, 'n', 0, 2, 'r', 10); // 10 × 24 beats 12 × 22, the best so far
  s = W.toggleSet(s, 'n', 0, 0, T0);
  eq(W.prIndex(s, 'n', 0), -1, 'only an unticked set beats it so far');
  s = W.toggleSet(s, 'n', 0, 2, T0);
  eq(W.prIndex(s, 'n', 0), 2);
  const first = W.addItem(s, 'n', 'squats');
  eq(W.prIndex(W.toggleSet(first, 'n', 3, 0, T0), 'n', 3), -1, 'squats were done before, 10 × 40 is no record');
});

test('PR for assisted pull-ups: less help is better', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  s = W.setValue(s, 'n', 0, 1, 'kg', 18);
  s = W.toggleSet(s, 'n', 0, 1, T0);
  eq(W.prIndex(s, 'n', 0), 1, '7 reps with 18 kg help beats 7 with 20');
  s = W.setValue(s, 'n', 0, 1, 'kg', 30);
  eq(W.prIndex(s, 'n', 0), -1);
});

test('the weight step goes to the next weight already used, then by the last gap', () => {
  const known = [11.3, 13.5, 15.8];
  eq(W.nextWeight(known, 11.3, 1), 13.5);
  eq(W.nextWeight(known, 13.5, -1), 11.3);
  eq(W.nextWeight(known, 15.8, 1), 18.1);
  eq(W.nextWeight(known, 11.3, -1), 9.1);
  eq(W.nextWeight([], 20, 1), 22.5);
  eq(W.nextWeight([], undefined, 1), 2.5);
  eq(W.nextWeight([20, 30], 0, -1), 0, 'never below zero');
  eq(W.knownWeights(log(), 'fly'), [11.3, 13.5]);
});

test('values: typed, cleared, never negative', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  s = W.setValue(s, 'n', 0, 0, 'kg', 25.55);
  eq(s.sessions.n.items[0].sets[0].kg, 25.55);
  s = W.setValue(s, 'n', 0, 0, 'kg', null);
  eq('kg' in s.sessions.n.items[0].sets[0], false);
  s = W.setValue(s, 'n', 0, 0, 'r', -3);
  eq(s.sessions.n.items[0].sets[0].r, 0);
});

test('adding a set copies the last one; adding an exercise brings its last time', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  s = W.addSet(s, 'n', 1);
  eq(s.sessions.n.items[1].sets, [{ r: 13, kg: 39, done: false }, { r: 13, kg: 39, done: false }]);
  s = W.addItem(s, 'n', 'bench');
  eq(s.sessions.n.items[2], { ex: 'bench', sets: [{ r: 6, kg: 90, done: false }] }, 'from 2022 when that is all there is');
  const [s2, id] = W.createExercise(s, '  Face   pulls ');
  eq([id, s2.exercises[id].name], ['face-pulls', 'Face pulls']);
  eq(W.createExercise(s2, 'face pulls')[1], 'face-pulls', 'the same name twice is one exercise');
});

test('supersets: join with the next, leave, move as a block; rest starts after the round', () => {
  let s = W.startWorkout(log(), { type: 'pull', day: '2026-10-16', now: T0, id: 'n' });
  s = W.toggleSuperset(s, 'n', 0);
  const g = s.sessions.n.items[0].group;
  ok(g && s.sessions.n.items[1].group === g, 'joined');
  s = W.toggleSet(s, 'n', 0, 0, T0);
  eq(W.roundDone(s.sessions.n, 0, 0), false, 'the second exercise of the round is still to do');
  s = W.toggleSet(s, 'n', 1, 0, T0);
  eq(W.roundDone(s.sessions.n, 1, 0), true);
  s = W.addItem(s, 'n', 'bench');
  s = W.moveItem(s, 'n', 2, -1);
  eq(s.sessions.n.items.map((it) => it.ex), ['bench', 'assisted', 'rows'], 'the bench jumps the whole superset');
  s = W.moveItem(s, 'n', 1, 1);
  eq(s.sessions.n.items.map((it) => it.ex), ['bench', 'assisted', 'rows'], 'a superset at the end goes no further');
  s = W.toggleSuperset(s, 'n', 1);
  eq(s.sessions.n.items.map((it) => it.group || null), [null, null, null], 'leaving a pair ends it');
});

test('finishing undoes a superset left with one exercise', () => {
  let s = W.startWorkout(log(), { type: 'push', day: '2026-10-16', now: T0, id: 'n' });
  s = W.toggleSet(s, 'n', 1, 0, T0);
  s = W.finishWorkout(s, 'n', T0);
  eq(s.sessions.n.items, [{ ex: 'fly', sets: [{ r: 12, kg: 11.3 }] }]);
});

test('moving a workout to another date moves its day too', () => {
  let s = W.startWorkout(log(), { type: 'legs', day: '2026-10-16', now: T0, id: 'n' });
  s = W.finishWorkout(W.toggleSet(s, 'n', 0, 0, T0), 'n', T0);
  s = W.moveSession(s, 'n', '2026-10-15', T0);
  eq(Object.keys(s.history), ['2026-10-15']);
  eq(s.sessions.n.day, '2026-10-15');
});

test('this week’s count: days with a real workout, Monday to Sunday', () => {
  const s = log();
  eq(W.weekCount(s, '2026-10-16'), 1, 'Mon 12 Oct only');
  eq(W.weekCount(s, '2026-10-11'), 2, 'Fri 9 and Sun 11');
});

test('exercise settings: changed, cleared; the name never goes blank', () => {
  let s = W.updateExercise(log(), 'squats', { setting: ' 5:3 ', rest: 120 });
  eq(s.exercises.squats, { name: 'Squats', setting: '5:3', rest: 120 });
  s = W.updateExercise(s, 'squats', { setting: '', rest: null, name: '' });
  eq(s.exercises.squats, { name: 'Squats' });
  eq(W.restFor(s, 'rows'), 120);
  eq(W.restFor(s, 'squats'), W.DEFAULT_REST);
});
