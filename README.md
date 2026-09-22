# Turf Radar

Static map of football turfs around Bengaluru with Playo's published hourly rates and live slot availability.
No server: one HTML file, a data file, and a script that rebuilds the data file.

## Run

```sh
node fetch-venues.mjs                  # rebuilds public/venues.geojson from Playo (about a minute)
python3 -m http.server 8080 -d public  # any static file server works
```

Open http://localhost:8080. Opening `index.html` directly from disk does not work because browsers block `fetch` of `venues.geojson` over `file://`.

A GitHub Action (`.github/workflows/refresh-venues.yml`) re-runs the fetch daily at 06:30 IST, or on demand from the Actions tab, and commits `public/venues.geojson` when the data changed. Cloudflare Workers Builds is connected to the repo and deploys every push to `main`.

Deploy by hand if needed: `npx wrangler deploy` (config in `wrangler.jsonc`, uploads `public/` as static assets to Cloudflare). Live at https://turf-radar.rohankmr414.workers.dev. Re-run `fetch-venues.mjs` and deploy again whenever you want a fresher catalog.

## Files

- `public/index.html`: the whole UI. MapLibre GL from jsdelivr, OpenFreeMap tiles, vanilla JS.
- `fetch-venues.mjs`: paginates Playo's venue list for football (`SP2`) around Challaghatta, fetches each venue's price chart, writes `public/venues.geojson`.
- `wrangler.jsonc`: Cloudflare deploy config, static assets only.
- `public/venues.geojson`: generated catalog as a GeoJSON FeatureCollection, sorted by distance from Challaghatta. GitHub renders it as a map, with pins coloured by price via `marker-color`.

## Playo endpoints used

All are public website endpoints. The `Authorization` value is the client key embedded in playo.co's own JavaScript bundle, not a user credential.

| Purpose | Request | CORS |
|---|---|---|
| Venue list | `POST https://api.playo.io/venue-public/v2/list` body `{category:"venue", page, lat, lng, sportId:["SP2"]}` | `*` |
| Price chart | `GET https://playo.club/book-api/v1/pricing/{venueId}/SP2/` + `Authorization` | `*` |
| Live slots | `GET https://playo.club/book-api/v5/availability/{venueId}/SP2/{YYYY-MM-DD}/?deviceType=99` + `Authorization` | `*` |
| Bookable sports | `GET https://playo.club/book-api/v3/sports/{venueId}/` + `Authorization` (not used by the UI) | `*` |

`api.playo.io/booking-lab-public/...` serves the same availability data but only allows the `https://playo.co` origin, so the browser cannot call it. `playo.club` mirrors it with open CORS.

Slot `status` 1 means available, 0 means booked or past. `slotDuration` is 30 or 60 minutes. Venues advertise a booking window (`dateLimit`, mostly 60 days) but the availability endpoint answers for dates beyond it too. Prices in `slotInfo` are strings; one venue returned a comma-joined list, so the UI uses `parseFloat`.
The pricing endpoint intermittently returns 500 under concurrent load; the fetch script retries and falls back to the previous `venues.geojson` entry.
playo.club sits behind an AWS WAF rate rule: roughly 40 requests within a minute from one IP to the sports or availability endpoints returns `403` for about a minute. One viewer polling one venue every 30 seconds stays far below that. The pricing endpoint is not covered by that rule.

Booking happens on Playo. Picking a slot here does not reserve anything.
