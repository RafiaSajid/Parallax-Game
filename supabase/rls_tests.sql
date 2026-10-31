-- RLS TESTS. Run in the Supabase SQL editor (it runs as the postgres role, so we switch role to act as a player).
-- 1) Create two accounts via the app's signup page. 2) Find their ids: select id, display_name from public.profiles;
-- 3) Replace USER_A_UUID / USER_B_UUID below. 4) Run the header + ONE test at a time (errors abort the transaction).

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','USER_A_UUID','role','authenticated')::text, true);

-- T1 expect: exactly ONE row (user A only)
select id, display_name from public.profiles;

-- T2 expect: "UPDATE 0" (B's row is invisible to A)
-- update public.profiles set display_name = 'hacked' where id = 'USER_B_UUID';

-- T3 expect: ERROR permission denied (players cannot grant themselves achievements)
-- insert into public.user_achievements (user_id, achievement_id) values ('USER_A_UUID', 'first_steps');

-- T4 expect: ERROR permission denied (progress is RPC-only)
-- update public.player_progress set status = 'completed';

-- T5 expect: ERROR permission denied for column (only display_name is updatable)
-- update public.profiles set id = id where id = 'USER_A_UUID';

-- T6 expect: ERROR permission denied (reference data is read-only)
-- update public.levels set par_moves = 1;

-- T7 expect: JSON with new_achievements (A gets credit)
-- select public.submit_level_result('level-01', 45000, 20, '11111111-1111-1111-1111-111111111111');

-- T7b run the SAME call as T7 twice in one transaction: second result has "duplicate": true and no second row is created
-- T8 expect: ERROR implausible result (fewer moves than the level allows)
-- select public.submit_level_result('level-01', 45000, 3, gen_random_uuid());

-- T11 expect: UPDATE 1 (your own settings); T12 expect UPDATE 0 (someone else's settings are invisible)
-- update public.player_settings set sound_enabled = false where user_id = 'USER_A_UUID';
-- update public.player_settings set sound_enabled = false where user_id = 'USER_B_UUID';

-- T13 expect: ERROR permission denied (user_id cannot be changed, so settings can't be moved to another account)
-- update public.player_settings set user_id = 'USER_B_UUID' where user_id = 'USER_A_UUID';

-- T14 expect: ERROR new row violates check constraint (volume 0-100 only)
-- update public.player_settings set volume = 500 where user_id = 'USER_A_UUID';

-- T15 expect: ERROR new row violates check constraint (display name length 2-32)
-- update public.profiles set display_name = 'x' where id = 'USER_A_UUID';

-- T16 expect: ERROR permission denied (the avatar table cannot be written directly, only through save_avatar)
-- insert into public.player_avatar (user_id, cap_color) values ('USER_A_UUID', '#FFFFFF');

-- T17 expect: void/OK. Then T18 expect ERROR (bad data URL) and T19 ERROR (bad colour)
-- select public.save_avatar(null, '#FF8FC2');
-- select public.save_avatar('<script>alert(1)</script>', '#FF8FC2');
-- select public.save_avatar(null, 'red');

-- T20 expect: only A's avatar row is visible to A
-- select user_id from public.player_avatar;

-- T9 expect: ERROR unknown level
-- select public.start_level('nope');

rollback;

-- T10 anonymous access: expect ERROR permission denied
-- begin; set local role anon; select * from public.profiles; rollback;
