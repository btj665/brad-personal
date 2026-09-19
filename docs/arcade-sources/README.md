# Arcade source documents

Drop primary documents here and tell me they have landed. Manual scans,
operator manuals, instruction cards, photographs of a control panel,
screenshots, pasted text — anything that settles a fact rather than
suggesting one.

Readable formats: `.pdf`, `.png`, `.jpg`, `.txt`, `.md`. Scanned pages are
fine; I read PDFs and images directly. One file per document, named for
what it is, for example `gorf-operator-manual.pdf` or
`megamania-manual-p3.jpg`.

Pasting text straight into the conversation works just as well and needs no
file at all. This folder is for things worth keeping, so a later session
does not have to ask you for them again.

## What is still open

Kept current as documents arrive. Each entry names the value, where it
lives, and what would settle it.

### Gorf

| Open question | Where | What would settle it |
|---|---|---|
| Is the Mission 5 bonus ship once a game or once a tour? | `BONUS_SHIP_MISSION` | Operator manual, bonus-life section |
| Galaxian flagship's point value | `SCORE.galFlagship` | Instruction card or scoring table |
| Astro Battles saucer: 100 or 200 | `SCORE.saucer` | Scoring table. Sources conflict; 100 is used |
| Force field granularity and durability | `FIELD_SEGS` | Screenshot or video of the field eroding |
| Movement speeds, dive paths, firing rates | throughout | Gameplay video, or you describing the feel |
| Which spoken line plays when | `taunt()` | Operator manual, or a recording |

Settled from MAME's DIP table for the PCB (`src/mame/bally/astrocde.cpp`):
three ships per credit, and the bonus ship awarded for reaching Mission 5
rather than at a score.

### Megamania

| Open question | Where | What would settle it |
|---|---|---|
| Energy drain rate | `ENERGY_FRAMES` | Manual, or timing a wave on real hardware |
| Attackers per wave | `WAVES[].count` | Screenshot of any wave, counted |
| Firing frequency | `WAVES[].fire` | Gameplay video |
| Seven of the eight movement patterns | `updateFoes()` | Video, or your description per wave |
| Per-cycle speed increase and recolouring | `speedScale`, `CYCLE_TINTS` | Screenshots of the same wave on cycles 1 and 2 |

Settled by you: energy refills only on a cleared wave, never on a hit. The
bar is eighty units.

### Moon Cresta

| Open question | Where | What would settle it |
|---|---|---|
| Eight waves a lap or ten | `WAVES` | Instruction card. Ten is used |
| Full ship: four shots or five | `gunOffsets()` | Screenshot of a docked ship firing |
| Which end a docking joins | `startDocking()` | Screenshot of the docking sequence |
| Attackers per wave | `WAVES[].count` | Screenshot of any wave, counted |
| Docking climb, drift, alignment tolerance | `startDocking`, `updateDocking` | Video of a docking |
| Movement paths and rates | `updateWave()` | Gameplay video |

Settled from MAME's DIP table for the PCB
(`src/mame/galaxian/galaxian.cpp`): the bonus section at 30,000, the other
switch setting being 50,000. That table has no lives switch, which matches
the three lives being the three rocket sections.
