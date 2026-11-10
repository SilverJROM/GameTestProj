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

To be discussed. Not yet specified.
