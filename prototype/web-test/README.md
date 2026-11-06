# Project Charon — web test v3

The opening of Perfect Assassin (Level 1, The Desert Canyon) rebuilt in the browser from the original data. Serve the folder over HTTP (for example `python -m http.server`) and open `index.html`. Opening it as a file will not work, because the page fetches its data.

## Controls (matching the original's model, without its gold frame)

- **Double-click**: hurry there (3D Charon: his walk played `FAST_WALK` = 1.45 times faster, covering ground 1.45 times faster, so the feet still match).
- **Click**: walk, or do the action the label line names: search a body, pick up an item, talk, read or use.
- **Right-click**: combat mode on or off. In combat Charon stands his ground, the pointer becomes the original sight (`SHOOTPTR`, or `SHTDOPTR` over something that can be hit), and **click** fires at it. Esc also holsters.
- **1 2 3 or the mouse wheel**: select multi-purpose, high velocity or explosive ammo.
- **I**: inventory. **C**: Ethereal Cortex. **M**: mission reminder. **Esc**: menu, or close a panel.

## What's in

- **Searchable bodies with their loot:** the PICKUPS.BIN owners.
- **Destructible rocks.** The boulder in cell (9,8) hides the Porta-Spa.
- **The sealed metal cask:** sealed, then broken, then an ammo cache.
- **The sealed second cave:** explosive shells only. It holds the shield charger and two ammo caches.
- **The komms pra'min run-past.** If it escapes, it comes back with two kommandos.
- **The conversation screen:** talking heads (TALK*.LBM palettes on the TA/TE/TI/TO/TS/TU and CHARON mouth clips), voice syllables, Who is / What is / Where is / Give me, Cortex filters, an attitude toggle, and offering items.
- **The City Gates:** the notice, the keycode panel (158758), and giving the Porta-Spa to Ich'Flah.

## Remake polish (v6)

- **Sky:** only the first 512 columns of `CANYON_sky.png` are sky (the rest is black padding). It now wraps around a dome that follows the camera, four times per full turn, so the black band at the top right is gone.
- **Destination ring** where Charon is walking to, and a **glow** on whatever the pointer is over (characters, props, pickups, the notice and keypad).
- **Talk portraits** have feathered edges, so each head's black backdrop no longer shows as a box.

## Combat fix (v7)

- **Firing animation:** `C00SHOT.PC` is 9 frames × 8 directions (frame-major). The export read it as 8 × 9, so the old code cycled through directions while firing (the spin). Its frames are three separate shots: 0→3→4 high, 2→5→6 level, 8→7 low. Each shot now plays the one that matches the target's height.
- Combat mode on right-click, as in the original; see Controls.

## Sprite sheets re-exported (v8)

- The same header mix-up affected every non-square sheet. Enemies now face the right way when they walk (the doolans, kommandos and komms pra'min use mirrored half-turn sheets). Deaths play their frames in the body's own direction instead of sweeping through all directions.
- `media/` sheets are rebuilt by `tools/extract/export_media.py`. `SHEET_V` in `game.js` is appended to their URLs; bump it after a re-export so browsers don't mix an old cached PNG with new JSON.

## Rendered hero sprites

`?hero=NAME` loads Charon's walk and idle from sheets rendered by `tools/sprites` (see its README). `?hero=DEMO` shows the pipeline's stand-in figure. Rendered sheets carry `world_scale` and a fixed ground anchor, which `sheetSprite()` uses in place of the 1997 per-frame drop.

## Remake landscape (canyon rebuild)

By default the canyon is drawn by the remake landscape; `?world=orig` shows the 1997 block geometry. The 1997 floor and wall meshes stay in the scene, unseen, so clicking, hover names, the walk grid and pathfinding are unchanged.

- `terrain.js`: one continuous terrain built from the 1997 wall masks. Reachable floor is found by flood fill (from the start, the NPCs and every link arrival); everything else becomes rock, so the canyon sits in a landscape. Wall density is blurred into a distance field (rounded outlines), lifted into cliffs at the two 1997 layer heights with a ledge, pushed back into the rock in places (alcoves, buttresses, gullies), with hills behind. A triplanar shader paints the cliffs with sandstone from the sides and the ground with sand from above, each blended with a second material by large-scale noise to hide tiling. A sun with 4K shadows, a sky light, filmic tone mapping and distance haze. `flat` rects keep ground open where the city stands and the cave passages run.
- The cave: rooms found by flood fill from the cave links (with the doorway cells closed) get a rock ceiling (`buildCaveCeiling`) arched over each room, with a few round openings whose rims are smooth; each has a light shaft and a sun pool, and warm fill lights are spread through the dark. Inside the cave the sky light dims and exposure rises. Passages are cut through the canyon's north cliff at the two cave mouths.
- At the gate, as in 1997, the notice (z 980) and the keypad (z 1170) hang on the city wall north of the doorway, right behind the Doolan: a weathered enamel panel (`buildNoticeBoard({ wall: true })`) and a keypad set into the stone (`buildWallKeypad`). Charon walks up in front of each (`userData.approach`).
- `structures.js` `buildCityWall` follows the 1997 map, checked against the original game (`reference/original_canyon/FINDINGS.md`):
  - one face of grey stone blocks at x = 6144 (Poly Haven `rough_block_wall`), with coping and merlons;
  - the gate is a single round-arched doorway one cell wide (z 1280–1536), recessed a cell deep, with a door that rises when the code is entered;
  - a round tower with slit windows and merlons stands on the doorway's south side, where the gate camera sees it.
  
  Nothing stands out in front of the wall.
- Hover labels use 1997's verbs (TX 22–28, 71–72), checked in the original game:
  - "Call to X" for the living, however close Charon is;
  - "Dead X" for a body from afar, "Search dead X" once Charon stands over it;
  - "Pick up", "Read notice", "Use keycode entry panel".
- The cave is lit as 1997 has it: no skylights, an even warm dimness while Charon is inside (`world.lights.cave`), and a pool of daylight just inside each mouth (the map's only 'pool of light' tiles).
- The cave's rocks: rock sprites are loaded from map plane 8 even without the plane-0 bit-7 flag, which the cave's rocks lack.
- The ground darkens and turns to rockier scree toward the cliff feet (an `aEdge` attribute from the distance to the cliffs), and a worn concrete forecourt (`pave`, concrete_floor_worn_001) lies in front of the gate, with sand drifting over its edge.
- `props.js`: a procedural 3D metal cask (sealed and broken) replaces the cask sprites, and 3D scanned rocks replace the 1997 rock sprites (the sprite stays, unseen, for picking, blocking and damage; destroying it removes the rock), and rubble is scattered along the feet of the cliffs.

Assets (CC0, Poly Haven): textures cliff_side, rock_face_03, rock_face_04, gravelly_sand, rocky_trail_02, rusty_metal_shutter, rusty_metal_02, metal_plate_02, concrete_slab_wall, concrete_floor_worn_001 (`media/tex/`); models namaqualand_boulder_02/03/04/06, boulder_01, stone_01, rock_09 (`media/models/*.glb`, reduced to 1.5-6k triangles by `tools/models/decimate_props.py`).

## Remake textures

The canyon loads `data/CANYON_{floor,walls,sprites,sky}_hd.png` when they exist (`?tex=orig` for 1997's). They keep the 1997 sheet layouts at a larger scale (floor 5x, walls 128 px tiles, objects 4x), so no map data changes; `objSprite` scales its atlas rectangles by the sheet's size, and a remake sky is used whole and mirrored around the horizon. `tools/textures/fit_canyon_hd.py` builds them from the artwork in `reference/art/textures_canyon_v1/`: it resizes the floor, cuts the wall strip at its real tile seams, and cuts the objects out of their black page and fits each into its old slot.

## Real-time 3D pra'min

With `?hero3d=...` (or `?npc3d=1`; `npc3d=0` turns it off) the kommando pra'min are drawn with the rigged model `media/PRAMIN.glb` (built by `tools/models/rig_creature.py` and `animate_creature.py`) instead of `KMNDOWLK`/`KMNDODED`. `NPC_MODELS` in `game.js` maps a 1997 walk sheet to a model and its height (from the sprites: the kommando is 167 units, Charon 190). The komms pra'min reuses the kommando model tinted brown until it has its own. Each NPC gets a clone with its own material (for the hit flash) playing `idle`, `walk` (sped up to its ground speed) and `death`; the bodies left from the ambush start at the end of `death`. The old sprite stays in place, unseen, as the click and hover target. The Doolan (`DOOLWLK`) uses `media/DOOLAN.glb` (`tools/models/rig_robed.py`: a spine-only rig for a floor-length robe and steepled hands, weighted smoothly by height): `idle`, `walk`, and `talk` while Charon is in conversation with it. The Jakari (`JKWOUND`/`JKWNDED`) use `media/JAKARI.glb` (`tools/models/animate_jakari.py`): `wounded` (face down, propped on the forearms, breathing, a claw twitching) while alive, `dying` to the dead pose, lying at a fixed heading in a pool of green blood that spreads as it dies. Lights and reflections for all models are shared (`modelSetup`).

## Hitscan shots and muzzle flash

Charon's shots no longer fly: like real bullets, each one is a muzzle flash and an impact on the same frame (`makeGunFX` in `game.js`). The flash is three crossed flame petals along the barrel with two side vents, a white-hot core, a star burst, sparks, a smoke wisp and a brief light pulse on the 3D model; the impact adds a flash, sparks and canyon dust over the original blast sprite. Each ammo type has its own look (`GUN_FX`): multi-purpose warm, high velocity long, thin and blue-white, explosive big and orange. All textures are drawn into canvases at startup. With the 3D model the whole cannon arm turns at the shoulder onto the target (up, down or sideways, on top of the `aim` clip and weighted by its blend), and the flash leaves the muzzle along the barrel's real axis, read from two marker bones (`RightMuzzle`, `RightMuzzleAim`) that `rig_humanoid.py` adds at the cannon tip; the flash is drawn 2.1x larger to suit the cannon. The shot goes off a beat after the click, once the arm is on target. His neck and head turn to look at the target (capped near 60°), and each shot kicks, minimally and mostly in the arm: the cannon arm jerks up ~6° at the shoulder, the chest under 1°, the body ~1 cm back, settling in about 0.15 s (`RECOIL`; explosive rounds kick harder, high velocity a little less). These are layered on the animation each frame: arm aim, then recoil, then the head, so the gaze stays on target through the kick (`update()` in `loadHero3D`). Because three's mixer skips writing a bone whose clip value hasn't changed, `update()` restores the clean animated pose before running the mixer; otherwise offsets pile up during held poses. Enemy shots still fly as visible bolts. `?fxslow=20` slows the effects down to study them.

## Real-time 3D Charon

`?hero3d=CHARON` replaces the Charon sprites with the rigged model `media/CHARON.glb`, built by `tools/models` (see its README). It plays `idle`/`walk` (cannon down) in interaction mode, `idle_ready`/`walk_ready` (cannon raised high-ready) in combat mode, and `aim` to fire, cross-fading as the mode toggles. It turns smoothly toward where he walks or shoots, walks at the pace of its own clip (stride from the GLB's `walk_stride_m` extras times `WALK_RATE` in `loadHero3D`, about 155 units/s at full size instead of the sprite's 520), and is lit by its own sun and sky lights (the canyon and the sprites are unlit, so the lights only touch him). `index.html` has an importmap so three.js add-ons (`GLTFLoader`, `RoomEnvironment`) load from the same three.js build. Without the parameter the game is unchanged.

`CHAR_SCALE` (top of `game.js`, now 0.5) sizes every character against the world: the 3D models, the sprites (which stay as invisible click areas under the models), contact shadows and blood pools, the gun flash and shot heights. Walking paces follow automatically, since they come from each clip's stride times the model's scale (Charon walks about 76 units/s at 0.5, about 110 on a double-click).

## Invented for the remake (not confirmed against the original)

- Which sight shows when: `SHTDOPTR` over a target is a guess from its name.
- The aim-height thresholds for high, level and low shots.

- The look of the sealed cave mouth (a rock pile).
- The exact komms route.
- The three attitudes mapped to the three Charon portrait sets.
- What Ich'Flah does after you give him the Porta-Spa.
- The end card.

`tools/export_talk.py` (in the extraction tools) rebuilds `media/talk/`.

When the speaker's own CHARACTS table has no row for a question, the answer falls back as 1997's does (checked against the longplay):
- **A subject:** `STOPICS.BIN` (`W.stopics`) gives the same few lines per subject and verb to everyone, picked at random.
- **"Who is <person>":** byte 77 of that person's CHARACTS record (`W.whois`).
- **Anything else:** the engine's own fallbacks (compass directions, "has it", the "don't know" pool).

`export_proto.py` writes both tables into the map bundle. The place fallback "It is just beyond <place>" (TX 710) isn't decoded yet; see `reference/original_canyon/FINDINGS.md`.

### Cave mouths (`cave.js`)

Each 1997 cave mouth is a straight cut through the north cliff. `buildCavePortal` spans it with a block of rock sunk into the cliffs either side (sized from the terrain heights, so it meets the cliff face and covers the front edge of the cave's rock ceiling), with an arch through it shaped like 1997's 'cave mouth' tiles (16, 18): tall, round-topped and clean-edged, with a black void a little way in (`P.void`, seen only from the canyon side, so the cave cameras still look out at daylight). The rock is tessellated, pushed about by noise and wears the terrain's triplanar material. The open mouth (by the Jakari) is a clear dark arch; the sealed one is choked by `buildRockfall`, chunks of the same rock jammed into the arch with a dark gap at the top and debris spilled in front. The rockfall is the `sealed cave mouth` prop's model, so the explosive that clears the prop takes the whole pile.

### Kar-es-Taal, the city past the gate (`city.js`)

Entering the gate code now opens the gate (the door in the wall's doorway rises, `structures.js`) instead of ending the demo, and Charon walks through the doorway into the city. `?city=0` leaves it out. Once open, the tunnel mouth is an invisible click target (`kind: 'gateway'`, labelled Kar-es-Taal from outside and the desert canyon from inside) that wins over 1997's unseen wall mesh standing across it; without it a click into the gateway landed on that wall and Charon never went in. The city camera also treats the city wall as an obstacle and swings round to a clear side (back towards the gate, just inside it) before coming in steeper.

The look comes from the 1997 city's own art (the JABALCIT / JABALNEW wall banks and the intro's fly-over): an adobe kasbah in a desert basin, sand plaster over stone footings, arched barred windows, wooden doors and roof beams, balconies, lattice tilework, wall posters, Information Consoles in the walls, the Mojo Ladder nightclub, and a blue dome over the doolan quarter.

- **Layout** (`STREETS`): the gate plaza with a cistern (lamp posts, moisture mist), the souk (stalls, shop awnings, shade cloths strung across), council square and the domed Council Hall (blue tiled dome with gold ribs, four minarets, a gilded arched entrance), the Jakhari workers' row with a building site (half-built walls, scaffolding, a crane), lantern lane to the Mojo Ladder's square (the 1997 logo redrawn as neon, a ladder up the front, a roof bar), the council steps and well alley.
- **Houses**: every other lot (a BSP split of the city, trimmed around the streets and grown back out to them) gets a procedural adobe house: district style (worker / souk / doolan), 1-4 storeys, a setback storey, parapets (crenellated on the doolan and edge houses), and on the sides that face a street: a door, shop fronts, windows with grilles, sills and shutters, balconies, roof beams, lattice bands, consoles, posters and lanterns. Roofs carry water tanks, moisture condensers, masts, shade cloths and small domes.
- **Assets**: CC0 from Poly Haven: textures `clay_plaster`, `rough_plaster_broken`, `patterned_clay_plaster`, `sandstone_blocks_08`, `red_sandstone_pavement`, `cobblestone_floor_08`, `weathered_planks`, `hessian_380`, `square_tiled_wall`; models (`media/models`) `wooden_crate_02`, `Barrel_01`, `ceramic_vase_01/03`, `antique_ceramic_vase_01`, `brass_pot_01`, `wooden_bucket_01`, `Lantern_01`, `wooden_stool_01`, `round_wooden_table_01`, `planter_pot_clay` (+ `wooden_ladder`, `wooden_barrels_01`). From the 1997 textures (`media/city/`): wall posters, the Mojo Ladder logo, the steel door, the red vending machine, the console panel. The scans differ a lot in brightness, so each gets a measured colour gain toward the 1997 city's sun-bleached sand.
- **Basin**: the city sits in a hollow ringed by cliffs in the canyon's own triplanar rock; the canyon terrain's open ground east of the wall is dropped out of sight (`sinkX`).
- **Merged per material**: all building pieces are baked to world space with world-scaled UVs and a vertex tint, then merged, about 40 draw calls for the whole city. Pictures (posters, signs, screens) keep their own UVs.
- **Playing it**: the streets are opened in the walk grid (`world.setWalk`), stalls, tables and the cistern are blockers; streets are named floor and buildings named walls for the hover label. Inside the city there are no 1997 cameras, so a camera follows Charon from above and behind; when a house stands in the way it comes in closer and steeper.

