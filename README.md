# ⚔️ Gemquest — Match-3 Card Battle

A single-file browser game combining **match-3** puzzle mechanics with **class-based card battling**. Match gems to bank mana, smash skulls for direct damage, then spend mana on role-appropriate cards and weapons to achieve **absolute domination** over a ladder of increasingly tough AI opponents.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

## How it works

- **Shared board duel (Puzzle Quest style):** you and an AI opponent alternate turns on one random 8×8 board.
- **Controls:** drag a gem into a neighbor to swap (works with mouse or touch), or tap two adjacent gems.
- **Gems → mana:** each colored gem banks mana of one of five schools — 🔴 Rage, 🔵 Arcane, 🟢 Vigor, 🟡 Holy, 🟣 Shadow.
- **💀 Skulls → direct damage:** matching skulls damages your opponent regardless of class.
- **Special gems** spawn from refills: **🌈 wildcards** match any color; **💣 bombs** clear a 3×3 blast; **⚡ lightning** clears its entire row and column. Bombs and lightning also deal bonus damage.
- **🔒 Locked/hazard tiles** start the board partly obstructed on tougher rungs — they can't be moved or matched until you clear gems next to them to break the lock (1–2 layers). Bomb/lightning blasts smash them outright.
- **Match 4+ = extra turn.**
- **Cards:** spend banked mana to cast your class's spells, attacks, and signature weapon. Effects include damage, heal, shield, poison, stun, drain, buff, armor-pierce, extra-turn, plus **weaken** (reduce the foe's next hit), **cleanse** (clear your own debuffs), **mana burn** (drain foe mana), and **counter/reflect**. Each class now has 6 cards, with expanded bonus and elite reward pools.
- **Level up between fights:** each victory lets you pick one reward from a choice of three — +20 max HP, an **Attunement** (permanent starting mana), an **upgrade** to a card (~+30%), **learn a new card** (with a chance at a stronger **⭐ Elite** card), or a **relic** loot drop. Your progression carries across the ladder (and through retries).
- **Relics** are persistent passive loot: start-of-battle shield, +damage, lifesteal, HP regen, thorns, bonus mana, or extra max HP. Collect them across a run.
- **Equipment:** swappable **⚔️ weapon** and **🛡️ armor** slots, distinct from relics. Drops go to your inventory; the **🛡️ Equipment** button lets you equip/swap gear between fights.
- **Run summary & stats:** the victory/defeat screens show foes beaten, total damage dealt/taken, and a full build recap.
- **Polished animation:** gems follow your finger/cursor while dragging and either slide into place or spring back on release; matches pop and new gems fall in. The opponent's move is telegraphed — the target gems pulse with a 👉 marker before a smooth slide — and card casts flash the caster's panel.
- **Audio & feedback:** synthesized sound effects (toggle with **🔊**) plus screen shake and hit flashes for bombs, damage, and clears.
- **Build viewer:** the **📖 Deck & Relics** button opens a read-only summary of your full deck and relics at any time.
- **Save & resume:** your run is checkpointed to the browser (localStorage) at the start of every fight. Reload the page and a **▶ Continue Run** button restores your class, level, deck, relics, equipment, and stats. Starting a new game or winning the run clears the save.
- **Gauntlet:** defeat all six challengers on a smoothed difficulty curve — ending with the Overlord boss — to win. Foes scale in HP, damage, and AI skill; you also heal 35% between fights.

## Classes

| Class | HP | Affinity | Flavor |
|-------|----|----------|--------|
| 🛡️ Fighter | 150 | Rage | Bruiser — huge HP, raw physical burst |
| 🧙 Mage | 95 | Arcane | Glass cannon — devastating burst & control |
| ⛪ Cleric | 120 | Holy / Vigor | Sustain — healing, shields, Smite |
| 🗡️ Rogue | 105 | Shadow | Combo — poison, extra turns, armor pierce |
| ✝️ Paladin | 140 | Holy / Rage | Balanced tank — shields, healing, heavy hits |

## Ideas for expansion

- Persistent meta-progression across runs (unlocks, achievements)
- Boss mechanics and unique enemy special tiles
- A settings panel (difficulty, board size, colorblind palette)
- Sprite art and richer particle effects (drop the CSS/emoji art)
