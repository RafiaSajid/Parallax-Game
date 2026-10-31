import { initModelToy } from '../modelToy.js';
import { markActive, addPasswordToggles, attachPasswordChecklist, supabase, initPage, run, validEmail, validName, passwordError, UserError, pageUrl, $ } from '../core.js';
await initPage({ guestOnly: true });
initModelToy(document.querySelector('.toy-slot'), 'cat'); // falls back to the cube if the model file is missing
addPasswordToggles();
const form = $('#signup-form'), msg = $('#msg');
attachPasswordChecklist(form.elements.password, $('#pw-rules'));
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run($('button[type=submit]', form), msg, async () => {
    const name = form.elements.displayName.value.trim();
    const email = form.elements.email.value.trim();
    const pw = form.elements.password.value, pw2 = form.elements.password2.value; // passwords untouched
    if (!validName(name)) throw new UserError('Display name must be 2 to 32 characters, with no control characters.');
    if (!validEmail(email)) throw new UserError('Enter a valid email address.');
    const pwErr = passwordError(pw);
    if (pwErr) throw new UserError(pwErr);
    if (pw !== pw2) throw new UserError('The passwords do not match.');
    const { data, error } = await supabase.auth.signUp({
      email, password: pw,
      options: { data: { display_name: name }, emailRedirectTo: pageUrl('login.html') },
    });
    if (error) throw error;
    if (data.session) { markActive(); location.replace('dashboard.html'); return; } // email confirmation turned off
    form.hidden = true; $('#done').hidden = false; // same message whether or not the email already exists
  });
});
