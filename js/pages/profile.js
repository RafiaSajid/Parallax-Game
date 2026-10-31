import { initPage, run, showMsg, validName, UserError, logout, friendlyError, $ } from '../core.js';
import { getProfile, updateDisplayName } from '../data.js';
import { fmtDate } from '../components.js';
import { mountSettings } from '../settings-card.js';

const user = await initPage({ protect: true });
if (user) {
  $('#logout').addEventListener('click', logout);
  const nameForm = $('#name-form'), nameMsg = $('#name-msg'), nameBtn = $('button[type=submit]', nameForm);
  nameBtn.disabled = true; // enabled once the real profile has loaded: never edit a profile that failed to load
  $('#email').textContent = user.email ?? '';
  getProfile(user.id).then((profile) => {
    $('#name').textContent = profile.display_name;
    $('#display-name').value = profile.display_name;
    $('#since').textContent = fmtDate(profile.created_at);
    nameBtn.disabled = false;
  }).catch((err) => showMsg(nameMsg, 'error', 'Could not load your profile: ' + friendlyError(err) + ' Refresh the page to try again.'));

  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    run(nameBtn, nameMsg, async () => {
      const name = nameForm.elements.displayName.value.trim(); // only surrounding whitespace is trimmed; Unicode and symbols are kept
      if (!validName(name)) throw new UserError('Display name must be 2 to 32 characters, with no control characters.');
      const saved = await updateDisplayName(user.id, name); // RLS + column grant: only YOUR row, only this column
      $('#name').textContent = saved.display_name; nameForm.elements.displayName.value = saved.display_name;
      showMsg(nameMsg, 'success', 'Name saved.');
    });
  });
  mountSettings($('#settings-card'), user.id, {
    onCustomize: async (btn, box) => {
      btn.disabled = true; box.hidden = true;
      try { const { openCustomizer } = await import('../customizer.js'); await openCustomizer(user.id, btn); }
      catch (err) { console.error(err); showMsg(box, 'error', 'Could not open the painter. It needs the 3D library; check your connection and try again.'); }
      finally { btn.disabled = false; }
    },
  });
}
