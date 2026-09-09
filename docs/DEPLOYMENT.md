# Deploying HomeBite

## 1. Provision Supabase

Create a project in your own Supabase account and choose the desired region. Retain its database password securely. In SQL Editor, run `supabase/migrations/001_homebite.sql` once against the new project, then run `supabase/migrations/002_service_area.sql`. The migration must run as the project database owner; do not run it under an application user. It creates the schema, row-level policies, role-safe signup trigger, mutation functions, audit log and Realtime publication entries.

The production database starts **empty**. The demo kitchens exist only in the local demo module and are not silently seeded into live operations.

In Auth settings:

- Enable email/password signup and email confirmation.
- Set the Site URL to the production HTTPS origin.
- Allow that origin's `/login` URL for email confirmation and password-reset redirects. Add `http://localhost:3000/login` when using local backend testing.
- Configure a production email provider and rate limits. Test confirmation and password reset before launch.
- Set a minimum password length of at least 12 characters. The signup form requires this too.

The signup trigger requires a name and valid 10-digit Indian mobile number in user metadata. Create application users via HomeBite's signup form. Metadata may request `customer`, `restaurant` or `rider`; requesting `admin` never grants it.

## 2. Bootstrap the platform admin

Create and confirm your own customer account through the application. Find that specific account's ID in Supabase Auth, then execute the following as the database owner, substituting its exact UUID:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_VERIFIED_ACCOUNT_UUID';
```

The UI and public RPCs cannot perform this promotion. Sign out and back in, then open `/admin`.

## 3. Configure the application

Copy `.env.example` to `.env.local` or set equivalent variables in Vercel:

| Variable                        | Purpose                                                   | Browser-visible? |
| ------------------------------- | --------------------------------------------------------- | ---------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase API URL                                          | Yes              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public/anonymous project key; constrained by database RLS | Yes              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Cron dispatch only; server runtime                        | **No**           |
| `CRON_SECRET`                   | Authorization for `/api/dispatch`                         | **No**           |

Use a strong randomly generated `CRON_SECRET`. Do not add real secrets to Git. Both public Supabase values must be set for live mode. Rebuild after changing public environment values because Next.js embeds them in the browser bundle.

## 4. Deploy to Vercel

1. Import `adithmv/homesbite` in your Vercel account.
2. Use the Next.js preset, repository root, `npm ci`, `npm run build`, and Node.js **22+**.
3. Set environment values in the correct production/preview environment.
4. Deploy, then update Supabase Site URL/redirect URLs to the assigned HTTPS origin.
5. Run the pilot checks below on the deployed origin.

`vercel.json` schedules `/api/dispatch` once per minute. Vercel sends the configured `CRON_SECRET` as a Bearer token. The endpoint rejects missing/wrong authorization and does not expose the service key. Every-minute cron requires a plan supporting that frequency. Do not accept an unexpected billing upgrade silently: select an appropriate plan or use the database alternative.

### Database-scheduler alternative

Supabase supports a database scheduler where enabled for your project. Enable `pg_cron` using your project's database extension controls, remove the `crons` entry from `vercel.json`, then run this as the database owner:

```sql
select cron.schedule(
  'homebite-dispatch',
  '* * * * *',
  $$select private.dispatch();$$
);
```

The scheduled database owner can invoke the private dispatcher; ordinary authenticated users cannot. Check scheduler execution history in your project. With this alternative the server-only service key and HTTP cron secret are unnecessary unless you also use the HTTP endpoint. Reassignment occurs on the next scheduler tick, so a 60-second offer can take up to roughly another minute to reassign with minute-granularity scheduling. Rider windows also request dispatch every 20 seconds while open.

## 5. Onboard live partners

- Kitchen owners sign up, confirm email, complete their profile with correct coordinates and an HTTPS banner URL, and add real menu items. Review and approve each kitchen in `/admin`.
- Riders sign up with phone and vehicle type. Verify their identity and operating requirements outside the app before approving them.
- Riders must use HTTPS (or localhost for development), allow location access, and keep the rider page open. This web app cannot guarantee background location updates on mobile operating systems.
- Kitchen hours are informational. The owner toggles open or paused to control acceptance.

## Verification on the real deployment

Use separate accounts and devices for customer, kitchen, rider, and admin. Verify email confirmation/reset, session refresh/logout, closed-kitchen ordering, one complete COD delivery, denied location permissions, stale/expired offers, absent riders, customer isolation and kitchen isolation. Confirm the scheduled dispatcher runs with all browser tabs closed. Check Supabase Realtime publication and channel delivery. Reconcile the first COD collection against the exported ledger.

## Self-hosting

A Node 22+ host can use `npm ci`, `npm run build`, then `npm start`. Put it behind HTTPS and supply the same environment values. Schedule dispatch through a protected external scheduler or database cron. No external account has been provisioned by these instructions.

## Existing installations: service-area upgrade

Run only `supabase/migrations/002_service_area.sql` in SQL Editor, then deploy the updated app. Do not rerun migration 001 on an existing database. The upgrade preserves orders and defaults to the original Bengaluru 12 km area. Open Admin → Service area to change the name, centre and radius. See [service-area guide](SERVICE-AREA.md).
