/* Bounty Hive — 100 hunter bees, 3 queens, honeycomb bounties. All visuals read from JSON. */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const DAY = 86400000;
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let TOUR = null, OPPS = [];
let beatFilter = null;
let hunterById = {};
let elimRound = {};   // hunter id -> round eliminated (null = queen/finalist)

const BEAT_COLORS = {
  "settlements-no-proof": "#4cc9f0", "settlements-breach": "#3a86ff", "settlements-new": "#8338ec",
  "unclaimed-property": "#3ddc97", "bank-bonuses": "#ffd166", "utility-rebates": "#c77dff",
  "tax-credits": "#90be6d", "grocery-cashback-apps": "#f9844a", "telecom-refunds": "#4d96a9",
  "warranty-claims": "#9c6644", "employer-benefits": "#577590", "state-programs": "#ef476f"
};
const PROOF_LABEL = { "none": "No proof", "email-code": "Email code", "records": "Records needed", "notice-id": "Notice ID needed" };

/* ---------- honest value tiers: fill levels derive from real dollar figures ---------- */
function maxDollars(s) {
  let max = 0;
  const re = /\$([\d,]+(?:\.\d+)?)\s*([bmk])?(?![a-z])/gi;
  let m;
  while ((m = re.exec(String(s || "")))) {
    let v = parseFloat(m[1].replace(/,/g, ""));
    const u = (m[2] || "").toLowerCase();
    if (u === "b") v *= 1e9; else if (u === "m") v *= 1e6; else if (u === "k") v *= 1e3;
    if (v > max) max = v;
  }
  return max;
}
// Tier from the largest dollar figure in value_desc. 0 = no figure found (a drizzle).
function valueTier(v) {
  if (v >= 100e6) return 5;
  if (v >= 10e6) return 4;
  if (v >= 1e6) return 3;
  if (v >= 500) return 2;
  if (v > 0) return 1;
  return 0;
}
const FILL_PCT = [10, 22, 40, 62, 82, 100];
function fmtMoney(v) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + Math.round(v / 1e3) + "K";
  return "$" + Math.round(v);
}

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
function isBanned(o) {
  return (TOUR.banned_beats || []).includes(o.beat);
}

/* ---------- bottom sheet ---------- */
function openSheet(html) {
  $("sheetBody").innerHTML = html;
  $("sheet").hidden = false;
  $("sheetBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  $("sheet").hidden = true;
  $("sheetBackdrop").hidden = true;
  document.body.style.overflow = "";
}
$("sheetClose").addEventListener("click", closeSheet);
$("sheetBackdrop").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function beeSheet(h) {
  const er = elimRound[h.id];
  const status = er == null ? "👑 Queen — tournament finalist" : "🐝 Eliminated in round " + er;
  openSheet(`
    <h3>${er == null ? "👑" : "🐝"} ${esc(h.name)}</h3>
    <div class="smeta">Hunter ${esc(h.id)} · beat: ${esc(h.beat)}</div>
    <div class="srow"><span>Score</span><span>${h.score.toFixed(3)} pts</span></div>
    <div class="srow"><span>Rank</span><span>#${h.rank} of 100</span></div>
    <div class="srow"><span>Fate</span><span>${esc(status)}</span></div>
    <div class="srow"><span>Scoring</span><span>value ÷ effort × urgency × verification rigor<br>(primary ×1.0 · secondary ×0.6)</span></div>`);
}
function queenSheet(c, i) {
  const medals = ["🥇", "🥈", "🥉"];
  openSheet(`
    <h3>👑 ${esc(c.name)} ${medals[i] || ""}</h3>
    <div class="smeta">Queen bee ${esc(c.id)} · champion of the 100-hunter tournament</div>
    <div class="srow"><span>Beat</span><span>${esc(c.beat)}</span></div>
    <div class="srow"><span>Final score</span><span>${c.score.toFixed(3)} pts</span></div>
    <div class="srow"><span>Gauntlet</span><span>Survived the Harvard &amp; Yale rival-hive raids</span></div>
    <div class="srow"><span>Team</span><span>Commands a five-seat crew: Scout, Guard, Comb-builder, Sentinel</span></div>`);
}
function cellSheet(o) {
  const dl = daysLeft(o);
  const banned = isBanned(o);
  const dlTxt = dl === null ? "no deadline" : dl + " days left (" + esc(o.deadline) + ")";
  openSheet(`
    <h3>${banned ? "🔒 " : "🍯 "}${esc(o.title)}</h3>
    <div class="smeta">${esc(o.category)} · ${esc(o.beat)}</div>
    <div class="srow"><span>Value</span><span>${esc(o.value_desc)}</span></div>
    <div class="srow"><span>Deadline</span><span>${esc(dlTxt)}</span></div>
    <div class="srow"><span>Proof needed</span><span>${esc(PROOF_LABEL[o.proof_required] || o.proof_required)}</span></div>
    <div class="srow"><span>Who qualifies</span><span>${esc(o.eligibility)}</span></div>
    <div class="srow"><span>Verification</span><span><span class="vbadge ${esc(o.verification)}">${esc(o.verification)}-source</span> · verified ${esc(o.verified || "?")}</span></div>
    ${banned ? `<div class="srow"><span>Hive rule</span><span>Sealed by hive rule — listed for reference only. Wins no tournament points and holds no honey.</span></div>` : ""}
    <a class="filebtn" href="${esc(o.claim_url)}" target="_blank" rel="noopener">File yourself →</a>`);
}

/* ---------- hero canvas: beehive, comb, foraging bees ---------- */
function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function drawHiveScene(ctx, W, H, t) {
  // warm dark sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1c1005"); g.addColorStop(1, "#120a02");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // faint comb lattice
  ctx.strokeStyle = "rgba(245,163,1,.08)"; ctx.lineWidth = 1;
  const r = 26, dx = r * 1.74, dy = r * 1.5;
  for (let row = -1; row * dy < H + r; row++) {
    for (let col = -1; col * dx < W + r; col++) {
      hexPath(ctx, col * dx + (row % 2 ? dx / 2 : 0), row * dy, r);
      ctx.stroke();
    }
  }
  // skep hive
  const cx = W * 0.5, base = H * 0.92, R = Math.min(W, H) * 0.30;
  ctx.fillStyle = "#7a5210";
  ctx.beginPath(); ctx.arc(cx, base, R, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8f6417";
  ctx.beginPath(); ctx.arc(cx, base, R * 0.94, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(30,18,4,.55)"; ctx.lineWidth = 3;
  for (let i = 1; i <= 4; i++) {
    const y = base - (R * i) / 5;
    const half = Math.sqrt(Math.max(0, R * R - (base - y) * (base - y)));
    ctx.beginPath(); ctx.moveTo(cx - half * 0.94, y); ctx.lineTo(cx + half * 0.94, y); ctx.stroke();
  }
  // entrance
  ctx.fillStyle = "#0d0701";
  ctx.beginPath(); ctx.ellipse(cx, base - 4, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,209,102,.5)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, base - 4, 15, 9, 0, 0, Math.PI * 2); ctx.stroke();

  // foraging bees on bezier paths in/out of the entrance
  const bees = window.__hiveBees || (window.__hiveBees = makeBees(W, H, cx, base - 4));
  for (const b of bees) {
    const tt = (t * b.speed + b.phase) % 2;
    const k = tt < 1 ? tt : 2 - tt; // ping-pong
    const p = qbez(b.p0, b.p1, b.p2, k);
    const p2 = qbez(b.p0, b.p1, b.p2, Math.min(1, k + 0.02));
    const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
    drawBee(ctx, p.x, p.y, ang, t * 40 + b.phase * 10);
  }
}
function makeBees(W, H, ex, ey) {
  const bees = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const edge = i % 4;
    const tx = edge === 0 ? -20 : edge === 1 ? W + 20 : Math.random() * W;
    const ty = edge < 2 ? Math.random() * H * 0.7 : (edge === 2 ? -20 : H + 20);
    bees.push({
      p0: { x: ex, y: ey },
      p1: { x: ex + (Math.random() - 0.5) * W * 0.8, y: ey - Math.random() * H * 0.5 },
      p2: { x: tx, y: ty },
      speed: 0.10 + Math.random() * 0.10,
      phase: Math.random() * 2
    });
  }
  return bees;
}
function qbez(p0, p1, p2, k) {
  const u = 1 - k;
  return { x: u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x,
           y: u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y };
}
function drawBee(ctx, x, y, ang, flap) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  // wings
  ctx.fillStyle = "rgba(255,255,255,.55)";
  const w = Math.abs(Math.sin(flap)) * 4 + 2;
  ctx.beginPath(); ctx.ellipse(0, -4, 5, w, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2, -4, 4, w * 0.8, -0.5, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.fillStyle = "#f5b301";
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3a2408";
  ctx.fillRect(-2, -4.5, 2.5, 9); ctx.fillRect(2, -4.2, 2.2, 8.4);
  ctx.restore();
}
function initHero() {
  const cv = $("hiveCanvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 600, H = 300;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  if (REDUCED) { drawHiveScene(ctx, W, H, 0.35); return; }
  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    drawHiveScene(ctx, W, H, (ts - start) / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- growth strip ---------- */
function renderGrowth() {
  const list = activeOpps();
  const total = list.reduce((s, o) => s + maxDollars(o.value_desc), 0);
  $("honeyTotal").textContent = fmtMoney(total) + " tracked";
  const pct = Math.min(100, (total / 2e9) * 100); // scale: $2B fund value = full comb
  requestAnimationFrame(() => { $("honeyFill").style.width = pct + "%"; });
  const weekAgo = Date.now() - 7 * DAY;
  const fresh = list.filter((o) => o.verified && new Date(o.verified + "T00:00:00") >= weekAgo).length;
  const queens = (TOUR.champions || []).length;
  $("hiveStats").innerHTML = `
    <div class="stat"><b>${list.length}</b><span>verified cells</span></div>
    <div class="stat"><b>100</b><span>hunter bees</span></div>
    <div class="stat"><b>${queens}</b><span>queen bees</span></div>
    <div class="stat"><b>+${fresh}</b><span>new cells this week</span></div>`;
}

/* ---------- queens ---------- */
function renderQueens() {
  const champs = TOUR.champions || [];
  $("queenComb").innerHTML = champs.map((c, i) => `
    <button class="queen ${["first", "second", "third"][i]}" data-q="${i}" aria-label="Queen bee ${esc(c.name)}">
      <div class="qcrown">👑</div><div class="qbee">🐝</div>
      <div class="qid">${esc(c.id)}</div>
      <div class="qname">${esc(c.name)}</div>
      <div class="qbeat">${esc(c.beat)}</div>
      <div class="qscore">${c.score.toFixed(2)} pts</div>
    </button>`).join("");
  $("queenComb").querySelectorAll("[data-q]").forEach((el) => {
    el.addEventListener("click", () => queenSheet(champs[+el.dataset.q], +el.dataset.q));
  });
}

/* ---------- comb rings (bracket) ---------- */
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    pts.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(" ");
}
function renderRings() {
  const rounds = TOUR.rounds || [];
  const svg = $("combRings");
  const cx = 200, cy = 200;
  let html = "";
  rounds.forEach((rd, i) => {
    const R = 168 - i * 26;
    const last = i === rounds.length - 1;
    html += `<g class="ring${rd.round === 6 ? " sel" : ""}" data-r="${rd.round}" tabindex="0" role="button"
      aria-label="Round ${rd.round}: ${rd.survivors.length} survivors">
      <polygon points="${hexPoints(cx, cy, R)}"/>
      <text x="${cx}" y="${cy - R + 22}">R${rd.round}</text>
      ${last ? "" : `<text x="${cx}" y="${cy - R + 36}">${rd.survivors.length} 🐝</text>`}
    </g>`;
  });
  // queen cells at the heart
  [-24, 0, 24].forEach((dx, i) => {
    html += `<g class="ring" data-r="6" aria-hidden="true">
      <polygon points="${hexPoints(cx + dx, cy, 20)}" style="fill:rgba(255,209,102,.25);stroke:var(--gold)"/>
      <text x="${cx + dx}" y="${cy + 6}" style="font-size:14px">👑</text></g>`;
  });
  svg.innerHTML = html;
  const show = (n) => {
    svg.querySelectorAll(".ring").forEach((g) => g.classList.toggle("sel", g.dataset.r == n));
    const rd = rounds.find((r) => r.round === n);
    if (!rd) return;
    const surv = rd.survivors.slice(0, 30).map((id) =>
      `<span class="rchip">${esc(id)} ${esc((hunterById[id] || {}).name || "")}</span>`).join("");
    const more = rd.survivors.length > 30 ? `<span class="rchip">+${rd.survivors.length - 30} more</span>` : "";
    $("roundDetail").innerHTML = `
      <strong>Round ${rd.round}</strong> — ${rd.survivors.length} fly on, ${rd.eliminated.length} fall.<div class="rchips">${surv}${more}</div>`;
  };
  svg.querySelectorAll(".ring[data-r]").forEach((g) => {
    g.addEventListener("click", () => show(+g.dataset.r));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(+g.dataset.r); } });
  });
  show(6);
}
function renderGauntlet() {
  $("gauntlet").innerHTML = ["tier2", "tier3"].map((k) => {
    const t = TOUR[k];
    if (!t) return "";
    const rds = (t.rounds || []).map((r) => r.survivors.length).join(" → ");
    const champs = (t.champions || []).map((c) =>
      `<span class="rchip">👑 ${esc(c.id)} ${esc(c.name)} · ${c.score.toFixed(2)}</span>`).join("");
    const label = k === "tier2" ? "⚔️ Harvard raid — 100 elite rivals" : "⚔️ Yale raid — 100 elites, primary-source-only audit";
    return `<div class="raid"><h4>${esc(label)}</h4>
      <p>${esc(t.name || "")}: ${esc(rds)} bees left standing.</p>
      <div class="rchips">${champs}</div></div>`;
  }).join("");
}

/* ---------- the swarm ---------- */
function renderSwarm() {
  const lb = TOUR.leaderboard || [];
  $("swarmGrid").innerHTML = lb.map((h) => {
    const er = elimRound[h.id];
    const cls = er == null ? "bee queenbee" : er <= 6 ? "bee out" : "bee";
    const face = er == null ? "👑" : "🐝";
    return `<button class="${cls}" data-h="${esc(h.id)}" aria-label="Bee ${esc(h.name)}, ${esc(h.id)}${er == null ? ", queen finalist" : ", eliminated round " + er}">
      ${face}<small>${esc(h.id)}</small></button>`;
  }).join("");
  $("swarmGrid").querySelectorAll("[data-h]").forEach((el) => {
    el.addEventListener("click", () => beeSheet(hunterById[el.dataset.h]));
  });
}

/* ---------- honeycomb ---------- */
function shortTitle(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
function renderFilters() {
  const beats = [...new Set(activeOpps().map((o) => o.beat))].sort();
  $("beatChips").innerHTML = `<button class="chip" data-b="" aria-selected="${!beatFilter}">All beats</button>` +
    beats.map((b) => `<button class="chip" data-b="${esc(b)}" aria-selected="${beatFilter === b}">${esc(b)}</button>`).join("");
  $("beatChips").querySelectorAll("[data-b]").forEach((el) => {
    el.addEventListener("click", () => { beatFilter = el.dataset.b || null; renderFilters(); renderComb(); });
  });
}
function renderComb() {
  const list = activeOpps()
    .filter((o) => !beatFilter || o.beat === beatFilter)
    .sort((a, b) => {
      const da = daysLeft(a), db = daysLeft(b);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  $("honeycomb").innerHTML = list.length ? list.map((o) => {
    const banned = isBanned(o);
    const dl = daysLeft(o);
    if (banned) {
      return `<button class="cell sealed" data-o="${esc(o.id)}" aria-label="Sealed cell: ${esc(o.title)}">
        <div class="wax"></div>
        <div class="cell-inner"><div class="seal">🔒</div>
          <div class="ct">${esc(shortTitle(o.title, 40))}</div>
          <div class="cv">sealed by hive rule</div></div></button>`;
    }
    const tier = valueTier(maxDollars(o.value_desc));
    const dlBadge = dl === null ? "no deadline" : dl + "d";
    return `<button class="cell${dl !== null && dl < 7 ? " urgent" : ""}" data-o="${esc(o.id)}"
        aria-label="Honey cell: ${esc(o.title)}, ${esc(o.value_desc)}, ${esc(dlBadge)} left">
      <div class="wax"></div>
      <div class="honeyfill" style="height:${FILL_PCT[tier]}%"></div>
      <div class="cell-inner">
        <span class="cvbadge ${esc(o.verification)}">${esc(o.verification)}</span>
        <div class="ct">${esc(shortTitle(o.title, 44))}</div>
        <div class="cv">${esc(shortTitle(o.value_desc, 36))}</div>
        <div class="cd${dl !== null && dl < 7 ? " hot" : ""}">${esc(dlBadge)}</div>
      </div></button>`;
  }).join("") : `<div class="empty">No cells match this filter.</div>`;
  $("honeycomb").querySelectorAll("[data-o]").forEach((el) => {
    const o = OPPS.find((x) => x.id === el.dataset.o);
    el.addEventListener("click", () => cellSheet(o));
  });
}

/* ---------- boot ---------- */
async function loadJSON(path, fallback) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw 0;
    return await r.json();
  } catch (e) { return fallback; }
}
function computeElimination() {
  const rounds = TOUR.rounds || [];
  const alive = new Set((rounds[0] || { survivors: [] }).survivors);
  elimRound = {};
  for (const rd of rounds) {
    const surv = new Set(rd.survivors);
    for (const id of [...alive]) {
      if (!surv.has(id) && !(id in elimRound)) elimRound[id] = rd.round;
    }
    for (const id of [...alive]) if (!surv.has(id)) alive.delete(id);
  }
}
async function init() {
  const [tour, opps] = await Promise.all([
    loadJSON("data/tournament.json", null),
    loadJSON("data/opportunities.json", { opportunities: [] }),
  ]);
  TOUR = tour; OPPS = opps.opportunities || [];
  if (!TOUR) {
    $("queenComb").innerHTML = `<div class="empty">Tournament data not loaded yet.</div>`;
    return;
  }
  (TOUR.leaderboard || []).forEach((h) => { hunterById[h.id] = h; });
  computeElimination();
  const rd = TOUR.run_date || (TOUR.generated_at || "");
  $("updatedAt").textContent = "tournament " + String(rd).replace("T", " ").replace("Z", " UTC");
  initHero();
  renderGrowth(); renderQueens(); renderRings(); renderGauntlet();
  renderSwarm(); renderFilters(); renderComb();
}
document.addEventListener("DOMContentLoaded", init);
