# Change the service area

## One-time upgrade for your existing project

1. Open `supabase/migrations/002_service_area.sql` on GitHub and copy the complete SQL file.
2. In your existing Supabase project, open SQL Editor, paste it into a new query, and Run as the database owner.
3. Wait for the GitHub-connected Vercel deployment to finish, or redeploy the latest `main` commit.
4. Refresh HomeBite and sign in as your administrator. Open **Admin → Service area**.

Do not rerun migration 001. Migration 002 keeps existing users, kitchens, menus, orders, and cron jobs. Repeating migration 002 preserves the saved area too. No new environment variables are needed.

## Choose the area

- Enter a public area name, such as Kochi.
- Click the map to place the centre, or enter latitude and longitude.
- Enter a radius from 1 to 100 km. The circle previews the coverage.
- Review the list of kitchens that would be outside the area, then click **Save service area**.

The database validates new delivery addresses and kitchen profiles against this circle. Kitchens outside it disappear from discovery and cannot receive new orders, including through old bookmarked pages. An existing basket may be rejected at checkout if the admin changed the area while the customer was ordering. Server validation always uses the saved settings.

Existing orders are not cancelled or rewritten. Their pickup and delivery addresses remain unchanged. The configured radius also determines the maximum rider-to-kitchen distance for new assignments, including orders already waiting for a rider. Accepted assignments remain intact. Distances are straight-line distances, not driving distances.

Only administrator accounts may save changes. Everyone may read the current area name and boundary. Changes reach other sessions via Realtime, with the existing 15-second polling fallback. Demo mode stores settings on the device and upgrades old demo data to the default area automatically.

If the app says service-area settings are unavailable, verify migration 002 completed successfully and refresh. No API key changes are required.
