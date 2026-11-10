# Plan 04 notes (not started)

Logged 2026-11-10 22:30 system clock (about 06:30 PHT 2026-11-11). Nothing here is built. The developer said not to start until they say so.

## Coin expiry refinement: decisions from the developer

- Every coin carries its own date stamp and 7-day expiry (stored as lots: coins gained together share one stamp).
- Losing coins in a duel: the loss is picked at random across all of the loser's coins, not oldest first.
- Coins won in a duel keep their old stamp and expiry. They do not get a new seven-day clock. This reverses the plan 03 rule
  "duel winnings are new lots dated at the duel", and it answers the open QA question about duel winnings.
- Spending at the forge: coins closest to expiry go first (unchanged).
- Warning window: 2 days.
- Indicator: Bag only. One line, shown only when coins expire within 2 days (for example "12 coins expire in 2 days",
  "expire today" under 24 hours); hidden otherwise. A hover tooltip lists at most 3 groups. No HUD dot.
- Client receives only the count expiring within the window and the soonest time.

Open point to confirm: "yes in bag only" was read as "show the indicator in the Bag only, with no HUD dot".

Implementation notes for later: transferred coins need their original stamps kept on the winner's side (lots move with their
stamp, merged only when the stamp is identical); the winner's lots from a duel must still be expired by the sweep at their old
time; `coinExpiryText` and `nextExpiry` change from "oldest group" to "total in the window"; tests for the random draw
and for transferring lots with stamps.

## Other improvements the developer wants to add

Logged 2026-11-10 (system clock). Not started.

### 1. Game menu and Bag icon (developer request)

- A three-line (hamburger) button in the upper right, beside the Bag. Clicking it opens the menu.
- Menu items: Exit game, Log out, Exit character (back to picking avatars), Settings.
- Settings: game resolution; sound (new, to be added); shortcuts (keys for Bag, Menu, and so on).
- Replace the word "Bag" with a bag icon; clicking the icon opens the Bag modal.

Questions to settle before building:
- "Exit game": a browser tab cannot close itself unless the game opened it. Options: return to the sign-in screen,
  or show a "you can close this tab" screen. Is that fine?
- Exit character versus Log out: Exit character keeps the account signed in and shows the avatar picker; Log out ends
  the session. Both should leave the world cleanly (the avatar disappears for other players). Confirm.
- Resolution: the game is already sized by the zoom slider. Do you mean a few presets (for example Small, Medium, Large,
  Fit window, Fullscreen), or exact sizes? Does it replace or sit beside the zoom slider?
- Sound: no audio exists yet. For now only a volume slider and a mute toggle, with the sounds themselves (steps, hits,
  coin, menu clicks) as a later step? Where do sound files come from (the same Grok provenance question applies)?
- Shortcuts: which actions get keys, and which defaults (for example B Bag, M Menu, Esc close)? Can the player rebind them,
  or only see them?
- Saving: store settings per account on the server, or per browser? Recommendation: per browser to start.
- Is the Bag icon drawn like the coin and items (Grok generated), or a plain vector icon? A plain vector icon avoids a new
  asset provenance item.
