// The Firebase web config of Life Hub's project (life-hub-fred), which this
// app shares with Life Hub and the Mongolian app: same account, same
// database, its own folder (users/{uid}/gym/). It is not a secret: every web
// app ships it, and the database rules (life-hub/firestore.rules) are what
// keep the data private to Fred's account.
//
// null = keep the data on this device only.

export const firebaseConfig = {
  apiKey: 'AIzaSyBcvMPBLxQAdOhL-8kslPenwCM_qz_TFmg',
  authDomain: 'life-hub-fred.firebaseapp.com',
  projectId: 'life-hub-fred',
  storageBucket: 'life-hub-fred.firebasestorage.app',
  messagingSenderId: '789038327074',
  appId: '1:789038327074:web:acfc21d203e9602642317b',
};
