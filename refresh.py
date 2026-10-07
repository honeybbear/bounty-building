#!/usr/bin/env python3
"""Daily refresh: mark expired opportunities, re-run the hunter tournament.

Never invents data. Expired opportunities are kept for the record with
status "expired" so the site can show what closed.
"""
import json
import os
import sys
import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import hunters  # noqa: E402

OPP_PATH = os.path.join(BASE, "data", "opportunities.json")
TOUR_PATH = os.path.join(BASE, "data", "tournament.json")


def main():
    today = datetime.date.today().isoformat()
    data = json.load(open(OPP_PATH))
    opps = data["opportunities"]
    newly = 0
    for o in opps:
        dl = o.get("deadline")
        if dl and dl < today and o.get("status") != "expired":
            o["status"] = "expired"
            newly += 1
    json.dump(data, open(OPP_PATH, "w"), indent=1)

    result = hunters.run(opps, today=today)
    json.dump(result, open(TOUR_PATH, "w"), indent=1)

    active = result["active_opportunity_count"]
    print("refresh %s: %d opportunities (%d active), %d newly expired" % (today, len(opps), active, newly))
    for c in result["champions"]:
        print("champion: %s %s (%s) score=%.4f" % (c["id"], c["name"], c["beat"], c["score"]))


if __name__ == "__main__":
    main()
