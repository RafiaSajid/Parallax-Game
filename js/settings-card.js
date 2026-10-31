import { h, run, showMsg } from './core.js';
import { getSettings, saveSettings } from './data.js';
import { loadSection } from './components.js';

// Device-only preference (localStorage, not the account): whether the controls panel starts open on the game screen.
export const HELP_KEY = 'parallax:helpOpen';
const readLocal = () => { try { return localStorage.getItem(HELP_KEY) !== '0'; } catch { return true; } };

// Account settings (stored in the database per user) plus one device-only setting. Used on the dashboard and the profile page.
// options.onCustomize(button, messageBox): when given, a "Customize" row (paint your character) is shown.
export function mountSettings(box, userId, options = {}) {
  return loadSection(box, async () => {
    const s = await getSettings(userId);
    const sound = h('input', { type: 'checkbox', id: 'set-sound', checked: s.sound_enabled });
    const vol = h('input', { type: 'range', id: 'set-volume', min: 0, max: 100, step: 5, value: s.volume });
    const volOut = h('output', { for: 'set-volume' }, String(s.volume));
    const quality = h('select', { id: 'set-quality' }, ['low', 'medium', 'high'].map((q) => h('option', { value: q, selected: q === s.quality }, q[0].toUpperCase() + q.slice(1))));
    const camera = h('select', { id: 'set-camera' }, [['overview', 'Overview (whole room)'], ['follow', 'Follow (third-person)']].map(([v, t]) => h('option', { value: v, selected: v === s.camera_mode }, t)));
    const reduced = h('input', { type: 'checkbox', id: 'set-reduced', checked: s.reduced_motion });
    const invert = h('input', { type: 'checkbox', id: 'set-invert', checked: s.invert_controls });
    const help = h('input', { type: 'checkbox', id: 'set-help', checked: readLocal() });
    const msg = h('div', { class: 'msg', role: 'status', hidden: true });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings');
    const sync = () => { vol.disabled = !sound.checked; };
    vol.addEventListener('input', () => { volOut.textContent = vol.value; });
    sound.addEventListener('change', sync); sync();

    let custRow = null;
    if (options.onCustomize) {
      const cMsg = h('div', { class: 'msg', role: 'status', hidden: true });
      const cBtn = h('button', { class: 'btn', type: 'button', onclick: () => options.onCustomize(cBtn, cMsg) }, 'Customize');
      custRow = h('div', { class: 'field' }, h('label', {}, 'Your character'), h('p', { class: 'hint' }, 'Paint your cylinder. It appears in the game.'), cBtn, cMsg);
    }

    const form = h('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      run(btn, msg, async () => {
        const saved = await saveSettings(userId, { sound_enabled: sound.checked, volume: Number(vol.value), quality: quality.value, camera_mode: camera.value, reduced_motion: reduced.checked, invert_controls: invert.checked });
        try { localStorage.setItem(HELP_KEY, help.checked ? '1' : '0'); } catch { /* storage blocked: device setting simply not remembered */ }
        sound.checked = saved.sound_enabled; vol.value = saved.volume; volOut.textContent = String(saved.volume); quality.value = saved.quality; camera.value = saved.camera_mode;
        reduced.checked = saved.reduced_motion; invert.checked = saved.invert_controls; sync();
        showMsg(msg, 'success', 'Saved to your account.'); // only reached after the database returned the saved row
      });
    } },
    custRow,
    h('div', { class: 'field' }, h('label', { class: 'check' }, sound, ' Sound effects')),
    h('div', { class: 'field' }, h('label', { for: 'set-volume' }, 'Volume ', volOut), vol),
    h('div', { class: 'field' }, h('label', { for: 'set-quality' }, 'Graphics quality'), quality),
    h('div', { class: 'field' }, h('label', { for: 'set-camera' }, 'Camera view'), camera),
    h('div', { class: 'field' }, h('label', { class: 'check' }, reduced, ' Reduce motion')),
    h('div', { class: 'field' }, h('label', { class: 'check' }, invert, ' Invert camera movement')),
    h('div', { class: 'field' }, h('label', { class: 'check' }, help, ' Show the controls panel on the game screen'), h('p', { class: 'hint' }, 'This one is stored on this device only. Everything else follows your account.')),
    msg, btn);
    return form;
  });
}
