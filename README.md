# HomeBite

A restaurant-first, cash-on-delivery food platform for a Bengaluru pilot. One Next.js application connects customers, restaurant owners, riders, and the platform admin.

## Run locally

Requires **Node.js 22+** and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. With no Supabase environment values, a clearly marked **device-local demo** runs automatically. It never places real orders. Three fictional kitchens and menus are included, with one reusable illustrative food photograph. The demo role switcher is absent in live mode.

### Try the whole journey

1. As **Customer**, open The Everyday Kitchen, add a dish, and check out. Select a delivery pin in Bengaluru and provide a complete address. Use fictional details in the demo.
2. Switch the top bar to **Restaurant**, open **For kitchens**, then accept the order, start preparation, and mark it ready.
3. Switch to **Rider**, open **For riders**, and go online if needed. The nearest available rider is offered the order. Accept within 60 seconds, confirm pickup, and confirm delivery after checking cash collection.
4. Switch back to **Customer** and check **My orders**.
5. Switch to **Admin** to inspect the order and export the manual settlement ledger. Reset the demo there when finished.

Demo records and role are shared across tabs in the same browser using local storage. Demo mode is a walkthrough, not a multi-user backend. Live mode uses Supabase Postgres, Auth and Realtime, with polling as a fallback.

## Included

| Surface    | Capabilities                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer   | Kitchen/dish search, cuisine and vegetarian filters, menus, quantities, single-kitchen basket, authenticated COD checkout, delivery pin and zone validation, order history, status tracking and active rider location                             |
| Restaurant | Email signup/login, kitchen profile, banner URL and hours, menu add/edit/delete, price/category/photo/availability controls, open/pause toggle, incoming order notification, accept/decline/prepare/ready queue                                   |
| Rider      | Email signup/login, phone/vehicle details, admin verification, online/offline, browser location sharing, nearest-rider offers, accept/decline, timeout reassignment, pickup/drop map and directions, delivery/cash confirmation, accrued earnings |
| Admin      | Partner approval/suspension, all orders, waiting-rider visibility, retry dispatch, operational totals, CSV settlement ledger                                                                                                                      |
| Backend    | RLS, restricted transactional RPCs, authoritative prices, ownership checks, order audit events, atomic rider assignment and a protected dispatch cron endpoint                                                                                    |

## Product decisions

- **Brand:** HomeBite. No domain has been purchased.
- **Service area:** defaults to a 12 km straight-line radius around 12.9716, 77.5946 (central Bengaluru). Admin → Service area can change the name, centre, and radius (1–100 km). New orders require both kitchen and customer pins inside the saved area.
- **Payment:** cash on delivery only. ₹35 delivery; no platform commission in this pilot. All money is stored in integer paise.
- **Identity:** anyone can browse; placing an order requires a confirmed customer account. There is no anonymous/guest checkout.
- **Partners:** one kitchen per owner; consistent public templates; manual kitchen and rider approval. No self-assigned admin accounts.
- **Dispatch:** nearest approved online rider within the configured service radius of the kitchen with a location newer than five minutes and no active delivery. One outstanding offer per rider. Offers expire after 60 seconds; declined/expired riders are excluded for that order.
- **No rider:** keep the order ready and visible for operations intervention. No silent auto-cancellation. Matching retries on availability updates, delivery completion, manual retry and scheduled dispatch.
- **Settlement:** ₹35 accrues to the delivering rider; food value belongs to the kitchen. CSV records are not proof of bank payment.
- **Hours:** displayed text; the explicit open/pause toggle determines acceptance. Operators must manage it each shift.

The plan mentioned Next.js 14. This implementation uses the current verified Next.js 16.3.4 release and React 19, preserving the App Router and Supabase architecture instead of starting on the older framework version.

## Live setup and deployment

See [deployment guide](docs/DEPLOYMENT.md) for Supabase provisioning, the migration, admin bootstrap, environment variables and Vercel deployment. No Supabase project, production database, Vercel deployment or real partner has been created by this repository alone. Account credentials are intentionally not committed.

Production requires these environment values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SERVICE_ROLE_KEY
CRON_SECRET=GENERATE_A_LONG_RANDOM_SECRET
```

Copy `.env.example` to `.env.local` for local live-backend testing. Never put the service role key in a `NEXT_PUBLIC_` variable. Vercel must use Node 22 or newer. The configured every-minute Vercel cron may require a paid Vercel plan; a database scheduler alternative is described in the deployment guide. Browser-based dispatch fallback operates only while the rider workspace is open.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The test suite includes the **actual production SQL migration** running in embedded PostgreSQL (PGlite). Tests cover the complete order flow, permission boundaries, forged totals, invalid carts, kitchen ownership, cancellation timing, rider eligibility, double assignment, declined/expired offers, location privacy, and signup privilege escalation. PGlite replaces only the unavailable `pgcrypto` extension declaration; its built-in `gen_random_uuid` is used. It cannot validate hosted Supabase email delivery, WebSocket transport, Vercel scheduling or browser geolocation permissions.

GitHub Actions runs type checking, lint, tests and the production build on pushes and pull requests.

## Repository map

- `app/`: App Router routes, styles and protected cron endpoint.
- `components/`: customer, kitchen, rider, admin and account workspaces; shared store and map.
- `lib/domain.ts`: TypeScript order rules, checkout validation and nearest-rider logic used by the demo.
- `lib/supabase.ts`: public-key Supabase client. Live authority resides in SQL, not UI guards.
- `supabase/migrations/001_homebite.sql`: tables, policies, role bootstrap trigger, RPCs, dispatcher and audit log.
- `tests/`: domain and database integration tests.
- `docs/`: deployment instructions, security model, pilot checklist and asset credit.

## Before a real pilot

Review [launch checklist](docs/LAUNCH-CHECKLIST.md). Replace fictional content with consenting partner kitchens and accurate food photography. The policy page is explicitly a **draft** requiring business identity, verified support contact, data retention and operator review. No staffed support service, legal sign-off, real-world rider recruitment, or production operational validation is implied.

Existing Supabase installations must apply [migration 002](supabase/migrations/002_service_area.sql) to enable [Admin service-area settings](docs/SERVICE-AREA.md). No existing orders are removed.
