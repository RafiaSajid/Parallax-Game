-- PARALLAX schema. Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run: tables/functions use IF NOT EXISTS / OR REPLACE, seeds use ON CONFLICT.
-- No passwords are stored here: Supabase Auth (auth.users) owns credentials.

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 2 and 32 and display_name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table if not exists public.player_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sound_enabled boolean not null default true,
  camera_mode text not null default 'overview' check (camera_mode in ('overview', 'follow')),
  volume smallint not null default 70 check (volume between 0 and 100),
  quality text not null default 'medium' check (quality in ('low','medium','high')),
  reduced_motion boolean not null default false,
  invert_controls boolean not null default false
);

alter table public.player_settings add column if not exists sound_enabled boolean not null default true;
alter table public.player_settings add column if not exists camera_mode text not null default 'overview' check (camera_mode in ('overview', 'follow'));

-- Reference data (read-only for players)
create table if not exists public.levels (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null,
  description text not null default '',
  sort_order int not null unique,
  par_time_ms int not null check (par_time_ms > 0),
  par_moves int not null check (par_moves > 0),
  min_moves int not null default 1 check (min_moves > 0) -- fewest actions possible (verified by tools/solve-level.mjs); fewer is rejected as implausible
);
alter table public.levels add column if not exists min_moves int not null default 1 check (min_moves > 0);

create table if not exists public.achievements (
  id text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  name text not null,
  description text not null,
  sort_order int not null unique
);

create table if not exists public.player_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  level_id text not null references public.levels(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  attempts int not null default 1 check (attempts >= 1),
  best_time_ms int check (best_time_ms > 0),
  best_moves int check (best_moves > 0),
  best_stars smallint check (best_stars between 1 and 3),
  first_completed_at timestamptz,
  last_played_at timestamptz not null default now(),
  primary key (user_id, level_id)
);

-- Upgrade path for databases created before stars existed (no-op on a fresh install).
alter table public.player_progress add column if not exists best_stars smallint check (best_stars between 1 and 3);

create table if not exists public.level_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  level_id text not null references public.levels(id) on delete cascade,
  time_ms int not null check (time_ms > 0),
  moves int not null check (moves > 0),
  completed_at timestamptz not null default now(),
  run_id uuid -- one id per completed run: makes saving idempotent (retries/double submits cannot duplicate)
);
alter table public.level_results add column if not exists run_id uuid;
create unique index if not exists level_results_run_uidx on public.level_results (user_id, run_id);
create index if not exists level_results_user_idx on public.level_results (user_id, completed_at desc);
create index if not exists level_results_level_idx on public.level_results (level_id);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- The player's customised cylinder: a small painted PNG (data URL) wrapped around the body, plus a colour for the top and bottom.
-- Players can READ their own row. They can only WRITE through save_avatar() below, which keeps validation in the database.
create table if not exists public.player_avatar (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skin_png text check (skin_png is null or (skin_png ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*=*$' and length(skin_png) <= 150000)),
  cap_color text not null default '#FF8FC2' check (cap_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

-- ---------- Privileges: start from zero, grant only what the app needs ----------
revoke all on public.player_avatar from anon, authenticated;
revoke all on public.profiles, public.player_settings, public.levels, public.achievements,
  public.player_progress, public.level_results, public.user_achievements from anon, authenticated;

grant select on public.profiles, public.player_settings, public.levels, public.achievements,
  public.player_progress, public.level_results, public.user_achievements to authenticated;
grant select on public.player_avatar to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (sound_enabled, camera_mode, volume, quality, reduced_motion, invert_controls) on public.player_settings to authenticated;
-- No INSERT/DELETE for players anywhere. Progress, results and achievements change only via the RPCs below.

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.player_settings enable row level security;
alter table public.levels enable row level security;
alter table public.achievements enable row level security;
alter table public.player_progress enable row level security;
alter table public.level_results enable row level security;
alter table public.user_achievements enable row level security;
alter table public.player_avatar enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists settings_select_own on public.player_settings;
create policy settings_select_own on public.player_settings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists settings_update_own on public.player_settings;
create policy settings_update_own on public.player_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists progress_select_own on public.player_progress;
create policy progress_select_own on public.player_progress for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists results_select_own on public.level_results;
create policy results_select_own on public.level_results for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists user_ach_select_own on public.user_achievements;
create policy user_ach_select_own on public.user_achievements for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists avatar_select_own on public.player_avatar;
create policy avatar_select_own on public.player_avatar for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists levels_read on public.levels;
create policy levels_read on public.levels for select to authenticated using (true);
drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements for select to authenticated using (true);

-- ---------- New-user trigger: creates profile + settings ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n text;
begin
  n := left(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), 32);
  if char_length(n) < 2 or n ~ '[[:cntrl:]]' then
    n := 'Player' || substr(md5(random()::text), 1, 4);
  end if;
  insert into public.profiles (id, display_name) values (new.id, n);
  insert into public.player_settings (user_id) values (new.id);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC: start a level (marks in progress, counts attempt) ----------
create or replace function public.start_level(p_level_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.levels where id = p_level_id) then
    raise exception 'unknown level' using errcode = '22023';
  end if;
  insert into public.player_progress (user_id, level_id) values (uid, p_level_id)
  on conflict (user_id, level_id) do update
    set attempts = public.player_progress.attempts + 1, last_played_at = now();
end $$;

-- ---------- RPC: submit a completed run ----------
-- Validates, saves ONE result per run id, updates bests and stars, awards achievements.
-- Stars: 1 for finishing, +1 at or under par moves, +1 at or under par time.
-- HONESTY NOTE: this is a browser-only single-player game. The browser reports the result, so a determined user can send
-- made-up numbers. The checks below only reject impossible results. Results are NOT independently verified; do not use them
-- for a competitive leaderboard.
drop function if exists public.submit_level_result(text, int, int);
create or replace function public.submit_level_result(p_level_id text, p_time_ms int, p_moves int, p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lvl public.levels%rowtype;
  v_stars int := 1;
  v_codes text[] := array['first_steps'];
  v_code text;
  v_new jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_run_id is null then raise exception 'missing run id' using errcode = '22023'; end if;
  select * into v_lvl from public.levels where id = p_level_id;
  if not found then raise exception 'unknown level' using errcode = '22023'; end if;
  if p_moves is null or p_moves < v_lvl.min_moves or p_moves > 100000
     or p_time_ms is null or p_time_ms < greatest(1000, (v_lvl.min_moves - 1) * 150) or p_time_ms > 86400000 then
    raise exception 'implausible result' using errcode = '22023';
  end if;

  if p_time_ms <= v_lvl.par_time_ms then v_stars := v_stars + 1; v_codes := array_append(v_codes, 'speed_runner'); end if;
  if p_moves <= v_lvl.par_moves then v_stars := v_stars + 1; v_codes := array_append(v_codes, 'efficient'); end if;
  if v_stars = 3 then v_codes := array_append(v_codes, 'three_stars'); end if;

  -- Duplicate submission of the same run (double click, retry after a timeout): change nothing and say so.
  insert into public.level_results (user_id, level_id, time_ms, moves, run_id)
  values (v_uid, p_level_id, p_time_ms, p_moves, p_run_id)
  on conflict (user_id, run_id) do nothing;
  if not found then
    return jsonb_build_object('new_achievements', '[]'::jsonb, 'stars', v_stars, 'duplicate', true);
  end if;

  insert into public.player_progress as pp
    (user_id, level_id, status, attempts, best_time_ms, best_moves, best_stars, first_completed_at, last_played_at)
  values (v_uid, p_level_id, 'completed', 1, p_time_ms, p_moves, v_stars, now(), now())
  on conflict (user_id, level_id) do update set
    status = 'completed',
    best_time_ms = least(coalesce(pp.best_time_ms, excluded.best_time_ms), excluded.best_time_ms),
    best_moves = least(coalesce(pp.best_moves, excluded.best_moves), excluded.best_moves),
    best_stars = greatest(coalesce(pp.best_stars, 0), excluded.best_stars),
    first_completed_at = coalesce(pp.first_completed_at, now()),
    last_played_at = now();

  -- One award per user and achievement (primary key). FOUND is true only when a NEW award row was inserted.
  foreach v_code in array v_codes loop
    insert into public.user_achievements (user_id, achievement_id) values (v_uid, v_code)
    on conflict (user_id, achievement_id) do nothing;
    if found then v_new := v_new || to_jsonb(v_code); end if;
  end loop;

  return jsonb_build_object('new_achievements', v_new, 'stars', v_stars, 'duplicate', false);
end $$;

revoke execute on function public.start_level(text), public.submit_level_result(text, int, int, uuid) from public, anon;
grant execute on function public.start_level(text), public.submit_level_result(text, int, int, uuid) to authenticated;

-- ---------- RPC: save the player's painted cylinder ----------
-- Column checks on player_avatar validate the PNG data URL (prefix, characters, max size) and the colour.
create or replace function public.save_avatar(p_skin_png text, p_cap_color text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.player_avatar as pa (user_id, skin_png, cap_color)
  values (v_uid, p_skin_png, p_cap_color)
  on conflict (user_id) do update set skin_png = excluded.skin_png, cap_color = excluded.cap_color, updated_at = now();
end $$;
revoke execute on function public.save_avatar(text, text) from public, anon;
grant execute on function public.save_avatar(text, text) to authenticated;

-- ---------- Seed data (re-running this file updates names, descriptions and par values) ----------
insert into public.levels (id, name, description, sort_order, par_time_ms, par_moves, min_moves) values
  ('level-01', 'The First Room', 'Rest a cube on the plate with its amber face up, then slide another cube into the portal.', 1, 120000, 20, 16),
  ('level-02', 'Twin Plates', 'Two plates must glow at the same time. Keep both lit, then send the third cube through.', 2, 180000, 27, 22),
  ('level-03', 'Crossroads', 'Narrow corridors and two plates. Plan the order of your moves.', 3, 240000, 32, 26)
on conflict (id) do update set name = excluded.name, description = excluded.description,
  sort_order = excluded.sort_order, par_time_ms = excluded.par_time_ms, par_moves = excluded.par_moves, min_moves = excluded.min_moves;

insert into public.achievements (id, name, description, sort_order) values
  ('first_steps', 'First steps', 'Complete your first room.', 1),
  ('speed_runner', 'Quick eye', 'Finish a room at or under its par time.', 2),
  ('efficient', 'Economy of motion', 'Finish a room at or under its par move count.', 3),
  ('three_stars', 'Flawless', 'Earn three stars in a single room.', 4)
on conflict (id) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;
