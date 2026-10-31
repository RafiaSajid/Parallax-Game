import { initPage, $, showMsg, friendlyError, describeError, uuid } from '../core.js';
import { getLevels, getProgress, startLevel, submitResult, getAchievements, unlockedIds, getSettings, saveSettings, getAvatar } from '../data.js';
import { initHud, setStats, fillComplete, setSaveResult, onRetry, setObjective } from '../game/hud.js';
import { GameFlow, S } from '../game/GameFlow.js';
import { HELP_KEY } from '../settings-card.js';
import { LEVEL_LAYOUTS } from '../game/levels/index.js';

const SEEN_KEY = 'parallax:seenHowTo';

async function main(user) {
  const msg = $('#msg'), loading = $('#loading'), placeholder = $('#placeholder');
  const fail = (text) => { placeholder.hidden = false; loading.hidden = true; showMsg(msg, 'error', text); };
  try {
    const id = new URLSearchParams(location.search).get('level') || 'level-01';
    const [levels, progress] = await Promise.all([getLevels(), getProgress()]);
    const level = levels.find((l) => l.id === id);
    if (!level) return fail('That room does not exist. Run the latest supabase/schema.sql, or pick a room from the level list.');
    if (!unlockedIds(levels, progress).has(level.id)) { location.replace('levels.html'); return; }
    const layout = LEVEL_LAYOUTS[level.id];
    if (!layout) return fail('This room has no 3D layout yet.');
    const nextLevel = levels[levels.findIndex((l) => l.id === level.id) + 1];
    $('#level-name').textContent = level.name;
    $('#hud-par').textContent = ` / par ${level.par_moves}`;
    document.title = `${level.name} · PARALLAX`;
    await startLevel(level.id); // marks "in progress" and counts the attempt

    let settings = {};
    try { settings = await getSettings(user.id); } catch { /* defaults are fine */ }

    const flow = new GameFlow(S.MENU); // MENU -> PLAYING <-> PAUSED, PLAYING -> SOLVED -> COMPLETE, restart -> PLAYING
    let game = null;

    let Game;
    try { ({ Game } = await import('../game/Game.js')); } // 3D code is loaded separately from auth/dashboard code
    catch (err) { console.error(err); return fail('Could not load the 3D engine. Check your connection and refresh.'); }

    // The player's painted cylinder (falls back to the default character if it cannot be loaded).
    let avatar = {};
    try {
      const [{ loadSkinCanvas }, row] = await Promise.all([import('../game/AvatarSkin.js'), getAvatar(user.id)]);
      if (row) avatar = { capColor: row.cap_color, skinCanvas: row.skin_png ? await loadSkinCanvas(row.skin_png).catch(() => null) : null };
    } catch (err) { console.warn('[avatar] using the default character:', err); }

    const stars = (timeMs, moves) => 1 + (moves <= level.par_moves ? 1 : 0) + (timeMs <= level.par_time_ms ? 1 : 0); // same rule as the database

    // Saves ONE completed run. The run id is created once per solve, so every retry is the same run and cannot be counted twice.
    async function handleSolved({ moves, timeSeconds }) {
      const timeMs = Math.max(1000, Math.round(timeSeconds * 1000)), runId = uuid();
      fillComplete({ timeMs, moves, stars: stars(timeMs, moves), nextHref: nextLevel ? 'game.html?level=' + encodeURIComponent(nextLevel.id) : null });
      const save = async () => {
        setSaveResult({ state: 'saving', message: 'Saving your result…' });
        try {
          const [res, ach] = await Promise.all([submitResult(level.id, timeMs, moves, runId), getAchievements()]);
          const names = new Map(ach.map((a) => [a.id, a]));
          setSaveResult({
            state: 'saved',
            message: res?.duplicate ? 'This run was already saved.' : 'Saved to your profile.',
            achievements: (res?.new_achievements ?? []).map((i) => names.get(i)).filter(Boolean),
          });
        } catch (err) {
          console.error('[save] failed', err);
          setSaveResult({ state: 'error', message: `NOT saved: ${friendlyError(err)} Your result is not recorded yet.`, detail: describeError(err) });
        }
      };
      onRetry(save);
      await save();
    }

    game = new Game({
      canvas: $('#game-canvas'), container: $('.stage'), levelDef: layout, settings, avatar, flow,
      onMove: (n) => setStats({ moves: n }),
      onTime: (sec) => setStats({ timeMs: sec * 1000 }),
      onStatus: ({ objective, selection }) => { setObjective(objective); $('#status-selection').textContent = selection; },
      onSolved: handleSolved,
      onError: fail,
    });
    flow.on((state, prev, ev) => {
      if (ev === 'restart') game.restart(); // reset cubes, plates, portal, selection, timer, history
      if (prev === S.MENU && state === S.PLAYING) { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } }
    });
    $('#btn-undo').addEventListener('click', () => game.undo());

    // Camera view: switches instantly (it is only a view), then is saved to the account. A failed save is reported, never hidden.
    const camBtn = $('#btn-camera');
    let camMode = settings.camera_mode === 'follow' ? 'follow' : 'overview';
    const paintCam = () => { camBtn.textContent = camMode === 'follow' ? 'Camera: follow' : 'Camera: overview'; camBtn.setAttribute('aria-pressed', String(camMode === 'follow')); };
    paintCam();
    camBtn.addEventListener('click', async () => {
      camMode = camMode === 'follow' ? 'overview' : 'follow'; game.setCameraMode(camMode); paintCam();
      try { await saveSettings(user.id, { camera_mode: camMode }); }
      catch (err) { console.error(err); $('#status-selection').textContent = 'Camera changed, but NOT saved to your account: ' + friendlyError(err); }
    });
    document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && flow.state === S.PLAYING) camBtn.click(); });

    // Sound on/off follows the account: saved to the database; the button only changes after the save succeeds.
    const soundBtn = $('#btn-sound');
    let soundOn = settings.sound_enabled !== false;
    const paintSound = () => { soundBtn.textContent = soundOn ? 'Sound: on' : 'Sound: off'; soundBtn.setAttribute('aria-pressed', String(soundOn)); };
    paintSound();
    soundBtn.addEventListener('click', async () => {
      soundBtn.disabled = true;
      try { const saved = await saveSettings(user.id, { sound_enabled: !soundOn }); soundOn = saved.sound_enabled; game.setSound(soundOn); paintSound(); }
      catch (err) { console.error(err); $('#status-selection').textContent = 'Could not save the sound setting: ' + friendlyError(err); }
      finally { soundBtn.disabled = false; }
    });
    await game.init();
    placeholder.hidden = true;
    const help = $('#help'); help.hidden = false;
    let pref = null; try { pref = localStorage.getItem(HELP_KEY); } catch { /* ignore */ }
    help.open = pref === null ? (innerWidth >= 900 && innerHeight >= 600) : pref === '1'; // device-only preference, else a sensible default
    help.querySelector('summary').addEventListener('click', () => setTimeout(() => { try { localStorage.setItem(HELP_KEY, help.open ? '1' : '0'); } catch { /* ignore */ } }, 0)); // remember only the player's own choice
    let seen = false; try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* ignore */ }
    if (seen) flow.start(); // returning players go straight to PLAYING; first-timers see the how-to card (MENU)
    initHud(flow);
    window.addEventListener('pagehide', () => game.dispose(), { once: true });
  } catch (err) {
    console.error(err);
    fail(/webgl/i.test(String(err?.message)) ? 'Your browser could not start WebGL, which the game needs. Try another browser or enable hardware acceleration.' : friendlyError(err));
  }
}

const user = await initPage({ protect: true, nav: false });
if (user) await main(user);
