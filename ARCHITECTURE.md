# Architecture

## Ownership and simulation

React owns routes, menu settings, optional player names in Options, query panels, accessible HUD snapshots and touch controls. Game owns the Pixi application, input, camera, fixed-step clock, renderer and platform effects. World owns seeded entities and rules without importing audio or rendering. Continuous state stays outside React; HUD snapshots publish every 0.1 seconds and on input/lifecycle events.

The 60 Hz FixedStep retains active-time backlog with a per-frame work budget. It does not guarantee recovery under sustained overload. World.update orders contact/velocity capture and time expiry, visual expiry, spawn and enemy planning, player repair/movement, weapons and enemy execution, projectile collision, then dead-entity removal. Completion stops later phases immediately. Enemy planning selects state/goal, steering/separation/terrain avoidance, speed and pose validation before executing movement. This preserves relative approach velocities in collisions. Chaser contact destroys the Chaser without awarding score; projectile kills score once.

Spawn helpers retain seeded sector shuffling, coverage sampling, fallback search and safe lane checks. HullGeometry is shared by spawn margins and navigation clearances. The 4000 × 4000 world reserves up to 24 areas and at most 43 enemies; safe route generation can yield fewer. GameConfig/CombatConfig are authoritative for balance. Player speed starts at 176 with distance-based straight-sailing boost up to 30%; front player range is 360, other ranges 300. Physical hulls use seven circles and continuous projectile sweeps select the earliest impact, including the exact range endpoint.

World emits typed collision, damage, destruction, firing, splash and repair events. Game drains them once per fixed step through WorldAudio. Platform audio retains its bounded pool, suppression and lifecycle ownership; rules no longer call AudioManager. Death effects advance only visually after simulation stops.

## Rendering and assets

WorldRenderer composes ocean, island render textures, player, CombatRenderer, DamageRenderer and HealthBarRenderer. DebugRenderer isolates navigation/leash drawing from the main renderer. Small collection helpers remove stale displays while preserving renderer-specific content; inViewport centralizes culling. Camera zoom and culling use world units, while DOM controls use CSS pixels. Resize/DPR do not recreate the world.

The orchestrator shares one fleet promise with CombatRenderer. Assets.load textures belong to Pixi's shared session cache and are never destroyed on individual game exit. Per-match mirrored surfaces and composed island render textures belong to WorldRenderer and are destroyed idempotently. All started initialization branches settle before failure reaches GameScreen, so Game can defer application release until no branch can create resources. Renderer children guard disposed state. Exit, failure/Retry, Restart and React Strict Mode follow the same ownership rules.

Boat/debris tiles 81–84 are transformed reproducibly by `scripts/prepare-cutouts.mjs` into versioned `assets/generated/cutouts`. Original PNGs stay intact. The native-pixel alpha rule and dimensions match the previous browser transform; the browser only loads the generated files. `predev`, `prebuild` and the test server prepare assets; `assets:check` detects stale output. Source atlas metadata remains in `assets/tilesheet/tilesheets.txt`, `ships_miscellaneous_sheet.xml` and `ui_sheet.json`. Ship appearance uses 1/7/13/19, 3/9/15/21 and 5/11/17/23 damage sequences, independent flags and collision geometry.

## API and durable recovery

Contracts own RegistrationStatus. A single failure-relative scheduler owns the retry budget; Axios and TanStack do not retry POST internally. Durable metadata records the original payload, consumed retries, next deadline and exhaustion. Web Locks serialize the same ID across tabs; storage events synchronize queues. Reopening runs only the next due attempt and schedules subsequent failures from their actual failure time. Offline does not consume a scheduler attempt. Exhaustion retains a manual-only result. Successful registration removes the pending record and invalidates matching ranking/history keys.

Shared MatchPanels feedback/pagination presents initial errors and cached-data refresh warnings with Retry. MainMenu uses parent pages when controlled and updates local pages only in uncontrolled mode.

## Tests and limitations

Game.testController is a development-only facade for fixed-step advancement, observation, scenario preparation, rendering and completion. GameScreen exposes it only with `?test`; gameplay E2E still uses real keyboard/pointer input. API tests share `src/testing/api.ts` and use Playwright's clock. Legacy tests still include some internal Vite imports and private renderer probes; migration is incremental. The opt-in profiling observer remains unchanged.

Mobile layout/orientation and U shortcut behavior are intentionally outside this correction. No performance optimization, balance change, ECS or global state library was introduced. Deployment, versioned visual baselines and physical-device validation remain outstanding.

## API contracts and networking

MSW starts before queries in development and production. The client also waits for the singleton startup promise; startup failure cannot POST to a static host. Axios uses the app base path plus `api`, a 2500 ms timeout and typed errors. Gameplay state is never persisted.

### Contracts and queries

`src/api/contracts.ts` validates records and paginated responses. GET `/api/ranking` filters exact game configuration, then sorts score descending, duration ascending, date ascending and ID ascending. GET `/api/matches` filters player and sorts newest first. Both accept page/pageSize and return items/page/pageSize/totalItems/totalPages. POST `/api/matches` uses the original matchId as Idempotency-Key and returns the original record on repeats. Only playerDestroyed/timeExpired results register.

Query keys include ranking configuration or history player plus pagination. Queries receive AbortSignal, cache for five minutes and remain fresh for 15 seconds. No internal query retry is enabled. Menu mount/tab/focus can refresh. Panels distinguish initial errors from empty results, retain existing rows after refresh failure and expose accessible Retry with fetching feedback. Registration success invalidates only matching configuration/player keys.

### One registration policy

`RegistrationPolicy.ts` defines five automatic retries after the initial POST: 10,000 / 30,000 / 60,000 / 600,000 / 1,800,000 ms. Each deadline starts after the previous failure, including HTTP 400 and configuration failures. There is no autoBlocked classification, periodic reset cycle or TanStack/Axios POST retry.

The single scheduler persists before sending, skips offline execution without consuming attempts, and waits until the existing deadline on mount/reconnect. When reopening after several missed deadlines it sends only the next retry. Saving metadata records the consumed attempt before POST; interruption retains that budget and a conservative deadline. Per-ID in-flight promises and Web Locks prevent overlapping submissions in the session and across tabs. Idempotent timeout-after-commit recovery uses the same payload and ID.

After the fifth retry fails, the automatic queue excludes the record but durable storage keeps it with exhausted=true. Main Menu shows every pending result and Retry Registration, including non-exhausted records. A manual click performs one request, retaining exhaustion and the retry count. Failure never silently resets the automatic budget; success removes the pending record and updates both query families. Players can start new matches with pending results. Closing/refreshing active combat abandons it without enqueueing.

### Storage

- `pirate-battle-player-v1`: stable identity.
- `pirate-battle-registration-queue-v2`: original payload, status, initialStarted, retriesPerformed, nextAttemptAt, exhausted and optional error.
- `pirate-battle-pending-v1`: legacy-compatible payload mirror; old payload-only queues migrate once with the new policy.
- `pirate-battle-lastCompletedMatch-v1`: last result, seed, status and optional awaitingName, independently of the queue.
- `pirate-battle-confirmed-v1`: mock confirmations merged with fixtures by ID.
- `pirate-battle-network-v1`: scenario, latency and seed.

Completion persists the last result and enqueues the immutable payload before navigation. The optional name is saved in Options and read on completion. Legacy awaitingName results and interrupted completion handoffs recover on startup if the non-saved last result is missing from the queue. The last-result store publishes through useSyncExternalStore; Results displays Pending/Saving/Saved/Failed and permits retry. Storage failures retain the session result and prevent POST when payload or attempt metadata cannot be persisted. The authoritative metadata is committed after its legacy payload mirror, preserving existing pending records if a write fails. Disabling storage cannot provide refresh durability.

### Scenarios and validation

Open `/?network=1` for Developer / Network Scenarios: success, empty, multiple-pages, slow, variable-latency, out-of-order, timeout, network-error, http-400, http-500, ranking-failure, history-failure, timeout-after-register and unavailable-on-match-end. Reset clears confirmed/pending and the last result, restores fixtures and refuses while Saving. Scenario changes refresh queries; they do not reset registration deadlines.

Tests cover contracts, real Axios/MSW traffic, failure feedback, delayed responses, fixed-clock retry deadlines, refresh/offline/reconnect, exhaustion/manual recovery and idempotency. Production recovery uses the optimized build without development instrumentation. Run the checks listed in [README.md](README.md).

Every POST runs through TanStack Query useMutation with key registerMatch and the Axios registerMatch mutation function. retry:false prevents a second retry policy; networkMode:always lets the durable scheduler own offline handling. Per-record queue state remains authoritative across multiple mutations. Confirmation removes the queue entry and invalidates matching query families.

MatchRecord contains matchId, playerId, playerName, ISO date, score, effectiveDuration, endReason, gameConfig { gameSessionTime, enemySpawnTime }, and optional seed. Registration returns { match }. Idempotency uses matchId, not player name or score.

## Navigation and island decoration

NavigationGrid supports generation validation (64-unit grid) and runtime AI (32-unit grid cached per World). A* uses Euclidean costs, an admissible heuristic and final-segment cost to select the goal. Connections and smoothing sweep physical colliders with hull clearance; diagonals require free adjacent cardinal cells. Replanning, progress checks, steering and separation handle moving targets and blocked turns. Patrol areas and safe spawn lanes are seeded.

Decorative forts, wrecks and vegetation fit inside existing island polygons and add no collision geometry. Fort compositions select compatible wall ports and quarter turns; boat/debris cutouts are prepared before runtime. The physical island remains the obstacle.

## Balance and limitations

The scrolling 4000 × 4000 world exceeds the visible viewport. Initial enemies occupy safe patrol slots and destroyed enemies are replaced after the configured delay, rather than unconditional interval spawning. Population is capped at 43. Shooter attack-range behavior and passive-contact scoring still require a separate requirements review; these registration changes do not address those gameplay findings.

Sustained simulation overload can retain backlog. Without Web Locks, per-session deduplication and server idempotency remain but cross-tab serialization is weaker. Storage-denied sessions cannot guarantee refresh durability. MSW is a local mock, not a shared online leaderboard. README.md preserves asset provenance gaps. PERFORMANCE.md records historical performance and unresolved memory retention.
