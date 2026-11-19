#!/usr/bin/env python3
"""Update data/status.json, the live state the Kantor dashboard reads.

  python3 tools/status.py run start            # new run for today (WIB), resets agents
  python3 tools/status.py run finish | fail "alasan"
  python3 tools/status.py agent <id> <idle|kerja|selesai|error> "aktivitas"
  python3 tools/status.py tasks <antri> <jalan> <kelar>
  python3 tools/status.py bos "poin 1" "poin 2" ...   # Kesimpulan Bos
  python3 tools/status.py log <id> "pesan"

Agent ids: bos, radar, detektif, narator, copywriter, qc
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

WIB = timezone(timedelta(hours=7))
PATH = Path(__file__).resolve().parent.parent / "data" / "status.json"
AGENTS = ["bos", "radar", "detektif", "narator", "copywriter", "qc"]
STATES = {"idle", "kerja", "selesai", "error"}
MAX_LOG = 60


def now():
    return datetime.now(WIB).isoformat(timespec="seconds")


def load():
    if PATH.exists():
        return json.loads(PATH.read_text(encoding="utf-8"))
    return {"run": {}, "tasks": {"antri": 0, "jalan": 0, "kelar": 0},
            "kesimpulan_bos": [], "agents": {}, "log": []}


def add_log(s, agent, msg):
    s["log"].insert(0, {"t": now(), "agen": agent, "pesan": msg})
    del s["log"][MAX_LOG:]


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    s = load()
    for a in AGENTS:
        s["agents"].setdefault(a, {"status": "idle", "aktivitas": "Menunggu tugas", "t": now()})
    cmd = argv[1]

    if cmd == "run":
        what = argv[2]
        if what == "start":
            s["run"] = {"date": datetime.now(WIB).strftime("%Y-%m-%d"), "status": "berjalan",
                        "started_at": now(), "finished_at": None}
            s["tasks"] = {"antri": 0, "jalan": 0, "kelar": 0}
            for a in AGENTS:
                s["agents"][a] = {"status": "idle", "aktivitas": "Menunggu tugas", "t": now()}
            add_log(s, "bos", "Shift pagi dimulai. Tim dikumpulkan.")
        elif what in ("finish", "fail"):
            s["run"]["status"] = "selesai" if what == "finish" else "gagal"
            s["run"]["finished_at"] = now()
            if what == "fail":
                s["run"]["alasan"] = argv[3] if len(argv) > 3 else ""
                add_log(s, "bos", "Shift gagal: " + s["run"]["alasan"])
            else:
                add_log(s, "bos", "Shift selesai. Semua hasil sudah di menu Hasil.")
        else:
            sys.exit("run start|finish|fail")
    elif cmd == "agent":
        aid, state, act = argv[2], argv[3], argv[4] if len(argv) > 4 else ""
        if aid not in AGENTS or state not in STATES:
            sys.exit(f"agent id harus {AGENTS}, status harus {sorted(STATES)}")
        s["agents"][aid] = {"status": state, "aktivitas": act, "t": now()}
        if act:
            add_log(s, aid, act)
    elif cmd == "tasks":
        s["tasks"] = {"antri": int(argv[2]), "jalan": int(argv[3]), "kelar": int(argv[4])}
    elif cmd == "bos":
        s["kesimpulan_bos"] = argv[2:]
        s["kesimpulan_t"] = now()
    elif cmd == "log":
        add_log(s, argv[2], argv[3])
    else:
        sys.exit(__doc__)

    s["updated_at"] = now()
    PATH.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv)
