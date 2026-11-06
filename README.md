# Project Charon

A fan-made, non-commercial remake of **Perfect Assassin** (1997), a sci-fi point-and-click adventure for MS-DOS (and later PlayStation).

The goal is to bring the game to modern browsers and hardware while staying faithful to the original: same locations, camera angles, characters, dialogue and story, read from the 1997 game data. The remake adds modern 3D graphics, lighting and controls on top. It is a passion project made by one fan, for fun and preservation, by someone who played and loved the original.

**Play the current test build:** https://nicodimov-dev.github.io/Project-Charon/ (the first level, the desert canyon, is the work in progress).

## About the original game and its rights

- **Perfect Assassin** was developed by **Synthetic Dimensions** (a UK studio founded in 1985 by Kevin Bulmer and Kate Copestake), produced by **Veritas Productions**, and published by **Grolier Interactive** in 1997 (DOS) and 1998 (PlayStation).
- **Grolier Interactive** stopped publishing games around 1999. Its parent company Grolier, owned by Hachette (Lagardère) since 1988, was bought by **Scholastic Corporation** in 2000, and survives within Scholastic as Grolier Incorporated.
- **Synthetic Dimensions** closed in 2012.
- As far as I can find, the game has not been sold, re-released or supported by anyone for over 25 years and is not available from any store. It is widely treated as abandonware. But abandonware is not a legal status: the copyright in the original game, its art, text, audio and video still belongs to whoever holds it today, presumably the successors of the companies above.

## What this project is, and is not

- **No commercial intent.** It is not sold, has no ads, takes no donations and earns nothing. It never will.
- **Not affiliated with or endorsed by** Grolier, Scholastic, Synthetic Dimensions, Veritas Productions or any other rights holder. "Perfect Assassin" and all original content are the property of their respective owners.
- **The code, tools and new 3D assets** in this repository are new work written for the remake.
- **Some original material is included** so the remake can run and be compared with the original: sprites, textures, map data, text, voice, sound and video extracted from the 1997 game. It is included solely for preservation, study and this non-commercial tribute. The original game itself (installer and executable) is not distributed here.

## For rights holders

If you hold rights to Perfect Assassin and want any of this material removed or changed, please open an issue on this repository and I will act on it promptly and in good faith. I would also be glad to hear from anyone who worked on the original game.

## Repository layout

| Path | What |
|---|---|
| `prototype/web-test/` | The playable remake (three.js, runs in the browser). See its README. |
| `tools/` | Python tools that read the original data files, and scripts that build and rig the 3D models. |
| `models/` | Source 3D models for the remake's characters. |
| `Game/` | Scripts to run the original game in DOSBox for side-by-side testing (the game files themselves are not included). |
| `reference/` | Captures from the original game used to check the remake against it. |

## Running locally

Any static web server works, for example:

```bash
py -m http.server 8766 -d prototype/web-test
```

Then open `http://localhost:8766/?hero3d=CHARON`.
