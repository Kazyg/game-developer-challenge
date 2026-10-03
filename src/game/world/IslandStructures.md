Asset inspection (default 64 × 64 PNGs)

- 13–14: isolated circular towers, without wall connectors.
- 15–16: vertical/horizontal straight walls.
- 29–30: towers with opposite vertical/horizontal connectors.
- 31–32: vertical walls with cannons facing right/left.
- 45–46: towers with one downward/rightward connector.
- 47–48: horizontal walls with cannons facing up/down.
- 60/76: vertical/horizontal wooden gates.
- 61–62: towers with one upward/leftward connector (not corners).
- 63–64: rounded wall ends pointing up/left; 79–80 point down/right.
- 77–78: corner towers connecting down+right/down+left.
- 81–82: the same stranded boat with damaged hull, on sand/grass-edged sand.
- 83–84: matching cannon and timber debris, on sand/grass-edged sand.
- 85–86: rocks with small plants, on sand/grass-edged sand (not wreck parts).
- 87–88: small foliage clusters, transparent background.
- 89–92: damaged vertical/horizontal wall variants.
- 93–94: damaged corner towers connecting up+right/up+left.
- 95–96: expanded vertical/horizontal wall segments.

Only compatible subsets are used by the presets. Intact and ruined forts use
contiguous wall grids, with whole-composition quarter-turn rotations. Boat and
debris are kept together; their baked terrain backgrounds are keyed out by the reproducible prebuild cutout script. No new collision or navigation geometry is created.

Placement samples the full footprint against the existing polygon. Forts have
a shoreline setback, an empty courtyard, and a surrounding vegetation/rock
clearing. Intact bottom corners reuse 77/78 rotated by PI; ruined top corners
reuse 93/94 rotated by PI. Fort tile dimensions are selected in world pixels
(30/42/48/54 for SMALL/MEDIUM/LARGE/HUGE); every part receives the same scale.
The citadel uses a 7 × 5 perimeter with a complete central lookout tower.

Nonrectangular variants include a 7 × 5 U with two wings and a recessed central
courtyard, a 5 × 5 L, and a compact horseshoe with deliberately capped open ends.
Closed concave perimeters select each wall/corner from its neighboring ports;
the horseshoe ends use tile 45's single downward connector. Whole-composition
quarter turns vary orientation, without loose or incompatible wall fragments.

Land area determines capacity (up to 1/2/3/5 interests); occupied footprints
never exceed 36% of the land. Larger islands can group secondary outposts near
the primary fort, with ruins and wrecks in other regions. Full rotated bounds
maintain a 28px minimum gap. Forts have a 16px shoreline setback. Wrecks use the beach band and require their whole footprint to fit physical land.
Trees/rocks use several seeded regions and world-space density/clearance.

Size profiles generate independent coastlines with 32/48/72/96 vertices.
Populations use 40% SMALL, 38% MEDIUM, 18% LARGE, 4% HUGE before world caps
(six LARGE, two HUGE); shapes are independent of size. Placement preserves
140px sea passages and a 70px boundary corridor. Ship-clearance flood validation
requires at least 60% navigable sample positions, with 98% of those connected
to spawn. Patrol areas are repositioned/shrunk if less than 70% of their samples
are safe connected water; unusual fully occupied sectors use nearby open water.
