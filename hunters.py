#!/usr/bin/env python3
"""Bounty Building - 100-hunter tournament.

100 hunters (H-001..H-100) compete to surface the best legitimate
money-claiming opportunities. Deterministic: seed 42, same opportunities
in -> same tournament out. No randomness theater.

SCORING (documented):
  Each hunter works ONE beat (10 beats, 10 hunters each). A hunter "submits"
  its top-3 finds: opportunities whose beat matches the hunter's beat and
  which are not expired.

  find_score = (value_score / effort_score) * urgency * thoroughness * (0.7 + 0.6 * aggression)

  hunter_score = sum of the hunter's top-3 find_scores.

  VALUE TIERS (value_score from value_desc - max dollar figure found):
      >= $1,000  -> 10
      >= $500    ->  8
      >= $200    ->  6
      >= $100    ->  5
      >= $40     ->  4
      >= $12     ->  3
      else       ->  2
    Handles K/M suffixes (e.g. "$59.5M" -> 59,500,000). This is a rough
    proxy: for pro-rata funds the per-person payout is smaller than the
    fund size, which the site discloses next to every value.

  effort_score = minutes parsed from the effort field ("5 min" -> 5).

  urgency(deadline):
      <= 7 days   -> 1.5
      <= 14 days  -> 1.3
      <= 30 days  -> 1.2
      <= 90 days  -> 1.1
      > 90 / none -> 1.0

  thoroughness, aggression in [0,1], drawn deterministically from seed 42.

TOURNAMENT: sort by (-score, id); eliminate the bottom half each round:
  100 -> 50 -> 25 -> 12 -> 6 -> 3 champions.
Ties broken by hunter id (deterministic).
"""
import json
import os
import random
import re
import datetime

SEED = 42

BEATS = [
    "settlements",
    "unclaimed-property",
    "bank-bonuses",
    "card-bonuses",
    "utility-rebates",
    "tax-credits",
    "grocery-cashback",
    "employer-benefits",
    "telecom-refunds",
    "warranty-claims",
]

ADJECTIVES = ["Lucky", "Dusty", "Slick", "Rusty", "Peppy", "Frugal", "Sharp", "Wily", "Bold", "Calm"]
NOUNS = ["Ferret", "Badger", "Mole", "Hawk", "Fox", "Otter", "Raccoon", "Beaver", "Coyote", "Marmot"]

ROUND_SIZES = [100, 50, 25, 12, 6, 3]


def parse_value(value_desc):
    """Max dollar figure in value_desc, handling K/M suffixes."""
    best = 0.0
    for m in re.finditer(r"\$\s*([\d,]+(?:\.\d+)?)\s*([KMB])?", value_desc or "", re.IGNORECASE):
        num = float(m.group(1).replace(",", ""))
        suf = (m.group(2) or "").upper()
        if suf == "K":
            num *= 1_000
        elif suf == "M":
            num *= 1_000_000
        elif suf == "B":
            num *= 1_000_000_000
        best = max(best, num)
    return best


def value_score(value_desc):
    v = parse_value(value_desc)
    if v >= 1000:
        return 10
    if v >= 500:
        return 8
    if v >= 200:
        return 6
    if v >= 100:
        return 5
    if v >= 40:
        return 4
    if v >= 12:
        return 3
    return 2


def effort_score(effort):
    m = re.search(r"(\d+(?:\.\d+)?)\s*min", effort or "")
    return float(m.group(1)) if m else 30.0


def urgency(deadline, today):
    if not deadline:
        return 1.0
    days = (datetime.date.fromisoformat(deadline) - today).days
    if days < 0:
        return 0.0
    if days <= 7:
        return 1.5
    if days <= 14:
        return 1.3
    if days <= 30:
        return 1.2
    if days <= 90:
        return 1.1
    return 1.0


def build_hunters():
    rng = random.Random(SEED)
    hunters = []
    for i in range(1, 101):
        hid = "H-%03d" % i
        hunters.append({
            "id": hid,
            "name": "%s %s" % (ADJECTIVES[(i - 1) // 10], NOUNS[(i - 1) % 10]),
            "beat": BEATS[(i - 1) % 10],
            "aggression": round(rng.random(), 3),
            "thoroughness": round(rng.random(), 3),
        })
    return hunters


def score_hunter(hunter, opportunities, today):
    finds = []
    for o in opportunities:
        if o.get("status") == "expired":
            continue
        if o.get("beat") != hunter["beat"]:
            continue
        u = urgency(o.get("deadline"), today)
        if u <= 0:
            continue
        vs = value_score(o.get("value_desc", ""))
        es = effort_score(o.get("effort", ""))
        s = (vs / es) * u * hunter["thoroughness"] * (0.7 + 0.6 * hunter["aggression"])
        finds.append((s, o["id"]))
    finds.sort(reverse=True)
    total = sum(s for s, _ in finds[:3])
    return round(total, 4), [oid for _, oid in finds[:3]]


def run(opportunities, today=None):
    today = today or datetime.date.today().isoformat()
    if isinstance(today, str):
        today = datetime.date.fromisoformat(today)
    hunters = build_hunters()
    scored = []
    for h in hunters:
        score, finds = score_hunter(h, opportunities, today)
        scored.append({**h, "score": score, "finds": finds})
    scored.sort(key=lambda h: (-h["score"], h["id"]))

    rounds = []
    alive = [h["id"] for h in scored]
    by_id = {h["id"]: h for h in scored}
    for r, size in enumerate(ROUND_SIZES, start=1):
        survivors = alive[:size]
        eliminated = alive[size:]
        rounds.append({"round": r, "size": size,
                       "survivors": survivors, "eliminated": eliminated})
        alive = survivors

    champions = [{"id": by_id[c]["id"], "name": by_id[c]["name"],
                  "beat": by_id[c]["beat"], "score": by_id[c]["score"]} for c in alive]
    leaderboard = [{"id": h["id"], "name": h["name"], "beat": h["beat"],
                    "score": h["score"], "rank": i + 1}
                   for i, h in enumerate(scored)]
    return {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seed": SEED,
        "opportunity_count": len(opportunities),
        "active_opportunity_count": sum(1 for o in opportunities if o.get("status") != "expired"),
        "rounds": rounds,
        "champions": champions,
        "leaderboard": leaderboard,
    }


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    opps = json.load(open(os.path.join(base, "data", "opportunities.json")))["opportunities"]
    result = run(opps)
    out = os.path.join(base, "data", "tournament.json")
    json.dump(result, open(out, "w"), indent=1)
    print("tournament: %d hunters, %d opportunities (%d active)" % (
        100, result["opportunity_count"], result["active_opportunity_count"]))
    for c in result["champions"]:
        print("champion: %s %s (%s) score=%.4f" % (c["id"], c["name"], c["beat"], c["score"]))


if __name__ == "__main__":
    main()
