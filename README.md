# ⚔️ Gemquest — Match-3 Card Battle

A single-file browser game combining **match-3** puzzle mechanics with **class-based card battling**. Match gems to bank mana, smash skulls for direct damage, then spend mana on role-appropriate cards and weapons to achieve **absolute domination** over a ladder of increasingly tough AI opponents.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

## How it works

- **Shared board duel (Puzzle Quest style):** you and an AI opponent alternate turns on one random 8×8 board.
- **Controls:** drag a gem into a neighbor to swap (works with mouse or touch), or tap two adjacent gems.
- **Gems → mana:** each colored gem banks mana of one of five schools — 🔴 Rage, 🔵 Arcane, 🟢 Vigor, 🟡 Holy, 🟣 Shadow.
- **💀 Skulls → direct damage:** matching skulls damages your opponent regardless of class.
- **🌈 Wildcards** match any color; **💣 bombs** are colored gems that also clear a 3×3 blast and deal extra damage when matched. Both spawn from refills.
- **Match 4+ = extra turn.**
- **Cards:** spend banked mana to cast your class's spells, attacks, and signature weapon. Damage, heal, shield, poison, stun, drain, buff, armor-pierce, and extra-turn effects.
- **Level up between fights:** each victory lets you pick a reward — +20 max HP, an **Attunement** (permanent starting mana), an **upgrade** to a card (~+30%), or **learn a new card**. Your progression carries across the ladder (and through retries).
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

- More special tiles (locked/hazard gems, color-bomb line clears)
- An equipment/loot system and persistent meta-progression across runs
- Larger reward pool and rarer "elite" cards
- Sound and richer animation (drop the CSS/emoji art for sprites)
