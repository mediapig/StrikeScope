# StrikeScope

**[strikescope.tudiancao.com](https://strikescope.tudiancao.com)**

An interactive globe for exploring nuclear scenarios: browse the world's nuclear power plants, run illustrative reactor-accident and nuclear-detonation reference zones driven by real-time weather, and see an offline population estimate for the affected area. Built as an educational visualization, not an emergency-planning or targeting tool.

## What it does

- **Global plant map** — every nuclear power plant tracked by [Global Energy Monitor](https://globalenergymonitor.org/projects/global-nuclear-power-tracker/)'s Global Nuclear Power Tracker, rendered on a MapLibre globe with day/night shading, filterable by status (operating / under construction / planned / decommissioned), searchable by name or country, bilingual (中文 / English).
- **Reactor accident scenarios** — pick a plant, pick an accident type (equipment leak / core meltdown / catastrophic core dispersal, each with a distinct dominant-isotope profile), and run a simulation. Plume direction, wind force, and rainfall are pulled automatically from live weather at the plant's location (via [Open-Meteo](https://open-meteo.com)) rather than hand-picked, so the reference zone reflects what's actually happening there right now.
- **Nuclear detonation scenarios** — place a detonation point and pick a yield from 23 publicly documented historical and current weapon systems (Hiroshima/Nagasaki, Trinity, Castle Bravo, Tsar Bomba, W76/W87/W88, DF-5/DF-41, and others), spanning fission, staged-thermonuclear, "dirty" thermonuclear, and neutron/enhanced-radiation designs — each with its own fallout-intensity multiplier based on fission fraction. Blast/thermal zones scale with yield; the fallout plume reuses the same live-weather model as the reactor scenarios.
- **Offline population estimates** — population within a scenario's reference zone is computed entirely client-side against a bundled, pre-processed [WorldPop](https://www.worldpop.org) population grid, instead of hitting a live API per request.
- **Sharing** — export a scenario as an image (with an embedded QR code back to the live site) to share outside the app.
- **Custom placements** — add a hypothetical plant or detonation point anywhere on the map.

Every simulation carries an explicit on-screen disclaimer: these are simplified, illustrative reference zones for public understanding, not dose forecasts, targeting data, or emergency instructions.

## Tech stack

- **[React 19](https://react.dev)** + **[Vite](https://vite.dev)** — single-page app, no backend. All data fetches (weather, population grid, plant list) happen client-side in the visitor's own browser.
- **[MapLibre GL JS](https://maplibre.org)** via `react-map-gl` — globe projection, custom raster protocol for the day/night lighting layer.
- **[Turf.js](https://turfjs.org)** — all the geometry: wedge/circle unions for plume shapes, point-in-polygon for the population lookup.
- **[Open-Meteo](https://open-meteo.com)** — free, keyless, CORS-enabled weather API called directly from the browser (rate-limited per calling IP, not per domain, so it scales with visitors rather than against a shared quota).
- **[geotiff.js](https://geotiffjs.github.io/geotiff.js/)** + **[Playwright](https://playwright.dev)** — build-time only, used by the data-sync scripts below (not shipped to the browser bundle).
- **GitHub Pages** — static hosting, deployed via GitHub Actions on every push to `main`.

## Data sources & automation

| Data | Source | Refresh |
|---|---|---|
| Plant locations | GEM Global Nuclear Power Tracker | Annual, automated PR ([`sync-plants.yml`](.github/workflows/sync-plants.yml)) |
| Population grid | WorldPop Global 2015-2030 constrained population mosaic (CC-BY 4.0) | Annual, automated PR ([`sync-population.yml`](.github/workflows/sync-population.yml)) |
| Weather | Open-Meteo | Live, per simulation |

Both sync workflows run on a yearly schedule (and can be triggered manually), regenerate the relevant data file, and open a pull request if anything changed — a human reviews the diff before it merges and deploys. Nothing gets pushed straight to `main` unattended.

- **Population grid**: WorldPop publishes an anonymously-downloadable global 1km population mosaic each year under a release tag with no predictable naming (`R2024A`, `R2024B`, `R2025A`, ...). `scripts/build-population-grid.mjs` discovers the current tag automatically, downloads the mosaic, resamples it to a 0.1° grid, and gzip-compresses it — the script fails loudly rather than silently falling back to stale data if it can't find a mosaic for the current year.
- **Plant data**: GEM's tracker has no anonymous API — the download is gated behind a lead-capture form. `scripts/download-gnpt-xlsx.mjs` drives a real headless browser through that form once a year, using one consistent project identity (configured via repository secrets, not hardcoded) rather than a fabricated one per run.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build to dist/
npm run lint      # oxlint
```

To manually refresh a data file locally:

```bash
npm run data:sync -- --input <path-to-GNPT-xlsx>
npm run data:population -- --input <path-to-worldpop-tif>   # or omit --input to auto-discover the current year
```

## Disclaimer

StrikeScope is an educational visualization. Reference zones are generated from simplified, publicly documented models (cube-root blast scaling, generic plume dispersion) and real-time weather — they are not dose forecasts, structural damage assessments, targeting data, or emergency-response guidance. Nothing in this project is derived from classified information.
