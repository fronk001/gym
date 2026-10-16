// Boot: draw from this device's data straight away, then keep the screen
// current. Screens by address (#/ home, #/w/<id> a workout, #/history,
// #/x/<id> an exercise), so a reload or the app coming back lands where Fred was.

import { roundDone, restFor, knownWeights, nextWeight } from '../core/workout.js';
import { act, get, isDemo, load, subscribe, sync, today } from '../data/store.js';
import { accountLine, closeSignIn, gate, openSignIn, signInForced, signInOpen, syncButton } from './account.js';
import { readNumber } from './html.js';
import { keepAwake, rest, showRestFor, stopRest, unlockSound } from './rest.js';
import { addExercise, askNote, exerciseMenu, logPast, sheetOpen, workoutMenu } from './sheets.js';
import { renderExercise, renderHistory, renderHome, renderWorkout } from './views.js';

const root = document.getElementById('app');
const ui = { syncOpen: false, setMenu: null, setMenuFor: null };
let drawnDay = null;
let dirty = false;
let moves = 0; // screens moved forward since opening: Back goes back only within the app
let goingBack = false;

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (h.startsWith('w/')) return { name: 'workout', id: h.slice(2) };
  if (h.startsWith('x/')) return { name: 'exercise', id: h.slice(2) };
  if (h === 'history') return { name: 'history' };
  return { name: 'home' };
}
const go = (hash) => { location.hash = hash; };

// Something being typed in a reps or kg box: a redraw now would take the
// box away mid-number (and the keyboard with it). Draw once it's left.
const typing = () => document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('num');

function render() {
  if (typing()) {
    dirty = true;
    return;
  }
  dirty = false;
  drawnDay = today();
  const s = get();
  const st = sync.status();
  if (!s) {
    root.className = 'is-gate';
    root.innerHTML = gate(st);
    if (st.mode === 'signed-out') openSignIn({ forced: true });
    showRestFor(null);
    keepAwake(false);
    return;
  }
  if (signInForced()) closeSignIn();
  const r = route();
  const ctx = { s, day: drawnDay, ui, sync: syncButton(st, ui.syncOpen), footer: accountLine(st) };
  let html;
  if (r.name === 'workout') html = renderWorkout({ ...ctx, id: r.id });
  else if (r.name === 'history') html = renderHistory(ctx);
  else if (r.name === 'exercise') html = renderExercise({ ...ctx, exId: r.id });
  else html = renderHome(ctx);
  root.className = `is-${r.name}`;
  root.innerHTML = html + (isDemo ? '<div class="demo-badge">Demo data</div>' : '');
  const live = r.name === 'workout' && s.sessions[r.id] && s.sessions[r.id].open;
  showRestFor(live ? r.id : null);
  keepAwake(!!live && s.sessions[r.id].day === drawnDay);
  if (r.name === 'history') wireSearch();
}

function wireSearch() {
  const q = root.querySelector('.search');
  if (!q) return;
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    const hits = root.querySelector('.ex-hits');
    let any = false;
    hits.querySelectorAll('[data-search]').forEach((el) => {
      el.hidden = !t || !el.dataset.search.includes(t);
      if (!el.hidden) any = true;
    });
    hits.hidden = !any;
    root.querySelectorAll('.sessions [data-search]').forEach((el) => { el.hidden = !!t && !el.dataset.search.includes(t); });
    root.querySelectorAll('.sessions .month').forEach((m) => {
      let n = m.nextElementSibling;
      let shown = false;
      while (n && !n.classList.contains('month')) {
        if (!n.hidden) shown = true;
        n = n.nextElementSibling;
      }
      m.hidden = !shown;
    });
  });
}

const sid = () => route().id;
const num = (el, k) => Number(el.dataset[k]);

function startWorkout(type, day) {
  const id = act.start(type, day);
  if (id) go(`#/w/${encodeURIComponent(id)}`);
}

function tick(i, j) {
  const id = sid();
  const before = get().sessions[id];
  const was = before && before.items[i] && before.items[i].sets[j] && before.items[i].sets[j].done;
  act.toggleSet(id, i, j);
  const x = get().sessions[id];
  if (!x || was) return;
  // Rest once the round is done: after the last exercise of a superset.
  if (roundDone(x, i, j) && x.day === today() && !x.late) {
    const it = x.items[i];
    const group = it.group ? x.items.filter((o) => o.group === it.group) : [it];
    rest(id, Math.max(...group.map((o) => restFor(get(), o.ex))));
  }
}

function step(el) {
  const id = sid();
  const i = num(el, 'i');
  const j = num(el, 'j');
  const d = num(el, 'd');
  const s = get();
  const st = s.sessions[id].items[i].sets[j];
  if (el.dataset.f === 'r') act.setValue(id, i, j, 'r', Math.max(0, (Number.isFinite(st.r) ? st.r : 0) + d));
  else {
    const v = nextWeight(knownWeights(s, s.sessions[id].items[i].ex), st.kg, d);
    act.setValue(id, i, j, 'kg', v);
  }
}

function finish() {
  const id = sid();
  const x = get().sessions[id];
  const open = x.items.reduce((n, it) => n + it.sets.filter((st) => !st.done).length, 0);
  const done = x.items.reduce((n, it) => n + it.sets.filter((st) => st.done).length, 0);
  if (!done && !confirm('Nothing is ticked, so no sets are saved. Today still counts as a gym day in Life Hub.\n\n' +
    '(Didn’t go after all? Use “Discard this workout” in the ⋯ menu instead.)\n\nFinish anyway?')) return;
  if (done && open && !confirm(`${open} ${open === 1 ? 'set isn’t' : 'sets aren’t'} ticked and won’t be saved. Finish anyway?`)) return;
  act.finish(id);
  stopRest();
  go('#/');
}

function removeWorkout() {
  const id = sid();
  const x = get().sessions[id];
  if (!x) return;
  const what = x.open ? 'Throw away this workout? Nothing of it is saved, and the day no longer counts as a gym day here. (If Life Hub already ticked it, untick it there.)' : 'Delete this workout? This can’t be undone.';
  if (!confirm(what)) return;
  act.remove(id);
  stopRest();
  go(x.open ? '#/' : '#/history');
}

function signOut() {
  const { waiting } = sync.status();
  const lost = waiting
    ? `\n\n${waiting} ${waiting === 1 ? 'change hasn’t' : 'changes haven’t'} reached the database yet and would be lost.`
    : '';
  if (confirm(`Sign out of Gym on this device? Your workouts stay safe online.${lost}`)) {
    sync.signOut().then(() => location.reload());
  }
}

root.addEventListener('click', (e) => {
  unlockSound();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // A tap on any button while a number is being typed: save the number
  // first (leaving the box does that), so the tap's own change draws.
  if (typing()) document.activeElement.blur();
  const id = sid();
  switch (el.dataset.act) {
    case 'back':
      // Back where Fred came from; opened straight on this screen, home.
      if (moves > 0) {
        goingBack = true;
        history.back();
      }
      else go('#/');
      break;
    case 'start': startWorkout(el.dataset.type); break;
    case 'log-past': logPast({ onStart: startWorkout }); break;
    case 'tick': tick(num(el, 'i'), num(el, 'j')); break;
    case 'step': step(el); break;
    case 'add-set': act.addSet(id, num(el, 'i')); break;
    case 'set-menu': {
      const key = `${el.dataset.i}:${el.dataset.j}`;
      const same = ui.setMenu === key && ui.setMenuFor === id;
      ui.setMenu = same ? null : key;
      ui.setMenuFor = id;
      render();
      break;
    }
    case 'set-note': {
      const i = num(el, 'i');
      const j = num(el, 'j');
      const st = get().sessions[id].items[i].sets[j];
      ui.setMenu = null;
      askNote(`Note on set ${j + 1}`, st.note, (t) => act.setNote(id, i, j, t));
      render();
      break;
    }
    case 'set-remove':
      ui.setMenu = null;
      act.removeSet(id, num(el, 'i'), num(el, 'j'));
      break;
    case 'ex-menu': {
      const i = num(el, 'i');
      const exId = get().sessions[id].items[i].ex;
      exerciseMenu(exId, id, i, { onHistory: () => go(`#/x/${encodeURIComponent(exId)}`) });
      break;
    }
    case 'ex-edit': exerciseMenu(el.dataset.ex); break;
    case 'add-ex': addExercise(id); break;
    case 'w-menu': workoutMenu(id, { onDelete: removeWorkout }); break;
    case 'finish': finish(); break;
    case 'delete': removeWorkout(); break;
    case 'sync':
      ui.syncOpen = !ui.syncOpen;
      render();
      break;
    case 'sign-in':
      ui.syncOpen = false;
      openSignIn();
      break;
    case 'sign-out': signOut(); break;
    case 'start-fresh':
      if (confirm('Put this log online as your gym record?\n\nOnly do this once: if your workouts are already online in another browser, sign in there instead.')) sync.startFresh();
      break;
    default:
  }
});

// Typed reps and kg: saved when the box is left (or Done on the keyboard).
root.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.classList.contains('num')) return;
  const v = readNumber(el.value);
  if (Number.isNaN(v)) {
    el.value = '';
    return;
  }
  act.setValue(sid(), num(el, 'i'), num(el, 'j'), el.dataset.f, v);
  drawSoon(); // also without a focusout (a window in the background sends none)
});
root.addEventListener('focusin', (e) => {
  // Tapping a box selects its number, so typing replaces it.
  // Only if still there: select() would put the cursor back into a box just left.
  const el = e.target;
  if (el.classList.contains('num')) setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
});
// Draws what waited while a box was being typed in. A moment later: the tap
// that left the box (a + or a tick) lands first.
const drawSoon = () => setTimeout(() => { if (dirty && !typing()) render(); }, 350);
root.addEventListener('focusout', (e) => { if (e.target.classList.contains('num')) drawSoon(); });
root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('num')) e.target.blur();
});

await load();
act.tidy();
subscribe(render);
addEventListener('hashchange', () => {
  moves += goingBack ? -1 : 1;
  goingBack = false;
  ui.setMenu = null;
  render();
  scrollTo(0, 0);
});
render();

// The day turns over at 04:00; an app left open overnight must notice.
const refreshIfNewDay = () => {
  if (today() !== drawnDay) {
    act.tidy();
    render();
  }
};
setInterval(refreshIfNewDay, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNewDay(); });
addEventListener('online', render);
addEventListener('offline', render);
document.addEventListener('click', (e) => {
  if (ui.syncOpen && !e.target.closest('.sync, .sync-card')) setTimeout(() => { ui.syncOpen = false; render(); }, 0);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.syncOpen) { ui.syncOpen = false; render(); } });

// The published copy keeps itself on the device (sw.js), so the installed
// phone app opens instantly and offline. In src/ the version reads "dev".
function keepOnDevice() {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }, () => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    // A new version: reload to show it, but never mid-workout or mid-typing;
    // then wait until the app is out of sight.
    const busy = signInOpen() || sheetOpen() || typing() || route().name === 'workout';
    if (document.hidden || !busy) location.reload();
    else document.addEventListener('visibilitychange', () => location.reload(), { once: true });
  });
}
if (document.querySelector('meta[name=app-version]').content !== 'dev' && 'serviceWorker' in navigator) keepOnDevice();
