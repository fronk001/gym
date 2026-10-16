// The rest timer on screen, the beep when it ends, and keeping the screen on
// during a workout.
//
// What an iPhone home-screen app can and can't do here (checked Oct 2026):
// - Its clock stops while the screen is locked or another app is open, and
//   it can't vibrate or show a notification by itself (that needs a push
//   server). So the screen stays on during a workout (Wake Lock, working in
//   home-screen apps since iOS 18.4), and the countdown is worked out from
//   its end moment, so it is right again the moment the app is back.
// - A sound needs a tap first: the first tap anywhere unlocks it. It plays
//   "ambient", mixed with Fred's music and silent when the phone is on mute;
//   the bar turning green is the signal that always works.
//
// The bar lives outside #app (the views are re-rendered whole on every
// change) and is fixed to the bottom of the screen.

import { adjust, left, progress, startRest, visible } from '../core/rest.js';
import { mmss } from './html.js';

const KEY = 'gym:rest';
let timer = read();
let shownFor = null; // the workout whose screen is open, or null
let bar = null;
let loop = null;
let beeped = false;
let audio = null;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
function save() {
  try {
    if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing: the timer still runs for this visit.
  }
}

// ---- sound ----------------------------------------------------------------

export function unlockSound() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    audio = new Ctx();
    // A silent blip: iOS only lets sound play later once some has played in a tap.
    const g = audio.createGain();
    g.gain.value = 0;
    g.connect(audio.destination);
    const o = audio.createOscillator();
    o.connect(g);
    o.start();
    o.stop(audio.currentTime + 0.01);
  } catch {
    audio = null;
  }
}

function beep() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.02;
    [0, 0.28].forEach((d) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.25);
    });
  } catch {
    // No sound: the green bar still says it.
  }
}

// ---- keeping the screen on -------------------------------------------------

let lock = null;
let wantAwake = false;

async function acquire() {
  if (!wantAwake || lock || document.hidden || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch {
    lock = null; // refused (low battery, settings): the timer still works
  }
}

export function keepAwake(on) {
  wantAwake = on;
  if (on) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}
// The lock ends whenever the app goes out of view; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    acquire();
    draw();
  }
});

// ---- the bar ---------------------------------------------------------------

function build() {
  bar = document.createElement('div');
  bar.className = 'rest';
  bar.hidden = true;
  bar.setAttribute('role', 'timer');
  bar.innerHTML = `
    <i class="fill"></i>
    <div class="rest-text"><span class="k">Rest</span><span class="v"></span></div>
    <button type="button" data-r="-15" aria-label="15 seconds less">−15</button>
    <button type="button" data-r="15" aria-label="15 seconds more">+15</button>
    <button type="button" data-r="skip">Skip</button>`;
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    if (b.dataset.r === 'skip') timer = null;
    else timer = adjust(timer, Date.now(), Number(b.dataset.r));
    if (timer && left(timer, Date.now()) > 0) beeped = false;
    save();
    draw();
  });
  document.body.append(bar);
}

function draw() {
  if (!bar) build();
  const now = Date.now();
  const show = shownFor && timer && timer.sid === shownFor && visible(timer, now);
  bar.hidden = !show;
  document.body.classList.toggle('resting', !!show);
  if (!show) {
    stopLoop();
    return;
  }
  const s = left(timer, now);
  const over = s <= 0;
  bar.classList.toggle('over', over);
  bar.querySelector('.k').textContent = over ? 'Rest over' : 'Rest';
  bar.querySelector('.v').textContent = over ? 'Go' : mmss(Math.ceil(s));
  bar.querySelector('.fill').style.transform = `scaleX(${progress(timer, now)})`;
  if (over && !beeped) {
    beeped = true;
    // Only when it ends in view: coming back to a timer long over shouldn't beep.
    if (s > -2) beep();
  }
  startLoop();
}

function startLoop() {
  if (!loop) loop = setInterval(draw, 250);
}
function stopLoop() {
  clearInterval(loop);
  loop = null;
}

// A set was ticked in workout `sid`: rest `seconds`.
export function rest(sid, seconds) {
  timer = startRest(Date.now(), seconds, sid);
  beeped = false;
  save();
  draw();
}

export function stopRest() {
  timer = null;
  save();
  draw();
}

// Which workout's screen is open (null: none), so the bar shows only there.
export function showRestFor(sid) {
  shownFor = sid;
  draw();
}
