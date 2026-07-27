import type { Variant } from '../types'
import { BAKERS_GAME, FREECELL, FREECELL_2 } from './freecell'
import { KLONDIKE_1, KLONDIKE_3, KLONDIKE_VEGAS } from './klondike'
import { SPIDER_1, SPIDER_2, SPIDER_4, SPIDERETTE } from './spider'

/** Every variant, grouped by family for the picker. Order within a family runs
 *  easy to hard. */
export const VARIANTS: Variant[] = [
  KLONDIKE_1,
  KLONDIKE_3,
  KLONDIKE_VEGAS,
  FREECELL,
  FREECELL_2,
  BAKERS_GAME,
  SPIDER_1,
  SPIDER_2,
  SPIDER_4,
  SPIDERETTE,
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
