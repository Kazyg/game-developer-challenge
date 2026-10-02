# Screens and settings

All React interface copy is English. ScreenLayout and App.css reuse inspected assets/png/retina/ui/menu panel, title and primary button states; controls remain semantic HTML with focus outlines and at least 48px touch targets. Range tracks span the panel, have 32px thumbs and paired labeled numeric inputs.

SessionSettings validates and persists Game Session Time (whole seconds, 60–180, default 120) and Enemy Spawn Time (whole seconds, 1–60, default 5). Save commits the draft to the existing localStorage duration key and a new spawn-time key. Back discards edits. GameScreen snapshots both values on mount; Restart retains that snapshot. New games use saved settings. Spawn time means delay before replacing a destroyed enemy; initial spawn and bounded obstacle retry keep existing behavior.

MainMenu contains Play/Options, controls and accessible Ranking/Match History tabs. MatchPanels takes typed DataPage props (loading, empty, error, data) plus page callbacks. Each panel includes Previous/Page/Next. No API or fabricated application records were added. Query/Axios/MSW integration can supply these props later. Without it, panels show empty states.

ResultScreen reads the actual MatchResult and accepts a typed registrationStatus (Pending/Saving/Saved/Failed). Pending is used until registration is integrated; the UI never claims a result has been saved. Missing results show an explanatory message, not mock values.

Tests cover desktop/mobile screens, large controls, validation, Save/Back, refresh, tab keyboard navigation, data/state fixtures and pagination, real match results, registration states and saved settings versus active match snapshots.
