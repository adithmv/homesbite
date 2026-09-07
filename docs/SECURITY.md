# Security and operational boundaries

## Authority

The Supabase public client is intentionally browser-visible. Row-level security controls all reads. Table mutations are not granted to anonymous or authenticated API roles; only narrowly defined RPCs are executable. Security-definer functions fix `search_path` and validate the authenticated user and record ownership. The private schema exposes only read predicates needed for policies. Service-role access is isolated to the server cron endpoint and must never be bundled into client code.

The role picker exists only when Supabase is unconfigured. Production roles come from `profiles`, which an API caller cannot update. Signup metadata cannot elevate a user to admin. Partners require approval.

## Orders and prices

The database locks kitchen and menu rows during checkout, checks availability and the delivery zone, limits cart size/quantity, snapshots item names/prices, and computes the fee and total in integer paise. A per-customer row lock, a brief submission interval and an active-order limit reduce accidental duplicates. This is not a durable network idempotency-token protocol: check order history before retrying after an ambiguous network result.

Transitions require both record ownership and the correct previous state. A customer may cancel only while placed. Only the owning kitchen can accept, decline, prepare and mark ready. Only the assigned rider who accepted the offer can confirm pickup or delivery. The admin has visibility and partner approval, not an unrestricted status override. Audit events retain state transitions.

## Dispatch

A transaction-scoped advisory lock serializes assignment operations. A partial unique index is a second defense against simultaneous active assignments for one rider. Matching excludes offline, unapproved, stale, busy, distant and previously declining riders. Pending offers expire after 60 seconds and are retried by scheduled dispatch. Accepted offers do not expire; abandoned accepted deliveries require operator intervention. Offline/suspended riders cannot receive new assignments; existing accepted deliveries are retained so they can be completed.

## Privacy

Customers see their orders, kitchens see their own orders, and riders see assigned orders. Unassigned riders cannot browse customer orders. Live location is exposed to the assigned customer only during an active delivery, and stale positions are not drawn. After delivery, order history remains visible to the participants; historical rider GPS is not exposed to customers. Admins can see platform operations. The app stores only the latest rider location, not a route history.

Realtime SELECT authorization is enforced by Supabase; the client refreshes through the same RLS policies. Polling is a fallback, not a guarantee against connectivity loss. Demo data uses a distinct cart storage key from live mode. Device-local demo data should be fictional.

## Limits requiring production validation

Embedded PostgreSQL tests exercise application policies and RPCs, but do not replace tests against hosted Supabase JWT validation, email delivery, Realtime, cron, mobile browser permissions, or operational practices. No penetration-test or legal-compliance certification is claimed. Establish retention/deletion, support escalation, partner verification and cash reconciliation procedures before a real pilot. Rate-limit public authentication using the identity provider's supported controls.

## Optional browser catalog tool

Where a browser supports the proposed `document.modelContext` API, HomeBite registers `read_homebite_catalog`. It searches the same approved catalog used by the UI and has no order-placement or privileged mutation capability. The input/search contract is unit tested. Native registration was not verified in a WebMCP-capable browser during this build; ordinary browsing is independent of that optional API.
