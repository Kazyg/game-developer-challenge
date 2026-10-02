# Ranking and Match History

The app starts MSW before rendering, in development and production. `public/mockServiceWorker.js` is included in Vite's output. Serve the published app over HTTPS (localhost also works) and serve the worker as JavaScript, rather than redirecting it to the SPA HTML. Axios uses the app base path plus `api` and a 2500 ms timeout. HTTP errors, network failures and timeouts become typed `ApiError` values. No gameplay state is persisted.

## Endpoints and contracts

Shared types and runtime validation live in `src/api/contracts.ts`.

- `GET /api/ranking?gameSessionTime=120&enemySpawnTime=5&page=1&pageSize=5`: exact configuration match; score descending, effective duration ascending, date ascending, then matchId ascending. Ranks are absolute across pages.
- `GET /api/matches?playerId=...&page=1&pageSize=5`: current player's history; date descending, then matchId ascending.
- `POST /api/matches`: `RegisterMatchRequest`, with `Idempotency-Key: matchId`; responds `{ match }`. Existing IDs return the original record even if a repeated payload differs. Only `timeExpired` and `playerDestroyed` are valid end reasons.

Paged responses have `items`, `page`, `pageSize`, `totalItems`, `totalPages`. Invalid filters, pagination (page >= 1, pageSize 1–100), records and idempotency headers return typed 400 errors.

## Queries and registration

- Ranking key: `['ranking', { gameSessionTime, enemySpawnTime }, page, pageSize]`.
- History key: `['history', playerId, page, pageSize]`.
- Mutation key: `['register-match']`.

Queries cache for five minutes, are fresh for 15 seconds, revalidate on menu mount, tab activation and window focus, and retry transient failures once (200 ms delay). HTTP 4xx responses are not retried. Cached rows remain visible during refetch or a failed refresh. Axios receives TanStack's AbortSignal; separate query keys isolate different pages/configurations. There is no parallel manual UI fetcher. Successful registration invalidates only the matching configuration's ranking and that player's history.

The finish callback receives GameScreen's original settings snapshot. A UUID is created once at completion, and the full payload is written to the pending queue before the mutation sends it. Failed saves remain queued; retries use the identical payload/ID and one POST is allowed in flight per ID. Confirmation removes pending only after success. Mutations do not automatically retry, keeping failure/retry behavior visible for demonstrations. Leaving Result Screen or starting a new game does not cancel or block registrations.

## Local persistence

JSON keys:

- `pirate-battle-player-v1`: `{ playerId, playerName }`, stable current player.
- `pirate-battle-pending-v1`: array of full `MatchRecord` payloads, supporting multiple pending matches.
- `pirate-battle-confirmed-v1`: array of confirmed mock records, merged with deterministic fixtures by `matchId`.
- `pirate-battle-network-v1`: `{ scenario, latency, seed }`.

Existing configuration and seed keys retain their current behavior. Startup loads pending records as Pending, offers Retry Registration in the menu, and restores the most recent pending result on `/result`. Successful results need not survive refresh. Refreshing an active battle abandons it without creating a record. If pending persistence fails, the app keeps the payload in memory, reports Failed and does not POST until persistence succeeds.

## Reproducible network scenarios

Open `/?network=1`, expand **Developer / Network Scenarios**. This panel is shown only in the menu and stays out of the HUD. Select a scenario, return to success, or explicitly reset confirmed + pending records. Reset restores fixtures, preserves player/settings/seed, and waits for any active registration to finish. Changing scenario revalidates queries but does not automatically retry pending registrations.

Supported: `success`, `empty`, `multiple-pages`, `slow`, `variable-latency`, `out-of-order`, `timeout`, `network-error`, `http-400`, `http-500`, `ranking-failure`, `history-failure`, `timeout-after-register`, `unavailable-on-match-end`.

`success` and `multiple-pages` expose deterministic multi-page fixtures. `empty` excludes fixtures, while still exposing any confirmed local matches. Variable latency is determined by request sequence and seed; out-of-order alternates 1200/30 ms. `setScenario(name, { latency, seed })` is available from `src/mocks/scenarios.ts` for tests and resets the request sequence. Each handler snapshots its scenario when the request arrives. `timeout-after-register` commits first, then withholds the response beyond the Axios timeout; retrying in success returns the same stored record. `unavailable-on-match-end` rejects POST while leaving reads available.

## Validation

Run `npm run build`, `npm run lint`, `npx playwright test --workers=2`, and `npx playwright test --config playwright.production.config.ts` (after building).

`api-contracts.spec.ts` covers ranking, every tie breaker, configuration filtering, pagination, player history and completed-match validation. `api-network.spec.ts` covers actual Axios/MSW traffic, repeated POSTs, timeout after commit, pending refresh/recovery, concurrent pending matches, real settings snapshots, combat refresh abandonment, independent failures, cached refetch, out-of-order queries, targeted invalidation, normalized errors and explicit reset. The production test serves `dist` and verifies worker activation and pending recovery without importing development source modules.
