# Charon model drop folder

Put image-to-3D results here as they are (`.glb` preferred, `.fbx` or `.obj` + textures also fine).
Name versions so they don't overwrite each other: `charon_tripo_v1.glb`, `charon_meshy_v2.glb`, …

## Inputs

`reference/art/charon_views/`: the turnaround split into single views on white, square, centred:
`charon_front.png`, `charon_side_right.png` (shows the arm cannon), `charon_back.png`, `charon_side_left.png`.
The source is only ~810 px tall per figure; a higher-resolution export of the turnaround will give the
generator more detail to work with, especially for the face, hands and cannon.

## When generating

- Use the service's **multi-view** mode if it has one: front + right side + back (+ left side).
- Ask for a **textured** mesh (PBR if offered), and a **quad / remeshed** topology option if offered; 20–60k faces is plenty for sprites.
- If the service offers a T-pose or A-pose option, take it: arms hanging straight down (as in the concept) rig and animate worse.
- Download as **GLB** with textures embedded.
- If the service also auto-rigs and animates, keep that version too (`_rigged`). A walk and idle from the service can go straight into `tools/sprites/render_sprites.py`.

## What happens next (done from Claude Code)

1. Import in Blender, scale to ~2.1 m, stand on the ground, face −Y, check the cannon is on his right.
2. Clean up: fix hands and the cannon, check materials (emissive red vents), decimate if needed.
3. Rig (Mixamo auto-rig or Blender Rigify) and get walk / idle / hit / grab; key the three arm-cannon aim poses.
4. Render with `tools/sprites/render_sprites.py`, pack, and try in the game with `?hero=CHARON`.
