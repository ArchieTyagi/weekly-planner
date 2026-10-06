// Weekly Planner: all the screen logic.
// Data calls live in db.js. This file keeps a copy of the week on screen,
// updates it straight away when you click, then saves it in the background.

import * as db from "./db.js";
import { TIME_ZONE } from "./config.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RATE_WORDS = ["Not rated yet", "Rough day", "Below par", "Okay", "Good day", "Fully locked in"];
const STARTER_HABITS = ["Wake up early", "Drink 2L of water", "Gym", "Study", "Reading 10 pages", "Sleep before 12"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ---------- dates ---------- */
// "Today" follows TIME_ZONE so the lock matches the database's rule.
function todayKey() { return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date()); }
function fromKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function keyOf(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function fmt(d) { return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(); }
const today = () => fromKey(todayKey());
const dayKey = (i) => keyOf(addDays(weekStart, i));
const isPast = (i) => dayKey(i) < todayKey();
const isToday = (i) => dayKey(i) === todayKey();
const weekIsPast = () => isPast(6);

/* ---------- state ---------- */
let weekStart = mondayOf(today());
let sel = defaultDay();
let week = emptyWeek();
let habits = [];
let hist = { tasks: [], ratings: [] };
let recView = "week";
let calMonth = new Date(today().getFullYear(), today().getMonth(), 1);
let loadToken = 0;

function emptyWeek() { return { tasks: [[], [], [], [], [], [], []], ratings: [0, 0, 0, 0, 0, 0, 0], checks: new Set(), focus: "" }; }
function defaultDay() { return keyOf(mondayOf(today())) === keyOf(weekStart) ? (today().getDay() + 6) % 7 : 0; }

/* ---------- save status ---------- */
let pending = 0;
function setStatus(text, warn) { const s = $("#status"); s.textContent = text; s.classList.toggle("warn", !!warn); }
// Runs one save. If it fails, `undo` puts the screen back the way it was.
async function save(work, undo) {
  pending++; setStatus("Saving…");
  try { await work(); if (--pending === 0) setStatus("All changes saved"); }
  catch (e) {
    pending--; if (undo) undo(); renderAll();
    const locked = /row-level security|violates/i.test(e.message);
    setStatus(locked ? "That day is locked, so the change wasn't saved." : "Couldn't save: " + e.message, true);
  }
}

/* ---------- charts ---------- */
function pie(done, total, size) {
  const r = size / 2 - 4, c = size / 2, p = total ? done / total : 0;
  let wedge = "";
  if (total && p >= 1) wedge = `<circle cx="${c}" cy="${c}" r="${r}" fill="var(--rose)"/>`;
  else if (p > 0) {
    const a = p * 2 * Math.PI - Math.PI / 2, x = c + r * Math.cos(a), y = c + r * Math.sin(a);
    wedge = `<path d="M${c} ${c} L${c} ${c - r} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y} Z" fill="var(--rose)"/>`;
  }
  return `<circle cx="${c}" cy="${c}" r="${r}" fill="var(--band)"/>${wedge}
    <circle cx="${c}" cy="${c}" r="${r * 0.42}" fill="var(--sheet)"/>
    <text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" fill="var(--ink)" font-family="JetBrains Mono, monospace" font-size="${size / 7.5}" font-weight="500">${total ? pctOf(done, total) + "%" : "–"}</text>`;
}
const pieSvg = (done, total, size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pctOf(done, total)}% done">${pie(done, total, size)}</svg>`;

function renderBar() {
  const W = 360, H = 200, L = 26, B = 24, T = 8, plotH = H - B - T, plotW = W - L - 6;
  const totals = week.tasks.map((t) => t.length), dones = week.tasks.map((t) => t.filter((x) => x.done).length);
  const max = Math.max(4, ...totals), step = max <= 8 ? 2 : Math.ceil(max / 4), top = Math.ceil(max / step) * step;
  const y = (v) => T + plotH - (v / top) * plotH, slot = plotW / 7, bw = slot * 0.58;
  let g = "";
  for (let v = 0; v <= top; v += step) g += `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v)}" text-anchor="end" dominant-baseline="central" font-size="10" fill="var(--muted)" font-family="JetBrains Mono, monospace">${v}</text>`;
  for (let i = 0; i < 7; i++) {
    const x = L + i * slot + (slot - bw) / 2, tip = `<title>${DAYS[i]}: ${dones[i]} of ${totals[i]} done</title>`;
    g += `<rect x="${x}" y="${y(totals[i])}" width="${bw}" height="${y(0) - y(totals[i])}" rx="3" fill="var(--band)">${tip}</rect>`;
    g += `<rect x="${x}" y="${y(dones[i])}" width="${bw}" height="${y(0) - y(dones[i])}" rx="3" fill="var(--rose)">${tip}</rect>`;
    g += `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="11" fill="${i === sel ? "var(--rose-ink)" : "var(--muted)"}" font-weight="${i === sel ? 600 : 400}">${SHORT[i]}</text>`;
  }
  $("#bar").innerHTML = g;
}

function renderOverall() {
  const total = week.tasks.reduce((a, t) => a + t.length, 0), done = week.tasks.reduce((a, t) => a + t.filter((x) => x.done).length, 0);
  $("#pie").innerHTML = pie(done, total, 160);
  $("#overallCount").textContent = `${done} / ${total} completed this week`;
  renderBar();
}

/* ---------- task lists ---------- */
function fillList(ul, i) {
  const items = week.tasks[i], locked = isPast(i);
  ul.dataset.day = i; ul.innerHTML = "";
  if (!items.length) { ul.innerHTML = `<li class="empty">${locked ? "No tasks were planned." : "No tasks yet. Add one below."}</li>`; return; }
  for (const t of items) {
    const li = document.createElement("li");
    li.className = "task" + (t.done ? " done" : ""); li.dataset.id = t.id;
    li.innerHTML = `<input type="checkbox" ${t.done ? "checked" : ""} ${locked ? "disabled" : ""} aria-label="Mark done"><span class="text"></span>${locked ? "<span></span>" : `<button class="del" type="button" aria-label="Delete task">&times;</button>`}`;
    li.querySelector(".text").textContent = t.text;
    if (!locked) li.querySelector(".text").title = "Double-click to edit";
    ul.appendChild(li);
  }
}

function renderSelected() {
  const i = sel, items = week.tasks[i], done = items.filter((x) => x.done).length, locked = isPast(i);
  $("#selName").textContent = (isToday(i) ? "Today · " : "") + DAYS[i];
  $("#selDate").textContent = fmt(addDays(weekStart, i));
  $("#selDone").textContent = done; $("#selTotal").textContent = items.length;
  $("#selPct").textContent = pctOf(done, items.length) + "%"; $("#selFill").style.width = pctOf(done, items.length) + "%";
  fillList($("#selTasks"), i);
  $("#selAdd").hidden = locked; $("#selLockedNote").hidden = !locked; $("#selLock").hidden = !locked;
  renderRating();
}

function renderRating() {
  const i = sel, r = week.ratings[i], locked = isPast(i), box = $("#stars");
  box.classList.toggle("locked", locked); box.innerHTML = "";
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "star" + (n <= r ? " on" : ""); b.textContent = "★";
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", n === r); b.setAttribute("aria-label", n + " star" + (n > 1 ? "s" : ""));
    b.dataset.n = n; b.disabled = locked; box.appendChild(b);
  }
  $("#rateLabel").textContent = `${SHORT[i]}: ${RATE_WORDS[r]}${locked ? " (locked)" : ""}`;
  $("#weekStars").innerHTML = week.ratings.map((v, k) => `<div><div class="s${v ? "" : " none"}">${v ? "★".repeat(v) : "·"}</div>${SHORT[k]}</div>`).join("");
  const rated = week.ratings.filter(Boolean);
  $("#avgRate").innerHTML = rated.length
    ? `Week average <b class="num">${(rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1)}</b> / 5`
    : `<span style="color:var(--muted)">Rate each day out of 5</span>`;
}

function renderDays() {
  const box = $("#days"); box.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const past = isPast(i), items = week.tasks[i], done = items.filter((x) => x.done).length;
    const sec = document.createElement("article");
    sec.className = "day" + (isToday(i) ? " today" : "") + (past ? " past" : "") + (i === sel ? " sel" : ""); sec.dataset.i = i;
    sec.innerHTML = `<button class="dayhead" type="button" data-pick="${i}" aria-label="Open ${DAYS[i]} in daily to-do"><h3>${DAYS[i]}</h3><div class="date num">${fmt(addDays(weekStart, i))}</div><div class="tag">${isToday(i) ? "Today" : past ? "Locked" : "&nbsp;"}</div></button>
      <div class="piebox">${pieSvg(done, items.length, 96)}</div>
      <div class="daybody"><div class="tasks-label"><span>Tasks</span><span class="num">${week.ratings[i] ? "★".repeat(week.ratings[i]) : ""}</span></div>
      <ul class="tasks"></ul>
      ${past ? `<div class="lockednote">Locked</div>` : `<form class="add"><input id="add-${i}" placeholder="Add a task" maxlength="200" aria-label="Add a task for ${DAYS[i]}"><button type="button" aria-label="Add">+</button></form>`}
      <div class="dayfoot"><span class="num">Done ${done}</span><span class="num">Left ${items.length - done}</span></div></div>`;
    fillList(sec.querySelector("ul.tasks"), i);
    box.appendChild(sec);
  }
}

function renderHabits() {
  const t = $("#habitTable");
  let h = `<thead><tr><th>Habit</th>${SHORT.map((s) => `<th>${s}</th>`).join("")}<th>Progress</th></tr></thead><tbody>`;
  if (!habits.length) h += `<tr><td colspan="9" class="empty">No habits yet. Add one above.</td></tr>`;
  for (const hb of habits) {
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((c) => week.checks.has(hb.id + "|" + dayKey(c)));
    const p = pctOf(ticks.filter(Boolean).length, 7);
    h += `<tr data-id="${hb.id}"><td class="name">${esc(hb.name)}<button class="rm" type="button" aria-label="Remove habit">&times;</button></td>` +
      ticks.map((v, c) => `<td><input type="checkbox" class="hbox" data-c="${c}" ${v ? "checked" : ""} ${isPast(c) ? "disabled" : ""} aria-label="${esc(hb.name)} on ${SHORT[c]}"></td>`).join("") +
      `<td><div class="hbar"><div class="trk"><div class="fill" style="width:${p}%"></div></div><span class="pct num">${p}%</span></div></td></tr>`;
  }
  t.innerHTML = h + "</tbody>";
}

/* ---------- records ---------- */
// One entry per day: saved history, with the week on screen laid over it.
function dailyRecords() {
  const out = {}, from = dayKey(0), to = dayKey(6);
  const get = (k) => (out[k] ||= { done: 0, total: 0, rating: 0 });
  for (const t of hist.tasks) if (t.day < from || t.day > to) { const r = get(t.day); r.total++; if (t.done) r.done++; }
  for (const r of hist.ratings) if (r.day < from || r.day > to) get(r.day).rating = r.rating;
  for (let i = 0; i < 7; i++) {
    const k = dayKey(i), items = week.tasks[i];
    if (items.length || week.ratings[i]) { const r = get(k); r.total = items.length; r.done = items.filter((x) => x.done).length; r.rating = week.ratings[i]; }
  }
  return out;
}
function agg(rows) {
  const done = rows.reduce((a, r) => a + r.done, 0), total = rows.reduce((a, r) => a + r.total, 0), rated = rows.filter((r) => r.rating);
  return { done, total, pct: pctOf(done, total), avg: rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0, active: rows.filter((r) => r.total).length };
}
function heat(r) {
  if (!r || !r.total) return "var(--track)";
  const p = r.done / r.total;
  return p >= 1 ? "var(--rose)" : p >= 0.6 ? "color-mix(in srgb,var(--rose) 60%,var(--track))" : p > 0 ? "color-mix(in srgb,var(--rose) 30%,var(--track))" : "color-mix(in srgb,var(--band-strong) 40%,var(--track))";
}

function renderRecords() {
  const daily = dailyRecords(), tk = todayKey(), now = today();
  const all = agg(Object.values(daily));
  let streak = 0, cur = now; if (!daily[keyOf(cur)]?.done) cur = addDays(cur, -1);
  while (daily[keyOf(cur)]?.done) { streak++; cur = addDays(cur, -1); }
  let best = null;
  for (const [k, r] of Object.entries(daily)) if (r.done && (!best || r.done > best.r.done)) best = { k, r };
  const mk = keyOf(calMonth).slice(0, 7), m = agg(Object.entries(daily).filter(([k]) => k.startsWith(mk)).map(([, r]) => r));
  $("#stats").innerHTML = [
    ["Tasks done (all time)", all.done, `of ${all.total} planned · ${all.pct}%`],
    ["Current streak", streak + " day" + (streak === 1 ? "" : "s"), "days in a row with a task done"],
    [MONTHS[calMonth.getMonth()] + " completion", m.pct + "%", `${m.done} of ${m.total} tasks`],
    ["Avg productivity", all.avg ? all.avg.toFixed(1) + " ★" : "–", "across rated days"],
    ["Best day", best ? best.r.done + " done" : "–", best ? fmt(fromKey(best.k)) : "no tasks done yet"],
  ].map(([k, v, s]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join("");

  const periods = [];
  if (recView === "week") {
    const thisMon = mondayOf(now);
    for (let n = 11; n >= 0; n--) {
      const s0 = addDays(thisMon, -7 * n), rows = []; let bd = -1, bv = 0;
      for (let i = 0; i < 7; i++) { const r = daily[keyOf(addDays(s0, i))]; if (r) { rows.push(r); if (r.done > bv) { bv = r.done; bd = i; } } }
      periods.push({ label: `${String(s0.getDate()).padStart(2, "0")} ${MONTHS[s0.getMonth()]}`, full: `Week of ${fmt(s0)}`, ...agg(rows), best: bd >= 0 ? SHORT[bd] : "–", cur: n === 0 });
    }
  } else {
    for (let n = 11; n >= 0; n--) {
      const d = new Date(now.getFullYear(), now.getMonth() - n, 1), k = keyOf(d).slice(0, 7);
      periods.push({ label: MONTHS[d.getMonth()], full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, ...agg(Object.entries(daily).filter(([dk]) => dk.startsWith(k)).map(([, r]) => r)), cur: n === 0 });
    }
  }

  const W = 520, H = 220, L = 34, B = 28, T = 16, plotH = H - B - T, plotW = W - L - 8, slot = plotW / periods.length, bw = slot * 0.6, y = (v) => T + plotH - (v / 100) * plotH;
  let g = "";
  for (const v of [0, 25, 50, 75, 100]) g += `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="central" font-size="10" fill="var(--muted)" font-family="JetBrains Mono, monospace">${v}%</text>`;
  periods.forEach((p, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    if (p.total) {
      g += `<rect x="${x}" y="${y(p.pct)}" width="${bw}" height="${y(0) - y(p.pct)}" rx="3" fill="${p.cur ? "var(--rose)" : "color-mix(in srgb,var(--rose) 55%,var(--band))"}"><title>${p.full}: ${p.done} of ${p.total} done (${p.pct}%)</title></rect>`;
      g += `<text x="${x + bw / 2}" y="${y(p.pct) - 5}" text-anchor="middle" font-size="9.5" fill="var(--ink)" font-family="JetBrains Mono, monospace">${p.pct}</text>`;
    } else g += `<rect x="${x}" y="${y(0) - 2}" width="${bw}" height="2" fill="var(--line)"><title>${p.full}: nothing planned</title></rect>`;
    g += `<text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle" font-size="9.5" fill="${p.cur ? "var(--rose-ink)" : "var(--muted)"}" font-weight="${p.cur ? 600 : 400}">${p.label}</text>`;
  });
  $("#trend").innerHTML = `<text x="${L}" y="10" font-size="11" fill="var(--muted)">${recView === "week" ? "Last 12 weeks" : "Last 12 months"} · % of planned tasks done</text>` + g;

  const rows = periods.slice().reverse().filter((p) => p.total || p.avg), wk = recView === "week";
  $("#recTable").innerHTML = `<thead><tr><th>${wk ? "Week" : "Month"}</th><th>Done</th><th>Planned</th><th>Progress</th><th>Avg rating</th><th>Active days</th>${wk ? "<th>Best day</th>" : ""}</tr></thead><tbody>` +
    (rows.length ? rows.map((p) => `<tr><td>${p.full}${p.cur ? " (now)" : ""}</td><td class="num">${p.done}</td><td class="num">${p.total}</td><td><span class="mini"><span style="width:${p.pct}%"></span></span><span class="num">${p.pct}%</span></td><td class="num">${p.avg ? p.avg.toFixed(1) + " ★" : "–"}</td><td class="num">${p.active}</td>${wk ? `<td>${p.best}</td>` : ""}</tr>`).join("")
      : `<tr><td colspan="7" class="empty">Records appear here as you plan and finish tasks.</td></tr>`) + `</tbody>`;

  $("#calTitle").textContent = `${MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  const first = (calMonth.getDay() + 6) % 7, days = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  let c = SHORT.map((d) => `<div class="dow">${d[0]}</div>`).join("");
  for (let i = 0; i < first; i++) c += `<div class="cell blank"></div>`;
  for (let d = 1; d <= days; d++) {
    const k = keyOf(new Date(calMonth.getFullYear(), calMonth.getMonth(), d)), r = daily[k];
    const tip = r && r.total ? `${r.done}/${r.total} done` + (r.rating ? `, ${r.rating}★` : "") : "Nothing planned";
    c += `<div class="cell${k === tk ? " today" : ""}" style="background:${heat(r)}" title="${d} ${MONTHS[calMonth.getMonth()]}: ${tip}">${d}${r?.rating ? `<span class="r">${"★".repeat(Math.min(r.rating, 3))}</span>` : ""}</div>`;
  }
  $("#calGrid").innerHTML = c;
}

function renderAll() {
  $("#range").textContent = `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}`;
  const f = $("#focus"); f.disabled = weekIsPast(); if (document.activeElement !== f) f.value = week.focus;
  renderSelected(); renderOverall(); renderDays(); renderHabits(); renderRecords();
}
function refresh() { renderSelected(); renderOverall(); renderDays(); renderRecords(); }

/* ---------- loading ---------- */
async function loadWeek() {
  const token = ++loadToken;
  week = emptyWeek(); renderAll(); setStatus("Loading…");
  try {
    const [data, h] = await Promise.all([db.loadWeek(dayKey(0), dayKey(6)), db.loadHistory()]);
    if (token !== loadToken) return;
    const w = emptyWeek();
    for (const t of data.tasks) { const i = Math.round((fromKey(t.day) - weekStart) / 864e5); if (i >= 0 && i < 7) w.tasks[i].push(t); }
    for (const r of data.ratings) { const i = Math.round((fromKey(r.day) - weekStart) / 864e5); if (i >= 0 && i < 7) w.ratings[i] = r.rating; }
    for (const c of data.checks) w.checks.add(c.habit_id + "|" + c.day);
    w.focus = data.focus;
    week = w; hist = h; renderAll(); setStatus("All changes saved");
  } catch (e) { if (token === loadToken) setStatus("Couldn't load: " + e.message, true); }
}

/* ---------- actions ---------- */
function dayOf(el) { return +el.closest("[data-day]").dataset.day; }

function addTaskFrom(form) {
  const i = form.id === "selAdd" ? sel : +form.closest(".day").dataset.i;
  if (isPast(i)) return;
  const input = form.querySelector("input"), text = input.value.trim();
  if (!text) return;
  const item = { id: "tmp-" + Math.random().toString(36).slice(2), text, done: false, position: week.tasks[i].length };
  week.tasks[i].push(item); input.value = ""; refresh();
  (form.id === "selAdd" ? $("#selInput") : document.getElementById("add-" + i))?.focus();
  save(async () => { const row = await db.addTask(dayKey(i), text, item.position); item.id = row.id; refresh(); },
    () => { week.tasks[i] = week.tasks[i].filter((x) => x !== item); });
}

function findTask(li) { const i = dayOf(li); return { i, t: week.tasks[i].find((x) => x.id === li.dataset.id) }; }

for (const root of [$(".todo"), $("#days")]) {
  root.addEventListener("submit", (e) => e.preventDefault());
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && e.target.matches(".add input")) { e.preventDefault(); addTaskFrom(e.target.closest(".add")); } });
  root.addEventListener("click", (e) => {
    if (e.target.closest(".add button")) { addTaskFrom(e.target.closest(".add")); return; }
    const pick = e.target.closest("[data-pick]");
    if (pick) { sel = +pick.dataset.pick; refresh(); $(".todo").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
    if (e.target.classList.contains("del")) {
      const { i, t } = findTask(e.target.closest(".task")); if (!t || isPast(i) || t.id.startsWith("tmp-")) return;
      const at = week.tasks[i].indexOf(t); week.tasks[i].splice(at, 1); refresh();
      save(() => db.deleteTask(t.id), () => week.tasks[i].splice(at, 0, t));
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    const { i, t } = findTask(e.target.closest(".task"));
    if (!t || isPast(i) || t.id.startsWith("tmp-")) { e.target.checked = !e.target.checked; return; }
    t.done = e.target.checked; refresh();
    save(() => db.updateTask(t.id, { done: t.done }), () => { t.done = !t.done; });
  });
  root.addEventListener("dblclick", (e) => {
    const span = e.target.closest(".task .text"); if (!span) return;
    const { i, t } = findTask(span.closest(".task")); if (!t || isPast(i) || t.id.startsWith("tmp-")) return;
    const input = document.createElement("input"); input.className = "edit"; input.value = t.text;
    span.replaceWith(input); input.focus(); input.select();
    let finished = false;
    const finish = (keep) => {
      if (finished) return; finished = true;
      const v = input.value.trim(), old = t.text;
      if (keep && v && v !== old) { t.text = v; save(() => db.updateTask(t.id, { text: v }), () => { t.text = old; }); }
      refresh();
    };
    input.addEventListener("keydown", (k) => { if (k.key === "Enter") finish(true); if (k.key === "Escape") finish(false); });
    input.addEventListener("blur", () => finish(true));
  });
}

$("#stars").addEventListener("click", (e) => {
  const b = e.target.closest(".star"); if (!b || isPast(sel)) return;
  const i = sel, old = week.ratings[i], n = +b.dataset.n;
  week.ratings[i] = old === n ? 0 : n; renderRating(); renderDays(); renderRecords();
  save(() => db.setRating(dayKey(i), week.ratings[i]), () => { week.ratings[i] = old; });
});

let focusTimer;
$("#focus").addEventListener("input", (e) => {
  if (weekIsPast()) return;
  week.focus = e.target.value; clearTimeout(focusTimer); setStatus("Saving…");
  const ws = dayKey(0), text = week.focus;
  focusTimer = setTimeout(() => save(() => db.setFocus(ws, text)), 700);
});

$("#habitTable").addEventListener("change", (e) => {
  if (!e.target.classList.contains("hbox")) return;
  const c = +e.target.dataset.c; if (isPast(c)) { e.target.checked = !e.target.checked; return; }
  const id = e.target.closest("tr").dataset.id, k = id + "|" + dayKey(c), on = e.target.checked;
  on ? week.checks.add(k) : week.checks.delete(k); renderHabits();
  save(() => db.setHabitCheck(id, dayKey(c), on), () => { on ? week.checks.delete(k) : week.checks.add(k); });
});
$("#habitTable").addEventListener("click", (e) => {
  if (!e.target.classList.contains("rm")) return;
  const id = e.target.closest("tr").dataset.id, at = habits.findIndex((h) => h.id === id), hb = habits[at];
  habits.splice(at, 1); renderHabits();
  save(() => db.archiveHabit(id), () => habits.splice(at, 0, hb));
});
$("#addHabit").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#habitName").value.trim(); if (!name) return;
  $("#habitName").value = "";
  save(async () => { habits.push(await db.addHabit(name, habits.length)); renderHabits(); });
});

$("#prev").onclick = () => { weekStart = addDays(weekStart, -7); sel = defaultDay(); loadWeek(); };
$("#next").onclick = () => { weekStart = addDays(weekStart, 7); sel = defaultDay(); loadWeek(); };
$("#today").onclick = () => { weekStart = mondayOf(today()); sel = defaultDay(); loadWeek(); };
document.querySelector(".seg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]"); if (!b) return;
  recView = b.dataset.view;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  renderRecords();
});
$("#calPrev").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderRecords(); };
$("#calNext").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderRecords(); };

// Past midnight with the page open: lock yesterday, and if you were on
// the current week, follow today into the new week.
let lastDay = todayKey();
setInterval(() => {
  const k = todayKey(); if (k === lastDay) return;
  const wasOnCurrentWeek = keyOf(weekStart) === keyOf(mondayOf(fromKey(lastDay)));
  lastDay = k;
  if (wasOnCurrentWeek && keyOf(weekStart) !== keyOf(mondayOf(today()))) { weekStart = mondayOf(today()); sel = defaultDay(); loadWeek(); return; }
  sel = defaultDay(); renderAll();
}, 60000);

/* ---------- sign in ---------- */
$("#googleBtn").onclick = async () => {
  $("#signinErr").textContent = "";
  try { await db.signInWithGoogle(); } catch (e) { $("#signinErr").textContent = "Couldn't start Google sign-in: " + e.message; }
};
$("#signOut").onclick = () => db.signOut();

let started = false;
async function showFor(user) {
  $("#signin").hidden = !!user; $("#app").hidden = !user;
  if (!user) { started = false; return; }
  if (started) return; started = true;
  try {
    habits = await db.loadHabits();
    if (!habits.length) {   // first visit: add a starter list you can edit
      for (const [n, name] of STARTER_HABITS.entries()) habits.push(await db.addHabit(name, n));
    }
  } catch (e) { setStatus("Couldn't load habits: " + e.message, true); }
  weekStart = mondayOf(today()); sel = defaultDay();
  await loadWeek();
}
db.onAuthChange(showFor);
showFor(await db.getUser());
