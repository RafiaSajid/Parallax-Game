import { markActive, addPasswordToggles, attachPasswordChecklist, supabase, initPage, run, passwordError, UserError, showMsg, getUser, $ } from '../core.js';
await initPage();
addPasswordToggles();
const form = $('#update-form'), msg = $('#msg');
attachPasswordChecklist(form.elements.password, $('#pw-rules'));
const show = () => { form.hidden = false; $('#invalid').hidden = true; };
// The recovery link signs the user in temporarily; supabase-js reads the token from the URL.
supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') show(); });
if (await getUser()) show(); else setTimeout(async () => { if (!(await getUser())) $('#invalid').hidden = false; }, 1500);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run($('button[type=submit]', form), msg, async () => {
    const pw = form.elements.password.value, pw2 = form.elements.password2.value;
    const pwErr = passwordError(pw);
    if (pwErr) throw new UserError(pwErr);
    if (pw !== pw2) throw new UserError('The passwords do not match.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) throw error;
    markActive();
    showMsg(msg, 'success', 'Password updated. Taking you to your dashboard…');
    setTimeout(() => location.replace('dashboard.html'), 1500);
  });
});
