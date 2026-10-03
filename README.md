# Pirate Battle

A seeded naval combat game using PixiJS for the arena and ship indicators, React for menus and accessible controls, and Axios/TanStack Query with MSW for a local mock API. Interface copy is English.

## Run and validate

Requires Node.js and npm. Run `npm ci`, then `npm run dev`. Open `/game?seed=42` to reproduce a map. `npm run build` creates `dist`; `npm run preview` serves it. MSW requires HTTPS or localhost and a correctly served `mockServiceWorker.js`.

Checks: `npm run lint`, `npm run typecheck`, `npm run assets:check`, `npm run build`, `npm test`, and `npm run test:production` after building. Install the test browser with `npx playwright install chromium` if needed. Development and production runners use separate report/artifact directories and own their server process. Existing servers are reused locally.

## Play

W sails along the bow; A/D turn. Space fires forward; Q/E fire independent three-shot broadsides; R repairs while stationary. Touch controls support simultaneous actions. Escape, help, blur and hidden visibility pause; Resume resumes explicitly. Options persist duration (60–180 seconds) and respawn delay (1–60 seconds). Restart preserves the current seed/settings snapshot; Play Again starts a new match with saved settings.

Player destruction or time expiry opens the result screen with score, time and end reason. The name is optional; Save Result, Play Again or Main Menu finalizes it once. Abandoned games never register. Registration runs privately with five retries after the initial attempt: 10 seconds, 30 seconds, 1 minute, 10 minutes, 30 minutes after each preceding failure. Exhausted results remain stored and offer Retry Registration in the main menu; manual retry does not reset the automatic budget. Pending results never block new games.

Ranking/history show loading, empty, data and accessible error states with Retry. Failed refreshes keep cached rows. `/?network=1` exposes reproducible mock scenarios and reset controls.

## Architecture and evidence

See [ARCHITECTURE.md](ARCHITECTURE.md), [API.md](API.md), [CODE_REVIEW.md](CODE_REVIEW.md), [patrol navigation](src/game/ai/PatrolNavigation.md) and [island structures](src/game/world/IslandStructures.md). [PERFORMANCE.md](PERFORMANCE.md) preserves the earlier measurement; no new profiling is part of this correction. Full requirement compliance, physical-device testing and versioned visual baselines remain unproven.

## Asset credits

[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) records author-provided provenance, verified official pages and remaining gaps, including credit to Icons8 for the control icons. Attribution is kept in documentation only. Third-party assets remain subject to their respective licenses independently of any future code license.
