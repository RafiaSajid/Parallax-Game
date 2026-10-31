import { supabase, UserError } from './core.js';
// Every read is filtered by RLS to the signed-in user; these helpers never need a user id for reads.
const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export const getProfile = (uid) => supabase.from('profiles').select('id,display_name,created_at').eq('id', uid).single().then(unwrap);
export const updateDisplayName = (uid, display_name) => supabase.from('profiles').update({ display_name }).eq('id', uid).select('display_name').single().then(unwrap);
export const getLevels = () => supabase.from('levels').select('id,name,description,sort_order,par_time_ms,par_moves').order('sort_order').then(unwrap);
export async function getProgress() {
  const cols = 'level_id,status,attempts,best_time_ms,best_moves,first_completed_at,last_played_at';
  const r = await supabase.from('player_progress').select(cols + ',best_stars');
  if (r.error && /best_stars/.test(r.error.message)) return supabase.from('player_progress').select(cols).then(unwrap); // SQL not updated yet
  return unwrap(r);
}
export const getResults = (limit = 5) => supabase.from('level_results').select('id,level_id,time_ms,moves,completed_at').order('completed_at', { ascending: false }).limit(limit).then(unwrap);
export const getAchievements = () => supabase.from('achievements').select('id,name,description,sort_order').order('sort_order').then(unwrap);
export const getEarned = () => supabase.from('user_achievements').select('achievement_id,earned_at').then(unwrap);
export const startLevel = (levelId) => supabase.rpc('start_level', { p_level_id: levelId }).then(unwrap);
// runId makes the save idempotent: retrying or double-submitting the same run can never create a second result.
export const submitResult = (levelId, timeMs, moves, runId) => supabase.rpc('submit_level_result', { p_level_id: levelId, p_time_ms: timeMs, p_moves: moves, p_run_id: runId }).then(unwrap);

// Level n is unlocked when it is the first, or the previous level is completed.
export function unlockedIds(levels, progress) {
  const done = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.level_id));
  return new Set(levels.filter((l, i) => i === 0 || done.has(levels[i - 1].id)).map((l) => l.id));
}

// Settings that follow the account. sound_enabled and camera_mode need the latest schema.sql; older databases fall back to defaults on read.
const BASE_COLS = 'volume,quality,reduced_motion,invert_controls';
const ALL_COLS = BASE_COLS + ',sound_enabled,camera_mode';
const NEEDS_SQL = /sound_enabled|camera_mode/;
export async function getSettings(uid) {
  const r = await supabase.from('player_settings').select(ALL_COLS).eq('user_id', uid).single();
  if (r.error && NEEDS_SQL.test(r.error.message)) return { ...unwrap(await supabase.from('player_settings').select(BASE_COLS).eq('user_id', uid).single()), sound_enabled: true, camera_mode: 'overview' };
  return unwrap(r);
}
export async function saveSettings(uid, s) {
  const r = await supabase.from('player_settings').update(s).eq('user_id', uid).select(ALL_COLS).single();
  if (r.error && NEEDS_SQL.test(r.error.message)) throw new UserError('Your database is missing a newer setting. Run the latest supabase/schema.sql, then try again.');
  return unwrap(r);
}

// The player's painted cylinder. Reads are limited to your own row by RLS; writes go through the save_avatar() database function.
export async function getAvatar(uid) {
  const r = await supabase.from('player_avatar').select('skin_png,cap_color').eq('user_id', uid).maybeSingle();
  if (r.error && /player_avatar/.test(r.error.message)) throw new UserError('Your database is missing the character table. Run the latest supabase/schema.sql, then try again.');
  return unwrap(r); // null when the player has not customised yet
}
export const saveAvatar = (skinPng, capColor) => supabase.rpc('save_avatar', { p_skin_png: skinPng, p_cap_color: capColor }).then(unwrap);
