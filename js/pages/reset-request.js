import { supabase, initPage, run, validEmail, UserError, showMsg, pageUrl, $ } from '../core.js';
await initPage();
const form = $('#reset-form'), msg = $('#msg');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run($('button[type=submit]', form), msg, async () => {
    const email = form.elements.email.value.trim();
    if (!validEmail(email)) throw new UserError('Enter a valid email address.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: pageUrl('reset-update.html') });
    if (error) throw error;
    showMsg(msg, 'success', 'If an account exists for that address, a reset link is on its way. The free email service is rate-limited, so it may be delayed. Check spam.');
  });
});
