# Security update setup

## Current installation: resolve the schema mismatch first

The reported database has `profiles` and `orders` but no `restaurants` or `menu_items`.
Do not run 001 blindly, delete tables, or apply 004 to that database. Confirm that the project
URL matches Vercel's `NEXT_PUBLIC_SUPABASE_URL`. Run `supabase/diagnostics.sql` and review
the table/column results to determine whether this is the wrong project or an older schema.
The diagnostic only reads schema metadata. Keep existing data and take a backup before a repair.

For an already matching installation, apply `004_security.sql` after 001–003 using the
Supabase SQL Editor as the project owner. For a genuinely new, empty project, apply
001, 002, 003, then 004 in order. Apply 004 last if reapplying an earlier migration:
earlier function definitions can otherwise replace hardened definitions.

## What the code enforces

- Admin MFA enrollment/challenge UI. The database requires a verified `aal2` session
  for admin read privileges, partner approval and service-area changes. A role alone
  is insufficient. Authenticator setup material stays in component memory; it is not logged.
- Shared, atomic place-search quotas: 30 requests per IP per minute plus a 600/minute
  platform cap. Raw IPs are HMAC-hashed before quota storage. Only the Vercel-provided
  client-IP header is trusted. Other hosts use a shared bucket until a trusted proxy
  adapter is implemented. At a minute boundary, fixed windows allow a burst across
  two windows; these are not sliding-window limits.
- Location lookup fails closed with 503 when the quota service or configuration is
  missing. Map selection and device GPS continue to work. Development without a
  backend uses a local shared limit; production never uses an in-memory fallback.
- Database limits on committed writes: rider updates 30/minute, new orders 6/minute,
  other order changes 120/minute, service-area changes 30/minute, kitchen/menu writes
  60/minute per account per table, dispatch RPCs 12/minute per account. Going offline
  remains allowed. Failed transactions roll these write counters back; these controls
  do not replace edge protection against invalid-request floods or distributed attacks.
- Private audit events for partner approvals/suspensions and service-area changes,
  visible to MFA-verified admins under **Security log**. Events contain actor IDs,
  target IDs, action and time, not GPS, phone numbers, addresses or tokens.
- Per-request nonce-based CSP blocks unauthorized scripts, script attributes, plugins
  and framing. Inline styles remain allowed for Leaflet. HTTPS page responses receive
  HSTS. Pages render dynamically and are private/no-store to keep nonces unique.
- Dependabot update PRs for npm and GitHub Actions. Updates require review and tests.

## Required hosting configuration

Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel's server environment alongside the existing
Supabase URL. It is now used by dispatch and the location quota RPC. Never prefix it
with `NEXT_PUBLIC_`, paste it into chat, or put it in the repository. Redeploy after
environment changes. The public Supabase key remains public by design and depends
on database RLS; it is not a privileged server key.

## Admin MFA

Enable TOTP enrollment and verification in Supabase Auth. After signing in as admin,
open `/admin`, choose **Set up authenticator**, scan the QR with your authenticator,
and enter its current six-digit code. Later sessions prompt for a code as needed.
Secure the Supabase, GitHub and Vercel owner accounts with MFA separately.

Recovery is an operator procedure: verify the account owner's identity and use the
Supabase Auth administration tools to recover an inaccessible factor. Do not weaken
the database's MFA rule or add a public bypass. No recovery codes are invented or
stored by this app.

## CAPTCHA and authentication rate limits

1. Create a Cloudflare Turnstile widget for the actual application domains.
2. Set its public site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel and redeploy.
3. Enable Turnstile CAPTCHA enforcement in Supabase Auth using the matching **secret**.
   Keep this secret in Supabase, never in a public environment variable.
4. Verify sign-in, signup and password reset. A widget alone does not enforce protection:
   Supabase must reject missing/invalid tokens, including direct API requests.
5. Review Supabase Auth rate limits and email confirmation/password settings. These
   platform settings cannot be changed by a SQL migration and were not applied here.

References: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Vercel trusted request headers](https://vercel.com/docs/headers/request-headers).

## Encryption and remaining operational work

This update adds HTTPS enforcement through HSTS; it does not implement custom
field encryption or end-to-end encryption. Supabase Auth handles password hashing.
Verify your hosting/database encryption and backup configuration in the actual project.
Additional field encryption would require a separate server-mediated data access and
key-management design; never put decryption keys in browser code.

Configure and test backups/restores, log alerting, edge traffic limits, session expiry,
and retention/deletion policies before public launch. Audit records currently remain
until an operator applies a retention policy. Old quota windows are cleaned during
subsequent quota requests. This is application hardening, not a penetration-test
certification. Hosted JWT, real MFA, CAPTCHA and multi-device tracking still need
validation against the correctly configured Supabase project.
