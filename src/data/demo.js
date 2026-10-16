// Made-up workouts for ?demo (screenshots, the smoke test): three weeks of
// the rotation ending the day before `today`. Never Fred's real numbers.

import { addDays } from '../core/dates.js';
import { emptyState } from '../core/workout.js';

const PLAN = {
  legs: [['squats', 'Squats', [[10, 40], [10, 50], [8, 60]]], ['hamstring', 'Prone Hamstring Curl', [[12, 36], [10, 38], [8, 41]]],
    ['legpress', 'Leg Press', [[12, 59], [10, 86], [12, 93]]], ['abs', 'Abs', [[20], [15], [12]]]],
  push: [['incline', 'Incline DB Chest Press', [[15, 18], [12, 20], [10, 22]]], ['flat-fly', 'Chest Flat Fly’s', [[10, 11.3], [8, 13.5], [8, 13.5]]],
    ['bent-fly', 'Bent-over Fly’s', [[10, 6], [8, 9], [8, 9]]], ['military', 'Military Press', [[10, 20], [8, 25], [6, 25]]],
    ['facepull', 'Cable Face Pulls', [[12, 20], [12, 22], [10, 24]]]],
  pull: [['assisted', 'Assisted Pull-ups', [[12, 32], [10, 27], [8, 23]]], ['vbar', 'Cable Rows (V-bar)', [[12, 32], [12, 45], [10, 52]]],
    ['curls', 'DB Bicep Curls', [[10, 10], [8, 12], [8, 12]]], ['shrugs', 'DB Shrugs', [[10, 20], [12, 20], [12, 22]]]],
};

export function buildDemo(today) {
  const s = emptyState();
  const order = ['legs', 'push', 'pull'];
  let k = 0;
  for (let d = -20; d < 0; d += 2) {
    const day = addDays(today, d);
    const type = order[k % 3];
    const round = Math.floor(k / 3);
    k++;
    const items = PLAN[type].map(([id, name, sets]) => {
      s.exercises[id] = { name, ...(id === 'assisted' ? { kind: 'assisted' } : {}) };
      // A little progress each round: one more rep on the last set.
      return { ex: id, sets: sets.map(([r, kg], j) => ({ r: j === sets.length - 1 ? r + round : r, ...(kg !== undefined ? { kg } : {}) })) };
    });
    if (type === 'push') { items[1].group = 'g1'; items[2].group = 'g1'; }
    s.sessions[`${day}~demo${k}`] = { day, type, items, startedAt: Date.parse(`${day}T17:00:00Z`), doneAt: Date.parse(`${day}T18:05:00Z`) };
    s.history[day] = { added: 0 };
  }
  s.exercises.hamstring.setting = '5:3';
  return s;
}
