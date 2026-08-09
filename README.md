# ⚔️ Gemquest — Match-3 Card Battle

A single-file browser game combining **match-3** puzzle mechanics with **class-based card battling**. Match gems to bank mana, smash skulls for direct damage, then spend mana on role-appropriate cards and weapons to achieve **absolute domination** over a ladder of increasingly tough AI opponents.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

## How it works

- **Shared board duel (Puzzle Quest style):** you and an AI opponent alternate turns on one random 8×8 board.
- **Gems → mana:** each colored gem banks mana of one of five schools — 🔴 Rage, 🔵 Arcane, 🟢 Vigor, 🟡 Holy, 🟣 Shadow.
- **💀 Skulls → direct damage:** matching skulls damages your opponent regardless of class.
- **Match 4+ = extra turn.**
- **Cards:** spend banked mana to cast your class's spells, attacks, and signature weapon. Damage, heal, shield, poison, stun, drain, buff, and extra-turn effects.
- **Gauntlet:** defeat all six challengers on the ladder — ending with the Overlord boss — to win. Foes scale in HP, damage, and AI skill. You heal between fights.

## Classes

| Class | HP | Affinity | Flavor |
|-------|----|----------|--------|
| 🛡️ Fighter | 150 | Rage | Bruiser — huge HP, raw physical burst |
| 🧙 Mage | 95 | Arcane | Glass cannon — devastating burst & control |
| ⛪ Cleric | 120 | Holy / Vigor | Sustain — healing, shields, Smite |
| 🗡️ Rogue | 105 | Shadow | Combo — poison, extra turns, armor pierce |
| ✝️ Paladin | 140 | Holy / Rage | Balanced tank — shields, healing, heavy hits |

## Ideas for expansion

- Board hazards / special gems (bombs, wildcards, locked tiles)
- Card rewards & deck-building between fights
- More classes, an equipment/loot system, and a persistent meta-progression
- Sound and richer animation (drop the CSS/emoji art for sprites)
