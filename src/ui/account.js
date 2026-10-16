// Sign-in and sync status: the sync button in the top right corner, the
// account line at the bottom of the page, the sign-in form, and the screen a
// new device shows before it has any data.
//
// The form lives outside #app on purpose: the views are re-rendered whole on
// every change, which would wipe a half-typed password.

import { hasNotes, sync } from '../data/store.js';
import { esc, plural } from './html.js';

const offline = (st) => st.mode === 'offline' || !navigator.onLine;
const changes = (n) => `${n} ${plural(n, 'change')}`;

// Where sync stands, in the Mongolian app's signs: a solid dot when this
// device is in step, a ring while it's on its way (connecting, offline, a
// change still going up: nothing to do), red when it needs you. `words` show
// on the button only when there is something to say; `name` and `note` fill
// the card a tap opens. Signed out has no card: its button opens the form.
function syncState(st) {
  if (st.mode === 'signed-out') {
    return { tone: 'red', words: st.claimed ? 'Signed out · Sign in' : 'Sign in to sync' };
  }
  if (st.mode === 'error') {
    const hint = /permission/.test(st.error)
      ? 'The database refused access. Check the “Paste the rules” step in SETUP.md.'
      : 'Your sets are kept on this device and are sent again the next time the app opens.';
    return { tone: 'red', words: 'Not syncing', name: 'Not syncing', note: `Gym couldn’t sync (${esc(st.error)}). ${hint}` };
  }
  if (offline(st)) {
    return {
      tone: 'wait', words: `Offline${st.waiting ? ` · ${changes(st.waiting)} saved here` : ''}`, name: 'Offline',
      note: st.claimed
        ? `Keep logging: ${st.waiting ? `the ${changes(st.waiting)} saved here go` : 'changes go'} up by themselves once you’re back online, even if you close the app meanwhile.`
        : 'This device isn’t synced yet. Once you’re back online, sign in to sync it.',
    };
  }
  if (st.waiting && st.slow) {
    return {
      tone: 'wait', words: 'Syncing…', name: 'Syncing…',
      note: `${changes(st.waiting)} still on the way up. They’re kept on this device until the database has them, so nothing is lost.`,
    };
  }
  if (st.mode !== 'live') {
    return { tone: 'wait', words: '', name: 'Connecting…', note: 'Reaching the database. Keep logging meanwhile: nothing is lost.' };
  }
  return { tone: 'on', words: '', name: 'Synced', note: 'Every set goes up by itself, and each workout ticks Gym in Life Hub.' };
}

// Top right of every screen, always there once sync is set up, so a device
// that isn't in step can't pass for one that is. `open`: the card below it.
export function syncButton(st, open = false) {
  if (st.mode === 'off') return '';
  const s = syncState(st);
  const cls = `sync ${s.tone}${s.words ? ' says' : ''}`;
  if (!s.name) return `<button class="${cls}" data-act="sign-in">${s.words}</button>`;
  const button = `<button class="${cls}" data-act="sync" aria-expanded="${open}"${s.words ? '' : ` title="${s.name}"`}>${s.words}</button>`;
  if (!open) return button;
  return `${button}
  <div class="sync-card ${s.tone}">
    <p class="t">${s.name}</p>
    <p>${s.note}</p>
    ${st.email ? `<p class="who">Signed in as ${esc(st.email)}</p>` : ''}
  </div>`;
}

const signOutLink = '<button data-act="sign-out">Sign out</button>';

export function accountLine(st) {
  return st.email ? `<footer class="acct">Signed in as ${esc(st.email)} · ${signOutLink}</footer>` : '';
}

// Before this device has any data: first visit on the phone.
export function gate(st) {
  const msg = {
    connecting: 'Loading your workouts…',
    offline: 'You’re offline. The first time on a new device, the app needs a connection to fetch your workouts.',
    empty: hasNotes
      ? 'Nothing is stored online yet. Start with your Notes log: it goes online, and your phone gets it as soon as you sign in there.'
      : 'Nothing is stored online yet. Open Gym on your laptop and sign in there first: that puts your Notes log online, and it appears here straight after.',
    error: `Couldn’t load your workouts (${esc(st.error)}).`,
  }[st.mode];
  const fresh = hasNotes
    ? '<button class="btn dark" data-act="start-fresh">Start with my Notes log</button>'
    : '<p class="acct">Starting without your Notes log? <button data-act="start-fresh">Start an empty log</button></p>';
  return `
  <div class="gate">
    <div class="eyebrow">Gym</div>
    ${msg ? `<p>${msg}</p>` : ''}
    ${st.canStartFresh ? fresh : ''}
    ${st.email && st.mode !== 'connecting' ? `<p class="acct">Signed in as ${esc(st.email)} · ${signOutLink}</p>` : ''}
  </div>`;
}

// ---- the sign-in form -----------------------------------------------------

const MESSAGES = {
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/user-not-found': 'That email and password don’t match.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/missing-password': 'Type your password too.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'No internet connection. Try again once you’re online.',
  'auth/user-disabled': 'This account is switched off in the Firebase console.',
};
const explain = (e) => MESSAGES[e && e.code] || `Couldn’t sign in (${(e && (e.code || e.message)) || e}).`;

const FORM = `
<form class="signin-card" novalidate>
  <div class="eyebrow">Gym</div>
  <h1 id="signin-title">Sign in</h1>
  <p class="lead">The same account as Life Hub. Your workouts, on every device you sign in on.</p>
  <label>Email<input name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
  <label>Password<input name="password" type="password" autocomplete="current-password"></label>
  <p class="msg" role="alert" hidden></p>
  <button class="btn dark" type="submit">Sign in</button>
  <div class="links">
    <button type="button" class="btn text" data-f="forgot">Forgot password?</button>
    <button type="button" class="btn text" data-f="cancel">Not now</button>
  </div>
</form>`;

let box = null;

function say(text, tone = 'error') {
  const m = box.querySelector('.msg');
  m.textContent = text;
  m.className = `msg ${tone}`;
  m.hidden = !text;
}

function build() {
  box = document.createElement('div');
  box.className = 'signin';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'signin-title');
  box.innerHTML = FORM;
  document.body.append(box);
  const form = box.querySelector('form');
  const submit = form.querySelector('[type=submit]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return say('Type your email and your password.');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    say('');
    try {
      await sync.signIn(email, password);
      form.password.value = '';
      closeSignIn();
    } catch (err) {
      say(explain(err));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  box.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (!f) return;
    if (f.dataset.f === 'cancel') return closeSignIn();
    const email = form.email.value.trim();
    if (!email) return say('Type your email above first, then tap “Forgot password?” again.');
    try {
      await sync.resetPassword(email);
      say(`If ${email} is your account, an email with a link to choose a new password is on its way.`, 'info');
    } catch (err) {
      say(explain(err));
    }
  });

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.classList.contains('forced')) closeSignIn();
  });
}

// `forced`: there is nothing to show without signing in (a new phone), so
// the form fills the screen and can't be dismissed.
export function openSignIn({ forced = false } = {}) {
  if (!box) build();
  box.classList.toggle('forced', forced);
  box.querySelector('[data-f=cancel]').hidden = forced;
  if (!box.hidden) return;
  box.hidden = false;
  say('');
  if (!forced) box.querySelector('input[name=email]').focus();
}

export function closeSignIn() {
  if (box) box.hidden = true;
}

export const signInForced = () => !!box && !box.hidden && box.classList.contains('forced');
export const signInOpen = () => !!box && !box.hidden;
