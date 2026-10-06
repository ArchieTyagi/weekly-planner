// Everything that talks to Supabase lives in this file.
// app.js only calls these functions, so swapping or extending the backend
// (for example adding an AI endpoint later) stays in one place.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Throws a readable error when Supabase returns one.
function check({ data, error }) {
  if (error) {
    const e = new Error(error.message || "Something went wrong");
    e.code = error.code;
    throw e;
  }
  return data;
}

/* ---------- sign in ---------- */

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
}

export async function signInWithGoogle() {
  check(await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  }));
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ---------- one week ---------- */

// from/to are "YYYY-MM-DD" strings (Monday and Sunday).
export async function loadWeek(from, to) {
  const [tasks, ratings, checks, note] = await Promise.all([
    supabase.from("tasks").select("id, day, text, done, position")
      .gte("day", from).lte("day", to)
      .order("position").order("created_at"),
    supabase.from("day_ratings").select("day, rating").gte("day", from).lte("day", to),
    supabase.from("habit_checks").select("habit_id, day").gte("day", from).lte("day", to),
    supabase.from("week_notes").select("focus").eq("week_start", from).maybeSingle(),
  ]);
  return {
    tasks: check(tasks),
    ratings: check(ratings),
    checks: check(checks),
    focus: check(note)?.focus ?? "",
  };
}

/* ---------- tasks ---------- */

export async function addTask(day, text, position) {
  return check(await supabase.from("tasks")
    .insert({ day, text, position })
    .select("id, day, text, done, position").single());
}

export async function updateTask(id, changes) {
  check(await supabase.from("tasks").update(changes).eq("id", id));
}

export async function deleteTask(id) {
  check(await supabase.from("tasks").delete().eq("id", id));
}

/* ---------- ratings and weekly focus ---------- */

export async function setRating(day, rating) {
  if (!rating) {
    check(await supabase.from("day_ratings").delete().eq("day", day));
  } else {
    check(await supabase.from("day_ratings")
      .upsert({ day, rating, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" }));
  }
}

export async function setFocus(weekStart, focus) {
  check(await supabase.from("week_notes")
    .upsert({ week_start: weekStart, focus, updated_at: new Date().toISOString() }, { onConflict: "user_id,week_start" }));
}

/* ---------- habits ---------- */

export async function loadHabits() {
  return check(await supabase.from("habits")
    .select("id, name, position").eq("archived", false)
    .order("position").order("created_at"));
}

export async function addHabit(name, position) {
  return check(await supabase.from("habits")
    .insert({ name, position }).select("id, name, position").single());
}

// Removing a habit hides it but keeps its old ticks for your records.
export async function archiveHabit(id) {
  check(await supabase.from("habits").update({ archived: true }).eq("id", id));
}

export async function setHabitCheck(habitId, day, on) {
  if (on) check(await supabase.from("habit_checks").insert({ habit_id: habitId, day }));
  else check(await supabase.from("habit_checks").delete().eq("habit_id", habitId).eq("day", day));
}

/* ---------- history for records and charts ---------- */

// Reads in pages of 1000 rows so years of data still load.
async function readAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await supabase.from(table).select(columns).order("day").range(from, from + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function loadHistory() {
  const [tasks, ratings] = await Promise.all([
    readAll("tasks", "day, done"),
    readAll("day_ratings", "day, rating"),
  ]);
  return { tasks, ratings };
}
