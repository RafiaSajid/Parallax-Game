# PARALLAX setup (free tiers only)

## 1. Supabase (free)
1. Create a project at supabase.com (Free plan). Do not enable paid add-ons.
2. **SQL Editor** → New query → paste `supabase/schema.sql` → Run. Safe to re-run.
3. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key into `js/config.js`. Never use or commit the `service_role` key.
4. **Authentication → Providers → Email**: keep "Confirm email" ON; set minimum password length to 8 or more.
5. **Authentication → URL Configuration**: set Site URL to your Netlify URL (or `http://localhost:3000` while testing) and add these Redirect URLs: your Netlify URL `/**` and `http://localhost:3000/**`.
6. For fast local testing you may temporarily turn "Confirm email" off. Turn it back on before sharing the site.

## 2. Run locally
Modules do not work from `file://`. From the `parallax` folder run `npx serve -l 3000` or `python3 -m http.server 3000`, then open http://localhost:3000.

## 3. Deploy on Netlify (free)
Run `node tools/make-deploy.mjs`, then drag the generated `deploy` folder onto your Netlify site (Deploys tab) or app.netlify.com/drop. Or connect a Git repo with **no build command** and publish directory `.`. The `_headers` file adds the security headers and CSP. Full guide: `docs/DEPLOY.md`. Then add the `*.netlify.app` URL to Supabase's Site URL and Redirect URLs (step 1.5).

## 4. Verify RLS
Create two accounts, then follow `supabase/rls_tests.sql`.

## Free-tier limits (check the providers' pricing pages for current numbers)
- Supabase's built-in email service is heavily rate-limited and meant for testing. Signup and reset emails may be delayed, land in spam, or be refused under load. Delivery is not guaranteed. Custom SMTP is a paid or third-party service and is intentionally not used.
- Free Supabase projects pause after about a week of inactivity. Restore from the Supabase dashboard; until then the app shows a "cannot reach the server" message.
- Database size, bandwidth and monthly-active-user quotas apply on both Supabase and Netlify.
- The anon key is public by design. Security comes from RLS and column grants in `schema.sql`, not from hiding it.

## Not included (deliberately)
Account deletion (needs the service-role key on a server). Players cannot write progress, results or achievements directly; only the `start_level` and `submit_level_result` functions can.

## Password and account security
- Supabase Auth hashes passwords (bcrypt) and never exposes them; this app never stores or logs them.
- Authentication -> Sign In / Providers -> Email: minimum length 8 and "Password requirements" = lowercase + uppercase + digits + symbols. These settings apply only to passwords set AFTER you save them. Older accounts keep their old password until it is changed.
- Leaked-password (HaveIBeenPwned) protection is a paid-plan feature as far as we know. It is not used; confirm on Supabase's pricing page. The app instead blocks a short list of common passwords client-side (feedback only).
- Keep "Confirm email" ON. Supabase rate-limits sign-ins and emails per IP on the server. The app adds a 30-second pause after 5 failed logins (a convenience, not a security boundary).
- Optional hardening later: Authentication -> Attack Protection -> CAPTCHA (Cloudflare Turnstile is free). It needs a site key and a CSP change; ask when ready.
- Delete weak test accounts: Authentication -> Users -> select -> Delete. Their profile rows are removed automatically.
- Email links: the redirect address must be listed under Authentication -> URL Configuration -> Redirect URLs EXACTLY (same host and port, e.g. http://localhost:3000/** vs http://127.0.0.1:3000/**). Otherwise Supabase sends people to the Site URL.

## 3D engine notes
- Three.js is pinned to 0.170.0 from jsDelivr through an import map in `game.html`. Netlify's CSP allows that inline import map by its SHA-256 hash (in `_headers`). If you change the import map (for example the Three.js version), the browser console shows the new expected `sha256-...` value; paste it into `_headers`. Keep the import map on ONE line.
- Controls: click a cube or press 1-3 to select; arrows/WASD slide; Q/E roll sideways; R/F tip forward/back; P or Esc pause. Touch controls come in the polish step.

## Updating level 1 par values (if you already ran schema.sql)
Run `supabase/migrations/002_level01_par.sql` once in the SQL editor.

## Idle sign-out
Sessions end after 30 minutes of inactivity (any tab). Free Supabase has no server-side inactivity timeout, so this is a browser-side control: it protects a shared computer, but it is not a replacement for a strong password.
