/* Bounty Building — renders champions, bracket, leaderboard, opportunities. */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const DAY = 86400000;

let TOUR = null, OPPS = [];
let beatFilter = null, proofFilter = null;

const BEAT_COLORS = {
  "settlements-no-proof": "#4cc9f0", "settlements-breach": "#3a86ff", "settlements-new": "#8338ec",
  "unclaimed-property": "#3ddc97", "bank-bonuses": "#ffd166", "utility-rebates": "#c77dff",
  "tax-credits": "#90be6d", "grocery-cashback-apps": "#f9844a", "telecom-refunds": "#4d96a9",
  "warranty-claims": "#9c6644", "employer-benefits": "#577590", "state-programs": "#ef476f"
};
const PROOF_LABEL = { "none": "No proof", "email-code": "Email code", "records": "Records needed", "notice-id": "Notice ID needed" };

function daysLeft(o) {
  if (!o.deadline) return null;
  const dl = new Date(o.deadline + "T23:59:59");
  return Math.ceil((dl - Date.now()) / DAY);
}
function activeOpps() {
  return OPPS.filter((o) => {
    if (o.status === "expired") return false;
    const dl = daysLeft(o);
    return dl === null || dl >= 0;
  });
}
function filteredOpps() {
  return activeOpps().filter((o) =>
    (!beatFilter || o.beat === beatFilter) && (!proofFilter || o.proof_required === proofFilter));
}

function renderPodium() {
  const champs = (TOUR.champions || []);
  const medals = ["🥇", "🥈", "🥉"], cls = ["first", "second", "third"];
  $("podium").innerHTML = champs.map((c, i) => `
    <div class="champ ${cls[i]}">
      <div class="medal">${medals[i]}</div>
      <div class="cid">${esc(c.id)}</div>
      <div class="cname">${esc(c.name)}</div>
      <div class="cbeat">${esc(c.beat)}</div>
      <div class="cscore">${c.score.toFixed(2)} pts</div>
    </div>`).join("");
}

function renderRounds() {
  const byId = {};
  (TOUR.leaderboard || []).forEach((h) => { byId[h.id] = h; });
  $("rounds").innerHTML = (TOUR.rounds || []).map((r) => {
    const surv = r.survivors.map((id) => {
      const h = byId[id] || {};
      return `<span class="hchip">${esc(id)} ${esc(h.name || "")}</span>`;
    }).join("");
    const elim = r.eliminated.slice(0, 50).map((id) => {
      const h = byId[id] || {};
      return `<span class="hchip out">${esc(id)} ${esc(h.name || "")}</span>`;
    }).join("");
    const more = r.eliminated.length > 50 ? `<span class="hchip out">+${r.eliminated.length - 50} more</span>` : "";
    return `<details class="round"${r.round === 6 ? " open" : ""}>
      <summary>Round ${r.round} <span class="rcount">${r.survivors.length} survive · ${r.eliminated.length} cut</span></summary>
      <div class="rbody">${surv}${elim}${more}</div>
    </details>`;
  }).join("");
}

function renderLeaderboard() {
  const top = (TOUR.leaderboard || []).slice(0, 20);
  $("leaderboard").innerHTML = top.map((h) => `
    <div class="lrow${h.rank <= 3 ? " top3" : ""}">
      <span class="lrank">#${h.rank}</span>
      <span class="lname">${esc(h.name)}<small>${esc(h.id)} · ${esc(h.beat)}</small></span>
      <span class="lscore">${h.score.toFixed(2)}</span>
    </div>`).join("");
}

function renderFilters() {
  const beats = [...new Set(activeOpps().map((o) => o.beat))].sort();
  $("beatChips").innerHTML = `<button class="chip" data-b="" aria-selected="${!beatFilter}">All beats</button>` +
    beats.map((b) => `<button class="chip" data-b="${esc(b)}" aria-selected="${beatFilter === b}">${esc(b)}</button>`).join("");
  $("beatChips").querySelectorAll("[data-b]").forEach((el) => {
    el.addEventListener("click", () => { beatFilter = el.dataset.b || null; renderFilters(); renderOpps(); });
  });
  const proofs = [...new Set(activeOpps().map((o) => o.proof_required))].sort();
  $("proofChips").innerHTML = `<button class="chip" data-p="" aria-selected="${!proofFilter}">Any proof level</button>` +
    proofs.map((p) => `<button class="chip" data-p="${esc(p)}" aria-selected="${proofFilter === p}">${esc(PROOF_LABEL[p] || p)}</button>`).join("");
  $("proofChips").querySelectorAll("[data-p]").forEach((el) => {
    el.addEventListener("click", () => { proofFilter = el.dataset.p || null; renderFilters(); renderOpps(); });
  });
}

function renderOpps() {
  const list = filteredOpps().sort((a, b) => {
    const da = daysLeft(a), db = daysLeft(b);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  $("oppGrid").innerHTML = list.length ? list.map((o) => {
    const dl = daysLeft(o);
    const dlHtml = dl === null
      ? `<span class="tag days">no deadline</span>`
      : `<span class="tag days${dl < 7 ? " hot" : dl < 21 ? " soon" : ""}">${dl}d left</span>`;
    return `<div class="ocard${dl !== null && dl < 7 ? " urgent" : ""}" style="--bc:${BEAT_COLORS[o.beat] || "#ffd166"}">
      <div class="o-top"><div>
        <div class="o-cat">${esc(o.category)} · ${esc(o.beat)}</div>
        <div class="o-title">${esc(o.title)}</div>
      </div></div>
      <div class="o-value">${esc(o.value_desc)}</div>
      <div class="o-meta">${dlHtml}
        <span class="tag">⏱ ${esc(o.effort)}</span>
        <span class="tag proof-${esc(o.proof_required)}">${esc(PROOF_LABEL[o.proof_required] || o.proof_required)}</span>
      </div>
      <div class="o-elig"><strong>Who qualifies:</strong> ${esc(o.eligibility)}</div>
      <div class="o-foot">
        <span class="o-ver">verified ${esc(o.verified || "?")}</span>
        <a class="filebtn" href="${esc(o.claim_url)}" target="_blank" rel="noopener">File yourself →</a>
      </div>
    </div>`;
  }).join("") : `<div class="empty">No bounties match these filters.</div>`;
}

async function loadJSON(path, fallback) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw 0;
    return await r.json();
  } catch (e) { return fallback; }
}

async function init() {
  const [tour, opps] = await Promise.all([
    loadJSON("data/tournament.json", null),
    loadJSON("data/opportunities.json", { opportunities: [] }),
  ]);
  TOUR = tour; OPPS = opps.opportunities || [];
  if (TOUR && TOUR.generated_at) {
    $("updatedAt").textContent = "tournament " + TOUR.generated_at.replace("T", " ").replace("Z", " UTC");
  }
  if (!TOUR) {
    $("podium").innerHTML = `<div class="empty">Tournament data not loaded yet.</div>`;
    return;
  }
  renderPodium(); renderRounds(); renderLeaderboard();
  renderFilters(); renderOpps();
}
document.addEventListener("DOMContentLoaded", init);
