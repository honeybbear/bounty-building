#!/usr/bin/env python3
"""Bounty Building - hunter tournament, Round 2 + Tier 2 (Harvard) + Tier 3 (Yale).

100 hunters (H-001..H-100) compete across 12 beats in a deterministic
tournament (seed 42). Verification rigor is the centerpiece: every
opportunity carries a `verification` field ("primary" or "secondary");
anything with an estimated field never reaches the data file.

ROUND 2 ("Open Qualifier") SCORING (documented):
  Each hunter works ONE beat (12 beats). A hunter "submits" its top-3
  finds: opportunities whose beat matches the hunter's beat and which
  are not expired.

  find_score = (value_score / effort_score) x urgency(deadline)
               x thoroughness x (0.7 + 0.6 x aggression) x verification_rigor

  hunter_score = sum of the hunter's top-3 find_scores.

  VALUE TIERS (value_score from value_desc - max dollar figure found):
      >= $1,000  -> 10
      >= $500    ->  8
      >= $200    ->  6
      >= $100    ->  5
      >= $40     ->  4
      >= $12     ->  3
      else       ->  2
    Handles K/M/B suffixes (e.g. "$59.5M" -> 59,500,000). This is a rough
    proxy: for pro-rata funds the per-person payout is smaller than the
    fund size, which the site discloses next to every value.

  effort_score = minutes parsed from the effort field ("5 min" -> 5).

  urgency(deadline):
      <= 7 days   -> 1.5
      <= 14 days  -> 1.3
      <= 30 days  -> 1.2
      <= 90 days  -> 1.1
      > 90 / none -> 1.0
      past        -> 0.0 (excluded)

  verification_rigor (the anti-fraud multiplier):
      "primary"   -> 1.0  (every field confirmed by a primary source:
                           official settlement site, court record/notice,
                           .gov page, or the administering company's page)
      "secondary" -> 0.6  (any field relies on a secondary roundup without
                           direct primary confirmation)
      estimated   -> 0.0  (excluded from the opportunity entirely - such
                           entries are rejected at data-entry time and never
                           reach data/opportunities.json)

  thoroughness, aggression in [0,1], drawn deterministically from seed 42.

  Rounds eliminate the bottom half: 100 -> 50 -> 25 -> 12 -> 6 -> 3.

TIER 2 ("Harvard" - the depth exam):
  The 3 Round-2 champions enter SEEDED with their Round-2 scores (they are
  the benchmark; they keep their verified finds and are exempt from the
  depth requirement below) versus 100 NEW elite hunters (T2-001..T2-100).
  Elites are a higher skill bracket: thoroughness drawn from [0.85, 1.0],
  aggression from [0.8, 1.0], deterministic from seed 4202.
  Depth requirement: an elite scores on an opportunity ONLY if its
  source_note names 2+ independent sources (segments split on "+").
  Single-source finds score 0 for elites - depth beats speed here.
  Elimination: 103 -> 12 -> 3 survivors.

TIER 3 ("Yale" - the adversarial audit):
  The 3 Tier-2 survivors enter SEEDED with their Tier-2 scores versus 100
  NEW elite hunters (T3-001..T3-100, fresh seed stream 4203, same elite
  distributions). Scoring adds the adversarial audit: verification_rigor
  becomes BINARY - 1.0 only if EVERY field is confirmed by a primary
  source; any opportunity relying on a secondary roundup scores 0 for that
  hunter. (The depth requirement is Tier 2's rule and does not carry over.)
  Elimination: 103 -> 12 -> 3. The final 3 winners stand.

DETERMINISM: separate seeded RNG streams per tier (42 / 4202 / 4203),
insertion-ordered data, tie-breaks by hunter id, and `run_date` (not wall
clock) in the output. Run twice -> byte-identical JSON.

BANNED BEATS (user-directed rule, 2026-10-07): {"settlements-no-proof"}.
Banned-beat opportunities stay in data/opportunities.json and on the site as
verified legitimate listings, but are excluded from scoring, seeding, and
elimination math in every tier - hunters on a banned beat score 0.

OUTPUT (data/tournament.json): top-level champions/rounds/leaderboard are
the Round-2 tournament (unchanged shape for the site), plus nested
"tier2" and "tier3" objects with their own rounds/champions/leaderboards.
"""
import json
import os
import random
import re
import datetime

SEED = 42
SEED_TIER2 = 4202
SEED_TIER3 = 4203

BEATS = [
    "settlements-no-proof",
    "settlements-breach",
    "settlements-new",
    "bank-bonuses",
    "unclaimed-property",
    "utility-rebates",
    "tax-credits",
    "grocery-cashback-apps",
    "telecom-refunds",
    "warranty-claims",
    "employer-benefits",
    "state-programs",
]

ADJECTIVES = ["Lucky", "Dusty", "Slick", "Rusty", "Peppy", "Frugal", "Sharp", "Wily", "Bold", "Calm"]
NOUNS = ["Ferret", "Badger", "Mole", "Hawk", "Fox", "Otter", "Raccoon", "Beaver", "Coyote", "Marmot"]

ROUND_SIZES = [100, 50, 25, 12, 6, 3]
TIER23_SIZES = [103, 12, 3]

# USER-DIRECTED RULE (2026-10-07): the settlements-no-proof beat is BANNED from
# tournament scoring in every tier. The user wants champions that cannot come
# from the no-proof settlements route. Those opportunities STAY in
# data/opportunities.json and on the site as verified legitimate listings -
# they are simply excluded from all hunter scoring, seeding, and elimination
# math. Hunters assigned to a banned beat score 0 and are eliminated.
BANNED_BEATS = {"settlements-no-proof"}


def parse_value(value_desc):
    """Max dollar figure in value_desc, handling K/M/B suffixes."""
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


def verification_rigor(opp, binary=False):
    """Anti-fraud multiplier.

    standard: primary -> 1.0, secondary -> 0.6.
    binary (Tier 3 adversarial audit): primary -> 1.0, anything else -> 0.0.
    """
    v = opp.get("verification", "secondary")
    if binary:
        return 1.0 if v == "primary" else 0.0
    return 1.0 if v == "primary" else 0.6


def count_sources(source_note):
    """Independent sources = segments of source_note split on '+'.

    Each segment must name a distinct publication/site. Minimum 1.
    """
    parts = [p.strip() for p in (source_note or "").split("+")]
    return max(1, len([p for p in parts if p]))


def build_hunters():
    rng = random.Random(SEED)
    hunters = []
    for i in range(1, 101):
        hid = "H-%03d" % i
        hunters.append({
            "id": hid,
            "kind": "hunter",
            "name": "%s %s" % (ADJECTIVES[(i - 1) // 10], NOUNS[(i - 1) % 10]),
            "beat": BEATS[(i - 1) % len(BEATS)],
            "aggression": round(rng.random(), 3),
            "thoroughness": round(rng.random(), 3),
        })
    return hunters


def build_elites(seed, id_prefix, name_prefix):
    """100 elite hunters: thoroughness in [0.85,1.0], aggression in [0.8,1.0]."""
    rng = random.Random(seed)
    elites = []
    for i in range(1, 101):
        elites.append({
            "id": "%s-%03d" % (id_prefix, i),
            "kind": "elite",
            "name": "%s %s %s" % (name_prefix, ADJECTIVES[(i - 1) // 10], NOUNS[(i - 1) % 10]),
            "beat": BEATS[(i - 1) % len(BEATS)],
            "aggression": round(0.8 + 0.2 * rng.random(), 3),
            "thoroughness": round(0.85 + 0.15 * rng.random(), 3),
        })
    return elites


def score_hunter(hunter, opportunities, today, binary_rigor=False, min_sources=0):
    """Score one hunter's top-3 finds.

    binary_rigor: Tier-3 adversarial audit (primary-only scoring).
    min_sources: Tier-2 depth requirement (elites need 2+ sources).
    """
    finds = []
    for o in opportunities:
        if o.get("status") == "expired":
            continue
        if o.get("beat") != hunter["beat"]:
            continue
        if min_sources and count_sources(o.get("source_note", "")) < min_sources:
            continue
        u = urgency(o.get("deadline"), today)
        if u <= 0:
            continue
        rig = verification_rigor(o, binary=binary_rigor)
        if rig <= 0:
            continue
        vs = value_score(o.get("value_desc", ""))
        es = effort_score(o.get("effort", ""))
        s = (vs / es) * u * hunter["thoroughness"] * (0.7 + 0.6 * hunter["aggression"]) * rig
        finds.append((s, o["id"]))
    finds.sort(reverse=True)
    total = sum(s for s, _ in finds[:3])
    return round(total, 4), [oid for _, oid in finds[:3]]


def run_bracket(contestants, sizes):
    """Elimination bracket: sort by (-score, id), cut to each size in turn."""
    scored = sorted(contestants, key=lambda h: (-h["score"], h["id"]))
    rounds = []
    alive = [h["id"] for h in scored]
    by_id = {h["id"]: h for h in scored}
    for r, size in enumerate(sizes, start=1):
        survivors = alive[:size]
        eliminated = alive[size:]
        rounds.append({"round": r, "size": size,
                       "survivors": survivors, "eliminated": eliminated})
        alive = survivors
    champions = [{"id": by_id[c]["id"], "name": by_id[c]["name"],
                  "beat": by_id[c]["beat"], "score": by_id[c]["score"],
                  "kind": by_id[c].get("kind", "hunter")} for c in alive]
    leaderboard = [{"id": h["id"], "name": h["name"], "beat": h["beat"],
                    "score": h["score"], "kind": h.get("kind", "hunter"),
                    "rank": i + 1}
                   for i, h in enumerate(scored)]
    return rounds, champions, leaderboard


def run_tier1(opportunities, today):
    """Round 2 Open Qualifier: 100 hunters, standard rigor, 100->50->25->12->6->3."""
    scored = []
    for h in build_hunters():
        score, finds = score_hunter(h, opportunities, today)
        scored.append({**h, "score": score, "finds": finds})
    rounds, champions, leaderboard = run_bracket(scored, ROUND_SIZES)
    return {"name": "Round 2 - Open Qualifier", "rounds": rounds,
            "champions": champions, "leaderboard": leaderboard}


def run_tier2(opportunities, today, t1_champions):
    """Tier 2 Harvard: 3 seeded champions vs 100 elites, depth requirement."""
    contestants = []
    for c in t1_champions:
        # Seeded with Round-2 score; keeps verified finds (no depth requirement).
        contestants.append({"id": c["id"], "kind": "seed",
                            "name": c["name"], "beat": c["beat"],
                            "score": c["score"], "finds": "seeded"})
    for h in build_elites(SEED_TIER2, "T2", "Apex"):
        score, finds = score_hunter(h, opportunities, today, min_sources=2)
        contestants.append({**h, "score": score, "finds": finds})
    rounds, champions, leaderboard = run_bracket(contestants, TIER23_SIZES)
    return {"name": "Tier 2 - Harvard (depth exam)", "rounds": rounds,
            "champions": champions, "leaderboard": leaderboard}


def run_tier3(opportunities, today, t2_survivors):
    """Tier 3 Yale: 3 seeded survivors vs 100 new elites, binary rigor audit."""
    contestants = []
    for c in t2_survivors:
        contestants.append({"id": c["id"], "kind": "seed",
                            "name": c["name"], "beat": c["beat"],
                            "score": c["score"], "finds": "seeded"})
    for h in build_elites(SEED_TIER3, "T3", "Prime"):
        score, finds = score_hunter(h, opportunities, today, binary_rigor=True)
        contestants.append({**h, "score": score, "finds": finds})
    rounds, champions, leaderboard = run_bracket(contestants, TIER23_SIZES)
    return {"name": "Tier 3 - Yale (adversarial audit)", "rounds": rounds,
            "champions": champions, "leaderboard": leaderboard}


def run(opportunities, today=None):
    today = today or datetime.date.today().isoformat()
    if isinstance(today, str):
        today = datetime.date.fromisoformat(today)
    # Banned beats: still listed on the site, never scored in any tier.
    scorable = [o for o in opportunities if o.get("beat") not in BANNED_BEATS]
    tier1 = run_tier1(scorable, today)
    tier2 = run_tier2(scorable, today, tier1["champions"])
    tier3 = run_tier3(scorable, today, tier2["champions"])
    return {
        "run_date": today.isoformat(),
        "seed": SEED,
        "banned_beats": sorted(BANNED_BEATS),
        "opportunity_count": len(opportunities),
        "scorable_opportunity_count": len(scorable),
        "active_opportunity_count": sum(1 for o in opportunities if o.get("status") != "expired"),
        # Top-level shape unchanged for the site: the Round-2 tournament.
        "rounds": tier1["rounds"],
        "champions": tier1["champions"],
        "leaderboard": tier1["leaderboard"],
        "tier1": tier1,
        "tier2": tier2,
        "tier3": tier3,
    }


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    opps = json.load(open(os.path.join(base, "data", "opportunities.json")))["opportunities"]
    result = run(opps)
    out = os.path.join(base, "data", "tournament.json")
    json.dump(result, open(out, "w"), indent=1)
    print("tournament: 100 hunters + 200 elites, %d opportunities (%d active)" % (
        result["opportunity_count"], result["active_opportunity_count"]))
    for tier in ("tier1", "tier2", "tier3"):
        print("== %s" % result[tier]["name"])
        for c in result[tier]["champions"]:
            print("  champion: %s %s (%s) score=%.4f" % (c["id"], c["name"], c["beat"], c["score"]))


if __name__ == "__main__":
    main()
