# Pre-rendered character sprites

The remake keeps the original's approach: characters are 3D models rendered offline into
sheets of fixed view angles and played back as billboards. This folder turns a rigged model
into sheets in the same format the web prototype already reads (`prototype/web-test/media/*.json`).

```
model.blend / .glb / .fbx  ──render_sprites.py (Blender)──►  build/<NAME>/<anim>/v00_f00.png …  + manifest.json
                                                     ──pack_sprites.py (Python)──►  <NAME>_<ANIM>.png + .json
```

## 1. What the model needs

| | |
|---|---|
| **Scale** | Real-world metres, standing on Z = 0, origin between the feet. Charon is about 2.1 m tall. |
| **Facing** | Facing **−Y** (Blender's front view) at rest. |
| **Rig** | Any armature. Mixamo rigs work as they are. |
| **Actions** | One Blender action per animation, named as in the table below (case-insensitive). Root motion off: the character walks on the spot. |
| **Materials** | Anything Cycles renders. Emissive red vents read well in the sprites. |

## 2. Animations and frame counts

Frame counts follow the 1997 sheets so the game timing carries over. All are rendered from
**16 views**. The redesign's arm cannon makes Charon asymmetric, so the original's trick of
mirroring half the views (9 or 5 view sheets) must **not** be used for him.

| Action name | Sheet | Frames | Notes |
|---|---|---|---|
| `walk` | `CHARON_WALK` | 16 | One full cycle (two steps), looping. |
| `idle` | `CHARON_IDLE` | 4 | Breathing loop. Original `C00STND`. |
| `aim_high` / `aim_level` / `aim_low` | `CHARON_SHOOT_HIGH` … | 4 each | Raise → fire → fire → recover, arm cannon pointed up / level / down ~25°. Replaces `C00SHOT`'s three shots. |
| `hit` | `CHARON_HIT` | 4 | Original `C00HIT`. |
| `grab` | `CHARON_GRAB` | 9 | Reach down and take. Original `C00GRAB`. |
| `death` | `CHARON_DEATH` | 10 | Optional for now. |

Missing actions are skipped, so a model with only `walk` and `idle` already works.

## 3. Camera, light and view convention

- **Orthographic** camera on −Y looking toward +Y, tilted down **20°**, as in the original's pre-renders. The billboard is drawn upright, so the tilt only sets how much of the top of the head and shoulders shows.
- **View k** turns the character **k × 22.5°** about Z, counter-clockwise from above. View 0 faces the camera, view 4 faces screen-right, view 8 faces away, view 12 faces screen-left. This matches `C00WALK` and the game's `view` maths.
- **Lights are fixed to the camera**, not the character: key from upper left, cool rim from behind right. The shading stays consistent as views turn, like the original renders.
- **Shadow**: a shadow-catcher floor renders the contact shadow into the alpha, like the original's 50% black drop shadow.
- Transparent background, 16-bit PNG out of Blender, packed to 8-bit RGBA.

## 4. Size

`--cell` sets the render height in pixels (default **512**; the 1997 cells are 124). The packer
crops every sheet to the union of its frames and writes:

- `world_scale`: world units per pixel. The game's Charon is about 190 world units tall, so a 512 px render comes out near 0.42.
- `gap`: the same for every cell, the distance from the ground line to the cell bottom, so the existing `sheetSprite()` stands him on the ground without per-frame bobbing.

## 5. Running it

```
blender -b charon.blend -P tools/sprites/render_sprites.py -- --name CHARON --out tools/sprites/build
py tools/sprites/pack_sprites.py tools/sprites/build/CHARON prototype/web-test/media
```

`render_sprites.py` options: `--cell 512`, `--samples 48`, `--anims walk,idle`, `--views 16`,
`--tilt 20`, `--engine CYCLES|BLENDER_EEVEE_NEXT`, `--demo` (builds a stand-in figure instead of using the open file, to test the pipeline).

Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`; add
`--factory-startup` so user add-ons don't interfere. Cycles renders about 0.45 s per image at 256 px
with 12 samples on this machine (no GPU picked up), so a full 512 px set at 48 samples takes a few hours.
Render one action first (`--anims walk`) to check a model.

## 6. Trying it in the game

Copy the packed `NAME_*.png/json` into `prototype/web-test/media` and open the prototype with
`?hero=NAME`. `NAME_WALK` and `NAME_IDLE` replace Charon's 1997 walk and stand; anything not
rendered yet (shots, hits) falls back to the 1997 sheets. Without the parameter the game uses 1997 Charon.

The stand-in test set is in the prototype as `DEMO`: `index.html?hero=DEMO`. Rebuild it with:

```
blender -b --factory-startup -P tools/sprites/render_sprites.py -- --demo --name DEMO --out tools/sprites/build --cell 256 --samples 12 --anims walk,idle
py tools/sprites/pack_sprites.py tools/sprites/build/DEMO prototype/web-test/media
```

## 7. Getting the model

The turnaround is `reference/art/charon_turnaround_v1.webp`. Options, cheapest first:

1. **Image-to-3D** (e.g. Tripo, Meshy, Hunyuan3D, Rodin) from the front/side/back views, then clean up in Blender. Expect to fix hands, the arm cannon and topology.
2. **Auto-rig** the cleaned mesh in Mixamo (upload FBX, place markers) and take walk / idle / hit / pick-up clips. Aim and fire poses need hand-keying for the arm cannon.
3. **Commission** a modeller with the turnaround, for production quality.
