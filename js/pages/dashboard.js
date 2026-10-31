import { initPage, h, $, showMsg, friendlyError, logout } from '../core.js';
import { getProfile, getLevels, getProgress, getAchievements, getEarned, getResults, unlockedIds } from '../data.js';
import { levelCard, achievementCard, emptyState, fmtTime, fmtDate, memo, loadSection } from '../components.js';
import { mountSettings } from '../settings-card.js';

const user = await initPage({ protect: true });
if (user) {
  $('#logout-btn').addEventListener('click', logout);
  // Each query runs once and is shared; every section loads (and fails, and retries) independently.
  const q = {
    profile: memo(() => getProfile(user.id)), levels: memo(getLevels), progress: memo(getProgress),
    results: memo(() => getResults(5)), achievements: memo(getAchievements), earned: memo(getEarned),
  };

  q.profile().then((p) => { $('#welcome').textContent = `Welcome, ${p.display_name}`; }) // textContent: names are never parsed as HTML
    .catch((err) => showMsg($('#head-msg'), 'error', 'Could not load your profile: ' + friendlyError(err)));

  Promise.all([q.levels(), q.progress()]).then(([levels, progress]) => {
    const unlocked = unlockedIds(levels, progress), done = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.level_id));
    const next = levels.find((l) => unlocked.has(l.id) && !done.has(l.id)) ?? levels[0];
    if (next) { const a = $('#play'); a.href = 'game.html?level=' + encodeURIComponent(next.id); a.textContent = progress.length ? 'Continue playing' : 'Play'; }
  }).catch(() => { /* the Rooms section shows the error; Play still opens the level list */ });

  const stat = (value, label) => h('div', { class: 'card' }, h('div', { class: 'stat' }, value, h('small', {}, label)));

  loadSection($('#stats'), async () => {
    const [levels, progress, achievements, earned] = await Promise.all([q.levels(), q.progress(), q.achievements(), q.earned()]);
    const done = progress.filter((p) => p.status === 'completed');
    const stars = progress.reduce((n, p) => n + (p.best_stars ?? 0), 0);
    const best = done.filter((p) => p.best_time_ms != null).sort((a, b) => a.best_time_ms - b.best_time_ms)[0];
    const bestName = best ? levels.find((l) => l.id === best.level_id)?.name : null;
    return [
      stat(`${done.length} / ${levels.length}`, 'Rooms completed'),
      stat(`${stars} / ${levels.length * 3}`, 'Stars earned'),
      stat(best ? fmtTime(best.best_time_ms) : '—', best ? `Best time (${bestName})` : 'Best time: no clears yet'),
      stat(`${earned.length} / ${achievements.length}`, 'Achievements'),
    ];
  }, [q.levels, q.progress, q.achievements, q.earned]);

  loadSection($('#progress'), async () => {
    const [levels, progress] = await Promise.all([q.levels(), q.progress()]);
    if (!levels.length) return emptyState('No rooms are available yet.');
    const byId = new Map(progress.map((p) => [p.level_id, p])), unlocked = unlockedIds(levels, progress);
    return levels.map((l) => levelCard(l, byId.get(l.id), !unlocked.has(l.id)));
  }, [q.levels, q.progress]);

  loadSection($('#results'), async () => {
    const [results, levels] = await Promise.all([q.results(), q.levels()]);
    if (!results.length) return emptyState('No runs yet. Finish a room and it will show up here.', $('#play').getAttribute('href'), 'Play your first room');
    const name = (id) => levels.find((l) => l.id === id)?.name ?? id;
    return h('ul', { class: 'list' }, results.map((r) => h('li', {}, h('span', {}, name(r.level_id)),
      h('span', { class: 'muted' }, `${fmtTime(r.time_ms)} · ${r.moves} moves · ${fmtDate(r.completed_at)}`))));
  }, [q.results, q.levels]);

  loadSection($('#achievements'), async () => {
    const [achievements, earned] = await Promise.all([q.achievements(), q.earned()]);
    if (!achievements.length) return emptyState('No achievements are defined yet.');
    const when = new Map(earned.map((e) => [e.achievement_id, e.earned_at]));
    return achievements.map((a) => achievementCard(a, when.get(a.id)));
  }, [q.achievements, q.earned]);

  mountSettings($('#settings-card'), user.id);
}
