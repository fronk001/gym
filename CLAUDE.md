# Gym

Fred's workout log, replacing his Apple Notes "Gym Progress Tracker". Phone
first (he only logs on the phone, at the gym); the laptop runs the same app.
Connected to Life Hub (`../life-hub`): starting a workout ticks Life Hub's **Gym**
habit (4× a week, a week goal, so it counts for Luna's jar).

Single user, non-technical: explain things plainly, in prose.
It must be **fast** (no loading screens) and **agile** (change anything mid-workout).

## Status (16 Oct 2026)

Built in one go at Fred's request (spec agreed 16 Oct):
- ✅ Logic + tests, the screens, sync, offline copy, Life Hub link (Life Hub
  migrate step 6, `data/links.js`), the Notes import.
- ⏳ Fred: check `import/review.html`, paste the rules, sign in on the laptop
  ("Start with my Notes log"), create the GitHub repo, install on the iPhone
  (SETUP.md). Not yet tried on a real iPhone: rest-timer beep, Wake Lock,
  the number pad's comma.

## The training

Three days in rotation: **Legs & Abs** → **Chest, Shoulders & Triceps** →
**Back & Biceps** (`types`, ids `legs push pull`). Home suggests the day after
the last real workout's; the others are one tap away.

**Planned days (27 Oct 2026).** A day may carry `plan: { since, items: [{ ex,
sets, group?, isNew?, note? }] }` (`pendingPlan`). Until a workout laid out
from it is finished (the session's `fromPlan` = the plan's `since`; a workout
done in an older copy of the app that never saw the plan doesn't count),
starting that day lays out the plan instead of copying the last workout:
numbers from each exercise's last time (its last n
sets, or the last one repeated; none = empty sets), `isNew` items wear a green
"New" chip, the note is the item's own. Home shows "New plan · n new
exercises". The finished workout is then "last time" as always, so the next one
copies it without the marks. Plans reach Fred's live log through
`core/migrate.js` (Life Hub's pattern: pure, idempotent, bump VERSION; only a
log that has `incline-db-chest-press`, so not the demo or an empty log).
Step 2 = the **efficient plan** from Fred's routine review (Life Hub's memory,
"Gym Routine Upgrade" report): standing calf raises and Romanian deadlifts are
new exercises; lateral raises use the existing `db-side-delt-raises`, whose old
standing note from Notes still shows.

## Run

No Node on this machine. Python 3.14 (`py`) + the browser do everything.

```
Start Gym.bat                              # double-click: serves + opens the app (:8530)
py tools/serve.py                          # http://localhost:8530/src/
py tools/run_tests.py                      # logic tests (headless Edge), exit 0 = pass
py tools/run_tests.py tools/smoke.html     # UI smoke test: a workout on demo data, then two synced frames
py tools/run_tests.py tools/firebase-check.html  # real Firebase SDK from the CDN (needs internet, no account)
py tools/build.py                          # dist/ = what GitHub Pages publishes (CI runs this too)
py tools/run_tests.py tools/sw-check.html  # after build.py: offline copy installs, app opens offline
py tools/import_notes.py                   # import/notes.txt -> src/data/seed.local.js + import/review.html
py tools/icons.py                          # OLD green icon: don't run, it would overwrite the ruby one (see below)
py tools/shot.py "?demo" "#/history"       # screenshots/desktop.png + phone.png
```

URL switches (dev), none touches the real, synced log: `?local` a copy on
this device only (`gym:dev`), from the Notes import on the laptop ·
`?today=YYYY-MM-DD` pretend date (on the `?local` copy) · `?demo` made-up
workouts (`gym:demo`) · `?fake-sync=laptop|phone` pretend server in
localStorage (`phone` has no Notes import, like the hosted app) · `?reset`
forget this copy and its unsent changes.

Run both test commands after any change to `src/`; the Firebase check too
after touching `firebase.js`; build + sw-check after touching `sw.js`,
`index.html`, `build.py` or adding files. A new module also goes into
index.html's `modulepreload` list.

**Publishing = `git push` to `main`** (repo `fronk001/gym`, git identity `Fred`
+ his relay email, like Life Hub). The workflow builds and deploys to
https://fronk001.github.io/gym/. Pushing publishes publicly: ask Fred first,
and run all the tests first.

## Layout

```
src/core/   workout.js (the log: rotation, last time, start/finish, plans, PRs, weight steps, supersets)
            migrate.js (brings older logs up to date, e.g. a new plan) ·
            rest.js (rest timer maths) · sync.js (online layout) · dates.js (Life Hub's copy)
src/data/   store.js (URL switches, backend, actions API) · engine.js (Life Hub's, unchanged
            but for the header) · firebase.js · firebase-config.js (Life Hub's project) ·
            fake-backend.js · seed.example.js (empty log) · demo.js · seed.local.js (git-ignored!)
src/ui/     app.js (boot, routes, clicks, typing) · views.js (home, workout, history, exercise) ·
            sheets.js (exercise options, add exercise, workout options, earlier day, set note) ·
            rest.js (timer bar, beep, Wake Lock) · account.js (Life Hub's, reworded) · html.js
import/     notes.txt (Fred's Notes log as pasted, 16 Oct) + review.html: git-ignored
tools/      as Life Hub's, plus import_notes.py
```

The home-screen icon (ruby dumbbell, "Jewel" family shared with Life Hub,
Mongolian and Portfolio) is generated in the Life Hub repo, `tools/jewel-icons/`;
`src/icons/` holds the finished PNGs. A phone keeps the old icon until the
home-screen shortcut is removed and added again.

Views are template strings re-rendered whole on every change. All user text
goes through `esc()`. State changes only via `core/workout.js` → `store.act.*`.
Screens by hash: `#/` home, `#/w/<session id>`, `#/history`, `#/x/<exercise id>`.

## Data model (localStorage `gym:v1`)

`{ version, types, exercises, sessions, history }`, documented at the top of
`core/workout.js`. Key points:
- A session id is `${day}~${random}`; its first 4 characters are its year.
- `open: true` = in progress: only sets with `done` count. Finishing drops
  unticked sets, done flags and empty items; nothing ticked = no workout.
  An open workout from an earlier day is finished as it stood (`closeStale`).
- `archive: true` = the 2022 Notes log: browsable, its own "best in 2022",
  never "last time" while a real one exists, never in the rotation or PRs.
- Starting a day copies the last real workout of that type: exercises,
  order, supersets, set values (not notes). An item with no sets gets one empty set to tick.
- Exercise: `setting` (machine setting, shown as a chip), `note` (standing),
  `rest` (seconds, default 90), `kind: 'assisted'` (less kg is harder: PRs invert).
- PR = a set whose Epley score (kg × (1 + reps/30)) beats every earlier real
  workout of that exercise; never on the first time. No-kg sets score by reps, below any weighted set.
- `history[day]` is what Life Hub reads, written the moment a workout is
  **started** (Fred, 16 Oct: pressing Start = went). Finishing with nothing
  ticked keeps the day; only deleting/discarding the day's last workout takes
  it out (Life Hub's tick then stays until unticked there). `{ firstAt, lastAt }` when live; `{ added }` for a workout logged afterwards ("Log an earlier day",
  `late: true`) or moved to another date, so Life Hub counts the date itself.

Online, `users/{uid}/gym/`: `main` (types, exercises) · `log-YYYY`
(`sessions`: each workout one **JSON string**, written whole) · `YYYY`
(`history` only). Strings cost one index entry each: maps of sets would near
Firestore's 40k entries per document within a year. Life Hub listens to
`YYYY` only.

## Sync

Life Hub's engine and rules (its CLAUDE.md "Sync"), same Firebase project
(`life-hub-fred`) and account, Firebase app named `'gym'` so its sign-in never
tangles with Life Hub's or Mongolian's on fronk001.github.io. The rules for
`users/{uid}/gym/` live in **`../life-hub/firestore.rules`** (one file for all
three apps; Fred pastes all of it). First sign-in with nothing online: the
laptop offers "Start with my Notes log" (seed.local.js); the phone says sign in
on the laptop first, with "Start an empty log" behind a confirm.

## Rules that matter

- Day = Life Hub's: starts 04:00 Amsterdam (`core/dates.js`, copied).
- **Typing**: the view isn't redrawn while a reps/kg box has focus (it would
  take the box and the keyboard away); it redraws on leaving the box, or
  350 ms after a change (`drawSoon`). A tap on any button blurs the box first.
  Tapping a box selects its number. Commas are read as points (Dutch number pad).
- **+/− on kg** jumps to the next weight this exercise has been done with
  (cable stacks: 11.3 → 13.5 → 15.8), then by the last gap, 2.5 at first.
- **Rest timer** (`ui/rest.js`): starts when a set is ticked, once the whole
  superset round is ticked; the longest rest of the group. Kept as an end
  moment in `gym:rest` (iPhone pages stop their clock when locked). Beeps
  once if it ends in view (sound unlocked by the first tap, "ambient": mixes
  with music, silent on mute); the bar turns green and flashes. Only for
  today's live workouts. Wake Lock while a live workout is on screen.
- New service-worker versions never reload mid-workout or mid-typing.
- `sw.js` caches as `gym-<version>` and refills itself on a miss: Mongolian's
  sw.js deletes every other cache on the origin when it updates (fix offered
  as a separate task, 16 Oct).
- `seed.local.js` and `import/` hold Fred's log: **never commit them**.

## The Notes import

`tools/import_notes.py` reads `import/notes.txt` (Fred's paste, one deliberate
change: 26 Oct 2022 "10x" / "55" on two lines joined to "10x 55"). Fred said
"12x 5" means 12 reps × 5 kg: numbers are taken as written. Names that are
the same exercise are merged by `ALIASES`; supersets in a name ("A + B",
"Superset: A & B") are split into two grouped exercises when their sets split
the same way. Unreadable sets become notes; everything the importer had to
guess is listed in amber in `import/review.html`. Re-running gives the same ids.
