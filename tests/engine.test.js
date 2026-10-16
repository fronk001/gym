// The sync engine (Life Hub's, tested in full there) with this app's
// layout, against the pretend server: the laptop puts the Notes log online,
// the phone logs a workout, offline sets wait and go up.

import { test, eq, ok } from './harness.js';
import * as W from '../src/core/workout.js';
import { fromDocs, same } from '../src/core/sync.js';
import { createEngine } from '../src/data/engine.js';
import { FAKE_ACCOUNTS, fakeBackend, fakeServer } from '../src/data/fake-backend.js';

const [FRED] = FAKE_ACCOUNTS;
const KEY = 'gym:v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.parse('2026-10-16T16:00:00Z');

async function until(fn, what, ms = 3000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(10)) if (fn()) return;
  throw new Error(`timed out waiting until ${what}`);
}

function memory(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// The Notes import, small.
function notes() {
  const s = W.emptyState();
  s.exercises = { squats: { name: 'Squats' }, rows: { name: 'Cable Rows (V-bar)' } };
  s.sessions = {
    '2022-09-07~notes0': { day: '2022-09-07', type: 'legs', archive: true, items: [{ ex: 'squats', sets: [{ r: 8, kg: 80 }] }] },
    '2026-10-12~notes0': { day: '2026-10-12', type: 'pull', items: [{ ex: 'rows', sets: [{ r: 13, kg: 39 }] }] },
  };
  return s;
}

async function device(server, { storage = memory(), seed = null, offline = false, name = 'd' } = {}) {
  const backend = fakeBackend({ server, storage, device: name });
  if (offline) backend.setOnline(false);
  const engine = createEngine({ storage, key: KEY, backend, seed: async () => (seed ? clone(seed) : null) });
  await engine.load();
  return { backend, engine, mode: () => engine.status().mode };
}

const online = (server) => server.docs(FRED.uid);

async function laptopWithNotes(server) {
  const laptop = await device(server, { seed: notes(), name: 'laptop' });
  await laptop.engine.signIn(FRED.email, FRED.password);
  await until(() => laptop.mode() === 'empty', 'nothing online yet');
  ok(laptop.engine.status().canStartFresh, 'it offers the Notes log');
  laptop.engine.startFresh();
  await until(() => laptop.mode() === 'live' && online(server).main, 'the log is online');
  return laptop;
}

async function phoneSignedIn(server, storage = memory()) {
  const phone = await device(server, { storage, name: 'phone' });
  await phone.engine.signIn(FRED.email, FRED.password);
  await until(() => phone.mode() === 'live', 'the phone is live');
  return phone;
}

test('the laptop puts the Notes log online, by year; the phone gets it whole', async () => {
  const server = fakeServer();
  await laptopWithNotes(server);
  eq(Object.keys(online(server)).sort(), ['log-2022', 'log-2026', 'main']);
  const phone = await phoneSignedIn(server);
  ok(same(phone.engine.get(), notes()));
});

test('a set ticked on the phone reaches the laptop, and its day is online for Life Hub', async () => {
  const server = fakeServer();
  const laptop = await laptopWithNotes(server);
  const phone = await phoneSignedIn(server);
  const s = W.startWorkout(phone.engine.get(), { type: 'pull', day: '2026-10-16', now: T0, id: '2026-10-16~p' });
  phone.engine.commit(W.toggleSet(s, '2026-10-16~p', 0, 0, T0 + 1000));
  await until(() => laptop.engine.get().sessions['2026-10-16~p'], 'the laptop sees the workout');
  eq(laptop.engine.get().sessions['2026-10-16~p'].items[0].sets[0], { r: 13, kg: 39, done: true });
  await until(() => online(server)['2026'], 'the year of days');
  eq(online(server)['2026'].history['2026-10-16'], { firstAt: T0, lastAt: T0 + 1000 }, 'from pressing Start');
  ok(same(fromDocs(online(server)), phone.engine.get()));
});

test('offline sets wait on the phone, survive closing the app, and go up when back', async () => {
  const server = fakeServer();
  const laptop = await laptopWithNotes(server);
  const storage = memory();
  const phone = await phoneSignedIn(server, storage);
  phone.backend.setOnline(false);
  let s = W.startWorkout(phone.engine.get(), { type: 'pull', day: '2026-10-16', now: T0, id: '2026-10-16~p' });
  s = W.toggleSet(s, '2026-10-16~p', 0, 0, T0);
  phone.engine.commit(s);
  phone.engine.commit(W.finishWorkout(s, '2026-10-16~p', T0 + 60000));
  await sleep(50);
  ok(phone.engine.status().waiting >= 1, 'queued');
  const again = await device(server, { storage, name: 'phone', offline: true });
  ok(again.engine.get().sessions['2026-10-16~p'], 'still there after a restart');
  again.backend.setOnline(true);
  dispatchEvent(new Event('online'));
  await until(() => laptop.engine.get().sessions['2026-10-16~p'] && !laptop.engine.get().sessions['2026-10-16~p'].open, 'the laptop gets the finished workout');
  await until(() => again.engine.status().waiting === 0, 'the queue empties');
});

test('a phone signing in first never puts an empty log online by itself', async () => {
  const server = fakeServer();
  const phone = await device(server, { name: 'phone', seed: W.emptyState() });
  await phone.engine.signIn(FRED.email, FRED.password);
  await until(() => phone.mode() === 'empty', 'nothing online yet');
  await sleep(50);
  eq(online(server), {}, 'nothing uploaded');
  await laptopWithNotes(server).catch(() => {}); // the laptop's own sign-in
  await until(() => phone.mode() === 'live' && phone.engine.get().sessions['2026-10-12~notes0'], 'the phone fills in');
});
