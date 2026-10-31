import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const clean = (v) => String(v ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
const rawUrl = clean(SUPABASE_URL), rawKey = clean(SUPABASE_ANON_KEY);
let projectUrl = '';
try { const u = new URL(rawUrl); if (u.protocol === 'https:') projectUrl = u.origin; } catch { /* handled below */ }

// Returns a plain-English reason when js/config.js is not filled in correctly, else ''.
export const configProblem = rawUrl.includes('YOUR_') || !rawUrl ? 'SUPABASE_URL is still the placeholder.'
  : !projectUrl ? 'SUPABASE_URL must look like https://abcdxyz.supabase.co'
  : rawKey.includes('YOUR_') || !rawKey ? 'SUPABASE_ANON_KEY is still the placeholder.'
  : rawKey.length < 20 || /\s/.test(rawKey) ? 'SUPABASE_ANON_KEY looks incomplete. Copy the whole publishable/anon key.'
  : '';
export const isConfigured = configProblem === '';

// Placeholder values keep the client constructible so pages can show a setup warning instead of crashing.
export const supabase = createClient(
  isConfigured ? projectUrl : 'https://placeholder.supabase.co',
  isConfigured ? rawKey : 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

/* ---------- Safe DOM ---------- */
// Builds elements with textContent only. Never use innerHTML with user data.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

export function showMsg(box, type, text) {
  box.className = `msg msg-${type}`;
  box.textContent = text;
  box.hidden = false;
}
export const clearMsg = (box) => { box.hidden = true; box.textContent = ''; };

/* ---------- Errors & validation ---------- */
export class UserError extends Error {}

export function friendlyError(err) {
  if (err instanceof UserError) return err.message;
  const m = String(err?.message || '');
  if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox (and spam) for the link.';
  if (err?.status === 429 || /rate limit|too many|security purposes/i.test(m))
    return 'Too many requests. The free email service has low limits; wait a few minutes and try again.';
  if (/same password|different from the old/i.test(m)) return 'Choose a password different from your current one.';
  if (err?.code === 'weak_password' || /weak|at least \d+ char|password should/i.test(m)) return 'The server rejected that password as too weak. Use 8+ characters with a lowercase letter, an uppercase letter, a number and a symbol.';
  if (/failed to fetch|networkerror|load failed/i.test(m))
    return 'Cannot reach the server. Check your connection. If you own this project, the free Supabase database may be paused.';
  if (/jwt|session|not authenticated/i.test(m)) return 'Your session expired. Please log in again.';
  return 'Something went wrong. Please try again.';
}

// Technical detail for failures the player may need to report (database messages are about their own project, never secrets).
export const describeError = (err) => [err?.code, err?.message].filter(Boolean).join(': ').slice(0, 220);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// Mirrors the DB check: 2-32 characters, no control characters. Other Unicode and symbols are allowed.
export const validName = (n) => { const len = [...n].length; return len >= 2 && len <= 32 && !/[\u0000-\u001f\u007f-\u009f]/.test(n); };
// Passwords are never trimmed or altered. Limit is 72 BYTES (bcrypt).
// These rules mirror Supabase's "Password requirements" setting (lowercase, uppercase, digits, symbols).
// The SERVER is the real enforcement; this gives instant feedback.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => [...p].length >= 8 },
  { label: 'A lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'An uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A number (0-9)', test: (p) => /[0-9]/.test(p) },
  { label: 'A symbol such as ! @ # $ % & *', test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,.\/`~]/.test(p) },
];
const COMMON = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'welcome', 'admin', 'iloveyou', 'parallax'];
export function passwordError(pw) {
  if (/\p{Extended_Pictographic}/u.test(pw)) return 'Emoji are not allowed in passwords. Use letters, numbers, spaces or symbols.';
  if (new TextEncoder().encode(pw).length > 72) return 'Password is too long (72 bytes max).';
  const missing = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label.replace(/ \(.*\)| such as.*/, '').toLowerCase());
  if (missing.length) return `Password still needs: ${missing.join(', ')}.`;
  if (COMMON.some((w) => pw.toLowerCase().includes(w))) return 'That password is too easy to guess. Avoid common words and number runs.';
  return null;
}
// Live checklist under a password field.
export function attachPasswordChecklist(input, list) {
  const items = PASSWORD_RULES.map((r) => ({ r, li: h('li') }));
  list.replaceChildren(...items.map((i) => i.li));
  const update = () => items.forEach(({ r, li }) => {
    const ok = r.test(input.value);
    li.className = ok ? 'ok' : '';
    li.textContent = (ok ? '✓ ' : '○ ') + r.label;
  });
  input.addEventListener('input', update);
  update();
}

/* ---------- Buttons ---------- */
export function setBusy(btn, on) {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = 'Please wait…'; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  btn.disabled = on;
}
// Runs an async action with busy state + error display.
export async function run(btn, msgBox, fn) {
  clearMsg(msgBox); setBusy(btn, true);
  try { await fn(); } catch (err) { showMsg(msgBox, 'error', friendlyError(err)); }
  finally { setBusy(btn, false); }
}

/* ---------- Session, navigation ---------- */
// Idle sign-out. Supabase's free plan has no server-side inactivity timeout, so the app enforces one in the browser:
// after IDLE_MINUTES without a key press, click or touch (in ANY open tab), the session is ended on the next page load or timer tick.
export const IDLE_MINUTES = 30;
const ACTIVE_KEY = 'parallax:lastActive';
const ARRIVED_VIA_LINK = /access_token|type=(signup|recovery|magiclink|invite)|[?&]code=/.test(location.hash + location.search);
const readActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0; } catch { return 0; } };
export const markActive = () => { try { localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch { /* storage blocked: idle guard degrades gracefully */ } };
const isIdle = () => { const last = readActive(); return last > 0 && Date.now() - last > IDLE_MINUTES * 60000; };

async function endSessionForIdle() {
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* offline: local session is cleared anyway */ }
  try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  location.replace('login.html?reason=idle');
}

function startIdleGuard() {
  let lastWrite = 0;
  const touch = () => { const n = Date.now(); if (n - lastWrite > 15000) { lastWrite = n; markActive(); } };
  for (const ev of ['pointerdown', 'keydown', 'pointermove', 'touchstart', 'wheel']) window.addEventListener(ev, touch, { passive: true });
  setInterval(() => { if (isIdle()) endSessionForIdle(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isIdle()) endSessionForIdle(); });
}

export async function getUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

const NEXT_RE = /^[a-z0-9-]+\.html(\?[A-Za-z0-9=&_-]*)?$/;
export const safeNext = (v) => (v && NEXT_RE.test(v) ? v : 'dashboard.html');
export const pageUrl = (name) => new URL(name, location.href).href;
const currentPage = () => location.pathname.split('/').pop() || 'index.html';

export async function logout() {
  await supabase.auth.signOut();
  location.href = 'index.html';
}

function renderNav(user) {
  const host = document.getElementById('site-header');
  if (!host) return;
  const here = currentPage();
  const link = (href, text) => h('a', { href, class: 'nav-link', 'aria-current': here === href ? 'page' : null }, text);
  const items = user
    ? [link('dashboard.html', 'Dashboard'), link('levels.html', 'Levels'), link('profile.html', 'Profile'),
       h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: logout }, 'Log out')]
    : [link('login.html', 'Log in'), h('a', { href: 'signup.html', class: 'btn btn-primary btn-sm' }, 'Sign up')];
  host.replaceChildren(h('div', { class: 'container nav' },
    h('a', { href: user ? 'dashboard.html' : 'index.html', class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'PARALLAX'),
    h('nav', { class: 'nav-links', 'aria-label': 'Main' }, items)));
}

// Every page calls this first. Returns the user (or null) after guards run.
export async function initPage({ protect = false, guestOnly = false, nav = true } = {}) {
  let user = await getUser();
  if (user && ARRIVED_VIA_LINK) markActive(); // came from an email link: that is activity
  if (user && isIdle()) { await endSessionForIdle(); return null; }
  if (user) { markActive(); startIdleGuard(); }
  if (protect && !user) {
    location.replace('login.html?next=' + encodeURIComponent(currentPage() + location.search));
    return null;
  }
  if (guestOnly && user) { location.replace('dashboard.html'); return null; }
  if (nav) renderNav(user);
  if (!isConfigured) {
    const main = document.getElementById('app');
    main?.prepend(h('p', { class: 'msg msg-warn', role: 'alert' },
      `Setup needed in js/config.js: ${configProblem} Save the file and hard-refresh (Ctrl+Shift+R). See docs/SETUP.md.`));
  }
  document.getElementById('app')?.classList.remove('is-loading');
  // Logging out in another tab ends access here too.
  if (protect) supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
  return user;
}

/* ---------- Show / hide password ---------- */
export function addPasswordToggles(root = document) {
  root.querySelectorAll('input[type=password]').forEach((input) => {
    const btn = h('button', { type: 'button', class: 'pw-toggle', 'aria-pressed': 'false', 'aria-label': 'Show password' }, 'Show');
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    const wrap = h('div', { class: 'pw-wrap' });
    input.replaceWith(wrap);
    wrap.append(input, btn);
  });
}
