# Plan 09 notes (to resume after the suspend, 2026-11-11 ~16:05 PHT)

State at save: `main` 23cd76e (plans 05 to 08), live on Cloudflare (Worker `game`, version b758a430) at https://game.silverjrom.workers.dev behind
Cloudflare Access (two allowed emails, one-time PIN). Working tree clean. Local dev server is stopped (start: `npx wrangler dev --port 8787 --local`).
Cloudflare credentials are read from ~/Documents/CF_Tokens.rtf by /tmp/cfenv.sh (recreate if /tmp is gone; the token must be rotated).

## Manager's Guidance received (report 22, verbatim)
> New rule: death is real, not just on the dying player's screen. A killed avatar stays dead where it fell until the player picks Respawn in town. Exit game leaves it dead, and it's still dead on the next Play. This must cover what's already in progress when the avatar dies: its unpicked coin, its pet, and any active duel or monster chase on it. Avatars already saved in town stay alive.

QA question (optional for the developer): "What made you keep the account cap in a Cloudflare secret rather than a plain config value?"
Report 21 failed with generation_failed (terminal). Report 22 is stored with its response.

## Open items
1. Real server-side dead state (the guidance above). Not started. Questions for the developer: (a) is a dead avatar hidden from others or visible where it fell, (b) after Exit game and a later Play, does the death panel show again straight away. Needs: a `dead` flag saved with the avatar (new migration 0007), the room keeps a dead avatar in place (no walking, no attack, monsters and duels drop it, its pet and unpicked coin handled), a `respawn` client message that lands it in town after the 1.5 s delay, the page shows the panel on join when dead. Opus review afterwards.
2. GitHub push: no target repo (only the starter remote, push DISABLED). Needs the developer's repo URL and auth.
3. Live playtest on Cloudflare and measured Free-plan numbers (CPU, D1 rows, Durable Object requests).
4. Asset provenance evidence (docs/asset-provenance.md): Grok terms link, source of maps, houses, overlays, coin.
5. Rotate the Cloudflare token; the Zero Trust team must stay enabled.
6. Chrome extension disconnected after a suspend; Playwright check script: docs/plan05-tools/death-duel-check.mjs.
