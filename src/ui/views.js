// The screens, as template strings, re-rendered whole on every change (the
// DOM is small; it takes a few ms). All user text goes through esc().
//   home      the next day in the rotation, a workout in progress, recent ones
//   workout   one workout: live (ticking sets, rest timer) or a past one to correct
//   history   every workout, 2022 archive included, with a filter
//   exercise  one exercise over time

import {
  best, countedSets, exerciseHistory, lastOfType, lastTime, nextType, openSession, prIndex,
  sessionList, typeOf, weekCount,
} from '../core/workout.js';
import { monthName } from '../core/dates.js';
import { BACK, CHECK, CHEVRON, MORE, clock, dayLabel, esc, kg, plural, setText, setsLine } from './html.js';

const exName = (s, id) => (s.exercises[id] ? s.exercises[id].name : id);
const typeName = (s, t) => (typeOf(s, t) ? typeOf(s, t).name : 'Workout');
const setCount = (x) => x.items.reduce((n, it) => n + countedSets(x, it).length, 0);
const exCount = (x) => x.items.filter((it) => countedSets(x, it).length || !x.open).length;

function top(sync, back = null) {
  const b = !back ? '' : back.href === 'back'
    ? `<button class="back" data-act="back">${BACK}<span>${esc(back.label)}</span></button>`
    : `<a class="back" href="${back.href}">${BACK}<span>${esc(back.label)}</span></a>`;
  return `<div class="top">${b}${sync}</div>`;
}

// ---- home ----------------------------------------------------------------

function dayCard(s, t, day, first) {
  const last = lastOfType(s, t.id);
  const when = last ? `Last time ${dayLabel(last.day, day)} · ${exCount(last)} ${plural(exCount(last), 'exercise')}` : 'Not done yet';
  if (first) {
    return `
    <section class="feature">
      <div class="eyebrow">Next up</div>
      <h1>${esc(t.name)}</h1>
      <p class="s">${when}</p>
      <button class="btn light big" data-act="start" data-type="${t.id}">Start workout</button>
    </section>`;
  }
  return `
  <button class="day-row" data-act="start" data-type="${t.id}">
    <span class="main"><span class="t">${esc(t.name)}</span><span class="s">${when}</span></span>
    <span class="go">Start ${CHEVRON}</span>
  </button>`;
}

function sessionRow(s, x, day) {
  const name = x.archive ? x.label || typeName(s, x.type) : typeName(s, x.type);
  const n = setCount(x);
  return `
  <a class="sess" href="#/w/${encodeURIComponent(x.id)}" data-search="${esc([name, ...x.items.map((it) => exName(s, it.ex))].join(' ').toLowerCase())}">
    <span class="d">${dayLabel(x.day, day)}</span>
    <span class="main"><span class="t">${esc(name)}</span><span class="s">${exCount(x)} ${plural(exCount(x), 'exercise')} · ${n} ${plural(n, 'set')}</span></span>
    ${CHEVRON}
  </a>`;
}

export function renderHome({ s, day, sync, footer }) {
  const open = openSession(s);
  const types = s.types;
  const next = nextType(s);
  const order = [...types.slice(types.findIndex((t) => t.id === next)), ...types.slice(0, types.findIndex((t) => t.id === next))];
  const week = weekCount(s, day);
  const recent = sessionList(s).filter((x) => !x.archive && !x.open).reverse().slice(0, 6);
  const feature = open
    ? `
    <section class="feature">
      <div class="eyebrow">In progress · ${open.day === day ? `started ${clock(open.startedAt)}` : dayLabel(open.day, day)}</div>
      <h1>${esc(typeName(s, open.type))}</h1>
      <p class="s">${setCount(open)} ${plural(setCount(open), 'set')} done so far</p>
      <a class="btn light big" href="#/w/${encodeURIComponent(open.id)}">Continue</a>
    </section>`
    : order.map((t, k) => dayCard(s, t, day, k === 0)).join('');
  return `
  <div class="page home">
    ${top(sync)}
    <header class="head">
      <div class="eyebrow">Gym</div>
      <p class="week">${week ? `${week} ${plural(week, 'workout')} this week` : 'No workout yet this week'}</p>
    </header>
    ${feature}
    ${recent.length ? `
    <section class="block">
      <div class="block-h"><h2>Recent</h2><a class="link" href="#/history">All workouts</a></div>
      <div class="list">${recent.map((x) => sessionRow(s, x, day)).join('')}</div>
    </section>` : `<a class="link" href="#/history">All workouts</a>`}
    <button class="btn text" data-act="log-past">Log a workout on an earlier day</button>
    ${footer}
  </div>`;
}

// ---- one workout ---------------------------------------------------------

function setRow(s, x, i, j, st, pr, ui) {
  const live = !!x.open;
  const ex = s.exercises[x.items[i].ex] || {};
  const key = `${i}:${j}`;
  const menu = ui.setMenu === key && ui.setMenuFor === x.id;
  return `
  <div class="set${live && st.done ? ' done' : ''}">
    <button class="sn" data-act="set-menu" data-i="${i}" data-j="${j}" aria-label="Set ${j + 1}${pr ? ', a PR' : ''}: note or remove">${pr ? `<span class="pr-dot">${j + 1}</span>` : j + 1}</button>
    <div class="stp">
      <button data-act="step" data-f="r" data-d="-1" data-i="${i}" data-j="${j}" aria-label="One rep less">−</button>
      <input class="num" data-f="r" data-i="${i}" data-j="${j}" inputmode="numeric" enterkeyhint="done" value="${kg(st.r)}" placeholder="reps" aria-label="Reps, set ${j + 1}">
      <button data-act="step" data-f="r" data-d="1" data-i="${i}" data-j="${j}" aria-label="One rep more">+</button>
    </div>
    <span class="x">×</span>
    <div class="stp kg">
      <button data-act="step" data-f="kg" data-d="-1" data-i="${i}" data-j="${j}" aria-label="Less weight">−</button>
      <input class="num" data-f="kg" data-i="${i}" data-j="${j}" inputmode="decimal" enterkeyhint="done" value="${kg(st.kg)}" placeholder="${ex.kind === 'assisted' ? 'help' : 'kg'}" aria-label="${ex.kind === 'assisted' ? 'Assistance kg' : 'Kg'}, set ${j + 1}">
      <button data-act="step" data-f="kg" data-d="1" data-i="${i}" data-j="${j}" aria-label="More weight">+</button>
    </div>
    ${live ? `<button class="tick" data-act="tick" data-i="${i}" data-j="${j}" aria-pressed="${!!st.done}" aria-label="Set ${j + 1} done">${CHECK}</button>` : '<span class="tick-gap"></span>'}
  </div>
  ${st.note ? `<p class="set-note">${esc(st.note)}</p>` : ''}
  ${menu ? `
  <div class="set-menu">
    <button class="chip-btn" data-act="set-note" data-i="${i}" data-j="${j}">${st.note ? 'Change note' : 'Add a note'}</button>
    <button class="chip-btn danger" data-act="set-remove" data-i="${i}" data-j="${j}">Remove set</button>
  </div>` : ''}`;
}

function itemHtml(s, x, i, day, ui) {
  const it = x.items[i];
  const e = s.exercises[it.ex] || { name: it.ex };
  const last = lastTime(s, it.ex, x.id);
  const pr = prIndex(s, x.id, i);
  return `
  <div class="item">
    <div class="item-h">
      <button class="ex-name" data-act="ex-menu" data-i="${i}">
        <span class="t">${esc(e.name)}</span>${e.setting ? `<span class="chip">${esc(e.setting)}</span>` : ''}${e.kind === 'assisted' ? '<span class="chip soft">assisted</span>' : ''}
      </button>
      <button class="icon" data-act="ex-menu" data-i="${i}" aria-label="More for ${esc(e.name)}">${MORE}</button>
    </div>
    ${last ? `<p class="last">Last · ${dayLabel(last.session.day, day)}: ${esc(setsLine(last.item.sets))}</p>` : '<p class="last">First time</p>'}
    ${e.note ? `<p class="ex-note">${esc(e.note)}</p>` : ''}
    ${it.note ? `<p class="ex-note mine">${esc(it.note)}</p>` : ''}
    ${it.sets.length ? `<div class="cols"><span>reps</span><span>${e.kind === 'assisted' ? 'help kg' : 'kg'}</span></div>` : ''}
    <div class="sets">${it.sets.map((st, j) => setRow(s, x, i, j, st, j === pr, ui)).join('')}</div>
    ${pr >= 0 ? `<p class="pr">Set ${pr + 1} is a PR: your best since September 2026</p>` : ''}
    <button class="add-set" data-act="add-set" data-i="${i}">+ Set</button>
  </div>`;
}

// Items in blocks: a superset's exercises share one card.
function blocks(x) {
  const out = [];
  x.items.forEach((it, i) => {
    const prev = out[out.length - 1];
    if (it.group && prev && prev.group === it.group) prev.idx.push(i);
    else out.push({ group: it.group || null, idx: [i] });
  });
  return out;
}

export function renderWorkout({ s, day, id, ui, sync }) {
  const x = s.sessions[id] && { id, ...s.sessions[id] };
  if (!x) {
    return `<div class="page">${top(sync, { href: '#/', label: 'Gym' })}<p class="empty">This workout isn’t here any more.</p></div>`;
  }
  const name = x.archive ? x.label || typeName(s, x.type) : typeName(s, x.type);
  const n = setCount(x);
  const when = x.open
    ? `${dayLabel(x.day, day)}${x.day === day && x.startedAt ? ` · started ${clock(x.startedAt)}` : ''}`
    : `${dayLabel(x.day, day)}${x.archive ? ' · from your Notes' : ''}`;
  return `
  <div class="page workout${x.open ? ' live' : ''}">
    ${top(sync, x.open ? { href: '#/', label: 'Gym' } : { href: 'back', label: 'Back' })}
    <header class="head">
      <div class="eyebrow">${when}</div>
      <div class="title-row"><h1>${esc(name)}</h1><button class="icon" data-act="w-menu" aria-label="Workout options">${MORE}</button></div>
    </header>
    ${x.items.length ? '' : '<p class="empty">No exercises yet. Add the first one below.</p>'}
    ${blocks(x).map((b) => `
    <section class="card ex${b.group ? ' superset' : ''}">
      ${b.group ? '<div class="eyebrow ss">Superset</div>' : ''}
      ${b.idx.map((i) => itemHtml(s, x, i, day, ui)).join('<hr>')}
    </section>`).join('')}
    <button class="btn outline" data-act="add-ex">+ Add exercise</button>
    ${x.open
    ? `<button class="btn dark big" data-act="finish">Finish workout${n ? ` · ${n} ${plural(n, 'set')}` : ''}</button>
       <p class="hint">Only ticked sets are saved.</p>`
    : '<button class="btn text danger" data-act="delete">Delete this workout</button>'}
  </div>`;
}

// ---- history ---------------------------------------------------------------

export function renderHistory({ s, day, sync }) {
  const list = sessionList(s).filter((x) => !x.open).reverse();
  const real = list.filter((x) => !x.archive);
  const old = list.filter((x) => x.archive);
  const months = (xs) => {
    const out = [];
    let cur = null;
    for (const x of xs) {
      const m = x.day.slice(0, 7);
      if (m !== cur) {
        cur = m;
        out.push(`<h3 class="month">${monthName(m)} ${m.slice(0, 4)}</h3>`);
      }
      out.push(sessionRow(s, x, day));
    }
    return out.join('');
  };
  const exs = Object.entries(s.exercises)
    .map(([id, e]) => ({ id, e, n: exerciseHistory(s, id).length }))
    .filter((r) => r.n)
    .sort((a, b) => a.e.name.localeCompare(b.e.name));
  return `
  <div class="page history">
    ${top(sync, { href: '#/', label: 'Gym' })}
    <header class="head"><div class="eyebrow">All workouts</div><h1>History</h1></header>
    <input class="search" type="search" placeholder="Find an exercise or a day" aria-label="Find an exercise" autocomplete="off">
    <section class="block ex-hits" hidden>
      <h2>Exercises</h2>
      <div class="list">${exs.map((r) => `
        <a class="sess" href="#/x/${encodeURIComponent(r.id)}" data-search="${esc(r.e.name.toLowerCase())}">
          <span class="main"><span class="t">${esc(r.e.name)}</span><span class="s">${r.n} ${plural(r.n, 'time')}</span></span>${CHEVRON}
        </a>`).join('')}</div>
    </section>
    <section class="block sessions">
      <div class="list">${months(real) || '<p class="empty">No workouts logged here yet.</p>'}</div>
    </section>
    ${old.length ? `
    <section class="block sessions archive">
      <h2>2022 · from your Notes</h2>
      <div class="list">${months(old)}</div>
    </section>` : ''}
  </div>`;
}

// ---- one exercise ----------------------------------------------------------

export function renderExercise({ s, day, exId, sync }) {
  const e = s.exercises[exId];
  if (!e) return `<div class="page">${top(sync, { href: '#/history', label: 'History' })}<p class="empty">Unknown exercise.</p></div>`;
  const rows = exerciseHistory(s, exId).filter((r) => !r.session.open);
  const now = best(s, exId);
  const then = best(s, exId, { archive: true });
  const bestLine = (b, label) => (b ? `<div class="tile"><span class="l">${label}</span><span class="v">${esc(setText(b.set))}</span><span class="l">${dayLabel(b.session.day, day)}</span></div>` : '');
  return `
  <div class="page exercise">
    ${top(sync, { href: 'back', label: 'Back' })}
    <header class="head">
      <div class="eyebrow">Exercise</div>
      <div class="title-row"><h1>${esc(e.name)}</h1><button class="icon" data-act="ex-edit" data-ex="${esc(exId)}" aria-label="Edit exercise">${MORE}</button></div>
      ${e.setting || e.kind ? `<p class="chips">${e.setting ? `<span class="chip">Setting ${esc(e.setting)}</span>` : ''}${e.kind === 'assisted' ? '<span class="chip soft">assisted: less kg is harder</span>' : ''}</p>` : ''}
      ${e.note ? `<p class="ex-note">${esc(e.note)}</p>` : ''}
    </header>
    ${now || then ? `<div class="tiles">${bestLine(now, 'Best since Sep 2026')}${bestLine(then, 'Best in 2022')}</div>` : ''}
    <section class="block">
      <div class="list">${rows.map((r) => `
        <a class="sess" href="#/w/${encodeURIComponent(r.session.id)}">
          <span class="d">${dayLabel(r.session.day, day)}</span>
          <span class="main"><span class="t">${esc(setsLine(r.item.sets))}</span>${r.item.note ? `<span class="s">${esc(r.item.note)}</span>` : ''}</span>${CHEVRON}
        </a>`).join('') || '<p class="empty">Not done yet.</p>'}</div>
    </section>
  </div>`;
}
