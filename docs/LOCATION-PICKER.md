# Location selection

Registration includes a searchable map for every role. Kitchen registration requires a selected
location inside the configured service area; it is carried into the kitchen setup after login.
Kitchen profiles, customer checkout, and admin service-area settings use the same picker.

Search for a town, landmark, or postcode, then choose a result. You can also click the map,
drag the pin, or choose **Use my location**. Coordinates fill automatically and the app looks
up a region name. Check the exact pickup/delivery pin and include house, flat, and street
details in the address. Region names are approximate; admin coverage remains a radius around
the saved centre, not a town boundary.

Device location needs browser permission and HTTPS (or localhost). If permission is denied,
search and manual map selection remain available. If region lookup fails, the chosen
coordinates remain usable.

Place search requires no API key. Multiple admin service areas require migration
`003_multiple_service_areas.sql` after 002. Search uses the server
route `/api/locations` with Photon and OpenStreetMap data. The default public Photon demo
service is for reasonable pilot usage, can throttle requests, and offers no availability
guarantee. For production traffic, configure the server-only `PHOTON_BASE_URL` environment
variable to a dedicated compatible Photon service, then redeploy. See
[Photon documentation](https://github.com/komoot/photon).

Search is submitted explicitly rather than on every keystroke. Searches and selected
coordinates for region detection reach the configured provider; this is disclosed in the
app's policies. Rider dispatch continues to use live GPS rather than a registration pin.
