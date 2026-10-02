# Match lifecycle

W moves along the bow; A/D rotate at the existing configured rate. S has no movement binding. Space fires forward, Q/E fire three parallel, independent side shots, R repairs, U toggles debug, Escape pauses.

MatchConfig centralizes duration limits (60–180 seconds, default 120). Options saves the duration for future matches. A mounted match snapshots its duration, including Restart Match. The HUD contains score, remaining active gameplay time and help only.

MatchSeed owns seed generation and sessionStorage persistence. Refresh and Restart Match retain the seed. Main Menu Play and Result Play Again generate a new seed. A fresh World resets all match state.

Game.pause/resume and World.paused freeze gameplay. Escape, help, blur and hidden visibility all pause. Returning focus never resumes. Only Resume does; pausing/resuming clears input, and repeat events from held keys cannot reactivate it.

Shots use enemyVisionRange as maximum travel distance, independent of viewport. The final range sample expires before checking damage. Each player projectile kill awards one point; already dead enemies and Chaser self destruction award none.

Player death or time expiry freezes gameplay immediately and captures score/time/reason. Player destruction has a short render-only explosion before results; this does not advance world state. Effects reuse fire/explosion assets from the inspected ships atlas and PNG effects directory. DamageRenderer attaches a modest fire_2 overlay at <=60% HP and a second at <30%; healing/removal clears overlays.

Result shows score, elapsed time and timeExpired/playerDestroyed. Pixi/input/listeners are disposed on navigation/restart, and shared loaded textures remain cached.

Validation includes match-rules.spec.ts, match-lifecycle.spec.ts, health-bars.spec.ts, combat.spec.ts and existing arena/AI/browser checks.
