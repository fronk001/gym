// Calendar logic. Pure: no DOM, no storage, no clock of its own.
//
// Every day in the app is a key like '2026-09-28' naming a *logical* day: the
// day starts at 04:00 Amsterdam time, not at midnight, so reading at 00:30
// still counts for the evening before. All arithmetic on keys goes through UTC
// so the timezone of whatever device runs this never leaks in.

export const TIME_ZONE = 'Europe/Amsterdam';
export const DAY_START_HOUR = 4;

const DAY_MS = 864e5;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function parse(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const fromDate = (dt) => keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

// Wall-clock date and hour of an instant in a timezone. hourCycle h23 matters:
// some engines render midnight as "24" under hour12:false.
export function wallClock(now, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') };
}

export function logicalDay(now, timeZone = TIME_ZONE, dayStartHour = DAY_START_HOUR) {
  const c = wallClock(now, timeZone);
  const key = keyOf(c.y, c.m, c.d);
  return c.h < dayStartHour ? addDays(key, -1) : key;
}

export function addDays(key, n) {
  const dt = parse(key);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
}

export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY_MS); // b - a

// 1 = Monday … 7 = Sunday
export const weekday = (key) => ((parse(key).getUTCDay() + 6) % 7) + 1;

export const weekStart = (key) => addDays(key, 1 - weekday(key));
export const weekDays = (key) => {
  const start = weekStart(key);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
};

export function isoWeek(key) {
  const thursday = addDays(key, 4 - weekday(key));
  const year = Number(thursday.slice(0, 4));
  const week = 1 + Math.floor(diffDays(`${year}-01-01`, thursday) / 7);
  return { year, week };
}

export function weekKey(key) {
  const { year, week } = isoWeek(key);
  return `${year}-W${pad(week)}`;
}

export const monthKey = (key) => key.slice(0, 7);
export const yearKey = (key) => key.slice(0, 4);

export function daysInMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// The nth day of a month, or its last day when the month is shorter.
export function monthDay(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  return keyOf(y, m, Math.min(n, daysInMonth(mKey)));
}
export const lastDay = (mKey) => monthDay(mKey, 31);

export function addMonths(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
}

// The first Saturday of the month and the Sunday after it. When the 1st is a
// Sunday, that Sunday is not a weekend on its own: the first weekend is the
// following Saturday/Sunday.
export function firstWeekendSunday(mKey) {
  const first = `${mKey}-01`;
  const saturday = addDays(first, (6 - weekday(first) + 7) % 7);
  return addDays(saturday, 1);
}

// ---- labels ---------------------------------------------------------------

export const dayName = (n) => WEEKDAYS[n - 1]; // 1 = Monday … 7 = Sunday
export const weekdayName = (key) => dayName(weekday(key));
export const weekdayShort = (key) => weekdayName(key).slice(0, 3);
export const monthName = (mKey) => MONTHS[Number(mKey.slice(5, 7)) - 1];
const monthShort = (key) => monthName(monthKey(key)).slice(0, 3);
const dayNum = (key) => Number(key.slice(8, 10));

export const longLabel = (key) => `${weekdayName(key)}, ${dayNum(key)} ${monthName(monthKey(key))}`; // Thursday, 1 October
export const shortLabel = (key) => `${weekdayShort(key)} ${dayNum(key)} ${monthShort(key)}`; // Thu 1 Oct
export const dayMonth = (key) => `${dayNum(key)} ${monthShort(key)}`; // 1 Oct

export function weekRangeLabel(key) {
  const start = weekStart(key);
  return `${dayMonth(start)} – ${dayMonth(addDays(start, 6))}`; // 28 Sep – 4 Oct
}
