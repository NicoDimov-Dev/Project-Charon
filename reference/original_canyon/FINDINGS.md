# Desert canyon: the 1997 game vs the remake

The 1997 game was played in `Game/` (DOSBox) on 2026-11-06. Every camera of the canyon's three locations was captured here:
- `L0_C0..5`: the canyon;
- `L1_C0..4`: the cave;
- `L2_C0`: the City Gates.

The remake was compared camera by camera.

## Tools added to `Game/tools/`

- **`tp.py X Y`**: teleports Charon. His position is at image `0x63564` (int16 x, int16 y). Writing the location variable directly breaks the view, so cross between locations through their link cells instead.
- **`capture_cams.py OUT "loc,cam,x,y" ...`**: teleports Charon and grabs one frame per camera.
- **`aim.py where | delta X Y`**: finds the green in-game crosshair, and gives the host pointer move needed to reach a game point.
  - The game reads mouse motion, not position, at about 1.76 game px per screenshot px.
  - Scripted `SendInput` mouse moves don't reach the game; use the real pointer.
- **Crash risk:** teleporting across big distances in one jump can crash the game with a divide-by-zero (EIP image `0x1950F`).

## Fixed in the remake

| What | 1997 | Remake before | Now |
|---|---|---|---|
| City wall | Grey stone blocks along x = 6144 (tiles 8, 20). The gate is one dark doorway one cell wide (z 1280–1536), recessed a cell deep. A rounded tower stands on its south side; seen from the canyon it is a dark block wall with a dark doorway. | A beige concrete and steel gatehouse at z 1480–1860, standing out from the wall, with a mast, lamps and hazard stripes. | Grey stone wall (Poly Haven `rough_block_wall`), round-arched doorway at z 1280–1536 with a door that rises, round tower with merlons and slit windows. `structures.js` `buildCityWall`. |
| Notice and keypad | Both on the wall face north of the doorway (notice z 980, keypad z 1170), right behind the Doolan. | A free-standing billboard and a kiosk in the forecourt. | Both hung on the wall at the 1997 positions: an enamel notice panel and a keypad set into the stone (`buildWallKeypad`, `buildNoticeBoard({wall:true})`). |
| Cave mouths | A tall, clean, round-topped arch (tiles 16, 18), pitch black inside, at the foot of a lit cliff. The open one has bones at its foot; it reads clearly from camera C2. | A low, irregular, noisy hole in a shadowed rock slab; it didn't read from C2. | A cleaner and taller round arch (170 × 250), with a black void inside that is visible only from the canyon. The sealed one keeps its rockfall. `cave.js`. |
| Hover verbs | The living are "Call to X" however close Charon is (checked on the doolan and on the tortured jakhari, right beside him). Bodies show "Dead X" from afar and "Search dead X" once Charon stands over them. Also "Pick up X", "Read notice", "Use keycode entry panel" (TX 22–28, 71–72). | Bare names; "Search dead" at any distance. | The 1997 verbs and distance rule. |
| Search result | "Search yields a jakhari pipe", with no full stop. | "Search yields a jakhari pipe." | No full stop. |
| Cave light | The cave is evenly dim; floor and walls read everywhere. The only 'pool of light' floor tiles are the two mouth cells (10,3) and (15,3). | Four invented skylights cast bright pools in the cave, and the rest was near black. | No skylights. A warm ambient fades in inside the cave, there are softer fills, and a pool of daylight sits just inside each mouth. |
| Cave rocks | Rocks and boulders on the cave floor (seen from cave C3 and C4). | Missing: their map cells lack the plane-0 bit-7 flag the loader required. | Rock sprites (0–3) load anywhere west of the wall. The cask codes in the cave (the broken-cask cells) are left out; the sealed cask is placed by hand as before. |

## Conversations (game files and the longplay)

The longplay (YouTube E8HdqUQFvnQ, 2:30–6:45) shows the G'Ssett Kasse conversation in the cave. I compared it with the data.

- **Own table:** each character has one, from CHARACTS.BIN, header → rows of (topic type, verb, topic, string). The remake reads it exactly. Verbs: 0 Who is, 1 What is, 2 Where is, 3 Give me. Object topics are pickup indices.
- **Fallbacks:** when the speaker's own table has no row, 1997 falls back to data the remake was missing:

| Asked about | Source | Example (as in the video) | Remake |
|---|---|---|---|
| A subject (LIST0004) | `STOPICS.BIN`: 14-byte records from offset 66; Who / What / Where = (first string, count); one picked at random | "Where is the Mojo Ladder?" → 254 "The Mojo Ladder's in the back streets to the east."; "Where is the Carteele?" → one of 114–116 | Done: `W.stopics` |
| A person, "Who is" | CHARACTS instance record byte 77 = (first string, count) | "Who is Dah'Mon Targ?" → 263 (of 262–263) | Done: `W.whois` |
| A person, "Where is" (far, unknown) | Engine | "I'm afraid I can't help you." (LIST0007 pool) | Already the remake's pool |
| A place | Engine strings 709 "It is near here.", 710 "It is just beyond " + place, compass 60–67, 54 " far away."; LOCATION.BIN holds only places 0–2 | "Where is the back streets?" → "It is just beyond the desert canyon" | Not yet: which neighbouring place it names isn't decoded |

- **Not a global search:** "Where is Dah'Mon Targ?" would then have given another character's line ("You should ask L-Hes"), but the video shows the "can't help" pool.

## Noted, matching already

- **Cameras:** the remake uses the 1997 camera table, and the framing matches at every camera checked: L0 C0–C5, L2 C0.
- **Hover names:** "shadows" (cave arch from outside), "pool of light" (the cave exit from inside), "the cave", "sand", "rock face", "city wall". All come from the 1997 name tables in both games.
- **Calling an NPC:** clicking the doolan or the tortured jakhari at stage 1 only makes them turn toward Charon; no conversation opens. This fits the Game README's note that the original's conversations are tied to story stages.
- **Searching:** the first click on a far body walks Charon to it, and a second click searches. The remake walks and searches on one click.
- **Item names:** they carry their article ("a jakhari pipe", "the torn paper"), and the remake uses the same table.

## Still to check

- Place fallbacks ("It is just beyond <place>"): which neighbouring place the engine names.
- How a conversation opens in the original. In the video it opens normally on G'Ssett; in DOSBox, clicking only "called" him (turned him to Charon). The mouse may have been missing the click.
- The cells with object codes 7 and 8 (cave (2,16), (3,15), (3,16); row 13 at x 3, 4, 7, 8). These are beyond the canyon sprite sheet: other sprites, or not objects at all.
