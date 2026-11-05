// Verifies the REAL Row Level Security and database functions of your Supabase project from the outside, using the public key
// and two throwaway test accounts. Usage (Node 18+):
//   A_EMAIL=a@example.com A_PASSWORD='...' B_EMAIL=b@example.com B_PASSWORD='...' node tools/live-test.mjs
// Both accounts must already exist and be email-confirmed. USE THROWAWAY ACCOUNTS: the test saves one result and one avatar for A.
// Give account B a password with symbols/Unicode (for example  Tëst-Pässwörd! #1 "x" ) to confirm special characters are accepted exactly as typed.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const cfg = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const URL_ = /SUPABASE_URL\s*=\s*'([^']+)'/.exec(cfg)?.[1], KEY = /SUPABASE_ANON_KEY\s*=\s*'([^']+)'/.exec(cfg)?.[1];
const { A_EMAIL, A_PASSWORD, B_EMAIL, B_PASSWORD } = process.env;
if (!URL_ || !KEY || /YOUR_/.test(URL_ + KEY)) { console.error('js/config.js is not filled in.'); process.exit(2); }
if (!A_EMAIL || !A_PASSWORD || !B_EMAIL || !B_PASSWORD) { console.error('Set A_EMAIL, A_PASSWORD, B_EMAIL and B_PASSWORD (two confirmed throwaway accounts).'); process.exit(2); }
const base = new URL(URL_).origin;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const rows = []; let failed = 0;
const check = (name, ok, detail = '') => { rows.push([ok ? 'PASS' : 'FAIL', name, detail]); if (!ok) failed++; };
const info = (name, detail) => rows.push(['INFO', name, detail]);

async function call(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`; // anonymous calls send only the apikey
  if (prefer) headers.Prefer = prefer;
  try {
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json, text };
  } catch (e) { return { status: 0, json: null, text: String(e.message) }; }
}
const denied = (r) => r.status >= 400;                                         // refused by the database
const none = (r) => r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0); // refused, or RLS shows no rows
const REP = 'return=representation';
async function login(email, password) {
  const r = await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
  return r.status === 200 ? { token: r.json.access_token, id: r.json.user.id } : { error: `HTTP ${r.status} ${r.json?.msg ?? r.json?.error_description ?? ''}` };
}

console.log(`Testing ${base}\n`);
const settings = await call('GET', '/auth/v1/settings');
if (settings.status === 200) info('Auth settings', `email confirmation required: ${settings.json.mailer_autoconfirm === false}`); else check('Supabase project reachable', false, `HTTP ${settings.status}: paused project or wrong URL/key?`);

/* ---- anonymous (not logged in) ---- */
for (const t of ['profiles', 'player_settings', 'player_progress', 'level_results', 'user_achievements', 'player_avatar', 'levels', 'achievements'])
  check(`Anonymous cannot read ${t}`, none(await call('GET', `/rest/v1/${t}?select=*`)));
check('Anonymous cannot call submit_level_result', denied(await call('POST', '/rest/v1/rpc/submit_level_result', { body: { p_level_id: 'level-01', p_time_ms: 90000, p_moves: 30, p_run_id: randomUUID() } })));
check('Anonymous cannot call save_avatar', denied(await call('POST', '/rest/v1/rpc/save_avatar', { body: { p_skin_png: null, p_cap_color: '#FF8FC2' } })));
check('Anonymous cannot list auth users', denied(await call('GET', '/auth/v1/admin/users')));
check('The auth users table is not exposed through the data API', denied(await call('GET', '/rest/v1/users?select=*')));

/* ---- sign in both accounts (passwords are sent exactly as typed) ---- */
const A = await login(A_EMAIL, A_PASSWORD), B = await login(B_EMAIL, B_PASSWORD);
check('Account A signs in with its exact password', !A.error, A.error ?? '');
check('Account B signs in with its exact password (special characters preserved)', !B.error, B.error ?? '');
const wrong = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: A_EMAIL, password: A_PASSWORD + 'x' } });
check('A wrong password is rejected', wrong.status === 400 || wrong.status === 401, `HTTP ${wrong.status}`);
if (A.error || B.error) { finish(); }

const ta = A.token, tb = B.token;
const nameB0 = (await call('GET', `/rest/v1/profiles?id=eq.${B.id}&select=display_name`, { token: tb })).json?.[0]?.display_name;
const nameA0 = (await call('GET', `/rest/v1/profiles?id=eq.${A.id}&select=display_name`, { token: ta })).json?.[0]?.display_name;

/* ---- A reading B's data ---- */
const mine = await call('GET', '/rest/v1/profiles?select=id', { token: ta });
check('A sees exactly one profile (its own)', mine.status === 200 && mine.json.length === 1 && mine.json[0].id === A.id, `rows: ${mine.json?.length}`);
for (const [t, col] of [['profiles', 'id'], ['player_settings', 'user_id'], ['player_progress', 'user_id'], ['level_results', 'user_id'], ['user_achievements', 'user_id'], ['player_avatar', 'user_id']])
  check(`A cannot read B's rows in ${t}`, none(await call('GET', `/rest/v1/${t}?${col}=eq.${B.id}&select=*`, { token: ta })));

/* ---- A writing B's data / forbidden writes ---- */
check("A cannot rename B's profile", none(await call('PATCH', `/rest/v1/profiles?id=eq.${B.id}`, { token: ta, prefer: REP, body: { display_name: 'hacked-by-A' } })));
check("A cannot change B's settings", none(await call('PATCH', `/rest/v1/player_settings?user_id=eq.${B.id}`, { token: ta, prefer: REP, body: { sound_enabled: false, volume: 1 } })));
check("A cannot delete B's profile", none(await call('DELETE', `/rest/v1/profiles?id=eq.${B.id}`, { token: ta, prefer: REP })));
check('A cannot change the id of its own profile', denied(await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, prefer: REP, body: { id: B.id } })));
check('A cannot edit profile created_at (column not writable)', denied(await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, prefer: REP, body: { created_at: '2000-01-01T00:00:00Z' } })));
check('A cannot move its settings to another user id', denied(await call('PATCH', `/rest/v1/player_settings?user_id=eq.${A.id}`, { token: ta, prefer: REP, body: { user_id: B.id } })));
check('A cannot grant itself an achievement directly', denied(await call('POST', '/rest/v1/user_achievements', { token: ta, body: { user_id: A.id, achievement_id: 'three_stars' } })));
check('A cannot insert a result directly', denied(await call('POST', '/rest/v1/level_results', { token: ta, body: { user_id: A.id, level_id: 'level-01', time_ms: 5000, moves: 20 } })));
check('A cannot edit progress directly', denied(await call('PATCH', `/rest/v1/player_progress?user_id=eq.${A.id}`, { token: ta, prefer: REP, body: { status: 'completed', best_stars: 3 } })));
check('A cannot write the avatar table directly', denied(await call('POST', '/rest/v1/player_avatar', { token: ta, body: { user_id: A.id, cap_color: '#000000' } })));
check('A cannot change level definitions', denied(await call('PATCH', '/rest/v1/levels?id=eq.level-01', { token: ta, prefer: REP, body: { par_moves: 1 } })));
check('A cannot change achievement definitions', denied(await call('PATCH', '/rest/v1/achievements?id=eq.first_steps', { token: ta, prefer: REP, body: { name: 'hacked' } })));

/* ---- validation constraints ---- */
check('Display name of 1 character is rejected', denied(await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, prefer: REP, body: { display_name: 'x' } })));
check('Display name of 33 characters is rejected', denied(await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, prefer: REP, body: { display_name: 'x'.repeat(33) } })));
check('Volume 500 is rejected', denied(await call('PATCH', `/rest/v1/player_settings?user_id=eq.${A.id}`, { token: ta, prefer: REP, body: { volume: 500 } })));
check('Unknown camera mode is rejected', denied(await call('PATCH', `/rest/v1/player_settings?user_id=eq.${A.id}`, { token: ta, prefer: REP, body: { camera_mode: 'x' } })));
const fancy = 'Zoë <b>😀</b> "Q"';
const up = await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, prefer: REP, body: { display_name: fancy } });
check('Unicode, emoji, quotes and angle brackets in a display name are stored exactly', up.status === 200 && up.json?.[0]?.display_name === fancy, up.json?.[0]?.display_name ?? `HTTP ${up.status}`);
const set = await call('PATCH', `/rest/v1/player_settings?user_id=eq.${A.id}`, { token: ta, prefer: REP, body: { sound_enabled: true, camera_mode: 'follow', volume: 55 } });
check('A can update its own settings', set.status === 200 && set.json?.[0]?.camera_mode === 'follow' && set.json?.[0]?.volume === 55, `HTTP ${set.status}`);

/* ---- RPC rules ---- */
check('start_level works for a real level', !denied(await call('POST', '/rest/v1/rpc/start_level', { token: ta, body: { p_level_id: 'level-01' } })));
check('start_level rejects an unknown level', denied(await call('POST', '/rest/v1/rpc/start_level', { token: ta, body: { p_level_id: 'nope' } })));
const run = randomUUID();
check('An impossible result (1 move) is rejected', denied(await call('POST', '/rest/v1/rpc/submit_level_result', { token: ta, body: { p_level_id: 'level-01', p_time_ms: 90000, p_moves: 1, p_run_id: randomUUID() } })));
check('An impossible result (0.01 s) is rejected', denied(await call('POST', '/rest/v1/rpc/submit_level_result', { token: ta, body: { p_level_id: 'level-01', p_time_ms: 10, p_moves: 30, p_run_id: randomUUID() } })));
const s1 = await call('POST', '/rest/v1/rpc/submit_level_result', { token: ta, body: { p_level_id: 'level-01', p_time_ms: 90000, p_moves: 30, p_run_id: run } });
check('A valid result is saved', s1.status === 200 && s1.json?.duplicate === false, `HTTP ${s1.status} ${s1.text.slice(0, 120)}`);
const s2 = await call('POST', '/rest/v1/rpc/submit_level_result', { token: ta, body: { p_level_id: 'level-01', p_time_ms: 90000, p_moves: 30, p_run_id: run } });
check('Submitting the SAME run again is a harmless duplicate', s2.status === 200 && s2.json?.duplicate === true && s2.json?.new_achievements?.length === 0, `HTTP ${s2.status}`);
check('Exactly one result row exists for that run', (await call('GET', `/rest/v1/level_results?run_id=eq.${run}&select=id`, { token: ta })).json?.length === 1);
check("B cannot see A's result", none(await call('GET', `/rest/v1/level_results?run_id=eq.${run}&select=id`, { token: tb })));
const ach = await call('GET', `/rest/v1/user_achievements?achievement_id=eq.first_steps&select=achievement_id`, { token: ta });
check('The first-steps award exists exactly once', ach.json?.length === 1, `rows: ${ach.json?.length}`);
const prog = await call('GET', '/rest/v1/player_progress?level_id=eq.level-01&select=status,best_stars', { token: ta });
check('Progress shows level 1 completed', prog.json?.[0]?.status === 'completed', JSON.stringify(prog.json));

/* ---- avatar ---- */
check('A can save a valid avatar', !denied(await call('POST', '/rest/v1/rpc/save_avatar', { token: ta, body: { p_skin_png: PNG, p_cap_color: '#12ABEF' } })));
const av = await call('GET', '/rest/v1/player_avatar?select=skin_png,cap_color', { token: ta });
check('The saved avatar reads back exactly', av.json?.length === 1 && av.json[0].skin_png === PNG && av.json[0].cap_color.toUpperCase() === '#12ABEF');
check("B cannot read A's avatar", none(await call('GET', `/rest/v1/player_avatar?user_id=eq.${A.id}&select=*`, { token: tb })));
check('A script injected as an avatar is rejected', denied(await call('POST', '/rest/v1/rpc/save_avatar', { token: ta, body: { p_skin_png: '<script>alert(1)</script>', p_cap_color: '#FF8FC2' } })));
check('A non-PNG data URL is rejected', denied(await call('POST', '/rest/v1/rpc/save_avatar', { token: ta, body: { p_skin_png: 'data:text/html;base64,PHNjcmlwdD4=', p_cap_color: '#FF8FC2' } })));
check('A bad colour is rejected', denied(await call('POST', '/rest/v1/rpc/save_avatar', { token: ta, body: { p_skin_png: PNG, p_cap_color: 'red' } })));
check('An oversized avatar is rejected', denied(await call('POST', '/rest/v1/rpc/save_avatar', { token: ta, body: { p_skin_png: 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(160000), p_cap_color: '#FF8FC2' } })));

/* ---- B's data untouched ---- */
check("B's profile name is unchanged", (await call('GET', `/rest/v1/profiles?id=eq.${B.id}&select=display_name`, { token: tb })).json?.[0]?.display_name === nameB0);
await call('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { token: ta, body: { display_name: nameA0 } }); // restore A's name
finish();

function finish() {
  for (const [lvl, name, detail] of rows) console.log(`${lvl.padEnd(4)}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  console.log(`\n${rows.filter((r) => r[0] === 'PASS').length} passed, ${failed} failed.`);
  console.log(failed ? 'FAILED: do not rely on these protections until every FAIL is understood and fixed.' : 'These checks passed against your live project. They cover the listed behaviours only; they are not a complete security audit.');
  process.exit(failed ? 1 : 0);
}
