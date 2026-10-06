-- Weekly Planner database
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Every table has a user_id, and row level security makes sure each person
-- only ever sees and changes their own rows.
-- One row per thing (one task, one rating, one habit tick) keeps the data
-- easy to query, chart and feed into ML later.

-- The planner's "today". Days before this are locked.
-- Change the time zone here if you move.
create or replace function public.planner_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------- tables ----------

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day           date not null,
  text          text not null check (char_length(text) between 1 and 200),
  done          boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists tasks_user_day on public.tasks (user_id, day);

create table if not exists public.day_ratings (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  rating      smallint not null check (rating between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  position    integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists habits_user on public.habits (user_id);

create table if not exists public.habit_checks (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists habit_checks_user_day on public.habit_checks (user_id, day);

create table if not exists public.week_notes (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null,          -- always a Monday
  focus       text not null default '' check (char_length(focus) <= 2000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Fill completed_at automatically when a task is ticked or unticked.
create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.done and (old is null or not old.done) then
    new.completed_at := now();
  elsif not new.done then
    new.completed_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists tasks_completed_at on public.tasks;
create trigger tasks_completed_at
  before insert or update on public.tasks
  for each row execute function public.tasks_set_completed_at();

-- ---------- security: own rows only, past days read-only ----------

alter table public.tasks        enable row level security;
alter table public.day_ratings  enable row level security;
alter table public.habits       enable row level security;
alter table public.habit_checks enable row level security;
alter table public.week_notes   enable row level security;

-- tasks
drop policy if exists "tasks read own"   on public.tasks;
drop policy if exists "tasks add"        on public.tasks;
drop policy if exists "tasks change"     on public.tasks;
drop policy if exists "tasks remove"     on public.tasks;
create policy "tasks read own" on public.tasks for select
  using (user_id = auth.uid());
create policy "tasks add" on public.tasks for insert
  with check (user_id = auth.uid() and day >= public.planner_today());
create policy "tasks change" on public.tasks for update
  using (user_id = auth.uid() and day >= public.planner_today())
  with check (user_id = auth.uid() and day >= public.planner_today());
create policy "tasks remove" on public.tasks for delete
  using (user_id = auth.uid() and day >= public.planner_today());

-- ratings
drop policy if exists "ratings read own" on public.day_ratings;
drop policy if exists "ratings add"      on public.day_ratings;
drop policy if exists "ratings change"   on public.day_ratings;
drop policy if exists "ratings remove"   on public.day_ratings;
create policy "ratings read own" on public.day_ratings for select
  using (user_id = auth.uid());
create policy "ratings add" on public.day_ratings for insert
  with check (user_id = auth.uid() and day >= public.planner_today());
create policy "ratings change" on public.day_ratings for update
  using (user_id = auth.uid() and day >= public.planner_today())
  with check (user_id = auth.uid() and day >= public.planner_today());
create policy "ratings remove" on public.day_ratings for delete
  using (user_id = auth.uid() and day >= public.planner_today());

-- habits (the list itself can always be edited; old ticks stay locked)
drop policy if exists "habits own" on public.habits;
create policy "habits own" on public.habits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- habit ticks
drop policy if exists "checks read own" on public.habit_checks;
drop policy if exists "checks add"      on public.habit_checks;
drop policy if exists "checks remove"   on public.habit_checks;
create policy "checks read own" on public.habit_checks for select
  using (user_id = auth.uid());
create policy "checks add" on public.habit_checks for insert
  with check (
    user_id = auth.uid()
    and day >= public.planner_today()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
create policy "checks remove" on public.habit_checks for delete
  using (user_id = auth.uid() and day >= public.planner_today());

-- weekly focus (editable until the week's Sunday has passed)
drop policy if exists "notes read own" on public.week_notes;
drop policy if exists "notes add"      on public.week_notes;
drop policy if exists "notes change"   on public.week_notes;
create policy "notes read own" on public.week_notes for select
  using (user_id = auth.uid());
create policy "notes add" on public.week_notes for insert
  with check (user_id = auth.uid() and week_start + 6 >= public.planner_today());
create policy "notes change" on public.week_notes for update
  using (user_id = auth.uid() and week_start + 6 >= public.planner_today())
  with check (user_id = auth.uid() and week_start + 6 >= public.planner_today());

-- ---------- a ready-made view for charts and ML ----------
-- One row per day you used the planner: tasks planned, done, rating, habits ticked.
create or replace view public.daily_summary
with (security_invoker = true) as
with t as (
  select user_id, day, count(*) as planned, count(*) filter (where done) as done
  from public.tasks group by user_id, day
),
h as (
  select user_id, day, count(*) as habits_done
  from public.habit_checks group by user_id, day
),
days as (
  select user_id, day from t
  union select user_id, day from public.day_ratings
  union select user_id, day from h
)
select
  d.user_id,
  d.day,
  coalesce(t.planned, 0)      as tasks_planned,
  coalesce(t.done, 0)         as tasks_done,
  case when coalesce(t.planned, 0) = 0 then null
       else round(100.0 * t.done / t.planned, 1) end as pct_done,
  r.rating,
  coalesce(h.habits_done, 0)  as habits_done
from days d
left join t on t.user_id = d.user_id and t.day = d.day
left join public.day_ratings r on r.user_id = d.user_id and r.day = d.day
left join h on h.user_id = d.user_id and h.day = d.day;
