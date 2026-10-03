# Mock API and registration

MSW starts before queries in development and production. The client also waits for the singleton startup promise; startup failure cannot POST to a static host. Axios uses the app base path plus `api`, a 2500 ms timeout and typed errors. Gameplay state is never persisted.

## Contracts and queries

`src/api/contracts.ts` validates records and paginated responses. GET `/api/ranking` filters exact game configuration, then sorts score descending, duration ascending, date ascending and ID ascending. GET `/api/matches` filters player and sorts newest first. Both accept page/pageSize and return items/page/pageSize/totalItems/totalPages. POST `/api/matches` uses the original matchId as Idempotency-Key and returns the original record on repeats. Only playerDestroyed/timeExpired results register.

Query keys include ranking configuration or history player plus pagination. Queries receive AbortSignal, cache for five minutes and remain fresh for 15 seconds. No internal query retry is enabled. Menu mount/tab/focus can refresh. Panels distinguish initial errors from empty results, retain existing rows after refresh failure and expose accessible Retry with fetching feedback. Registration success invalidates only matching configuration/player keys.

## One registration policy

`RegistrationPolicy.ts` defines five automatic retries after the initial POST: 10,000 / 30,000 / 60,000 / 600,000 / 1,800,000 ms. Each deadline starts after the previous failure, including HTTP 400 and configuration failures. There is no autoBlocked classification, periodic reset cycle or TanStack/Axios POST retry.

The single scheduler persists before sending, skips offline execution without consuming attempts, and waits until the existing deadline on mount/reconnect. When reopening after several missed deadlines it sends only the next retry. Saving metadata records the consumed attempt before POST; interruption retains that budget and a conservative deadline. Per-ID in-flight promises and Web Locks prevent overlapping submissions in the session and across tabs. Idempotent timeout-after-commit recovery uses the same payload and ID.

After the fifth retry fails, the automatic queue excludes the record but durable storage keeps it with exhausted=true. Main Menu shows Retry Registration for exhausted results. A manual click performs one request, retaining exhaustion and the retry count. Failure never silently resets the automatic budget; success removes the pending record and updates both query families. Players can start new matches with pending results. Closing/refreshing active combat abandons it without enqueueing.

## Storage

- `pirate-battle-player-v1`: stable identity.
- `pirate-battle-registration-queue-v2`: original payload, status, initialStarted, retriesPerformed, nextAttemptAt, exhausted and optional error.
- `pirate-battle-pending-v1`: legacy-compatible payload mirror; old payload-only queues migrate once with the new policy.
- `pirate-battle-lastCompletedMatch-v1`: last result, seed, status and optional awaitingName, independently of the queue.
- `pirate-battle-confirmed-v1`: mock confirmations merged with fixtures by ID.
- `pirate-battle-network-v1`: scenario, latency and seed.

Awaiting-name results persist before finalization. Save Result or leaving Results finalizes the optional sanitized name once; thereafter the payload is immutable. Storage failures retain the session result and prevent POST when payload or attempt metadata cannot be persisted. The authoritative metadata is committed after its legacy payload mirror, preserving existing pending records if a write fails. Disabling storage cannot provide refresh durability.

## Scenarios and validation

Open `/?network=1` for Developer / Network Scenarios: success, empty, multiple-pages, slow, variable-latency, out-of-order, timeout, network-error, http-400, http-500, ranking-failure, history-failure, timeout-after-register and unavailable-on-match-end. Reset clears confirmed/pending, restores fixtures and refuses while Saving. Scenario changes refresh queries; they do not reset registration deadlines.

Tests cover contracts, real Axios/MSW traffic, failure feedback, delayed responses, fixed-clock retry deadlines, refresh/offline/reconnect, exhaustion/manual recovery and idempotency. Production recovery uses the optimized build without development instrumentation. Run the checks listed in [README.md](README.md).
