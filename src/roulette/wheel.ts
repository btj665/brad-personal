// The wheel. Numbers, colours, and the physical pocket order — which is what a
// real wheel is: the order matters for nothing statistically, but it's what you
// watch the ball ride around.

export type Colour = 'red' | 'black' | 'green'

export type Variant = 'american' | 'european' | 'french'

/** The eighteen red numbers; everything else 1–36 is black, 0 and 00 are green. */
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export function colourOf(n: number | '00'): Colour {
  if (n === '00' || n === 0) return 'green'
  return RED.has(n) ? 'red' : 'black'
}

/** The pocket ring, in order, clockwise. European is single-zero; American adds
 *  00 and uses its own famous order. */
export const EUROPEAN_ORDER: Array<number> = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

export const AMERICAN_ORDER: Array<number | '00'> = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8,
  19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
]

export function pocketOrder(variant: Variant): Array<number | '00'> {
  return variant === 'american' ? AMERICAN_ORDER : EUROPEAN_ORDER
}

/** The set of pockets on the wheel, for a spin. */
export function pockets(variant: Variant): Array<number | '00'> {
  return pocketOrder(variant)
}

export const VARIANT_LABEL: Record<Variant, string> = {
  american: 'American (0, 00)',
  european: 'European (single 0)',
  french: 'French (single 0, la partage)',
}

export const VARIANT_EDGE: Record<Variant, number> = {
  american: 5.26,
  european: 2.7,
  // La partage halves the loss on even-money bets when the ball hits zero.
  french: 1.35,
}
