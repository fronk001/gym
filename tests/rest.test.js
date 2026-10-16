// The rest timer: worked out from its end moment, so a locked phone comes
// back to the right time.

import { test, eq, ok } from './harness.js';
import { LINGER, adjust, left, progress, startRest, visible } from '../src/core/rest.js';

const T = 1_000_000;

test('a 90 s rest: counts down from its end, whatever happened meanwhile', () => {
  const t = startRest(T, 90, 'w');
  eq(left(t, T), 90);
  eq(left(t, T + 60_000), 30, 'a minute later, even if the page slept through it');
  eq(left(t, T + 100_000), -10);
  eq(progress(t, T + 45_000), 0.5);
});

test('+15 and −15; never into the past; once over, +15 is 15 from now', () => {
  const t = startRest(T, 90, 'w');
  eq(left(adjust(t, T, 15), T), 105);
  eq(left(adjust(t, T + 80_000, -15), T + 80_000), 0);
  eq(left(adjust(t, T + 120_000, 15), T + 120_000), 15);
});

test('a finished rest stays on screen for a while, then goes', () => {
  const t = startRest(T, 60, 'w');
  ok(visible(t, T + 60_000 + (LINGER - 1) * 1000));
  ok(!visible(t, T + 60_000 + (LINGER + 1) * 1000));
  ok(!visible(null, T));
});
