# HomeBite — Project Plan & Work Breakdown

A restaurant-first food delivery platform (alternative to Swiggy/Zomato), built as one Next.js codebase with three connected surfaces: **Customer App**, **Restaurant Dashboard**, and **Rider Window**.

**MVP scope:** all three apps built together. Payments: Cash on Delivery only at launch. Rider assignment: system auto-assigns the nearest available rider.

---

## 1. High-Level Architecture

- **Framework:** Next.js 14 (App Router), one codebase, route groups per surface (`/`, `/restaurant`, `/rider`)
- **Database & Auth & Realtime:** Supabase (Postgres, Auth, Realtime subscriptions)
- **Maps:** Leaflet + OpenStreetMap (free, no API billing)
- **Rider matching (v1):** haversine (straight-line distance) nearest-rider logic; upgradeable later to routing-aware matching
- **Payments:** none integrated at launch (COD only)
- **Hosting:** Vercel

The whole system is really one shared **order state machine** that all three surfaces read/write to:

```
placed → restaurant_accepted → preparing → ready_for_pickup
       → rider_assigned → picked_up → delivered
       (cancelled/rejected branches at early stages)
```

---

## 2. Work Phases

### Phase 0 — Foundations

**What it covers:** project setup, accounts, environment, core database schema.

| Task                                                                                                                        | Who                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Create Supabase project                                                                                                     | **You**                                           |
| Create Vercel account/project (or reuse existing)                                                                           | **You**                                           |
| Decide on final app name/domain (HomeBite vs Homes Bite) and check domain availability                                      | **You**                                           |
| Provide Supabase URL + anon/service keys as env vars                                                                        | **You**                                           |
| Scaffold Next.js project, folder structure, route groups                                                                    | **AI agent**                                      |
| Design and create database schema (restaurants, menu_items, orders, order_items, riders, rider_locations, addresses, users) | **AI agent**, reviewed by **You**                 |
| Set up Supabase Auth (restaurant login, rider login, customer login/guest checkout)                                         | **AI agent**                                      |
| Decide: single-city launch or multi-city from day one (affects geospatial design)                                           | **You** (decision), **AI agent** (implementation) |

---

### Phase 1 — Restaurant Dashboard

**What it covers:** the tool restaurants use to manage themselves.

| Task                                                                                                                             | Who                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Restaurant signup/login flow                                                                                                     | **AI agent**                                                     |
| Restaurant profile setup (name, banner, description, address, hours)                                                             | **AI agent** builds it; **You** decide what fields are mandatory |
| Menu management (add/edit/remove items, categories, price, photos, availability toggle)                                          | **AI agent**                                                     |
| Incoming order queue (new → accept/reject → preparing → ready)                                                                   | **AI agent**                                                     |
| Notification for new orders (in-app minimum; push/sound later)                                                                   | **AI agent**                                                     |
| Decide: does each restaurant get a fully custom page design, or one consistent template with restaurant-supplied content/photos? | **You** (decision)                                               |
| Source or approve placeholder restaurant images/branding for testing                                                             | **You**                                                          |

---

### Phase 2 — Customer App

**What it covers:** browsing, ordering, tracking.

| Task                                                            | Who                |
| --------------------------------------------------------------- | ------------------ |
| Home/landing page — restaurant discovery, search, filters       | **AI agent**       |
| Individual restaurant page (`/r/restaurant-slug`) with menu     | **AI agent**       |
| Cart + checkout (COD, delivery address entry)                   | **AI agent**       |
| Order tracking page (live status updates via Supabase Realtime) | **AI agent**       |
| Order history for returning customers                           | **AI agent**       |
| Define delivery zones / service area boundaries                 | **You** (decision) |
| Decide guest checkout vs required signup                        | **You** (decision) |
| Review and approve UI/UX flow before final polish               | **You**            |

---

### Phase 3 — Rider Window

**What it covers:** the interface riders use to work.

| Task                                                                                       | Who                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Rider signup/login (with basic verification fields — name, phone, vehicle)                 | **AI agent** builds it; **You** decide verification requirements |
| Rider online/offline toggle + live location sharing (browser geolocation)                  | **AI agent**                                                     |
| Auto-assignment logic: nearest available rider gets the order                              | **AI agent**                                                     |
| Accept/reject assigned order with timeout fallback (reassign if rider doesn't respond)     | **AI agent**                                                     |
| Pickup navigation (restaurant location) and drop navigation (customer address) via Leaflet | **AI agent**                                                     |
| Mark picked up / delivered, triggering order state update                                  | **AI agent**                                                     |
| Decide rider payout tracking (even manual/spreadsheet-based for MVP is fine)               | **You** (decision)                                               |
| Recruit test riders for real-world trial                                                   | **You**                                                          |

---

### Phase 4 — Cross-Cutting Concerns

**What it covers:** things that touch all three surfaces.

| Task                                                                                                                 | Who                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Realtime sync so order status updates instantly across customer/restaurant/rider views                               | **AI agent**                                                                                                     |
| Basic admin view (you, as platform owner, seeing all restaurants/orders/riders)                                      | **AI agent** builds it; **You** define what you need to see                                                      |
| Error handling: rejected orders, no riders available, restaurant closed mid-order                                    | **AI agent** implements; **You** decide business rules (e.g., what happens if no rider accepts within X minutes) |
| Mobile responsiveness across all three surfaces                                                                      | **AI agent**                                                                                                     |
| Basic security review (auth checks, restaurant can't see other restaurants' data, rider can't see unassigned orders) | **AI agent** implements; **You** should sanity-test before real use                                              |
| Legal basics: terms of service, privacy policy, refund/cancellation policy text                                      | **You** (content) — AI agent can draft, but you must review/own this                                             |
| Decide launch pricing: delivery fee structure, any commission from restaurants                                       | **You** (decision)                                                                                               |

---

### Phase 5 — Testing & Launch

**What it covers:** getting from "built" to "usable."

| Task                                                                                   | Who                                                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| End-to-end test of full order flow (place → accept → prepare → assign rider → deliver) | **You**, with AI agent fixing bugs found                        |
| Load a few real restaurants and real menus as pilot data                               | **You**                                                         |
| Recruit 2–3 pilot riders for a real trial run                                          | **You**                                                         |
| Fix bugs found during pilot                                                            | **AI agent**                                                    |
| Set up production environment variables and deploy to Vercel                           | **AI agent** guides; **You** execute (owns the accounts/domain) |
| Decide go-live date and initial service area                                           | **You**                                                         |

---

## 3. Your Ongoing Responsibilities Throughout

These are things that stay with you regardless of phase, because they require real-world access/decisions the AI agent cannot make:

- Owning all accounts (Supabase, Vercel, domain registrar) and their billing
- Providing API keys/env vars and keeping them secure
- Making product decisions (pricing, delivery zones, custom vs template restaurant pages, verification rules)
- Recruiting real restaurants and riders for pilot testing
- Reviewing UI/UX and giving feedback on what feels wrong
- Legal/policy content ownership (even if drafted with help)
- Testing real flows on real devices before wider rollout

## 4. What the AI Agent Handles Throughout

- Code: schema design, all three app surfaces, realtime wiring, state machine logic
- Implementation of decisions once you've made them
- Bug fixes during testing
- Explaining trade-offs when a decision needs your input
- Drafting policy/legal text for your review (not final legal sign-off)

---

## 5. Suggested Build Order

Even though scope = all three apps, build order still matters for momentum and testability:

1. Schema + auth (Phase 0)
2. Restaurant dashboard enough to create a restaurant + menu (Phase 1, partial)
3. Customer app enough to browse and place a COD order (Phase 2, partial)
4. Order flows end-to-end between restaurant and customer (no rider yet — restaurant marks "delivered" manually)
5. Rider window + auto-assignment layered in (Phase 3)
6. Polish, cross-cutting concerns, testing (Phase 4–5)

This lets you see and test a working (if incomplete) order flow early, rather than waiting for all three apps to be fully done before anything works end-to-end.
