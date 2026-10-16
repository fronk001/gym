// The workout log, as pure functions: no DOM, no storage, no clock of its own
// (every "now" is passed in). Every change returns a new state; ui code
// calls these only through data/store.js.
//
// State (localStorage `gym:v1`, online users/{uid}/gym/, see sync.js):
//   types      the three training days, in rotation order
//   exercises  { [id]: { name, setting?, note?, rest?, kind? } }
//              kind: 'assisted' = the kg helps (assisted pull-ups): less is harder
//   sessions   { [id]: { day, type, label?, archive?, open?, startedAt?, doneAt?, items } }
//              id = `${day}~${random}`; items = [{ ex, group?, note?, sets: [{ r?, kg?, note?, done? }] }]
//              open = in progress: only its sets with `done` count. Finishing drops the rest.
//              archive = the 2022 Notes log: browsable, never "last time" while a newer one exists.
//   history    { [day]: { firstAt, lastAt } | { added } } the days trained, which Life Hub reads
//              to tick its Gym habit (life-hub/src/core/links.js): times when logged live,
//              `added` for a day logged afterwards (Life Hub then counts the date itself).

import { addDays, weekStart } from './dates.js';

export const TYPES = [
  { id: 'legs', name: 'Legs & Abs', short: 'Legs' },
  { id: 'push', name: 'Chest, Shoulders & Triceps', short: 'Chest · Shoulders' },
  { id: 'pull', name: 'Back & Biceps', short: 'Back · Biceps' },
];
export const DEFAULT_REST = 90;
export const REST_CHOICES = [45, 60, 90, 120, 150, 180, 240];

const clone = (x) => JSON.parse(JSON.stringify(x));
const rand = () => Math.random().toString(36).slice(2, 8);
export const newSessionId = (day) => `${day}~${Date.now().toString(36)}${rand()}`;

export const emptyState = () => ({ version: 1, types: clone(TYPES), exercises: {}, sessions: {}, history: {} });

export const typeOf = (s, id) => (s.types || TYPES).find((t) => t.id === id) || null;

// ---- reading -------------------------------------------------------------

// Oldest first: by day, then by start time, then by id.
export function sessionList(s) {
  return Object.entries(s.sessions || {})
    .map(([id, x]) => ({ id, ...x }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.startedAt || 0) - (b.startedAt || 0) || (a.id < b.id ? -1 : 1)));
}

const counts = (x) => !x.archive;

// The sets that count: in an open workout only the ticked ones.
export const countedSets = (session, item) => (item.sets || []).filter((st) => !session.open || st.done);

export function openSession(s) {
  return sessionList(s).reverse().find((x) => x.open) || null;
}

// The last real (not archived) workout of a type, before `beforeId` if given.
export function lastOfType(s, type, beforeId = null) {
  const list = sessionList(s).filter((x) => counts(x) && x.type === type);
  const end = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
  const pool = end >= 0 ? list.slice(0, end) : list.filter((x) => x.id !== beforeId);
  return pool.reverse().find((x) => !x.open && x.items.length) || null;
}

// The day after the last real workout's: legs → push → pull → legs.
export function nextType(s) {
  const order = (s.types || TYPES).map((t) => t.id);
  const last = sessionList(s).reverse().find((x) => counts(x) && order.includes(x.type) && !x.open);
  return last ? order[(order.indexOf(last.type) + 1) % order.length] : order[0];
}

// What was done on an exercise the last time before session `beforeId`
// (or ever): { session, item }. A real workout first; failing that the
// archive, so an exercise last done in 2022 still shows what that was.
export function lastTime(s, exId, beforeId = null) {
  const list = sessionList(s);
  const end = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
  const before = (end >= 0 ? list.slice(0, end) : list.filter((x) => x.id !== beforeId)).reverse();
  const find = (pool) => {
    for (const x of pool) {
      if (x.open) continue;
      const item = x.items.find((it) => it.ex === exId && (it.sets || []).length);
      if (item) return { session: x, item };
    }
    return null;
  };
  return find(before.filter(counts)) || find(before.filter((x) => x.archive));
}

// Every workout with this exercise, newest first: [{ session, item }].
export function exerciseHistory(s, exId) {
  const out = [];
  for (const x of sessionList(s).reverse()) {
    for (const item of x.items) if (item.ex === exId) out.push({ session: x, item });
  }
  return out;
}

// Epley's estimate of a one-rep max: how a set's weight and reps compare.
// Assisted exercises count the help as negative weight; bodyweight ones by reps.
export function score(set, kind) {
  const r = Number(set.r) || 0;
  if (!r) return -Infinity;
  // No weight (pull-ups, abs): reps only, and below any weighted set.
  if (!Number.isFinite(set.kg)) return kind === 'assisted' ? -Infinity : r / 1000;
  const kg = set.kg;
  const load = kind === 'assisted' ? -kg : kg;
  return load + Math.abs(load) * (r / 30);
}

// The best set of an exercise over a set of sessions: { set, session } or null.
export function best(s, exId, { before = null, archive = false } = {}) {
  const kind = (s.exercises[exId] || {}).kind;
  let top = null;
  const list = sessionList(s);
  const end = before ? list.findIndex((x) => x.id === before) : list.length;
  for (const x of list.slice(0, end < 0 ? list.length : end)) {
    if (!!x.archive !== archive) continue;
    for (const item of x.items) {
      if (item.ex !== exId) continue;
      for (const st of countedSets(x, item)) {
        const v = score(st, kind);
        if (v > -Infinity && (!top || v > top.v)) top = { v, set: st, session: x };
      }
    }
  }
  return top;
}

// The index of the set in this item that beats every earlier real workout of
// the exercise, or -1. Never on the first time an exercise is done: a first
// time is not a record.
export function prIndex(s, sessionId, itemIndex) {
  const session = s.sessions[sessionId];
  const item = session && session.items[itemIndex];
  if (!item || session.archive) return -1;
  const kind = (s.exercises[item.ex] || {}).kind;
  const prev = best(s, item.ex, { before: sessionId });
  if (!prev) return -1;
  let idx = -1;
  let v = prev.v;
  item.sets.forEach((st, j) => {
    if (session.open && !st.done) return;
    const x = score(st, kind);
    if (x > v) { v = x; idx = j; }
  });
  return idx;
}

// Every weight used on an exercise, low to high.
export function knownWeights(s, exId) {
  const w = new Set();
  for (const x of Object.values(s.sessions || {})) {
    for (const item of x.items) {
      if (item.ex !== exId) continue;
      for (const st of item.sets || []) if (Number.isFinite(st.kg)) w.add(st.kg);
    }
  }
  return [...w].sort((a, b) => a - b);
}

const round = (x) => Math.round(x * 100) / 100;

// The weight one step up (dir 1) or down (dir -1): the next weight this
// exercise has been done with, so a cable stack's 11.3 → 13.5 → 15.8 needs one
// tap; past the known ones, a step the size of the last gap (2.5 at first).
export function nextWeight(known, kg, dir) {
  const cur = Number.isFinite(kg) ? kg : null;
  if (cur === null) return known.length ? known[dir > 0 ? 0 : known.length - 1] : dir > 0 ? 2.5 : null;
  const pick = dir > 0 ? known.find((w) => w > cur + 1e-9) : [...known].reverse().find((w) => w < cur - 1e-9);
  if (pick !== undefined) return pick;
  const gaps = known.length > 1 ? (dir > 0 ? known[known.length - 1] - known[known.length - 2] : known[1] - known[0]) : 0;
  const step = gaps > 0 && gaps <= 10 ? gaps : 2.5;
  return Math.max(0, round(cur + dir * step));
}

export function weekCount(s, day) {
  const from = weekStart(day);
  const to = addDays(from, 6);
  return new Set(sessionList(s).filter((x) => counts(x) && x.day >= from && x.day <= to && x.items.some((it) => countedSets(x, it).length)).map((x) => x.day)).size;
}

// The rest after a set, in seconds.
export const restFor = (s, exId) => ((s.exercises[exId] || {}).rest) || DEFAULT_REST;

// The set j of item i completes a round: the item stands alone, or every
// exercise in its superset has set j ticked. That's when rest starts.
export function roundDone(session, i, j) {
  const item = session.items[i];
  const group = item.group ? session.items.filter((it) => it.group === item.group) : [item];
  return group.every((it) => it.sets[j] ? it.sets[j].done : true) && group.some((it) => it.sets[j]);
}

// ---- changing ------------------------------------------------------------

function withSession(s, id, fn) {
  if (!s.sessions[id]) return s;
  const next = clone(s);
  fn(next.sessions[id], next);
  return next;
}

// History, for Life Hub: logged live, the times; afterwards, just the date.
function markDay(next, session, now, live) {
  const h = (next.history = next.history || {});
  const cur = h[session.day];
  if (!live) {
    if (!cur) h[session.day] = { added: now };
    return;
  }
  if (cur && Number.isFinite(cur.firstAt)) cur.lastAt = Math.max(cur.lastAt || 0, now);
  else h[session.day] = { firstAt: now, lastAt: now };
}

const freshSets = (sets, open) => (sets || []).map((st) => {
  const out = {};
  if (st.r !== undefined) out.r = st.r;
  if (st.kg !== undefined) out.kg = st.kg;
  if (open) out.done = false;
  return out;
});

// A new workout of `type` on `day`, laid out like the last one of that type:
// same exercises, same order, supersets kept, every set pre-filled with what
// was done, nothing ticked. `live`: being done now (else logged afterwards).
export function startWorkout(s, { type, day, now, id = newSessionId(day), live = true }) {
  const next = clone(s);
  const prev = lastOfType(s, type);
  const items = prev
    ? prev.items.filter((it) => next.exercises[it.ex]).map((it) => ({
      ex: it.ex,
      ...(it.group ? { group: it.group } : {}),
      // An exercise done without numbers (abs) still gets a set to tick.
      sets: it.sets.length ? freshSets(it.sets, true) : [{ done: false }],
    }))
    : [];
  next.sessions[id] = { day, type, open: true, startedAt: now, items, ...(live ? {} : { late: true }) };
  return next;
}

// Done: only ticked sets stay. A workout with nothing ticked disappears.
export function finishWorkout(s, id, now) {
  const session = s.sessions[id];
  if (!session) return s;
  const next = clone(s);
  const x = next.sessions[id];
  x.items = x.items
    .map((it) => ({ ...it, sets: it.sets.filter((st) => !x.open || st.done).map(({ done, ...rest }) => rest) }))
    .filter((it) => it.sets.length);
  // A superset left with one exercise is just an exercise.
  for (const it of x.items) if (it.group && x.items.filter((o) => o.group === it.group).length < 2) delete it.group;
  if (!x.items.length) {
    delete next.sessions[id];
    dropDay(next, session.day);
    return next;
  }
  delete x.open;
  delete x.late;
  x.doneAt = now;
  return next;
}

function dropDay(next, day) {
  const still = Object.values(next.sessions).some((x) => x.day === day && !x.archive && x.items.some((it) => countedSets(x, it).length));
  if (!still && next.history) delete next.history[day];
}

export function deleteSession(s, id) {
  if (!s.sessions[id]) return s;
  const next = clone(s);
  const { day } = next.sessions[id];
  delete next.sessions[id];
  dropDay(next, day);
  return next;
}

// An open workout from an earlier day is finished as it stood.
export function closeStale(s, today, now) {
  let next = s;
  for (const x of sessionList(s)) if (x.open && x.day < today) next = finishWorkout(next, x.id, now);
  return next;
}

export const setValue = (s, id, i, j, field, value) => withSession(s, id, (x) => {
  const st = x.items[i] && x.items[i].sets[j];
  if (!st) return;
  if (value === null || value === '' || !Number.isFinite(value)) delete st[field];
  else st[field] = Math.max(0, round(value));
});

export const toggleSet = (s, id, i, j, now, live = true) => withSession(s, id, (x, next) => {
  const st = x.items[i] && x.items[i].sets[j];
  if (!st || !x.open) return;
  st.done = !st.done;
  if (st.done) markDay(next, x, now, live && !x.late);
});

export const setNote = (s, id, i, j, note) => withSession(s, id, (x) => {
  const target = j === null ? x.items[i] : x.items[i] && x.items[i].sets[j];
  if (!target) return;
  const t = String(note || '').trim();
  if (t) target.note = t;
  else delete target.note;
});

export const addSet = (s, id, i) => withSession(s, id, (x) => {
  const it = x.items[i];
  if (!it) return;
  const last = it.sets[it.sets.length - 1];
  it.sets.push({ ...(last ? freshSets([last], x.open)[0] : x.open ? { done: false } : {}) });
});

export const removeSet = (s, id, i, j) => withSession(s, id, (x) => {
  if (x.items[i]) x.items[i].sets.splice(j, 1);
});

const slug = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exercise';

// A new exercise; returns [state, id]. A name already known gives that one.
export function createExercise(s, name, extra = {}) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return [s, null];
  const known = Object.entries(s.exercises).find(([, e]) => e.name.toLowerCase() === clean.toLowerCase());
  if (known) return [s, known[0]];
  let id = slug(clean);
  for (let n = 2; s.exercises[id]; n++) id = `${slug(clean)}-${n}`;
  const next = clone(s);
  next.exercises[id] = { name: clean, ...extra };
  return [next, id];
}

export const updateExercise = (s, exId, patch) => {
  if (!s.exercises[exId]) return s;
  const next = clone(s);
  const e = next.exercises[exId];
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '' || v === false) delete e[k];
    else e[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (!e.name) e.name = s.exercises[exId].name;
  return next;
};

// Adds an exercise to a workout, its sets pre-filled from its last time.
export const addItem = (s, id, exId) => withSession(s, id, (x) => {
  const prev = lastTime(s, exId, id);
  const sets = prev ? freshSets(prev.item.sets, x.open) : [x.open ? { done: false } : {}];
  x.items.push({ ex: exId, sets });
});

export const removeItem = (s, id, i) => withSession(s, id, (x) => {
  x.items.splice(i, 1);
});

// Moves an item one place; a superset moves as one block.
export const moveItem = (s, id, i, dir) => withSession(s, id, (x) => {
  const block = (k) => {
    const g = x.items[k] && x.items[k].group;
    if (!g) return [k, k];
    let a = k;
    let b = k;
    while (a > 0 && x.items[a - 1].group === g) a--;
    while (b < x.items.length - 1 && x.items[b + 1].group === g) b++;
    return [a, b];
  };
  const [a, b] = block(i);
  if (dir < 0 && a === 0) return;
  if (dir > 0 && b === x.items.length - 1) return;
  const moving = x.items.splice(a, b - a + 1);
  if (dir < 0) {
    const [pa] = block(a - 1);
    x.items.splice(pa, 0, ...moving);
  } else {
    const [, nb] = block(a); // the block now at a is the one that was after
    x.items.splice(nb + 1, 0, ...moving);
  }
});

// Joins item i with the one after it into a superset, or takes it out of one.
export const toggleSuperset = (s, id, i) => withSession(s, id, (x) => {
  const it = x.items[i];
  if (!it) return;
  if (it.group) {
    const g = it.group;
    delete it.group;
    const rest = x.items.filter((o) => o.group === g);
    if (rest.length < 2) rest.forEach((o) => delete o.group);
    return;
  }
  const after = x.items[i + 1];
  if (!after) return;
  const g = after.group || `g${rand()}`;
  it.group = g;
  after.group = g;
});

// Logged on another day than planned: move it (and its history day).
export const moveSession = (s, id, day, now) => withSession(s, id, (x, next) => {
  const old = x.day;
  if (old === day) return;
  x.day = day;
  dropDay(next, old);
  if (x.items.some((it) => countedSets(x, it).length)) markDay(next, x, now, false);
});

export const setType = (s, id, type) => withSession(s, id, (x) => { x.type = type; });
