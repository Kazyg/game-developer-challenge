Patrol and terrain navigation
=============================

Each accepted patrol area reserves concentric Chaser and Shooter lanes. The
complete annulus of the rotating hull plus the configured 3px safety margin
must clear physical land, world boundaries and existing lanes. Shallow water
is visual and does not add a physical navigation obstacle.

Generation validation and runtime pathfinding use NavigationGrid. Generation
keeps its original 64px sampling, player hull clearance and cardinal ordering.
Runtime uses a fixed 32px terrain grid shared by enemies within the World.
Cached water components and swept links exclude moving allies.

A* includes terminal edges in total route cost, uses an admissible heuristic,
and compares complete alternatives. Swept rotating-hull clearance protects
corners; direct and terminal approaches also check the oriented physical hull.
Visible intermediate nodes are removed only when their full segment is safe.

Each enemy keeps its route and destination. Replanning runs every 0.75s with
seeded ID phases, or sooner for invalid terrain, a displaced goal or stalled
route progress. Small cost changes preserve a valid route. Coastal recovery
uses validated forward/reverse movement before turning, preserving collisions.
Waypoint arrival slows movement with a hull/step-proportional tolerance.

The existing debug overlay shows physical land in pink, planned route in green,
next waypoint in white, goal in yellow and coastal escape in orange. No normal
interface controls were added.

Coverage: tests/route-planning.spec.ts, tests/route-browser.spec.ts,
tests/patrol-navigation.spec.ts, tests/enemy-balance.spec.ts and
tests/naval-ai.spec.ts. Detailed behavior and configuration: docs/ENEMY_AI.md.
