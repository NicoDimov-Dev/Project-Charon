# Real-time character models

Turns an image-to-3D humanoid (`models/<name>/*.glb`) into a rigged, animated GLB the prototype loads with `?hero3d=NAME`.

```
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" -b --factory-startup -P tools/models/inspect_model.py  -- models/charon/charon_hunyuan_v1.glb tools/models/build/charon_hunyuan_v1
"$B" -b --factory-startup -P tools/models/rig_humanoid.py   -- models/charon/charon_hunyuan_v1.glb models/charon/work/charon_rig_v1.blend --height 2.1 --cannon R
"$B" -b --factory-startup models/charon/work/charon_rig_v1.blend -P tools/models/animate_humanoid.py -- prototype/web-test/media/CHARON.glb --test tools/models/build/charon_rig_test --cannon R
```

| Script | Does |
|---|---|
| `inspect_model.py` | Mesh stats (faces, non-manifold edges, UVs, materials, textures, size) and a four-view preview. |
| `slices.py` | Prints horizontal cross-sections; useful to see where arms and legs separate on a new model. |
| `rig_humanoid.py` | Scales to `--height` m, feet on Z=0, centred. Places a Mixamo-named skeleton (Hips, Spine…Head, Left/Right Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase) from measured cross-sections and human proportions. Skins with Blender heat weights on a welded copy, transfers them to the textured mesh, then cleans up by region: no leg weights on the arms, no arm weights on the thighs, and the `--cannon` forearm made rigid. The elbow hinges near the back of the arm so deep folds come to one sharp point. With `--cannon` it adds two unweighted marker bones, `RightMuzzle` at the cannon tip and `RightMuzzleAim` along the bore, which the game uses for the muzzle position and barrel direction. |
| `animate_humanoid.py` | Keys procedural `idle` (2 s breathing), `jog` (the run on double-click, modelled on a side-on slow-motion reference of MGSV's run: the whole body projects forward from the pelvis (~30 degrees), the back leg straightens at push-off, the heel folds up and the knee drives high (`RUN_SWING` ankle path), the front arm drives forward and across the chest, the back arm pulls back with the elbow high; ground speed `RUN_V` = 4 m/s, 20 frames a cycle (180 steps a minute). Each foot is locked to the ground while it is down by two-bone IK from the hip (`ik_leg`), so the speed stored as `jog_stride_m`/`jog_cycle_s` matches the legs exactly and the game plays it at `JOG_RATE` 1. Key poses per step: contact, down (hips lowest), push (heel rolls up), a short float; tune with `RUN_DUTY`, `RUN_LIFT`, `RUN_SINK`, `RUN_BOB`. `--strip` also renders `travel_*.png`, the rig moving at that speed from a fixed camera, to check that planted feet stay put), `walk` (32 frames at 30 fps, two heavy steps) and `aim` (cannon arm raised level). The legs are angled in from the rig's wide rest stance (`ADD_WALK` from `adduction()`, foot spacing relative to the hips) so the feet land under the body instead of a bow-legged gait. `--strip` renders 8-frame filmstrips of the walk and run (join them with `strip_sheet.py`). Two sets: `idle`/`walk` with the cannon arm down (interaction mode) and `idle_ready`/`walk_ready` with it held high-ready beside the head, elbow fully closed (combat mode, as in the 1997 sprites; tune with `GUN`). The walk's stride is measured (heel-to-heel at each contact) and stored on the rig as glTF extras `walk_stride_m` and `walk_cycle_s`. With `--test DIR` it also renders stress poses (rest, arms up, crouch, stride, passing, aim) from front, side and three-quarter views. Exports a GLB with the rig and all actions. |

Assumptions: one mesh, standing, facing −Y, arms hanging clear of the body. His right is −X.

The walk and idle are hand-keyed placeholders. Mixamo clips (upload an FBX export of the rig) can replace them: the bone names already match Mixamo's, without the `mixamorig:` prefix.

To do: hit, grab and death clips; the model's back texture (missing the concept's olive plates and red spine vents).

## Creatures (many-legged)

```
"$B" -b --factory-startup -P tools/models/rig_creature.py -- models/pramin/pramin_v1.glb models/pramin/work/pramin_rig_v1.blend --height 1.85
"$B" -b --factory-startup models/pramin/work/pramin_rig_v1.blend -P tools/models/animate_creature.py -- prototype/web-test/media/PRAMIN.glb --test tools/models/build/pramin_test
```

`legs.py` reports the leg clusters and renders top and bottom views. `rig_creature.py` decimates to `--tris` (70k), scales to `--height`, finds the leg tips by clustering vertices just above the ground, and gives each leg a hip (body to knee) and shin (knee to tip) bone, `LegL1`..`LegL4` / `LegR1`..`LegR4` front to back, plus `Body` and two `Fang` bones. The shell above half height is rigid on `Body`. `animate_creature.py` moves legs by where their tips should go, so it works for legs pointing any way: an alternating tetrapod `walk` (L1 R2 L3 R4, then the others), `idle`, and `death` (the shell drops, the legs curl). Textures are exported as JPEG.

## Jakari (long-armed humanoid)

```
"$B" -b --factory-startup -P tools/models/rig_humanoid.py -- models/jakari/jakari_v1.glb models/jakari/work/jakari_rig_v1.blend --height 2.2 --arm 0.53,0.37,0.19 --name JakariRig --torso-x 0.30 --split-z 0.85 --arm-x 0.40
"$B" -b --factory-startup models/jakari/work/jakari_rig_v1.blend -P tools/models/animate_jakari.py -- prototype/web-test/media/JAKARI.glb --test tools/models/build/jakari_test
```

`rig_humanoid.py` options for non-Charon bodies: `--arm` elbow, wrist and fingertip heights as fractions of height; `--name` the rig object; `--torso-x` keeps arm weights off anything that close to the centre line (harness straps); `--split-z` separates arms from legs below that height by mesh connectivity (hands that hang beside the thighs); `--arm-x` where the arm zone starts above it. The spine now runs straight from hips to neck (things hanging over the chest no longer bend it), and knees are searched inside the arms. Note: Charon's rig predates these two changes; rebuilding it will move his spine joints slightly.

## Robed figures (Doolan)

```
"$B" -b --factory-startup -P tools/models/rig_robed.py -- models/doolan/doolan_v2.glb prototype/web-test/media/DOOLAN.glb --arms --height 2.35 --tris 60000 --test tools/models/build/doolan_v2/test
```

For a figure whose robe reaches the floor and whose hands are held together: decimates (1.56M -> 60k triangles), builds a spine chain (Root, Hips, Spine, Chest, Neck, Head) weighted smoothly by height, keys `idle`, `talk` and `walk` (a gliding shuffle), and exports in one go.

`--arms` (Doolan v2, an A-pose model with free arms): adds UpperArm, ForeArm and Hand bones per side from joint positions measured on the mesh (`J`, fractions of height), gives sleeve and hand vertices to that chain (blending into the chest at the shoulder), and holds the hands steepled at the chest in every clip (`HOLD`), carried with the chest; in `talk` the hands part as he speaks. `death` follows the 1997 DOOLDEAD frames: hands flung up palms out as he recoils, the knees give (the body sinks into the robe, below the floor) and he folds forward into a heap (`DK` keyposes). v1 (hands modelled together, spine-only rig) is kept as `models/doolan/DOOLAN_v1_rigged.glb`.
