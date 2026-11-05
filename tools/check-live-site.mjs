// Checks a DEPLOYED site over the network. Usage: node tools/check-live-site.mjs https://your-site.netlify.app
// Verifies: pages load, security headers are really served, import-map hashes match, every file the pages need exists,
// config.js holds only public values, models, and that the Supabase project answers. Needs Node 18+.
import { createHash } from 'node:crypto';

const arg = process.argv[2];
if (!arg) { console.error('Usage: node tools/check-live-site.mjs https://your-site.netlify.app [--skip-supabase]'); process.exit(2); }
const base = new URL(arg).origin, skipSup = process.argv.includes('--skip-supabase');
const out = [], add = (level, name, detail = '') => out.push({ level, name, detail });
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const cache = new Map();
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  let r; try { const res = await fetch(base + '/' + path.replace(/^\//, ''), { redirect: 'follow' }); r = { status: res.status, headers: res.headers, text: await res.text() }; } catch (e) { r = { status: 0, headers: new Headers(), text: '', error: e.message }; }
  cache.set(path, r); return r;
}
const PAGES = ['index.html', 'login.html', 'signup.html', 'reset-request.html', 'reset-update.html', 'dashboard.html', 'levels.html', 'profile.html', 'game.html'];

/* pages + headers */
let csp = '';
for (const p of PAGES) {
  const r = await get(p);
  add(r.status === 200 ? 'PASS' : 'FAIL', `Page ${p}`, `HTTP ${r.status}${r.error ? ' ' + r.error : ''}`);
  if (p === 'index.html' && r.status === 200) {
    csp = r.headers.get('content-security-policy') ?? '';
    for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) add(r.headers.get(h) ? 'PASS' : 'FAIL', `Response header ${h} is served`);
    if (csp) add(/'unsafe-inline'|'unsafe-eval'/.test(csp) ? 'FAIL' : 'PASS', "Served CSP has no 'unsafe-inline'/'unsafe-eval'");
    add(base.startsWith('https://') ? 'PASS' : 'WARN', 'Site is served over HTTPS', base);
  }
}
/* import-map hashes vs the CSP that is actually served */
for (const p of PAGES) {
  const t = (await get(p)).text;
  for (const m of t.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
    const h = 'sha256-' + createHash('sha256').update(m[1]).digest('base64');
    add(csp.includes(`'${h}'`) ? 'PASS' : 'FAIL', `Import map in ${p} is allowed by the served CSP`, csp.includes(`'${h}'`) ? '' : `missing '${h}'`);
  }
}
/* crawl every file the pages need */
const seen = new Set(), queue = [];
const enqueue = (p) => { p = p.replace(/^\.\//, ''); if (!seen.has(p)) { seen.add(p); queue.push(p); } };
for (const p of PAGES) for (const m of (await get(p)).text.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^(https?:|data:|mailto:|\/\/)/.test(m[1]) && !m[1].endsWith('.html')) enqueue(m[1]);
let missing = 0, files = 0, secretHits = 0;
while (queue.length) {
  const p = queue.shift(), r = await get(p); files++;
  if (r.status !== 200) { missing++; add('FAIL', 'Missing file', `${p} -> HTTP ${r.status}`); continue; }
  if (/\.js$/.test(p)) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
    for (const m of r.text.matchAll(/(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) enqueue(new URL(m[1], 'http://x/' + dir).pathname.slice(1));
  }
  for (const m of r.text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) { let role; try { role = JSON.parse(b64(m[1])).role; } catch { /* ignore */ } if (role !== 'anon') { secretHits++; add('FAIL', 'PRIVILEGED KEY SERVED PUBLICLY', `${p} role=${role}. Rotate it in Supabase NOW.`); } }
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(r.text)) { secretHits++; add('FAIL', 'SUPABASE SECRET KEY SERVED PUBLICLY', p); }
}
if (!missing) add('PASS', 'Every file the pages and scripts import is served', `${files} files crawled`);
if (!secretHits) add('PASS', 'No privileged keys in any served file');
/* config + Supabase */
const cfg = (await get('js/config.js')).text, url = /SUPABASE_URL\s*=\s*'([^']*)'/.exec(cfg)?.[1] ?? '', key = /SUPABASE_ANON_KEY\s*=\s*'([^']*)'/.exec(cfg)?.[1] ?? '';
if (!url || /YOUR_/.test(url + key)) add('FAIL', 'config.js still has placeholders', 'the deployed site cannot talk to Supabase');
else {
  add('PASS', 'config.js has a project URL and key', url);
  const supOrigin = (() => { try { return new URL(url).origin; } catch { return url; } })(); // the app only uses the origin, so a /rest/v1/ suffix is harmless
  let kind = key.startsWith('sb_publishable_') ? 'publishable' : ''; if (!kind) { try { kind = JSON.parse(b64(key.split('.')[1])).role; } catch { kind = 'unknown'; } }
  add(kind === 'publishable' || kind === 'anon' ? 'PASS' : 'FAIL', 'Key in config.js is a public key', kind);
  if (!skipSup) {
    try {
      const res = await fetch(supOrigin + '/auth/v1/settings', { headers: { apikey: key } }); const j = await res.json().catch(() => ({}));
      add(res.status === 200 ? 'PASS' : 'FAIL', 'Supabase project answers (not paused, key accepted)', `HTTP ${res.status}`);
      if (res.status === 200) {
        add(j.mailer_autoconfirm === false ? 'PASS' : 'WARN', 'Email confirmation is required for new accounts', `mailer_autoconfirm=${j.mailer_autoconfirm}`);
        add(j.disable_signup ? 'WARN' : 'PASS', 'Sign-ups are open', `disable_signup=${j.disable_signup}`);
      }
    } catch (e) { add('FAIL', 'Could not reach Supabase', e.message); }
  }
}
/* models, dev files */
for (const m of new Set([...(await get('js/modelToy.js')).text.matchAll(/['"](assets\/models\/[^'"]+\.glb)['"]/g)].map((x) => x[1]))) {
  const r = await get(m); add(r.status === 200 ? 'PASS' : 'WARN', `Model ${m}`, r.status === 200 ? `${(r.text.length / 1048576).toFixed(2)} MB` : `HTTP ${r.status} (pages fall back to the cube toy)`);
}
for (const p of ['supabase/schema.sql', 'docs/SETUP.md', 'tools/live-test.mjs', 'README.md', '.env', '.git/config']) { const r = await get(p); if (r.status === 200 && !/^<!doctype html/i.test(r.text.trim())) add(p.startsWith('.') ? 'FAIL' : 'WARN', 'Development file is publicly downloadable', `${p} (use the deploy folder so only site files are published)`); }

const order = { FAIL: 0, WARN: 1, PASS: 2 };
for (const r of out.sort((a, b) => order[a.level] - order[b.level])) console.log(`${r.level.padEnd(4)}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
const f = out.filter((r) => r.level === 'FAIL').length, w = out.filter((r) => r.level === 'WARN').length;
console.log(`\n${out.length} checks against ${base}: ${f} FAIL, ${w} WARN.`);
console.log('This covers files, headers and configuration. It does NOT test signup, login, gameplay or rendering: do those by hand in a clean browser window.');
process.exit(f ? 1 : 0);
