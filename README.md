# Bounty Building 🏆

A legitimate "money waiting to be claimed" hunter system. A static site (GitHub Pages)
plus a daily pipeline. 100 hunters compete in a deterministic tournament to surface the
best real, verifiable claim opportunities — class action settlements, unclaimed property,
bank bonuses, and more.

**The site FINDS. You FILE.** Every claim is filed under penalty of perjury by the user.
Only claim what you genuinely qualify for.

## Concept

Most "free money" never gets claimed because nobody watches the deadlines. Bounty Building
watches them: a curated list of legitimate opportunities, each with a real deadline, a real
claim URL, and an honest proof requirement — plus a gamified 100-hunter tournament that
ranks which beats are actually producing.

## The 100-hunter tournament (Round 2 + Harvard + Yale)

- 100 hunters `H-001`–`H-100`, each with a fun callsign (e.g. "Rusty Ferret"), one of
  12 beats (settlements-no-proof, settlements-breach, settlements-new, bank-bonuses,
  unclaimed-property, utility-rebates, tax-credits, grocery-cashback-apps,
  telecom-refunds, warranty-claims, employer-benefits, state-programs),
  and `aggression` / `thoroughness` attributes drawn deterministically from seed 42.
- Each hunter "submits" its top-3 finds: opportunities matching its beat that are not expired.
- Scoring: `find_score = (value_score / effort_score) × urgency × thoroughness × (0.7 + 0.6 × aggression) × verification_rigor`;
  `hunter_score = sum of top-3`. See `hunters.py` for the documented value-tier mapping
  (max dollar figure in `value_desc`: ≥$1000→10, ≥$500→8, ≥$200→6, ≥$100→5, ≥$40→4,
  ≥$12→3, else 2) and the urgency curve (≤7d→1.5, ≤14d→1.3, ≤30d→1.2, ≤90d→1.1).
- **Verification rigor (the anti-fraud multiplier):** every opportunity carries
  `verification`: `"primary"` (every field confirmed by a primary source — official
  settlement site, court record/notice, .gov page, or the administrator's own page)
  → 1.0; `"secondary"` (any field relies on a secondary roundup without direct
  primary confirmation) → 0.6. Anything with an estimated field is rejected at
  data-entry time and never reaches the file (0.0).
- Rounds eliminate the bottom half: 100 → 50 → 25 → 12 → 6 → 3 champions.
- **Tier 2 "Harvard" (depth exam):** the 3 Round-2 champions enter seeded with their
  scores (keeping their verified finds) vs 100 new elite hunters `T2-001`–`T2-100`
  (thoroughness 0.85–1.0, aggression 0.8–1.0, seed 4202). Elites score on an
  opportunity only if its `source_note` names 2+ independent sources. Elimination
  103 → 12 → 3.
- **Tier 3 "Yale" (adversarial audit):** the 3 Tier-2 survivors enter seeded vs 100
  new elite hunters `T3-001`–`T3-100` (fresh seed stream 4203, same elite
  distributions). `verification_rigor` goes binary: 1.0 only if EVERY field is
  primary-confirmed, else 0 for that opportunity. Elimination 103 → 12 → 3.
  The final 3 winners stand.
- Fully deterministic: same opportunities + seeds = same `data/tournament.json`
  (the output stamps `run_date`, never wall-clock time).
  Run `python3 hunters.py` twice and diff — identical.
- Top-level `champions`/`rounds`/`leaderboard` in `tournament.json` are the
  Round-2 tournament (unchanged shape for the site); `tier2` and `tier3`
  objects carry the higher tiers.
- **Banned beat (user-directed rule, 2026-10-07):** `settlements-no-proof` is
  excluded from scoring in all three tiers — the user wants champions that
  cannot come from the no-proof settlements route. The 5 no-proof opportunities
  stay in `data/opportunities.json` and on the site as verified legitimate
  listings; they simply don't count toward any hunter's score, seeding, or
  elimination math. Implemented as `BANNED_BEATS` in `hunters.py`; hunters
  assigned to a banned beat score 0.

## Honesty rules (non-negotiable)

- Every opportunity is LEGITIMATE and verifiable: real programs, real deadlines, real
  claim URLs. Never invent an opportunity, deadline, payout, or URL.
- `proof_required` is one of `none` | `email-code` | `records` | `notice-id` — marked honestly.
- Claims are filed UNDER PENALTY OF PERJURY by the user. Filing a claim you don't
  qualify for harms other real claimants and can be fraud.
- Expired opportunities are kept with `"status": "expired"` for the record; the site hides them.
- Educational content only — not legal or financial advice.

## Ops

- `python3 hunters.py` — run the tournament, write `data/tournament.json`.
- `python3 refresh.py` — mark expired, re-run tournament (what the daily workflow runs).
- `.github/workflows/daily.yml` — cron daily 06:00 UTC + manual dispatch; commits `data/*.json`.
- `.github/workflows/pages.yml` — deploys to GitHub Pages on push to `master`.
- No build step, no secrets, no API keys.

## Adding a verified opportunity

1. Verify it TODAY via web search: real program, real deadline, real claim URL.
2. Never guess a URL — use the official settlement administrator site.
3. Mark `verification` honestly: `"primary"` only if every field is confirmed by a
   primary source (official site, court notice, .gov page, administrator's own page);
   `"secondary"` if any field relies on a secondary roundup. Anything estimated is
   rejected — a smaller honest list beats a bigger shaky one.
4. Add an entry to `data/opportunities.json` with all fields:
   `id, title, category, beat, value_desc, effort ("N min"), deadline (ISO or null),
   eligibility, claim_url, proof_required, verified (today's date), verification,
   source_note` (name each independent source, separated by ` + `).
5. Run `python3 refresh.py` and check the site renders it.
