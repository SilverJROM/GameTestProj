# Regions and hit-areas: how each number was measured

Source picture: `assets/maps/world-map-wide.jpg`. The JPEG header reads 1280 x 720, checked by
`scripts/check-map-size.mjs` and again by `test/unit/regions.test.ts`. All coordinates are image
pixels, x to the right and y down from the top-left corner. Numbers live in `src/rules/regions.ts`.

## Method

1. Opened the picture with a 80 px grid overlaid (pixel-probe script, scratch only) and read the
   edges of the walls, roads and colour fields by eye.
2. Classified every pixel by colour as a check on those edges: green where the green channel leads
   red and blue by 25 or more (grass), grey where red, green and blue lie within 22 of each other
   (grey ground and stone), and other otherwise. Agreement with the polygons:
   - grey zone: 93 % of sampled pixels classed grey;
   - green zone: 76 % classed green, the rest mostly shadowed grass and bushes;
   - cemetery zone: 61 % grey (tombstones), the rest tree and grass;
   - town zone: mixed, as expected for roofs, walls and courtyard dirt.
3. Drew each polygon back onto the picture and inspected the overlay until edges followed the
   visible boundaries. Accuracy is roughly 5 to 10 px; the boundaries are judgement calls, not survey
   data.
4. Every zone ring shares its edge vertices exactly with its neighbours. A crossing-number test
   with a half-open rule on y then puts each pixel in exactly one ring. A full scan of all
   1280 x 720 = 921,600 pixels in an offline check gave exactly one zone per pixel. The vitest file
   repeats the check on a 4-px grid plus the last row and column.

## Zones and why the borders sit where they do

- **Cemetery (upper left).** Bounded by the trees and the cemetery wall, from the top edge at x 0 to
  432, down the left edge to y 130, along the wall's lower line through (250, 256) and (380, 222),
  and up the wall's far end at (556, 115).
- **Grey (upper right).** From the top edge at x 432 across to x 1280, down to y 530 on the right edge.
  The lower boundary follows the grey ground's edge: (600, 132), (800, 225), (1040, 318), (1230, 440).
- **Green (lower right and the middle).** Everything between the cemetery, the grey ground, the
  town's walls and the bottom edge. The bottom-right corner (1279, 719) lies here because the grey
  edge meets the right edge at y 530, which is what the brief asks for.
- **Town (lower left).** The walled town plus the grass around it. Its upper boundary is the
  cemetery's lower wall; its right boundary is the dirt road from (400, 250) through (530, 330) to
  (640, 380), then the town's east walls, then the road down to the bottom edge at x 650. Because
  this zone reaches the left and bottom edges, the lower-left corner (0, 719) is town, as the brief
  requires. The walled outline (`pearTownWalls`) is a separate ring inside that zone, used by the
  hit-areas and spawn checks.

## Numbers

### Town spawn points (`carrotTownSpawns`, `townSpawn`)

`townSpawn` is the first entry, (300, 440): the open dirt of the courtyard, south of the centre
buildings and clear of the forge and the well. It is the start point for new characters.
Other points: (260, 470), (330, 500), (230, 500), (290, 520), (340, 450), (210, 430). All lie
inside the walls and outside both hit-areas. Test: `townSpawn` is inside `pearTownWalls`,
`zoneAt` returns `town`, and neither hit-area contains it.

### Fountain hit-area (`melonFountainBox`)

The round stone well in the south of the courtyard, centred near (242, 566) with radius about 24 px.
The box is x 218 to 266, y 548 to 584. It is a rectangle, so the test check is four corners plus the
centre.

### Forge hit-area (`mangoForgeBox`)

The smith's hut with the chimney and glowing furnace. The chimney top is near y 410 and the furnace is
near (125, 530), so the box is x 100 to 205, y 405 to 560. It takes in some dirt beside the hut;
that is harmless for a hit-area.

### Skeleton proximity radius (`skeletonRadiusPx = 120`)

The radius is set against the melee reach in the rules tables (48 px). 120 px is 2.5 reaches:
a skeleton notices a character who is close enough to be a threat but not one who is just
crossing the cemetery's far corner. The cemetery spans about 550 px across, so a radius of
120 px covers roughly a fifth of its width and leaves most of the yard as safe lanes. It is also
about one second of walking at the 120 px/s walk speed. A larger radius would make the graveyard
hard to cross; a smaller one would make the skeletons pass characters without reacting.

### Spawn points per monster zone

Each zone gets at least seven points, the same count as the rules tables (`count: 7`). Points sit
well inside their zone, away from the borders, so a monster does not spawn on one:

- Green (wolves): (720, 280), (800, 320), (900, 380), (960, 420), (880, 500), (1000, 560), (1100, 620),
  (760, 520), (660, 600). Each lies in the open grass between the road and the grey edge or south of
  it.
- Grey (bears): (860, 150), (950, 120), (1040, 200), (1120, 150), (1180, 250), (980, 260), (1100, 300).
  All lie above the grey edge, with the rock cluster at (760-1120, 60-200) left out.
- Cemetery (skeletons): (60, 60), (140, 30), (230, 70), (300, 110), (380, 80), (200, 160), (120, 170),
  (260, 200). These lie among the tombstones and pines, away from the wall.

## Sampled pixels

Colours are the RGB values read from the JPEG. Zone is what `zoneAt` returns.

| Pixel (x, y) | RGB | Zone | What it is |
|---|---|---|---|
| (0, 0) | 40, 45, 25 | cemetery | upper-left corner, pine shade |
| (1279, 0) | 104, 99, 95 | grey | upper-right corner, grey ground |
| (0, 719) | 40, 44, 19 | town | lower-left corner, grass by the walls |
| (1279, 719) | 37, 30, 20 | green | lower-right corner, dark field edge |
| (60, 60) | 16, 21, 14 | cemetery | tree shade |
| (200, 160) | 88, 79, 48 | cemetery | tombstones and grass |
| (860, 150) | 91, 86, 80 | grey | grey ground beside the rocks |
| (1100, 220) | 95, 90, 84 | grey | grey ground inside the orange loop |
| (720, 280) | 73, 76, 31 | green | open field, first green spawn |
| (880, 500) | 78, 79, 37 | green | open field |
| (600, 404) | 88, 90, 40 | green | town's east wall corner, on the shared edge |
| (242, 566) | 74, 67, 57 | town | fountain centre |
| (300, 440) | 133, 104, 70 | town | town spawn, courtyard dirt |
| (150, 480) | 21, 18, 13 | town | forge hut shadow |
| (100, 405) | 23, 13, 4 | town | forge box corner, chimney base |
| (205, 560) | 143, 114, 82 | town | forge box corner, courtyard |
| (0, 420) | 36, 39, 18 | town | left edge, grass beside the town wall |
| (1270, 560) | 74, 71, 56 | green | lower-right field edge |

## Known limits

- The zone outlines are approximate, within roughly 5 to 10 px of the visible edges. The town's
  walled outline follows the outer wall by eye.
- The grey and green edge on the far right, below y 500, is low contrast in the picture. The cut at
  (1280, 530) is a judgement made so the lower-right corner falls in green.
- Changing the map means re-measuring every ring. The test will fail on the wrong size before any
  zone check runs.
