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

## The 100-hunter tournament

- 100 hunters `H-001`–`H-100`, each with a fun callsign (e.g. "Rusty Ferret"), one of
  10 beats (settlements, unclaimed-property, bank-bonuses, card-bonuses, utility-rebates,
  tax-credits, grocery-cashback, employer-benefits, telecom-refunds, warranty-claims),
  and `aggression` / `thoroughness` attributes drawn deterministically from seed 42.
- Each hunter "submits" its top-3 finds: opportunities matching its beat that are not expired.
- Scoring: `find_score = (value_score / effort_score) × urgency × thoroughness × (0.7 + 0.6 × aggression)`;
  `hunter_score = sum of top-3`. See `hunters.py` for the documented value-tier mapping
  (max dollar figure in `value_desc`: ≥$1000→10, ≥$500→8, ≥$200→6, ≥$100→5, ≥$40→4,
  ≥$12→3, else 2) and the urgency curve (≤7d→1.5, ≤14d→1.3, ≤30d→1.2, ≤90d→1.1).
- Rounds eliminate the bottom half: 100 → 50 → 25 → 12 → 6 → 3 champions.
- Fully deterministic: same opportunities + seed 42 = same `data/tournament.json`.
  Run `python3 hunters.py` twice and diff — identical.

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
3. Add an entry to `data/opportunities.json` with all fields:
   `id, title, category, beat, value_desc, effort ("N min"), deadline (ISO or null),
   eligibility, claim_url, proof_required, verified (today's date), source_note`.
4. Run `python3 refresh.py` and check the site renders it.
