// Static security + integrity scan. Usage: node tools/security-scan.mjs [folder]   (default: the project; use "deploy" before uploading)
// It only proves what it checks; it is not a penetration test.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKIP = new Set(['node_modules', 'deploy', '.git']);
const results = [];
const add = (level, name, detail = '') => results.push({ level, name, detail });
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { if (SKIP.has(n)) continue; const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk(root);
const rel = (p) => relative(root, p).replaceAll('\\', '/');
const read = (p) => readFileSync(p, 'utf8');
const textFiles = files.filter((f) => /\.(html|js|mjs|css|json|toml|md|sql)$|_headers$/.test(f));
const jsFiles = files.filter((f) => /\.js$/.test(f) && !rel(f).startsWith('tools/'));
const htmlFiles = files.filter((f) => /\.html$/.test(f));
const code = (src) => src.split('\n').map((line, i) => ({ n: i + 1, line })).filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line)).map(({ n, line }) => ({ n, line: line.replace(/\s\/\/.*$/, '') }));
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/* 1. Secrets anywhere in the folder */
let secretFail = 0, anonSeen = 0;
for (const f of textFiles) {
  const src = read(f);
  for (const m of src.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    let role; try { role = JSON.parse(b64(m[1])).role; } catch { /* not a JWT */ }
    if (role === 'anon') anonSeen++;
    else { secretFail++; add('FAIL', 'Privileged or unknown JWT found', `${rel(f)} (role: ${role ?? 'unreadable'}) REMOVE IT AND ROTATE THE KEY`); }
  }
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(src)) { secretFail++; add('FAIL', 'Supabase secret key found', rel(f)); }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(src)) { secretFail++; add('FAIL', 'Private key found', rel(f)); }
  if (/postgres(?:ql)?:\/\/[^\s'"@:]+:[^\s'"@]+@/.test(src)) { secretFail++; add('FAIL', 'Database connection string with password', rel(f)); }
}
if (!secretFail) add('PASS', 'No service-role/secret keys, private keys or DB passwords in any file', `${textFiles.length} text files scanned; ${anonSeen} public anon key(s) found (expected)`);
for (const f of files) if (/(^|\/)(\.env[^/]*|.*\.pem|.*\.key|id_rsa)$/.test(rel(f))) add('FAIL', 'Sensitive-looking file present', rel(f));

/* 2. Public config */
const cfgPath = join(root, 'js', 'config.js');
if (!existsSync(cfgPath)) add(basename(root) === 'deploy' ? 'FAIL' : 'WARN', 'js/config.js is missing', 'the site cannot reach Supabase without it');
else {
  const c = read(cfgPath), url = /SUPABASE_URL\s*=\s*'([^']*)'/.exec(c)?.[1] ?? '', key = /SUPABASE_ANON_KEY\s*=\s*'([^']*)'/.exec(c)?.[1] ?? '';
  // The app itself only uses the origin of this URL, so the "API URL" shown under Data API (which ends in /rest/v1/) also works.
  let origin = ''; try { const u = new URL(url); if (u.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname)) origin = u.origin; } catch { /* not a URL */ }
  if (!origin) add('FAIL', 'config.js SUPABASE_URL is not a Supabase project URL', `found "${url}", expected https://<project-ref>.supabase.co`);
  else if (url.replace(/\/+$/, '') !== origin) add('WARN', 'config.js URL has an extra path (works, but can be shortened)', `${url} -> ${origin}`);
  else add('PASS', 'config.js URL looks like a Supabase project URL', url);
  if (key.startsWith('sb_publishable_')) add('PASS', 'config.js holds a publishable key');
  else { let role; try { role = JSON.parse(b64(key.split('.')[1])).role; } catch { /* ignore */ } add(role === 'anon' ? 'PASS' : 'FAIL', 'config.js key type', role ? `JWT role: ${role}` : 'unrecognised key format'); }
}

/* 3. Safe DOM: no HTML-string injection, eval, inline handlers */
const bad = [[/\.innerHTML\s*[+]?=/, 'innerHTML assignment'], [/insertAdjacentHTML/, 'insertAdjacentHTML'], [/\.outerHTML\s*=/, 'outerHTML assignment'], [/document\.write/, 'document.write'],
  [/\beval\s*\(/, 'eval'], [/new Function\s*\(/, 'new Function'], [/setAttribute\(\s*['"]on/i, 'setAttribute(on...)'], [/setAttribute\(\s*['"]style['"]/, 'inline style attribute (blocked by CSP)'], [/javascript:/, 'javascript: URL']];
let domFail = 0;
for (const f of jsFiles) for (const { n, line } of code(read(f))) for (const [re, label] of bad) if (re.test(line)) { domFail++; add('FAIL', `Unsafe pattern: ${label}`, `${rel(f)}:${n}`); }
if (!domFail) add('PASS', 'No innerHTML/eval/document.write/inline handler patterns in client JavaScript', `${jsFiles.length} files`);

/* 4. HTML: nothing the CSP would block */
let htmlFail = 0;
for (const f of htmlFiles) {
  const s = read(f);
  if (/\son[a-z]+\s*=\s*["']/i.test(s.replace(/<script[\s\S]*?<\/script>/g, ''))) { htmlFail++; add('FAIL', 'Inline event handler in HTML', rel(f)); }
  if (/\sstyle\s*=\s*["']/.test(s)) { htmlFail++; add('FAIL', 'Inline style attribute in HTML', rel(f)); }
  if (/href\s*=\s*["']\s*javascript:/i.test(s)) { htmlFail++; add('FAIL', 'javascript: link', rel(f)); }
  for (const m of s.matchAll(/<script\b([^>]*)>/g)) if (!/\bsrc=/.test(m[1]) && !/type="importmap"/.test(m[1])) { htmlFail++; add('FAIL', 'Inline script (CSP would block it)', rel(f)); }
}
if (!htmlFail) add('PASS', 'HTML has no inline handlers, inline styles or inline scripts (except the hashed import map)', `${htmlFiles.length} pages`);

/* 5. CSP: present, strict, and the import-map hashes match */
const hp = join(root, '_headers');
if (!existsSync(hp)) add('FAIL', '_headers file missing', 'security headers would not be applied');
else {
  const csp = /Content-Security-Policy:\s*(.*)/.exec(read(hp))?.[1] ?? '';
  if (!csp) add('FAIL', 'No Content-Security-Policy in _headers');
  else {
    add(/'unsafe-inline'|'unsafe-eval'/.test(csp) ? 'FAIL' : 'PASS', "CSP has no 'unsafe-inline' / 'unsafe-eval'");
    add(/frame-ancestors 'none'/.test(csp) ? 'PASS' : 'FAIL', "CSP blocks framing (frame-ancestors 'none')");
    let hashFail = 0;
    for (const f of htmlFiles) for (const m of read(f).matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
      const h = 'sha256-' + createHash('sha256').update(m[1]).digest('base64');
      if (!csp.includes(`'${h}'`)) { hashFail++; add('FAIL', 'Import-map hash is not in the CSP (the 3D scripts would be blocked)', `${rel(f)} needs '${h}'`); }
    }
    if (!hashFail) add('PASS', 'Every import map matches a hash in the CSP');
  }
  for (const h of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) add(read(hp).includes(h) ? 'PASS' : 'FAIL', `Header ${h} configured`);
}

/* 6. Every local reference resolves (broken asset paths) */
let refFail = 0;
const ex = (p) => existsSync(p) && statSync(p).isFile();
for (const f of htmlFiles) for (const m of read(f).matchAll(/(?:src|href)="([^"#?]+)"/g)) {
  const t = m[1]; if (/^(https?:|data:|mailto:|\/\/)/.test(t)) continue;
  if (!ex(resolve(dirname(f), t))) { refFail++; add('FAIL', 'Broken reference in HTML', `${rel(f)} -> ${t}`); }
}
for (const f of jsFiles) for (const m of read(f).matchAll(/(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
  if (!ex(resolve(dirname(f), m[1]))) { refFail++; add('FAIL', 'Broken import', `${rel(f)} -> ${m[1]}`); }
}
if (!refFail) add('PASS', 'All HTML references and JavaScript imports resolve to real files');
const models = new Set();
for (const f of jsFiles) for (const m of read(f).matchAll(/['"](assets\/models\/[^'"]+\.glb)['"]/g)) models.add(m[1]);
for (const m of models) {
  const p = join(root, m);
  if (!existsSync(p)) add('WARN', 'Model file not present (the fallback is used)', m);
  else { const mb = statSync(p).size / 1048576; add(mb > 5 ? 'WARN' : 'PASS', `Model ${m}`, `${mb.toFixed(2)} MB${mb > 5 ? ' - large; consider optimising' : ''}`); }
}

/* 7. Passwords and database write paths */
const sql = existsSync(join(root, 'supabase', 'schema.sql')) ? read(join(root, 'supabase', 'schema.sql')) : null;
if (sql) add(/\b(password|passwd|pwd|secret)\w*\s+(text|varchar|bytea|character)/i.test(sql) ? 'FAIL' : 'PASS', 'Schema defines no password/secret columns (credentials stay in Supabase Auth)');
let pwFail = 0;
for (const f of jsFiles) for (const { n, line } of code(read(f))) {
  if (/(localStorage|sessionStorage)\.setItem\([^)]*pass/i.test(line)) { pwFail++; add('FAIL', 'Password stored in browser storage', `${rel(f)}:${n}`); }
  if (/console\.(log|info|warn|error)\([^)]*password/i.test(line)) { pwFail++; add('FAIL', 'Password passed to console', `${rel(f)}:${n}`); }
}
if (!pwFail) add('PASS', 'Passwords are never written to storage or the console by the client');
let writeFail = 0; const updated = new Set();
for (const f of jsFiles) for (const { n, line } of code(read(f))) {
  if (/\.(insert|upsert)\(/.test(line) || (/\.delete\(/.test(line) && /\.from\(|supabase/.test(line))) { writeFail++; add('FAIL', 'Direct table insert/upsert/delete in client code', `${rel(f)}:${n}`); }
  const m = /from\(['"](\w+)['"]\)\.update/.exec(line); if (m) updated.add(m[1]);
}
const allowedUpdate = new Set(['profiles', 'player_settings']);
for (const t of updated) if (!allowedUpdate.has(t)) { writeFail++; add('FAIL', 'Client updates an unexpected table', t); }
if (!writeFail) add('PASS', 'Client writes only via update() on profiles/player_settings and via RPC functions', [...updated].join(', '));
add('PASS', 'Inventory', `${files.length} files, ${(files.reduce((n, f) => n + statSync(f).size, 0) / 1048576).toFixed(2)} MB total`);

const order = { FAIL: 0, WARN: 1, PASS: 2 };
for (const r of results.sort((a, b) => order[a.level] - order[b.level])) console.log(`${r.level.padEnd(4)}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
const fails = results.filter((r) => r.level === 'FAIL').length, warns = results.filter((r) => r.level === 'WARN').length;
console.log(`\n${results.length} checks: ${fails} FAIL, ${warns} WARN. ${fails ? 'Fix the FAIL items before deploying.' : 'No blocking problems found by these checks.'}`);
process.exit(fails ? 1 : 0);
