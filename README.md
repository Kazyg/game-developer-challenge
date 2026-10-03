# Pirate Battle

Single-player naval combat with React, strict TypeScript, PixiJS, TanStack Query, Axios and a persistent MSW mock API.

## Setup and commands

Use Node.js 24 LTS and npm. No private services, API keys or environment file are required.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open the URL printed by Vite.

| Command | Purpose |
| --- | --- |
| npm run dev | Development; prepares generated cutouts |
| npm run build | TypeScript check and optimized dist output |
| npm run preview | Serve the built application |
| npm run lint | ESLint |
| npm run typecheck | Strict TypeScript check |
| npm run assets:check | Verify generated assets |
| npm test | Playwright Chromium tests, two workers |
| npm run test:production | Test production API recovery after npm run build |
| npx playwright show-report | Open the development HTML report |

Run development and production tests sequentially: builds regenerate assets and can trigger HMR during development tests. Reports: playwright-report and playwright-report-production. Artifacts: test-results and test-results-production. Failure traces are retained. Test servers are owned by the runner; an existing local server may be reused.

Optional environment variables: TEST_PORT selects the development test port (default 5173); CI disables existing-server reuse. TEST_SERVER_TOKEN is generated internally for server ownership. PROFILE_URL, PROFILE_SECONDS and PROFILE_CYCLE_SECONDS configure profiling; see [PERFORMANCE.md](PERFORMANCE.md).

## Controls and configuration

| Input | Action |
| --- | --- |
| W | Sail forward along the bow |
| A / D | Rotate left / right |
| Space | Fire forward |
| Q / E | Three parallel projectiles from the left / right broadside |
| R | Repair while stationary |
| Escape / Pause | Pause menu |

Touch buttons support simultaneous movement and firing. Desktop and mobile portrait/landscape layouts are available; landscape is suggested for a wider view. Help and Options are accessible during pause. Losing focus or hiding the tab pauses; Resume requires an explicit action and clears held input. Menus support keyboard navigation and visible focus.

Options persists whole-second Game Session Time (60–180, default 120), Enemy Spawn Time (1–60, default 5), audio settings and an optional player name (up to 40 ASCII letters/numbers/spaces; blank becomes Captain). Gameplay settings are snapshotted at match start; edits apply to new matches. Balance parameters live in src/game/config and src/SessionSettings.ts.

Current spawning initializes a seeded population and replaces destroyed enemies after the delay; it does not continuously add enemies each interval. Open /game?seed=42 to reproduce a map. Play Again chooses a new seed and current saved settings. See [ARCHITECTURE.md](ARCHITECTURE.md) for balance and limitations.

## Results and failure recovery

Time expiry or player destruction automatically persists and queues an immutable result before navigating to Results. No Save Result action or name entry is required. Results displays Pending, Saving, Saved or Failed, relevant errors and Retry Registration. The menu lists all pending records. Another match can start during submission. Leaving or refreshing active combat abandons that match without registration.

The first attempt has five automatic retries, after 10 seconds, 30 seconds, 1 minute, 10 minutes and 30 minutes from each preceding failure. Refresh and reconnect preserve deadlines and consumed attempts. Exhausted records allow manual retry without resetting that budget. Repeated submissions use the original match ID. Writable storage is required for refresh durability; persistence failures prevent sending and remain visible.

Open /?network=1 and expand Developer / Network Scenarios. Available scenarios: success, empty, multiple-pages, slow, variable-latency, out-of-order, timeout, network-error, http-400, http-500, ranking-failure, history-failure, timeout-after-register and unavailable-on-match-end. Latency and seed control reproducibility; selection persists.

1. Select unavailable-on-match-end and complete a match. Check Failed on Results, return to the menu or complete another match, and refresh: pending records survive.
2. Select success, then Retry Registration or wait for the saved deadline. Each result appears once in history and ranking for its configuration.
3. Select timeout-after-register and complete a match. The mock commits before the client times out. Refresh, restore success and retry: the original record is recovered without duplication.
4. Select ranking-failure or history-failure. The affected tab shows Retry; the other tab, Options and gameplay remain usable. Slow/out-of-order exercise background refresh and isolated configuration/page caches.
5. Reset confirmed + pending records clears confirmations, pending submissions and the last result, restores fixtures and selects success. Reset is disabled during active registration.

Offline browser mode preserves results without consuming attempts; reconnect resumes the existing schedule. Mock records belong to the current browser/origin, not a shared online service.

## Delivery and evidence

Not deployed yet: no public evaluation URL is available. Publish dist on an HTTPS static host with SPA fallback for /game, /options, /result and /help. Serve assets and mockServiceWorker.js as actual files rather than fallback HTML. Verify direct route loads, refresh and mock recovery on the deployed origin.

[ARCHITECTURE.md](ARCHITECTURE.md) documents simulation, ownership, API contracts and persistence. [PERFORMANCE.md](PERFORMANCE.md) consolidates profiling and evidence. Existing screenshots are not a complete set of versioned visual regression baselines; physical-device and published-site validation remain outstanding.

## Asset sources and licenses

Recorded on 2026-10-03. This manifest distinguishes project-author statements from official pages inspected during this correction. It does not establish provenance for every supplied asset or constitute a complete legal audit. No general code LICENSE file was found; third-party media remain governed by their respective terms regardless of any future code license.

### Recovery sound

Path: `assets/sounds/ship_recover.mp3`.

The project author states that Guilherme combined and edited two Pixabay effects in VEED to create the ship recovery sound. VEED was the editing tool, not the original author or licensor. The combination/editing history was supplied by the author and was not independently reconstructed from the MP3.

| Source | Author/profile | Official page |
| --- | --- | --- |
| Hammer Hitting Nail Carpentery Sound Effect | kalsstockmedia | [Source 1](https://pixabay.com/sound-effects/film-special-effects-hammer-hitting-nail-carpentery-sound-effect-243339/) |
| Sawing Wood | u_xg7ssi08yr | [Source 2](https://pixabay.com/sound-effects/film-special-effects-sawing-wood-355452/) |

The titles and profiles were verified on the official source pages. The author reports Pixabay Content License for both. The official [license summary](https://pixabay.com/service/license-summary/) and [terms](https://pixabay.com/service/terms/) were inspected: adaptation is permitted subject to prohibited uses and other applicable rights; attribution is not required but is preserved here. Use and adaptation remain subject to restrictions, including standalone distribution, misleading use and third-party rights. These sounds are not designated public domain, CC0 or MIT. No download receipt or historical license certificate was supplied.

### Control icons

Path: `assets/keyIcons/*.png` (A/W/D/Q/E/R/Space artwork).

The author reports Icons8 as the source and [this E-key search page](https://icons8.com.br/icons/set/e-key) as the page used. No paid license was reported. The search page and official [licensing guidance](https://icons8.com/license) were inspected. That guidance calls for linking/crediting Icons8 for free use, including game credits.

Documentation credit: **Control icons by [Icons8](https://icons8.com)**. Attribution is kept here only and is not displayed in How to Play. Individual asset pages, collection/package identity, exact file-specific license and download history could not be identified from the supplied search URL. No such details are inferred from filenames.

### Existing supplied media and generated derivatives

The original PNG/vector/atlas, UI imagery, logo and other sound files remain unchanged. Their original attribution/license manifests were not found in this workspace; their provenance remains to be documented by the author. This correction neither replaces them nor asserts a license from their names.

`assets/generated/cutouts/tile_81.png` through `tile_84.png` derive from corresponding `assets/png/default/tiles` sources. The reproducible native-pixel alpha transform lives in `scripts/prepare-cutouts.mjs`; dimensions, remaining pixel colors and object transparency are preserved. This transformation does not change the original assets' licensing obligations. Original source files and atlas metadata are retained.
