// The online database: Firebase Auth (email + password) and Cloud Firestore,
// behind the small interface engine.js expects. The only file that knows
// Firebase exists. Same project and account as Life Hub and the Mongolian
// app (life-hub-fred); this app's data lives in users/{uid}/gym/.
//
// The SDK comes as ES modules straight from Google's CDN, fetched after the
// first paint: the screen never waits for it. The Firebase app is created
// under its own name ('gym'), so its sign-in never tangles with Life Hub's
// or Mongolian's, which share this web address (fronk001.github.io).

const V = '12.19.0';
const sdk = (name) => import(`https://www.gstatic.com/firebasejs/${V}/firebase-${name}.js`);
const FOLDER = 'gym';

export function firebaseBackend(config) {
  let fb = null;
  let booting = null;
  let failed = false;

  function boot() {
    // A browser remembers a failed module download for the life of the
    // page, so once online again only a reload gets the SDK: instant, since
    // the screen draws from this device's copy, and the queue survives it.
    if (failed) {
      location.reload();
      return new Promise(() => {});
    }
    booting = booting || Promise.all([sdk('app'), sdk('auth'), sdk('firestore')]).then(([app, A, F]) => {
      const a = app.initializeApp(config, 'gym');
      const auth = A.initializeAuth(a, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
      fb = { A, F, auth, db: F.getFirestore(a) };
      return fb;
    }, (e) => {
      failed = true;
      throw e;
    });
    return booting;
  }

  const DEL = Symbol('delete');
  const swap = (v) => {
    if (v === DEL) return fb.F.deleteField();
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };

  const data = (uid, id) => fb.F.doc(fb.db, 'users', uid, FOLDER, id);

  return {
    DEL,

    async start(onUser) {
      const { A, auth } = await boot();
      A.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, email: u.email || '' } : null));
    },

    async signIn(email, password) {
      const { A, auth } = await boot();
      await A.signInWithEmailAndPassword(auth, email, password);
    },

    async signOut() {
      const { A, auth } = await boot();
      await A.signOut(auth);
    },

    async resetPassword(email) {
      const { A, auth } = await boot();
      await A.sendPasswordResetEmail(auth, email);
    },

    listen(uid, onDocs, onError) {
      const { F, db } = fb;
      return F.onSnapshot(F.collection(db, 'users', uid, FOLDER), { includeMetadataChanges: true }, (snap) => {
        const docs = {};
        snap.forEach((d) => { docs[d.id] = d.data(); });
        onDocs({ docs, fromCache: snap.metadata.fromCache });
      }, onError);
    },

    write(uid, writes) {
      const batch = fb.F.writeBatch(fb.db);
      for (const w of writes) batch.set(data(uid, w.id), swap(w.data), { merge: w.merge });
      return batch.commit();
    },
  };
}
