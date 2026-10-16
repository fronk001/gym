// The starting record for a device with nothing else: the three days, no
// exercises, no workouts. Offered (behind a confirm) only when nothing is
// online yet; Fred's real start is his Notes log (seed.local.js, laptop only).

import { emptyState } from '../core/workout.js';

export const buildSeed = () => emptyState();
