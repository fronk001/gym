"""
Turns Fred's Apple Notes gym log into the app's starting record.

    py tools/import_notes.py       # import/notes.txt -> src/data/seed.local.js + import/review.html

Both outputs are git-ignored (the repo is public). seed.local.js is the
laptop's starting set: the first sign-in on the laptop offers to upload it
("Start with my Notes log"), and the phone then gets it from the database.
review.html shows every workout as imported beside the lines it came from,
with anything the importer had to guess marked, for Fred to check first.

The Notes log is two eras: 2022 (kept as an archive: browsable, not used for
"last time") and 14 Sep 2026 on (the real history). Names that mean the same
exercise are merged by ALIASES below; everything else keeps Fred's own name.
Standard library only. Re-running gives the same ids, so it can be redone.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTES = ROOT / "import" / "notes.txt"
SEED = ROOT / "src" / "data" / "seed.local.js"
REVIEW = ROOT / "import" / "review.html"

# lower-cased name as written -> the one exercise it means (display name).
ALIASES = {
    "incline chest db press": "Incline DB Chest Press",
    "incline db chest press": "Incline DB Chest Press",
    "chest db fly’s": "DB Chest Fly’s",
    "dumbel fly’s incl superset": "Incline DB Fly’s",
    "chest flat fly’s": "Chest Flat Fly’s",
    "bent fly’s": "Bent-over Fly’s",
    "shoulder db press": "DB Shoulder Press",
    "db shoulder press": "DB Shoulder Press",
    "shoulder military press": "Military Press",
    "military press": "Military Press",
    "bb shoulder press": "Military Press",
    "shoulder bb press": "Military Press",
    "or bb press": "Military Press",
    "shoulder side delt db raises": "DB Side Delt Raises",
    "db side delt raises": "DB Side Delt Raises",
    "cable face pulls": "Cable Face Pulls",
    "face pulls": "Cable Face Pulls",
    "robe cable pulls triceps": "Rope Cable Pulls (Triceps)",
    "cable tricep pulldown": "Cable Tricep Pulldown",
    "triceps over arm extension": "Triceps Overhead Extension",
    "tricep db overhead extension": "Triceps Overhead Extension",
    "tricep overhead db extension": "Triceps Overhead Extension",
    "db overhead tricepe extension": "Triceps Overhead Extension",
    "assisted pullups": "Assisted Pull-ups",
    "pullups": "Pull-ups",
    "cable rows (v-bar)": "Cable Rows (V-bar)",
    "seated rows": "Seated Rows",
    "t-bar rows": "T-bar Rows",
    "db bicep curls": "DB Bicep Curls",
    "bicep curls": "DB Bicep Curls",
    "barbell bicep curls bend": "Barbell Bicep Curls (bent)",
    "db shrugs": "DB Shrugs",
    "shrugs": "DB Shrugs",
    "squats": "Squats",
    "pause squats": "Pause Squats",
    "pause-squats": "Pause Squats",
    "kuiten aan leg press": "Calves on Leg Press",
    "prone hamstring curl": "Prone Hamstring Curl",
    "leg extension curl": "Leg Extension",
    "leg extension": "Leg Extension",
    "leg press intermezzo": "Leg Press",
    "seated calf machine": "Seated Calf Machine",
    "abssssss": "Abs",
    "abs (short pause only)": "Abs",
    "abs bench": "Abs",
    "bench": "Bench Press",
    "bent-over bb rows": "Bent-over BB Rows",
    "bb rows": "Bent-over BB Rows",
    "barbell rows": "Bent-over BB Rows",
    "dips": "Dips",
    "20kg bicep curl": "20 kg Plate Bicep Curls",
    "20kg plate bicep curls": "20 kg Plate Bicep Curls",
    "butterfly rear delts": "Butterfly Rear Delts",
    "db bent-over rear delta": "DB Bent-over Rear Delts",
    "pushups": "Push-ups",
}
ASSISTED = {"Assisted Pull-ups"}

DATE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$")
SET_X = re.compile(r"^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)?(.*)$", re.I)
SET_PLAIN = re.compile(r"^(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?$")
SETTING = re.compile(r"^\[settings?:\s*(.+?)\]$", re.I)


def num(s):
    if s is None:
        return None
    v = float(s.replace(",", "."))
    return int(v) if v.is_integer() else v


def is_set(line):
    line = line.replace("“", "").replace('"', "")
    return bool(SET_X.match(line) or SET_PLAIN.match(line)) or "warmup" in line.lower()


def parse_set(text):
    """'4 x 14 + 4 x 10 + finish' -> {r: 4, kg: 14, note: '+ 4 x 10 + finish'}; None if not a set."""
    t = text.replace("“", "").replace('"', "").strip()
    m = SET_PLAIN.match(t)
    if m:
        out = {"r": num(m.group(1))}
        if m.group(2):
            out["kg"] = num(m.group(2))
        return out
    m = SET_X.match(t)
    if not m:
        return None
    out = {"r": num(m.group(1))}
    if m.group(2):
        out["kg"] = num(m.group(2))
    rest = m.group(3).strip()
    if rest:
        out["note"] = rest
    return out


def day_of(line):
    m = DATE.match(line)
    if not m:
        return None
    d, mo, y = m.groups()
    y = int(y) + (2000 if len(y) == 2 else 0)
    return f"{y:04d}-{int(mo):02d}-{int(d):02d}"


def type_of(label, era2026):
    low = label.lower()
    if "leg" in low:
        return "legs"
    if low.startswith("back-arms") or low.startswith("back-biceps") or (era2026 and "back" in low):
        return "pull"
    if era2026 or low.startswith("chest-shoulder"):
        return "push"
    return None


def canonical(name):
    clean = re.sub(r"\s+", " ", name.strip().rstrip(":").strip()).replace("'", "’")
    return ALIASES.get(clean.lower(), clean[:1].upper() + clean[1:])


def split_names(name):
    """A superset's exercise names, or None: 'Superset Dips + 20kg Bicep Curl'."""
    low = name.lower()
    body = re.sub(r"^superset:?\s*", "", name, flags=re.I)
    body = re.sub(r"\s*superset$", "", body, flags=re.I).strip()
    for sep in (" + ", " & "):
        if sep in body and ("superset" in low or sep == " + "):
            parts = [p.strip() for p in body.split(sep)]
            if len(parts) == 2 and all(parts):
                return parts
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    lines = [l.strip() for l in NOTES.read_text(encoding="utf-8").splitlines()]
    raw = [l for l in lines if l]
    sessions = []      # {day, label, archive, items: [{names, sets: [[...]], notes}], src: [lines]}
    flags = []         # (session index or None, message)
    era2026 = False
    cur = None
    item = None
    loose_notes = []

    def nxt(i):
        return raw[i + 1] if i + 1 < len(raw) else ""

    def new_session(day, label):
        nonlocal cur, item
        cur = {"day": day, "label": label, "archive": not era2026, "items": [], "src": []}
        sessions.append(cur)
        item = None

    i = 0
    while i < len(raw):
        line = raw[i]
        low = line.lower()
        if low.startswith("aaaaaaaa"):
            era2026 = True
            cur = None
            i += 1
            continue
        day = day_of(line)
        if day or line.startswith(".. "):
            label = ""
            if day is None:
                day = "2022-09-01"
                label = "September 2022 (no exact date)"
                flags.append((len(sessions), "No date in Notes (“.. September 2022”): filed under 1 Sep 2022."))
            new_session(day, label)
            cur["src"].append(line)
            # The heading is the next line, unless that is already an exercise.
            h = nxt(i)
            if h and not is_set(h) and not is_set(nxt(i + 1)) and not SETTING.match(nxt(i + 1)):
                cur["label"] = cur["label"] or h.rstrip(": ").strip()
                cur["src"].append(h)
                i += 1
            i += 1
            continue
        if cur is None:
            loose_notes.append(line)
            i += 1
            continue
        if low == "legday":
            new_session(cur["day"], "Legday")
            cur["src"].append(line)
            flags.append((len(sessions) - 1, "A second workout in “.. September 2022” (“Legday”): same undated day."))
            i += 1
            continue
        cur["src"].append(line)
        m = SETTING.match(line)
        if m and item:
            item["setting"] = m.group(1).strip()
            i += 1
            continue
        if item and not item["sets"] and low.startswith("superset"):
            item["notes"].append(line)
            i += 1
            continue
        if item and "warmup" in low:
            item["notes"].append(line.replace("x warmup", "× warmup"))
            i += 1
            continue
        if item and is_set(line):
            parts = [p.strip() for p in line.split(" + ")] if len(item["names"]) == 2 else [line]
            if len(item["names"]) == 2 and len(parts) != 2:
                if " & " in line and len(line.split(" & ")) == 2:
                    parts = [p.strip() for p in line.split(" & ")]
                else:
                    parts = [line, None]
            parsed = []
            for p in parts:
                if p is None:
                    parsed.append(None)
                    continue
                st = parse_set(p)
                if st is None:
                    st = {"note": p}
                    flags.append((len(sessions) - 1, f"Couldn’t read “{p}” as reps × kg: kept as a note."))
                parsed.append(st)
            item["sets"].append(parsed)
            i += 1
            continue
        # A text line: an exercise if it ends in ':' or sets follow, or a short
        # one that ends a workout ("Shrugs", "Abssssss"); anything else is a note.
        follows = is_set(nxt(i)) or bool(SETTING.match(nxt(i))) or nxt(i).lower().startswith("supersets with")
        last = not nxt(i) or bool(day_of(nxt(i))) or nxt(i).lower().startswith("aaaa")
        if line.endswith(":") or follows or (len(line) <= 25 and last):
            names = split_names(line.rstrip(":").strip())
            item = {"names": names or [line.rstrip(": ").strip()], "sets": [], "notes": []}
            cur["items"].append(item)
        elif item:
            item["notes"].append(line)
        i += 1

    # ---- build the record --------------------------------------------------
    exercises = {}
    by_name = {}

    def ex_id(name):
        disp = canonical(name)
        if disp in by_name:
            return by_name[disp]
        base = re.sub(r"[^a-z0-9]+", "-", disp.lower()).strip("-")
        eid = base
        n = 2
        while eid in exercises:
            eid = f"{base}-{n}"
            n += 1
        exercises[eid] = {"name": disp}
        if disp in ASSISTED:
            exercises[eid]["kind"] = "assisted"
        by_name[disp] = eid
        return eid

    out_sessions = {}
    counter = {}
    sorted_sessions = sorted(enumerate(sessions), key=lambda p: (p[1]["day"], p[0]))
    for idx, s in sorted_sessions:
        n = counter.get(s["day"], 0)
        counter[s["day"]] = n + 1
        sid = f"{s['day']}~notes{n}"
        s["id"] = sid
        items = []
        for it in s["items"]:
            group = f"g{len(items)}{sid[-6:]}" if len(it["names"]) == 2 else None
            for k, name in enumerate(it["names"]):
                eid = ex_id(name)
                sets = []
                for row in it["sets"]:
                    st = row[k] if k < len(row) else None
                    if st:
                        sets.append(st)
                entry = {"ex": eid, "sets": sets}
                if group:
                    entry["group"] = group
                notes = [x for x in it["notes"] if not x.lower().startswith("next time")]
                if k == 0 and notes:
                    entry["note"] = " · ".join(notes)
                if it.get("setting"):
                    exercises[eid]["setting"] = it["setting"]
                for x in it["notes"]:
                    if x.lower().startswith("next time"):
                        exercises[eid]["note"] = x
                if not sets and not entry.get("note"):
                    entry["note"] = "No sets written down"
                items.append(entry)
        rec = {"day": s["day"], "type": type_of(s["label"], not s["archive"]), "items": items}
        if s["label"]:
            rec["label"] = s["label"]
        if s["archive"]:
            rec["archive"] = True
        out_sessions[sid] = rec

    if loose_notes:
        hs = [x for x in loose_notes if x.lower().startswith("hamstring lying")]
        if hs and "Prone Hamstring Curl" in by_name:
            e = exercises[by_name["Prone Hamstring Curl"]]
            e["note"] = (e.get("note", "") + " · " if e.get("note") else "") + "Lying machine: laag, -1, 1"
            flags.append((None, "“Hamstring lying: laag,-1,1” (top of the note) became a note on Prone Hamstring Curl."))
    flags.append((None, "26 Oct 2022, Bent-over BB rows: “10x” and “55” were on two lines; read as 10 × 55."))

    record = {
        "version": 1,
        "types": [
            {"id": "legs", "name": "Legs & Abs", "short": "Legs"},
            {"id": "push", "name": "Chest, Shoulders & Triceps", "short": "Chest · Shoulders"},
            {"id": "pull", "name": "Back & Biceps", "short": "Back · Biceps"},
        ],
        "exercises": exercises,
        "sessions": out_sessions,
        "history": {},
    }
    js = (
        "// Fred's Apple Notes gym log, as the laptop's starting record.\n"
        "// Made by tools/import_notes.py from import/notes.txt: edit those, not this.\n"
        "// Git-ignored and never published (tools/build.py leaves it out).\n\n"
        f"const RECORD = {json.dumps(record, ensure_ascii=False, indent=1)};\n\n"
        "export const buildSeed = () => JSON.parse(JSON.stringify(RECORD));\n"
    )
    SEED.write_text(js, encoding="utf-8", newline="\n")
    write_review(sessions, out_sessions, exercises, flags)
    real = sum(1 for s in out_sessions.values() if not s.get("archive"))
    print(f"{len(out_sessions)} workouts ({real} since Sep 2026, {len(out_sessions) - real} in the 2022 archive), "
          f"{len(exercises)} exercises, {len(flags)} things to check")
    print(SEED)
    print(REVIEW)


def fmt_set(st):
    if not st:
        return ""
    t = ""
    if "r" in st:
        t = f"{st['r']}" + (f" × {st['kg']}" if "kg" in st else " reps")
    if st.get("note"):
        t += (" " if t else "") + f"<i>{html.escape(st['note'])}</i>"
    return t


def write_review(sessions, out, exercises, flags):
    by_idx = {}
    for i, s in enumerate(sessions):
        by_idx[i] = s
    rows = []
    general = [m for i, m in flags if i is None]
    for s in sorted(sessions, key=lambda x: x["day"], reverse=True):
        rec = out[s["id"]]
        mine = [m for i, m in flags if i is not None and sessions[i] is s]
        items = []
        for it in rec["items"]:
            e = exercises[it["ex"]]
            extra = []
            if it.get("group"):
                extra.append("superset")
            if e.get("setting"):
                extra.append(f"setting {html.escape(e['setting'])}")
            if e.get("kind"):
                extra.append("assisted: less kg is harder")
            sets = " · ".join(fmt_set(x) for x in it["sets"]) or "—"
            note = f"<div class=n>{html.escape(it['note'])}</div>" if it.get("note") else ""
            items.append(f"<li><b>{html.escape(e['name'])}</b>{' <span class=t>' + ', '.join(extra) + '</span>' if extra else ''}<div>{sets}</div>{note}</li>")
        typ = {"legs": "Legs & Abs", "push": "Chest, Shoulders & Triceps", "pull": "Back & Biceps"}.get(rec.get("type"), "no day type")
        rows.append(f"""
<section class="{'arch' if rec.get('archive') else ''}">
  <h2>{s['day']} · {html.escape(rec.get('label', ''))} <span class=t>{typ}{' · archive' if rec.get('archive') else ''}</span></h2>
  {''.join(f'<p class=flag>{html.escape(m)}</p>' for m in mine)}
  <div class=cols><ol>{''.join(items)}</ol><pre>{html.escape(chr(10).join(s['src']))}</pre></div>
</section>""")
    names = sorted({e["name"] for e in exercises.values()})
    REVIEW.write_text(f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Gym import review</title>
<style>body{{font:15px/1.45 system-ui,sans-serif;margin:24px auto;max-width:1100px;padding:0 16px;background:#F5F1E8;color:#1E1D1A}}
section{{background:#FFFDF8;border:1px solid #E4DDCE;border-radius:14px;padding:14px 18px;margin:14px 0}}section.arch{{opacity:.85}}
h2{{font-size:17px;margin:0 0 8px}}.t{{font-weight:400;color:#6B665C;font-size:13px}}.cols{{display:grid;grid-template-columns:1fr 320px;gap:20px}}
ol{{margin:0;padding-left:20px}}li{{margin:4px 0}}pre{{margin:0;font-size:12px;color:#6B665C;white-space:pre-wrap}}.n{{color:#6B665C;font-size:13px}}
.flag{{background:#F3E3C8;color:#7A4A0B;border-radius:8px;padding:6px 10px;margin:4px 0}}i{{color:#6B665C}}
@media(max-width:700px){{.cols{{grid-template-columns:1fr}}}}</style></head><body>
<h1>Your Notes log, as imported</h1>
<p>Left: what the app will hold. Right: the lines it came from. Amber: places I had to make a call.</p>
{''.join(f'<p class=flag>{html.escape(m)}</p>' for m in general)}
<details><summary>{len(names)} exercises</summary><p>{', '.join(html.escape(n) for n in names)}</p></details>
{''.join(rows)}
</body></html>""", encoding="utf-8")


if __name__ == "__main__":
    main()
