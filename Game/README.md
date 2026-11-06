# Perfect Assassin (1997) on Windows 11

The original game runs unchanged in a portable DOSBox Staging that lives in this folder (`dosbox/`).
Nothing is installed system-wide. It plays with full sound: Sound Blaster 16 for speech and effects, and General MIDI music through Windows' built-in synth.

## Play

Double-click **`Play Perfect Assassin.bat`**. The window opens on the 42" monitor (DISPLAY3). To use another screen, change `--screen` in the .bat; `tools\winpos.ps1` lists the screens.

- **Mouse:** click inside the window to use the mouse in the game. It is released when the pointer leaves the window.
- **Dialogue:** click to advance it.
- **Alt+Enter:** fullscreen.
- **Main menu:** Esc opens it. F1 new game, F2 load, F3 save, F4 return to game, F5 options, F6 quit.

## Files

| Path | What |
|---|---|
| `C/AS/` | the installed game (DOS drive C:). It was installed from the CD by `tools/install_game.py`. |
| `../Original/Perfect Assassin Installer` | the CD, mounted as drive D:. The game reads FMV and audio from it. It is never modified. |
| `pass.conf`, `play.conf` | DOSBox config (machine, sound, mounts) and the autostart. |
| `C/AS/PASS.ORG` | backup of the untouched PASS.EXE. |

## Patches (`tools/patch_exe.py`)

Patches are applied to the installed `C/AS/PASS.EXE` only. Each run rebuilds the EXE from `PASS.ORG` with the options you pass.

```bash
py -I tools/patch_exe.py
```
This applies the base fixes:
- **Conversation crash fix.** Talking to an NPC computed 300 ÷ (timer ticks in the last frame). On a modern PC a frame can finish inside one 10 ms tick, so the game divided by 0 and quit to DOS. The patch makes the divisor at least 1.
- **Debug unlock.** The developers' debug mode (Alt+I) was hidden behind an easter-egg timer; the patch removes the timer.

If the game ever drops back to DOS, `C/AS/CW.ERR` holds the crash report (exception and address).

```bash
py -I tools/patch_exe.py --god
```
This also applies **god mode**: hits do 0 damage to shield and health. Scripted deaths still kill you.

```bash
py -I tools/patch_exe.py --undo
```
This restores the original EXE.

Patches take effect the next time the game starts. **God mode is currently ON.**

## In-game cheat keys (the developers' own)

| Key | Effect |
|---|---|
| **Alt+I** | toggle debug mode (an oval appears on the HUD) |
| Alt+C *(debug)* | show "Location NNNN, Camera N" |
| Alt+A *(debug)* | show the object under the cursor |
| **Ctrl+0** *(debug)* | finish the current story stage: plays its end sequence, then starts the next stage |
| Ctrl+1 / Ctrl+2 *(debug)* | 1000 high velocity rounds / 1000 explosive shells |
| Arrow keys *(debug)* | move Charon freely |
| Alt+S / Alt+L | quick-save / quick-load (slot "SaveGame One") |
| F7 | show the current objective |
| V | version string |

## Test harness and cheats (`tools/pa.py`)

Run these from this folder while the game is running. They talk to DOSBox through a local-only API (127.0.0.1:8086). They never touch your real mouse or keyboard and don't steal focus.

```bash
py -I tools/pa.py status
```
Shows location, camera, story stage and objective, health, ammo, and inventory.

```bash
py -I tools/pa.py stage 5
```
Warps to a story stage. The opening cut-scene or conversation of that stage plays, so this is also how you **spawn a stage's NPC conversation**.

```bash
py -I tools/pa.py give all
```
Puts every pickable item in the inventory. `give 12 13`, `take 12`, and `items` lists all items.

```bash
py -I tools/pa.py heal
```

```bash
py -I tools/pa.py ammo 999
```

Other commands: `launch`, `newgame` (skips the intro and starts playing), `menu`, `keys …`, `shot`, `debug on|off`, `peek`/`poke`. Run `py -I tools/pa.py help` to see them all.

Free-form NPC conversations (talking to any character at any time) are not available. Conversations are tied to story stages, so use `stage N`.

### Story stages (`stage N`)

| N | Objective |
|---|---|
| 0 | New game: the desert canyon |
| 1 | Enter the city. |
| 2 | Where is Ul D-Grak? |
| 3 | Find and interrogate Dah'mon Targ. |
| 4 | Find Karanni L'Bajo Maccam. |
| 5 | Speak to Karanni L'Bajo Maccam. |
| 6 | Eliminate Rochan. |
| 7 | Find the entrance to Akim's hideout. |
| 8 | Execute Akim Quorta Khan. |
| 9 | Get information about the Carteele. |
| 10 | Escape to the streets. |
| 11 | Find an entrance to the Hub. |
| 12 | Eliminate Rochan. |
| 13 | Gain access to the Carteele Arena. |
| 14 | Find the keys to complete each zone. |
| 15 | Find a way into the Militia headquarters. |
| 16 | Find a path through the flooded tunnels. |
| 17 | How to enter the upper floors? |
| 18 | Get through the security doors. |
| 19 | Find the outer gate to let K L'Hanna in. |
| 20 | Follow and protect K L'Hanna |
| 21 | Find the crystals and open the Protoverse. |
| 22 | Secure the Tyros Cantata. |
| 23 | Choose your fate! |

## Technical notes

- **Engine and memory:** PASS.EXE is a Watcom LE program on the CauseWay extender. At runtime, data sits at image address + `0x421000` and code at image address + `0x426000`. The variable map is in `tools/pa.py` (`V`).
- **DOSBox API limits:** the API crashes on requests over 4 KB and on Python's HTTP client, so pa.py uses `curl` with small reads.
- **Background mouse input:** background mouse messages reach the game as *relative* motion, so scripted clicks land in the wrong place. Use keys for automation and your own mouse for clicking.
