# Pilot readiness checklist

## Infrastructure

- [ ] Supabase project created; migration applied successfully.
- [ ] Public environment values configured; production does not show the demo role switcher.
- [ ] Email confirmation, password reset, and HTTPS redirects verified.
- [ ] Admin account promoted by the database owner.
- [ ] Vercel or self-hosted deployment built and reachable over HTTPS.
- [ ] One-minute scheduled dispatch verified with all rider windows closed.
- [ ] Secrets stored in environment configuration and absent from Git history.

## Business and partner setup

- [ ] Confirm Bengaluru 12 km zone, ₹35 delivery fee, no pilot commission, and manual payout policy.
- [ ] Confirm domain/brand and operator business identity.
- [ ] Add verified customer support contact and response procedure.
- [ ] Review/replace the draft policies, including retention/deletion and paid-COD issue handling.
- [ ] Recruit real kitchens and 2–3 pilot riders; validate their details before approval.
- [ ] Replace fictional menus/photos with partner-approved content and food information.
- [ ] Train kitchens on open/pause, preparation and pickup handoff.
- [ ] Train riders on accepting offers, geolocation, COD collection and daily settlement.

## Real-device acceptance

- [ ] Customer signup → confirm email → browse → basket → place COD order.
- [ ] Kitchen notification → accept → prepare → ready.
- [ ] Nearest available rider offer → accept → pickup → deliver → cash confirmation.
- [ ] Customer tracking updates across devices; active rider location appears.
- [ ] History, kitchen totals and rider accrued earnings match the order.
- [ ] Unknown users, other kitchens and unassigned riders cannot retrieve the order.
- [ ] Cancel before acceptance; late cancellation rejected.
- [ ] Kitchen closed / item sold out during checkout fails clearly.
- [ ] Rider decline / timeout / stale location / offline / denied geolocation handled.
- [ ] No available rider remains visible for operator intervention.
- [ ] CSV ledger reconciles food value, delivery earning and cash collection.
- [ ] Multiple simultaneous orders never claim the same rider.
- [ ] Mobile layout, keyboard navigation and browser permission prompts tested.

## Not included as automated operations

Online payments/refunds, bank payouts, tax invoicing, background native location, turn-by-turn navigation, route-aware ETA, restaurant/rider document verification, a staffed support console, push notifications, and auto-cancellation of abandoned accepted deliveries. These require operational decisions or additional integrations beyond this COD pilot.
