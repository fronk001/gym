// Cards that slide over the screen: an exercise's options, adding an
// exercise, a workout's options, logging an earlier day. They live outside
// #app, like the sign-in form: the views are re-rendered whole on every
// change, which would wipe anything half-typed here.

import { REST_CHOICES, DEFAULT_REST, lastOfType, sessionList, typeOf } from '../core/workout.js';
import { addDays } from '../core/dates.js';
import { act, get, today } from '../data/store.js';
import { esc } from './html.js';

let box = null;
let onClick = null;

function close() {
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
  onClick = null;
  document.body.classList.remove('sheet-open');
}

function open(html, handler, { focus = null } = {}) {
  if (!box) {
    box = document.createElement('div');
    box.className = 'sheet';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.addEventListener('click', (e) => {
      if (e.target === box) return close();
      const el = e.target.closest('[data-s]');
      if (!el) return;
      if (el.dataset.s === 'close') return close();
      if (onClick) onClick(el.dataset.s, el, box);
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(box);
  }
  box.innerHTML = `<div class="sheet-card">${html}</div>`;
  box.hidden = false;
  onClick = handler;
  document.body.classList.add('sheet-open');
  const f = focus && box.querySelector(focus);
  if (f) f.focus();
}

export const sheetOpen = () => !!box && !box.hidden;
export const closeSheet = close;

const field = (box, name) => box.querySelector(`[name="${name}"]`);

// ---- an exercise -----------------------------------------------------------

// From a workout (sid + item index): also its place in that workout.
// From the exercise screen (sid null): just the exercise itself.
export function exerciseMenu(exId, sid = null, i = null, { onHistory } = {}) {
  const s = get();
  const e = s.exercises[exId];
  if (!e) return;
  const x = sid ? s.sessions[sid] : null;
  const it = x ? x.items[i] : null;
  const rest = e.rest || DEFAULT_REST;
  const inWorkout = x ? `
    <div class="sheet-row">
      <button class="chip-btn" data-s="up">Move up</button>
      <button class="chip-btn" data-s="down">Move down</button>
      ${it.group ? '<button class="chip-btn" data-s="ss">Leave superset</button>'
    : i < x.items.length - 1 ? '<button class="chip-btn" data-s="ss">Superset with next</button>' : ''}
    </div>
    <label>Note for this workout<input name="itemNote" value="${esc(it.note || '')}" placeholder="e.g. 2× warmup, felt strong"></label>` : '';
  open(`
    <h1>${esc(e.name)}</h1>
    ${inWorkout}
    <label>Name<input name="name" value="${esc(e.name)}" autocomplete="off"></label>
    <label>Machine setting <span class="hint">remembered for next time</span><input name="setting" value="${esc(e.setting || '')}" placeholder="e.g. 5:3"></label>
    <label>Standing note <span class="hint">shows every time</span><input name="note" value="${esc(e.note || '')}" placeholder="e.g. next time try cables"></label>
    <label>Rest after a set
      <select name="rest">${REST_CHOICES.map((r) => `<option value="${r}"${r === rest ? ' selected' : ''}>${r < 60 ? `${r} s` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} min`}</option>`).join('')}</select>
    </label>
    <label class="check"><input type="checkbox" name="assisted"${e.kind === 'assisted' ? ' checked' : ''}> Assisted: the kg helps, so less is harder</label>
    <div class="sheet-actions">
      <button class="btn dark" data-s="save">Save</button>
      <button class="btn text" data-s="close">Cancel</button>
    </div>
    <div class="sheet-row end">
      ${onHistory ? '<button class="chip-btn" data-s="history">History of this exercise</button>' : ''}
      ${x ? '<button class="chip-btn danger" data-s="remove">Remove from this workout</button>' : ''}
    </div>`, (what, el, b) => {
    if (what === 'up' || what === 'down') {
      act.moveItem(sid, i, what === 'up' ? -1 : 1);
      return close();
    }
    if (what === 'ss') {
      act.toggleSuperset(sid, i);
      return close();
    }
    if (what === 'history') {
      close();
      return onHistory();
    }
    if (what === 'remove') {
      act.removeItem(sid, i);
      return close();
    }
    if (what === 'save') {
      act.updateExercise(exId, {
        name: field(b, 'name').value,
        setting: field(b, 'setting').value,
        note: field(b, 'note').value,
        rest: Number(field(b, 'rest').value) === DEFAULT_REST ? null : Number(field(b, 'rest').value),
        kind: field(b, 'assisted').checked ? 'assisted' : null,
      });
      if (x) act.setNote(sid, i, null, field(b, 'itemNote').value);
      close();
    }
  });
}

// ---- adding an exercise ------------------------------------------------------

export function addExercise(sid) {
  const s = get();
  const x = s.sessions[sid];
  if (!x) return;
  const inIt = new Set(x.items.map((it) => it.ex));
  // This day's own exercises first (any earlier workout of its type), then the rest.
  const mine = new Set();
  for (const y of sessionList(s)) if (y.type === x.type && !y.archive) y.items.forEach((it) => mine.add(it.ex));
  const all = Object.entries(s.exercises).filter(([id]) => !inIt.has(id)).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const row = ([id, e]) => `<button class="pick" data-s="pick" data-ex="${esc(id)}" data-name="${esc(e.name.toLowerCase())}">${esc(e.name)}</button>`;
  const day = all.filter(([id]) => mine.has(id));
  const rest = all.filter(([id]) => !mine.has(id));
  open(`
    <h1>Add exercise</h1>
    <input class="search" name="q" type="search" placeholder="Search, or type a new name" autocomplete="off" autocapitalize="sentences">
    <button class="btn dark" data-s="new" hidden></button>
    ${day.length ? `<h2>${esc((typeOf(s, x.type) || { name: 'This day' }).name)}</h2><div class="picks">${day.map(row).join('')}</div>` : ''}
    ${rest.length ? `<h2>All exercises</h2><div class="picks">${rest.map(row).join('')}</div>` : ''}
    <div class="sheet-actions"><button class="btn text" data-s="close">Cancel</button></div>`, (what, el, b) => {
    if (what === 'pick') {
      act.addItem(sid, el.dataset.ex);
      close();
    } else if (what === 'new') {
      act.addNewItem(sid, field(b, 'q').value);
      close();
    }
  }, { focus: null });
  const q = field(box, 'q');
  const add = box.querySelector('[data-s=new]');
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    let exact = false;
    box.querySelectorAll('.pick').forEach((p) => {
      p.hidden = !!t && !p.dataset.name.includes(t);
      if (p.dataset.name === t) exact = true;
    });
    box.querySelectorAll('.sheet-card h2').forEach((h) => {
      const list = h.nextElementSibling;
      h.hidden = !list.querySelector('.pick:not([hidden])');
    });
    add.hidden = !t || exact;
    add.textContent = `Add “${q.value.trim()}” as a new exercise`;
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !add.hidden) {
      act.addNewItem(sid, q.value);
      close();
    }
  });
}

// ---- a workout ---------------------------------------------------------------

export function workoutMenu(sid, { onDelete }) {
  const s = get();
  const x = s.sessions[sid];
  if (!x) return;
  open(`
    <h1>This workout</h1>
    <label>Day
      <select name="type">${s.types.map((t) => `<option value="${t.id}"${t.id === x.type ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
      ${x.type ? '' : '<option value="" selected>None (from your Notes)</option>'}</select>
    </label>
    <label>Date<input type="date" name="day" value="${x.day}" max="${today()}"></label>
    <div class="sheet-actions">
      <button class="btn dark" data-s="save">Save</button>
      <button class="btn text" data-s="close">Cancel</button>
    </div>
    <div class="sheet-row end">
      <button class="chip-btn danger" data-s="delete">${x.open ? 'Discard this workout' : 'Delete this workout'}</button>
    </div>`, (what, el, b) => {
    if (what === 'save') {
      const type = field(b, 'type').value;
      const day = field(b, 'day').value;
      if (type && type !== x.type) act.setType(sid, type);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day !== x.day) act.moveSession(sid, day);
      close();
    } else if (what === 'delete') {
      close();
      onDelete();
    }
  });
}

// ---- logging an earlier day ----------------------------------------------------

export function logPast({ onStart }) {
  const s = get();
  const t = today();
  open(`
    <h1>Log an earlier day</h1>
    <p class="lead">For a workout you didn’t log at the gym. It starts from that day’s last workout, like any other.</p>
    <label>Date<input type="date" name="day" value="${addDays(t, -1)}" max="${t}"></label>
    <label>Day
      <select name="type">${s.types.map((ty) => `<option value="${ty.id}">${esc(ty.name)}${lastOfType(s, ty.id) ? '' : ' (new)'}</option>`).join('')}</select>
    </label>
    <div class="sheet-actions">
      <button class="btn dark" data-s="go">Start</button>
      <button class="btn text" data-s="close">Cancel</button>
    </div>`, (what, el, b) => {
    if (what !== 'go') return;
    const day = field(b, 'day').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > t) return;
    close();
    onStart(field(b, 'type').value, day);
  });
}

// A short text: a set's note.
export function askNote(title, value, onSave) {
  open(`
    <h1>${esc(title)}</h1>
    <input name="t" value="${esc(value || '')}" placeholder="e.g. + dropdown, 4 × 10 to finish" autocomplete="off">
    <div class="sheet-actions">
      <button class="btn dark" data-s="save">Save</button>
      <button class="btn text" data-s="close">Cancel</button>
    </div>`, (what, el, b) => {
    if (what !== 'save') return;
    onSave(field(b, 't').value);
    close();
  }, { focus: '[name=t]' });
  field(box, 't').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      onSave(e.target.value);
      close();
    }
  });
}
