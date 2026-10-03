# Requirement and quality review

Updated 2026-10-03. Scope: source, configuration, tests and workspace documentation, including pre-existing changes. This review does not establish physical-device validation, remote production readiness or complete requirement compliance.

## Current corrections

Query errors retain error state, accessible alerts and Retry; failed refreshes preserve rows. Both panels share feedback/pagination. Retry disables during fetching. MainMenu updates local pages only when uncontrolled.

Asset startup waits for all started branches before propagating failure. Ship textures are shared by the orchestrator. Native cutouts are generated reproducibly before browser execution; no delayed browser task creates cutout textures. Local surfaces/island textures are owned and destroyed by the renderer; cached textures remain shared. Game.start reserves one startup promise per instance. Exit, Retry and Strict Mode use the same lifecycle guards.

Registration uses one persisted six-attempt policy, including formerly permanent errors. The five failure-relative delays are 10s, 30s, 1m, 10m and 30m. Reload/reconnect do not reset the budget or advance future deadlines. Offline scheduler runs consume nothing. Exhausted results remain local and allow one explicit manual send, without restarting automatic recovery. Idempotent IDs, per-session promises and Web Locks coordinate submissions. Ranking/history invalidate on confirmation. New games remain available and abandonment never registers.

World has named visual, player, combat and pruning phases. Enemy planning separates goals, steering, speed and validation while retaining plan-before-execute collision velocities. Spawn coverage/fallback helpers and constants preserve RNG order. Debug drawing is isolated. Rules emit domain events consumed once by Game's audio effects layer. Geometry and small display-collection helpers are shared. RegistrationStatus belongs to API contracts. A development-only test facade exposes fixed-step clock, observation and scenario controls; legacy private probes still exist and can be migrated later.

## Test findings

The RETURN/DEAD failure came from legitimate longitudinal hull contact at 100 units while following a returning Chaser. The return setup now keeps 150 units separation and removes unrelated generated enemies. The reduced-vision reacquisition test uses an 80-unit lateral offset: inside 90-unit vision without overlapping the narrow hull sides. Contact expectations remain covered separately, with Chaser destruction and player damage unchanged.

Movement tests now run fixed simulation steps across render-frame rates and assert straight-sailing acceleration bounds. Projectile tests use team-specific configured range and avoid accidentally placing a hull at the range endpoint. Population tests check safe positive population below the configured cap rather than requiring the obsolete 48. The expensive island test bundled 40 complete route-generation seeds in one synchronous test; each seed now has an independent test/timeout and aggregate size-distribution assertions use map generation directly. No timeout increase, skip or assertion deletion was used to hide the workload.

Result/focus tests follow optional naming, Save Result, private submission and actual help focus order. Combat E2E retains real keyboard input with fixed-step instrumentation. Orientation assertions remain enabled and the known CSS conflict remains outside this task.

## Asset provenance

[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) records the author-provided recovery sound combination by Guilherme in VEED, verifies the two official Pixabay source titles/profiles and links the Content License summary/terms. Icons8 credit is retained in documentation only and is not displayed in How to Play. The official guidance/search page were consulted; exact icon collection, individual source pages and download/license history are still unconfirmed. Other supplied-media provenance and license manifests remain missing. This is not a complete legal audit.

## Remaining requirement gaps

- Mobile orientation hint is hidden by a later CSS rule; mobile layout/orientation will be handled separately.
- Debug U still captures outside active gameplay in some contexts. It was intentionally neither corrected nor removed; exclusive debug setup in affected tests no longer depends on it.
- No versioned menu/arena/result visual baselines. Screenshots are review evidence, not regression approval.
- The 12 requested flows are not proven end-to-end across a complete desktop/mobile matrix; some tests call rule systems directly.
- Accessibility contrast has not been measured systematically. No physical-device/Safari verification.
- Legacy browser tests retain internal Vite imports and some private probes; the new instrumentation only begins consolidation.
- Prior performance measurement did not reach 60 FPS under SwiftShader. GPU-accelerated engagement scenarios and broader memory paths remain unmeasured; no new profiling was run.

## Evidence and document cleanup

The 2026-10-02 full review recorded lint/build passing, 125 tests passing and 21 failing out of 146, plus one production test passing. Its isolated repetition had 20 failures/one pass. Those counts describe the earlier workspace, not this correction. The two old runners initially shared artifacts; production uses separate directories now. Historical performance data, environment, reproduction and limitations remain in [PERFORMANCE.md](PERFORMANCE.md) and `docs/performance`.

Removed redundant historical ARENA.md, COMBAT.md, MATCH.md, SCREENS.md, ADJUSTMENTS.md, REQUESTED_ADJUSTMENTS.md and POLISH.md after migrating necessary execution, lifecycle, rules, asset ownership, UI/audio and network information to README/ARCHITECTURE/API and retaining detailed patrol/island notes. Earlier broad completion claims are not carried forward.

Validation on 2026-10-03:

- Lint, TypeScript, production build and reproducible cutout checks passed. A pixel-by-pixel check of all four cutouts also matched the original alpha transform and dimensions.
- Consolidated regression: **194 passed, 2 failed out of 196**, in 10.7 minutes. The failures were the existing hidden portrait hint and the repeated-navigation case exceeding its 30-second budget.
- Navigation traces showed all assertions completing after the budget while four full world/Pixi initializations ran. The case now stops the simulation clock through the explicit facade, preserves all three real navigation cycles and browser-history cleanup, and has a specific 60-second budget. Two parallel repetitions passed in 27.9 and 28.0 seconds (29.8 seconds total). Single-start and island-test budgets were not increased. This focused repetition does not rewrite the full-run count above.
- Optimized-build MSW/persistent recovery: **1 passed**, in 3.4 seconds.
- No assertions were skipped, no snapshots were automatically approved, and orientation remains an enabled failing assertion outside the authorized scope. Debug U was preserved. No new performance study was run.

Full HTML report: `playwright-report/index.html`; navigation repetition: `playwright-report-followup/index.html`; production: `playwright-report-production/index.html`. Failure traces use retain-on-failure and separate output directories. Each runner shuts down only its own token-authenticated server; reused developer servers remain running. The Windows teardown completed automatically in the final runs.
