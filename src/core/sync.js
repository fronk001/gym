// How the app's state maps onto the online database, as pure functions.
// The same interface as Life Hub's core/sync.js (engine.js is shared code).
//
// Firestore layout, all under users/{uid}/gym/:
//   main       types, exercises, settings: everything but workouts and days
//   log-2026   that year's workouts: { sessions: { [id]: "<the workout as JSON>" } }
//   2026       that year's days trained: { history: { [day]: { firstAt, lastAt } } }
//              Life Hub reads only this one (its data/links.js), so it never
//              downloads a year of sets to tick a habit.
//
// A workout is one value online, a JSON string, written whole on every
// change. It changes on one device at a time, and as a string it costs one
// index entry instead of one per set: a year of maps of sets would come near
// Firestore's 40,000-entries-per-document limit, a year of strings never.
// Year = the first four characters of the session id (`${day}~…`).

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));

export function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && same(a[k], b[k]));
}

function addAll(v, path, ops) {
  const keys = Object.keys(v);
  if (!keys.length) ops.push({ path, value: {} });
  for (const k of keys) {
    if (isObj(v[k])) addAll(v[k], [...path, k], ops);
    else ops.push({ path: [...path, k], value: clone(v[k]) });
  }
}

function removeAll(v, path, ops) {
  const keys = isObj(v) ? Object.keys(v) : [];
  if (!keys.length) ops.push({ path, del: true });
  for (const k of keys) removeAll(v[k], [...path, k], ops);
}

function leafDiff(a, b, path, ops) {
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a ? a[k] : undefined;
    const y = b ? b[k] : undefined;
    const p = [...path, k];
    if (y === undefined) removeAll(x, p, ops);
    else if (isObj(x) && isObj(y)) leafDiff(x, y, p, ops);
    else if (isObj(y)) addAll(y, p, ops);
    else if (!same(x, y)) ops.push({ path: p, value: clone(y) });
  }
}

// What changed from a to b, as [{ path, value } | { path, del: true }].
// Workouts change as a whole (`sessions.<id>`), everything else leaf by leaf.
export function diff(a, b) {
  const ops = [];
  const { sessions: sa = {}, ...ra } = a || {};
  const { sessions: sb = {}, ...rb } = b || {};
  leafDiff(ra, rb, [], ops);
  for (const id of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (sb[id] === undefined) ops.push({ path: ['sessions', id], del: true });
    else if (!same(sa[id], sb[id])) ops.push({ path: ['sessions', id], value: clone(sb[id]) });
  }
  return ops;
}

export function docOf(path) {
  if (path[0] === 'sessions') return path.length > 1 ? `log-${path[1].slice(0, 4)}` : null;
  if (path[0] === 'history') return path.length > 1 ? path[1].slice(0, 4) : null;
  return 'main';
}

const encode = (path, value) => (path[0] === 'sessions' && path.length === 2 ? JSON.stringify(value) : clone(value));

export function toDocs(state) {
  const { sessions = {}, history = {}, ...rest } = clone(state);
  const docs = { main: rest };
  for (const [id, x] of Object.entries(sessions)) {
    const d = (docs[`log-${id.slice(0, 4)}`] = docs[`log-${id.slice(0, 4)}`] || { sessions: {} });
    d.sessions[id] = JSON.stringify(x);
  }
  for (const [day, v] of Object.entries(history)) {
    const d = (docs[day.slice(0, 4)] = docs[day.slice(0, 4)] || { history: {} });
    d.history[day] = v;
  }
  return docs;
}

export function fromDocs(docs) {
  const { main, ...rest } = clone(docs);
  const s = { ...main, sessions: {}, history: {} };
  for (const id of Object.keys(rest).sort()) {
    const d = rest[id];
    if (/^log-\d{4}$/.test(id)) {
      for (const [sid, v] of Object.entries(d.sessions || {})) {
        try {
          s.sessions[sid] = typeof v === 'string' ? JSON.parse(v) : v;
        } catch {
          // A damaged workout is left out rather than stopping the whole log.
        }
      }
    } else if (/^\d{4}$/.test(id)) Object.assign(s.history, d.history || {});
  }
  return s;
}

export function patchesFor(ops, DEL) {
  const docs = {};
  for (const op of ops) {
    const id = docOf(op.path);
    if (!id) continue;
    let o = (docs[id] = docs[id] || {});
    for (const k of op.path.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k];
    }
    o[op.path[op.path.length - 1]] = op.del ? DEL : encode(op.path, op.value);
  }
  return Object.entries(docs).map(([id, data]) => ({ id, data, merge: true }));
}

export function applyMerge(target, patch, DEL) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === DEL) delete target[k];
    else if (isObj(v) && Object.keys(v).length) {
      if (!isObj(target[k])) target[k] = {};
      applyMerge(target[k], v, DEL);
    } else target[k] = clone(v);
  }
  return target;
}
