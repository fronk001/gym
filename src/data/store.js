// The app's state: drawn instantly from this device's copy, changed only
// through core/workout.js, and synced with the online database in the
// background (engine.js, shared with Life Hub).
//
// Dev switches in the URL. None of them ever touches the real, synced log:
//   ?local              a copy on this device only, from the Notes import (laptop) or empty
//   ?demo               made-up workouts under their own key
//   ?today=2026-10-16   pretend it is that day (on the ?local copy)
//   ?fake-sync=laptop   sync against a pretend server in this browser; a device
//                       called "phone" has no Notes import, like the hosted app
//   ?reset              forget this copy (and its unsent changes) and start again

import * as W from '../core/workout.js';
import { logicalDay } from '../core/dates.js';
import { createEngine } from './engine.js';
import { firebaseBackend } from './firebase.js';
import { firebaseConfig } from './firebase-config.js';

const params = new URLSearchParams(location.search);
export const isDemo = params.has('demo');
const fake = !isDemo && params.has('fake-sync') ? params.get('fake-sync') || 'laptop' : null;
const local = !isDemo && !fake && (params.has('local') || params.has('today'));
const KEY = isDemo ? 'gym:demo' : fake ? `gym:fake:${fake}` : local ? 'gym:dev' : 'gym:v1';
const synced = !!fake || (KEY === 'gym:v1' && !!firebaseConfig);

export const today = () => params.get('today') || logicalDay(new Date());
const now = () => Date.now();

// seed.local.js (the Notes import) exists only on the laptop: it is
// git-ignored and never published, and the published copy never asks for it.
const onLaptop = () => document.querySelector('meta[name=app-version]').content === 'dev';
let notesFile = null;
const notes = () => (notesFile = notesFile || (fake === 'phone' || !onLaptop() ? Promise.resolve(null) : import('./seed.local.js').catch(() => null)));
export let hasNotes = false;

async function seed() {
  if (isDemo) return (await import('./demo.js')).buildDemo(today());
  const m = await notes();
  hasNotes = !!m;
  if (m) return m.buildSeed();
  return (await import('./seed.example.js')).buildSeed();
}

async function backend() {
  if (fake) {
    const { fakeBackend, fakeServer } = await import('./fake-backend.js');
    return fakeBackend({ server: fakeServer({ storage: localStorage }), storage: localStorage, device: fake });
  }
  return synced ? firebaseBackend(firebaseConfig) : null;
}

let engine = null;

export async function load() {
  engine = createEngine({ storage: localStorage, key: KEY, backend: await backend(), seed });
  addEventListener('storage', (e) => engine.receive(e));
  return engine.load({ reset: params.has('reset') });
}

export const get = () => engine.get();
export const subscribe = (fn) => engine.subscribe(fn);

const commit = (fn) => {
  const s = engine.get();
  if (!s) return s;
  const next = fn(s);
  if (next !== s) engine.commit(next);
  return next;
};

export const act = {
  // A workout left open on an earlier day is finished as it stood.
  tidy: () => commit((s) => W.closeStale(s, today(), now())),
  start(type, day = today()) {
    let id = null;
    commit((s) => {
      id = W.newSessionId(day);
      return W.startWorkout(s, { type, day, now: now(), id, live: day === today() });
    });
    return id;
  },
  finish: (id) => commit((s) => W.finishWorkout(s, id, now())),
  remove: (id) => commit((s) => W.deleteSession(s, id)),
  setValue: (id, i, j, field, v) => commit((s) => W.setValue(s, id, i, j, field, v)),
  toggleSet: (id, i, j) => commit((s) => W.toggleSet(s, id, i, j, now())),
  setNote: (id, i, j, note) => commit((s) => W.setNote(s, id, i, j, note)),
  addSet: (id, i) => commit((s) => W.addSet(s, id, i)),
  removeSet: (id, i, j) => commit((s) => W.removeSet(s, id, i, j)),
  addItem: (id, exId) => commit((s) => W.addItem(s, id, exId)),
  addNewItem(id, name) {
    commit((s) => {
      const [next, exId] = W.createExercise(s, name);
      return exId ? W.addItem(next, id, exId) : s;
    });
  },
  removeItem: (id, i) => commit((s) => W.removeItem(s, id, i)),
  moveItem: (id, i, dir) => commit((s) => W.moveItem(s, id, i, dir)),
  toggleSuperset: (id, i) => commit((s) => W.toggleSuperset(s, id, i)),
  updateExercise: (exId, patch) => commit((s) => W.updateExercise(s, exId, patch)),
  moveSession: (id, day) => commit((s) => W.moveSession(s, id, day, now())),
  setType: (id, type) => commit((s) => W.setType(s, id, type)),
};

export const sync = {
  status: () => engine.status(),
  signIn: (email, password) => engine.signIn(email, password),
  signOut: () => engine.signOut(),
  resetPassword: (email) => engine.resetPassword(email),
  startFresh: () => engine.startFresh(),
};
