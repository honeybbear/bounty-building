#!/usr/bin/env python3
"""Deadline watchdog for the Bounty Building.

Reads data/opportunities.json, marks expired entries, and reports deadlines
<7 days out. Run from the repo root. Stdlib only.
"""
import json, datetime, os, sys

P = "data/opportunities.json"
if not os.path.exists(P):
    print("no opportunities.json yet"); sys.exit(0)

ops = json.load(open(P))
today = datetime.date.today()
changed, urgent, expired = False, [], []

for o in ops:
    dl = o.get("deadline")
    if not dl:
        continue
    try:
        d = datetime.date.fromisoformat(dl)
    except ValueError:
        continue
    days = (d - today).days
    if days < 0 and o.get("status") != "expired":
        o["status"] = "expired"; changed = True; expired.append(o["title"])
    elif 0 <= days < 7 and o.get("status") != "expired":
        urgent.append((o["title"], days))

if changed:
    json.dump(ops, open(P, "w"), indent=1)
    print(f"marked expired: {len(expired)}")
for t, d in urgent:
    print(f"URGENT ({d}d left): {t}")
if not urgent and not expired:
    print("all deadlines healthy")
