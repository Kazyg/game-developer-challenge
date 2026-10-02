Patrol navigation
=================

Each accepted area reserves concentric Chaser and Shooter lanes. The complete
annulus occupied by a rotating hull plus a 16px safety margin must clear land,
the renderer's 1.12-scale shallow-water outline, world boundaries and previously
reserved lanes. Segment radial intervals validate continuous circles rather
than a finite set of points. Land collision geometry is unchanged.

Planning tries smaller radii, shifted centers, a regional grid, then bounded
seeded area replacement. Areas without two safe lanes are discarded. Therefore
population may be lower than the configured maximum on crowded maps. Spawns
start on their reserved lane facing its tangent; respawns reuse that lane.

Separation requests steering and slows ships catching neighbors. Shared island
avoidance runs afterward, probes the real hull heading and uses AI clearance.
Turning reduces speed, and movement validates the complete forward step without
sliding along either axis. Ships inside clearance after combat may move outward.

Debug U: pink outlines are physical land; green outlines are shallow-water AI
clearance; purple rectangles are patrol areas. Orange circles are Chaser lanes,
blue circles Shooter lanes, faint concentric borders show hull plus safety
margin. White lines show hull look-ahead and green lines avoidance waypoints.

Deterministic coverage: tests/patrol-navigation.spec.ts and
tests/enemy-balance.spec.ts; spawn/respawn coverage: tests/combat.spec.ts.
