// Builds a clean ./deploy folder containing ONLY what the website needs, then scans it.
// Usage: node tools/make-deploy.mjs      then drag the "deploy" folder onto Netlify (Deploys tab or app.netlify.com/drop).
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'deploy');
if (!existsSync(join(root, 'js', 'config.js'))) { console.error('js/config.js is missing. Copy js/config.example.js to js/config.js and fill in your Project URL and publishable/anon key.'); process.exit(1); }
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
for (const n of readdirSync(root)) if (n.endsWith('.html') || n === '_headers') cpSync(join(root, n), join(out, n));
const skip = (src) => !/(\.md|\.DS_Store|config\.example\.js)$/.test(src);
for (const d of ['css', 'js', 'assets']) if (existsSync(join(root, d))) cpSync(join(root, d), join(out, d), { recursive: true, filter: skip });
const count = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? count(join(d, f)) : 1), 0);
console.log(`Built ${basename(out)}/ with ${count(out)} files (docs, SQL, tools and README are NOT included).\n`);
try { execFileSync(process.execPath, [join(root, 'tools', 'security-scan.mjs'), out], { stdio: 'inherit' }); }
catch { console.error('\nThe scan found blocking problems. Fix them, then run this again. Do NOT upload the deploy folder yet.'); process.exit(1); }
console.log('\nNext: drag the "deploy" folder onto your Netlify site (Deploys tab).');
