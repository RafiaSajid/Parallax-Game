import { initPage, $, showMsg, friendlyError } from '../core.js';
import { getLevels, getProgress, unlockedIds } from '../data.js';
import { levelCard } from '../components.js';

const user = await initPage({ protect: true });
if (user) {
  try {
    const [levels, progress] = await Promise.all([getLevels(), getProgress()]);
    const byId = new Map(progress.map((p) => [p.level_id, p]));
    const unlocked = unlockedIds(levels, progress);
    $('#levels').replaceChildren(...levels.map((l) => levelCard(l, byId.get(l.id), !unlocked.has(l.id))));
  } catch (err) { showMsg($('#msg'), 'error', friendlyError(err)); }
}
