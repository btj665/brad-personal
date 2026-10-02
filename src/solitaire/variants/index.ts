import type { Variant } from '../types'
import { CANFIELD, CANFIELD_1, CHAMELEON, RAINBOW, STOREHOUSE } from './canfield'
import { BAKERS_GAME, FREECELL, FREECELL_2 } from './freecell'
import {
  AUSTRALIAN,
  FORTY_AND_EIGHT,
  FORTY_THIEVES,
  JOSEPHINE,
  LIMITED,
  NUMBER_TEN,
  STREETS,
} from './fortythieves'
import { BLACK_HOLE, GOLF, GOLF_WRAP } from './golf'
import { KLONDIKE_1, KLONDIKE_3, KLONDIKE_VEGAS } from './klondike'
import {
  DOUBLE_KLONDIKE,
  EASTHAVEN,
  THUMB_AND_POUCH,
  WESTCLIFF,
  WHITEHEAD,
} from './klondikefamily'
import { SCORPION, WASP } from './scorpion'
import { SPIDER_1, SPIDER_2, SPIDER_4, SPIDERETTE } from './spider'
import { ALASKA, RUSSIAN, YUKON } from './yukon'

// Families the engine deliberately does NOT try to hold, because their goal is not
// "build foundations from a tableau" and forcing them into this record would be a
// lie about how they play:
//
//   - Pyramid / Tri Peaks / pairing-Golf — you REMOVE cards in pairs summing to 13
//     (or off a wheel), never building a foundation. A matching engine, not this one.
//   - Accordion — the row COLLAPSES onto itself; there is no tableau/foundation split.
//   - Montana / Gaps — wholly POSITIONAL: cards slot into a grid by rank and suit and
//     nothing is "built" at all.
//   - Clock — a fixed twelve-pile clock face with no tableau building.
//   - Monte Carlo / Pairs — adjacency-based pair removal, again a matching game.
//   - Sixty Thieves and other three-deck games — the shoe here is capped at two decks.
//
// Each would need a fundamentally different core, so they are named here rather than
// bent into a shape that misrepresents them.

/** Every variant, grouped by family for the picker. Order within a family runs
 *  easy to hard. */
export const VARIANTS: Variant[] = [
  // Klondike and its stock/deal cousins.
  KLONDIKE_1,
  KLONDIKE_3,
  KLONDIKE_VEGAS,
  THUMB_AND_POUCH,
  WHITEHEAD,
  WESTCLIFF,
  EASTHAVEN,
  DOUBLE_KLONDIKE,
  // FreeCell.
  FREECELL,
  FREECELL_2,
  BAKERS_GAME,
  // Canfield.
  CANFIELD_1,
  CANFIELD,
  RAINBOW,
  STOREHOUSE,
  CHAMELEON,
  // Yukon.
  YUKON,
  ALASKA,
  RUSSIAN,
  // Forty Thieves.
  JOSEPHINE,
  LIMITED,
  STREETS,
  NUMBER_TEN,
  FORTY_AND_EIGHT,
  AUSTRALIAN,
  FORTY_THIEVES,
  // Spider.
  SPIDER_1,
  SPIDER_2,
  SPIDER_4,
  SPIDERETTE,
  // Scorpion.
  SCORPION,
  WASP,
  // Golf and Black Hole — the single-pile builders.
  GOLF_WRAP,
  GOLF,
  BLACK_HOLE,
]

export function variantById(id: string): Variant {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0]
}

export function families(): Array<{ family: string; variants: Variant[] }> {
  const order: string[] = []
  const byFamily = new Map<string, Variant[]>()
  for (const v of VARIANTS) {
    if (!byFamily.has(v.family)) {
      byFamily.set(v.family, [])
      order.push(v.family)
    }
    byFamily.get(v.family)!.push(v)
  }
  return order.map((family) => ({ family, variants: byFamily.get(family)! }))
}
