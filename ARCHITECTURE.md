# Architecture

## Ownership and simulation

React owns routes, menu settings, optional result names, query panels, accessible HUD snapshots and touch controls. Game owns the Pixi application, input, camera, fixed-step clock, renderer and platform effects. World owns seeded entities and rules without importing audio or rendering. Continuous state stays outside React; HUD snapshots publish every 0.1 seconds and on input/lifecycle events.

The 60 Hz FixedStep retains active-time backlog with a per-frame work budget. It does not guarantee recovery under sustained overload. World.update orders contact/velocity capture and time expiry, visual expiry, spawn and enemy planning, player repair/movement, weapons and enemy execution, projectile collision, then dead-entity removal. Completion stops later phases immediately. Enemy planning selects state/goal, steering/separation/terrain avoidance, speed and pose validation before executing movement. This preserves relative approach velocities in collisions. Chaser contact destroys the Chaser without awarding score; projectile kills score once.

Spawn helpers retain seeded sector shuffling, coverage sampling, fallback search and safe lane checks. HullGeometry is shared by spawn margins and navigation clearances. The 4000 × 4000 world reserves up to 24 areas and at most 43 enemies; safe route generation can yield fewer. GameConfig/CombatConfig are authoritative for balance. Player speed starts at 176 with distance-based straight-sailing boost up to 30%; front player range is 360, other ranges 300. Physical hulls use seven circles and continuous projectile sweeps select the earliest impact, including the exact range endpoint.

World emits typed collision, damage, destruction, firing, splash and repair events. Game drains them once per fixed step through WorldAudio. Platform audio retains its bounded pool, suppression and lifecycle ownership; rules no longer call AudioManager. Death effects advance only visually after simulation stops.

## Rendering and assets

WorldRenderer composes ocean, island render textures, player, CombatRenderer, DamageRenderer and HealthBarRenderer. DebugRenderer isolates navigation/leash drawing from the main renderer. Small collection helpers remove stale displays while preserving renderer-specific content; inViewport centralizes culling. Camera zoom and culling use world units, while DOM controls use CSS pixels. Resize/DPR do not recreate the world.

The orchestrator shares one fleet promise with CombatRenderer. Assets.load textures belong to Pixi's shared session cache and are never destroyed on individual game exit. Per-match mirrored surfaces and composed island render textures belong to WorldRenderer and are destroyed idempotently. All started initialization branches settle before failure reaches GameScreen, so Game can defer application release until no branch can create resources. Renderer children guard disposed state. Exit, failure/Retry, Restart and React Strict Mode follow the same ownership rules.

Boat/debris tiles 81–84 are transformed reproducibly by `scripts/prepare-cutouts.mjs` into versioned `assets/generated/cutouts`. Original PNGs stay intact. The native-pixel alpha rule and dimensions match the previous browser transform; the browser only loads the generated files. `predev`, `prebuild` and the test server prepare assets; `assets:check` detects stale output. Source atlas metadata remains in `assets/tilesheet/tilesheets.txt`, `ships_miscellaneous_sheet.xml` and `ui_sheet.json`. Ship appearance uses 1/7/13/19, 3/9/15/21 and 5/11/17/23 damage sequences, independent flags and collision geometry.

## API and durable recovery

See [API.md](API.md). Contracts own RegistrationStatus. A single failure-relative scheduler owns the retry budget; Axios and TanStack do not retry POST internally. Durable metadata records the original payload, consumed retries, next deadline and exhaustion. Web Locks serialize the same ID across tabs; storage events synchronize queues. Reopening runs only the next due attempt and schedules subsequent failures from their actual failure time. Offline does not consume a scheduler attempt. Exhaustion retains a manual-only result. Successful registration removes the pending record and invalidates matching ranking/history keys.

Shared MatchPanels feedback/pagination presents initial errors and cached-data refresh warnings with Retry. MainMenu uses parent pages when controlled and updates local pages only in uncontrolled mode.

## Tests and limitations

Game.testController is a development-only facade for fixed-step advancement, observation, scenario preparation, rendering and completion. GameScreen exposes it only with `?test`; gameplay E2E still uses real keyboard/pointer input. API tests share `src/testing/api.ts` and use Playwright's clock. Legacy tests still include some internal Vite imports and private renderer probes; migration is incremental. The opt-in profiling observer remains unchanged.

Mobile layout/orientation and U shortcut behavior are intentionally outside this correction. No performance optimization, balance change, ECS or global state library was introduced. See [CODE_REVIEW.md](CODE_REVIEW.md) for remaining delivery gaps and validation.
