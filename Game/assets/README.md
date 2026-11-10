# Assets

Pictures for the game. Side-view characters face right, so the page can flip them when they walk left. Character, creature, house, and overlay files are transparent PNGs. Maps are JPEGs.

The requirements in `task/briefing_A.md` still name the first warrior set and `maps/world-map.jpg`. The folders below are the larger set drawn for the wide map, patrol, and walking between walls.

## Avatars

Each folder is one character. The file name is the pose.

| Folder | Who | Poses |
|---|---|---|
| `avatars/warrior/` | First warrior set | `stand`, `attack`, `pickup` |
| `avatars/warrior-m/` | Man | `stand`, `walk-1` `walk-2` `walk-3`, `attack-1` `attack-2`, `pickup` |
| `avatars/warrior-f/` | Woman | same poses as the man |
| `avatars/axolotl/` | Pet | `stand`, `walk`, `pickup` |
| `avatars/blacksmith/` | Smith | `stand` |
| `avatars/wolf/` | Green fields | `stand`, `walk-1` `walk-2` `walk-3`, `step`, `bite` |
| `avatars/bear/` | Grey fields | `stand`, `walk-1` `walk-2` `walk-3`, `charge`, `swipe` |
| `avatars/skeleton/` | Cemetery | `stand`, `walk-1` `walk-2` `walk-3`, `strike`, `thrust` |

`wolf/walk-1.png` is the same picture as `wolf/step.png`.

Swap stills. Do not play them as a film strip.

- Idle: `stand.png`
- Walk: `walk-1`, then `walk-2`, then `walk-3`, then `walk-2` again. Frame 1 is a stride, frame 2 is the legs passing, frame 3 is the opposite stride. Returning through frame 2 closes the loop. About 320 ms a frame matches the hero's step.
- Attack: `attack`, `attack-1` then `attack-2`, `bite`, `charge`, `swipe`, `strike`, or `thrust`. Hold an attack for about 420 ms.
- Pickup: `pickup.png` while the coin is collected, then back to `stand`.

Frames in one folder are not the same pixel size. Scale a character's stills to one height before drawing them. Anchor the feet, not the top of the sprite. The skeleton stills are much taller than the wolf and the bear.

Gender does not change the numbers. `warrior-m` and `warrior-f` are the two drawn bodies. `avatars/warrior/` is the smaller set the login can use until the page is pointed at the new folders.

Patrol for the three enemies is a walk along a short path in their region, swapping the walk frames, and flipping the sprite when the path turns left. Use `bite` for the wolf, `swipe` or `charge` for the bear, and `strike` or `thrust` for the skeleton. The sword on the skeleton stays low during the walk.

## Houses

`houses/forge.png`, `houses/cottage.png`, and `houses/tall.png` are single buildings. The ground line is the bottom of the picture. Sort each house by that bottom edge, the same way a character is sorted by their feet. A character whose feet are lower on the screen draws in front of the house. A character whose feet are higher draws behind it.

These three are props to place on the ground. They are not lined up on the map image.

## Maps

| File | What it is |
|---|---|
| `maps/world-map.jpg` | Square map, 1024×1024. The picture named in the requirements. |
| `maps/world-map-wide.jpg` | Wide map, 1280×720. Cemetery upper left, grey field upper right, town lower left, green field lower right. Houses and walls are painted into this file. |
| `maps/world-ground.jpg` | Same wide view with the town buildings and the walls removed. This is the plate the overlays sit on. |
| `maps/map.jpg` | Older side-view picture. Not the play map. |

Use `world-ground.jpg` when the overlays are on. Use `world-map-wide.jpg` when you want one painted picture and no overlay split. A character drawn on `world-map-wide.jpg` will sit on top of the painted roofs and walls.

## Overlays

`overlays/town-behind.png`, `overlays/town-wall-near.png`, and `overlays/cemetery-wall.png` are 1280×720, the same size as `world-ground.jpg`. Draw them at the same origin as the ground. Empty space is transparent.

Draw order:

1. `maps/world-ground.jpg`
2. `overlays/town-behind.png` — houses and the far side of the town
3. The avatars, pets, and enemies, sorted by feet
4. `overlays/town-wall-near.png` — the stone wall along the near side of the town, with the gate
5. `overlays/cemetery-wall.png`, but only in front of a character who is standing on the north side of that wall

Inside the square, the character is in front of the houses and behind the near wall. South of the gate, draw the character after `town-wall-near.png` so they stand in front of that wall. The cemetery wall has a gap. A character whose feet are south of the wall draws in front of it. A character north of the wall draws behind it.

The top edge of `town-wall-near.png` is a little uneven, and a bit of the yard fence came with the wall. `world-ground.jpg` still has a few trees where the town was removed. `town-behind.png` covers them.

There is no collision in these pictures. A step walk can still cross a wall unless the page adds that rule.
