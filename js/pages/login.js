import { initModelToy } from '../modelToy.js';
import { markActive, IDLE_MINUTES, showMsg, addPasswordToggles, supabase, initPage, run, validEmail, UserError, safeNext, $ } from '../core.js';
await initPage({ guestOnly: true });
initModelToy(document.querySelector('.toy-slot'), 'cat'); // falls back to the cube if the model file is missing
addPasswordToggles();
const form = $('#login-form'), msg = $('#msg');
if (new URLSearchParams(location.search).get('reason') === 'idle') showMsg(msg, 'info', `You were signed out after ${IDLE_MINUTES} minutes of inactivity. Please log in again.`);
let fails = 0, lockUntil = 0; // UX throttle only; Supabase rate-limits server-side
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run($('button[type=submit]', form), msg, async () => {
    const wait = Math.ceil((lockUntil - Date.now()) / 1000);
    if (wait > 0) throw new UserError(`Too many failed attempts. Try again in ${wait} seconds.`);
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value; // never trimmed or altered
    if (!validEmail(email)) throw new UserError('Enter a valid email address.');
    if (!password) throw new UserError('Enter your password.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { if (++fails >= 5) { fails = 0; lockUntil = Date.now() + 30000; } throw error; }
    markActive();
    location.replace(safeNext(new URLSearchParams(location.search).get('next')));
  });
});
