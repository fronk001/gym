// Small helpers shared by the views.

import { shortLabel } from '../core/dates.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

export const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
export const MORE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
export const CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

// 11.3, 20, 7.5: as Fred writes them, with a point.
export const kg = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');

// "12 × 20", "12 reps", "12 × 20 + dropdown".
export function setText(st) {
  let t = '';
  if (Number.isFinite(st.r)) t = Number.isFinite(st.kg) ? `${kg(st.r)} × ${kg(st.kg)}` : `${kg(st.r)} reps`;
  else if (Number.isFinite(st.kg)) t = `${kg(st.kg)} kg`;
  if (st.note) t += `${t ? ' ' : ''}${st.note}`;
  return t || '—';
}

export const setsLine = (sets) => (sets.length ? sets.map(setText).join(' · ') : 'no sets');

// "Mon 12 Oct", or "Mon 12 Oct 2022" when not this year.
export function dayLabel(day, today) {
  return day.slice(0, 4) === today.slice(0, 4) ? shortLabel(day) : `${shortLabel(day)} ${day.slice(0, 4)}`;
}

export function clock(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
}

// "1:05", "0:09", "-0:12" style countdowns.
export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Reads 11,3 as well as 11.3: a Dutch iPhone's number pad types a comma.
export function readNumber(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}
