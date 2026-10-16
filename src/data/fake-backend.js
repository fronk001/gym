// A pretend online database with the same interface as firebase.js, for the
// tests and for trying the sync screens (?fake-sync=<device>). Nothing
// leaves the browser. It copies the Firestore behaviour engine.js relies on:
// merge-writes, snapshots that already include this device's unsent writes,
// "fromCache" while offline, and writes that only resolve once delivered.

import { applyMerge } from '../core/sync.js';

// The pretend server's only account. Not a real credential anywhere.
export const FAKE_ACCOUNTS = [
  { email: 'fred@example.test', password: 'pretend-pass-1', uid: 'fake-fred' },
  { email: 'other@example.test', password: 'pretend-pass-2', uid: 'fake-other' },
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const later = (fn) => setTimeout(fn, 0);
const refuse = (code) => Object.assign(new Error(code), { code });

// The shared "server": documents per user. With `storage` it survives a
// reload and is shared by frames of the same page (via storage events).
export function fakeServer({ storage = null, key = 'gym:fake-server' } = {}) {
  const read = () => (storage && JSON.parse(storage.getItem(key) || 'null')) || {};
  let all = read();
  const watchers = new Set();
  const tell = () => watchers.forEach((fn) => fn());
  if (storage) {
    addEventListener('storage', (e) => {
      if (e.key === key) {
        all = read();
        tell();
      }
    });
  }
  return {
    docs: (uid) => clone(all[uid] || {}),
    // Another app's documents for this account (tests: the Mongolian app's
    // year documents). `key` = `${uid}/${app}`, never a Life Hub uid.
    appDocs: (uid, app) => clone(all[`${uid}/${app}`] || {}),
    putApp(uid, app, id, data) {
      const mine = (all[`${uid}/${app}`] = all[`${uid}/${app}`] || {});
      mine[id] = clone(data);
      if (storage) storage.setItem(key, JSON.stringify(all));
      tell();
    },
    apply(uid, writes, DEL) {
      const mine = (all[uid] = all[uid] || {});
      for (const w of writes) mine[w.id] = w.merge ? applyMerge(mine[w.id] || {}, w.data, DEL) : clone(w.data);
      if (storage) storage.setItem(key, JSON.stringify(all));
      tell();
    },
    watch(fn) {
      watchers.add(fn);
      return () => watchers.delete(fn);
    },
  };
}

// One device's connection. `storage` keeps its sign-in across reloads.
export function fakeBackend({ server, storage = null, device = 'a', accounts = FAKE_ACCOUNTS }) {
  const SESSION = `gym:fake-session:${device}`;
  const DEL = Symbol('delete');
  let user = (storage && JSON.parse(storage.getItem(SESSION) || 'null')) || null;
  let onUser = () => {};
  let online = true;
  const known = {};    // uid -> documents as last received from the server
  const queue = [];    // writes not yet delivered: { uid, writes, resolve, reject }
  const listeners = new Set();
  const appListeners = new Set();

  function view(uid) {
    const docs = clone(known[uid] || {});
    for (const q of queue) {
      if (q.uid !== uid) continue;
      for (const w of q.writes) docs[w.id] = w.merge ? applyMerge(docs[w.id] || {}, w.data, DEL) : clone(w.data);
    }
    return docs;
  }

  function emit(l) {
    later(() => {
      if (listeners.has(l)) l.onDocs({ docs: view(l.uid), fromCache: !(online && l.heard) });
    });
  }

  function refresh() {
    if (!online) return;
    for (const l of listeners) {
      known[l.uid] = server.docs(l.uid);
      l.heard = true;
      emit(l);
    }
    for (const l of appListeners) {
      const docs = server.appDocs(l.uid, l.app);
      const rows = Object.assign({}, ...l.years.map((y) => (docs[y] && docs[y].history) || {}));
      later(() => { if (appListeners.has(l)) l.onRows(rows); });
    }
  }

  function deliver() {
    if (!online) return;
    while (queue.length) {
      const q = queue.shift();
      // The database rules: each account may only touch its own data.
      if (!user || user.uid !== q.uid) q.reject(refuse('permission-denied'));
      else {
        server.apply(q.uid, q.writes, DEL);
        q.resolve();
      }
    }
    refresh();
  }

  server.watch(refresh);

  const setUser = (u) => {
    user = u;
    if (storage) {
      if (u) storage.setItem(SESSION, JSON.stringify(u));
      else storage.removeItem(SESSION);
    }
    later(() => onUser(user));
  };

  return {
    DEL,

    get online() { return online; },
    setOnline(v) {
      online = v;
      if (v) later(deliver);
      else for (const l of listeners) emit(l);
    },

    async start(fn) {
      // The real SDK comes from the network: offline, it can't load at all.
      if (!online) throw refuse('unavailable');
      onUser = fn;
      later(() => onUser(user));
    },

    async signIn(email, password) {
      if (!online) throw refuse('auth/network-request-failed');
      const a = accounts.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
      if (!a) throw refuse('auth/invalid-credential');
      setUser({ uid: a.uid, email: a.email });
    },

    async signOut() {
      setUser(null);
    },

    async resetPassword() {
      if (!online) throw refuse('auth/network-request-failed');
    },

    listen(uid, onDocs, onError) {
      if (!user || user.uid !== uid) {
        later(() => onError(refuse('permission-denied')));
        return () => {};
      }
      const l = { uid, onDocs, heard: false };
      listeners.add(l);
      if (online) refresh();
      else emit(l);
      return () => listeners.delete(l);
    },

    listenApp(uid, app, years, onRows, onError) {
      if (!user || user.uid !== uid) {
        later(() => onError(refuse('permission-denied')));
        return () => {};
      }
      const l = { uid, app, years, onRows };
      appListeners.add(l);
      if (online) refresh();
      return () => appListeners.delete(l);
    },

    write(uid, writes) {
      return new Promise((resolve, reject) => {
        queue.push({ uid, writes, resolve, reject });
        for (const l of listeners) emit(l);
        later(deliver);
      });
    },
  };
}
