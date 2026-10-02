// Every roulette bet, as the set of numbers it covers and what it pays. The
// payouts are the universal ones; what changes between wheels is only how many
// green pockets dilute them.

import { colourOf, type Variant } from './wheel'

export type Pocket = number | '00'

export type BetKind =
  | 'straight' // one number, 35:1
  | 'split' // two adjacent, 17:1
  | 'street' // three in a row, 11:1
  | 'corner' // four in a square, 8:1
  | 'sixline' // six (two rows), 5:1
  | 'topline' // 0,00,1,2,3 (American), 6:1
  | 'column' // twelve, 2:1
  | 'dozen' // twelve, 2:1
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low' // 1–18
  | 'high' // 19–36

export const PAYOUT: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  sixline: 5,
  topline: 6,
  column: 2,
  dozen: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
}

/** The even-money bets, which la partage applies to on the French wheel. */
export const EVEN_MONEY: BetKind[] = ['red', 'black', 'odd', 'even', 'low', 'high']

export interface Bet {
  /** A stable key, so repeated clicks stack on the same spot. */
  key: string
  kind: BetKind
  /** The numbers this bet covers. */
  numbers: Pocket[]
  label: string
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/** Build one of the standard outside bets. */
export function outsideBet(kind: BetKind): Bet {
  switch (kind) {
    case 'red':
      return { key: 'red', kind, numbers: range(1, 36).filter((n) => colourOf(n) === 'red'), label: 'Red' }
    case 'black':
      return { key: 'black', kind, numbers: range(1, 36).filter((n) => colourOf(n) === 'black'), label: 'Black' }
    case 'odd':
      return { key: 'odd', kind, numbers: range(1, 36).filter((n) => n % 2 === 1), label: 'Odd' }
    case 'even':
      return { key: 'even', kind, numbers: range(1, 36).filter((n) => n % 2 === 0), label: 'Even' }
    case 'low':
      return { key: 'low', kind, numbers: range(1, 18), label: '1–18' }
    case 'high':
      return { key: 'high', kind, numbers: range(19, 36), label: '19–36' }
    default:
      throw new Error(`not an outside bet: ${kind}`)
  }
}

export function dozenBet(which: 1 | 2 | 3): Bet {
  const start = (which - 1) * 12 + 1
  const label = ['1st 12', '2nd 12', '3rd 12'][which - 1]
  return { key: `dozen-${which}`, kind: 'dozen', numbers: range(start, start + 11), label }
}

export function columnBet(which: 1 | 2 | 3): Bet {
  const numbers = range(0, 11).map((i) => which + i * 3)
  return { key: `column-${which}`, kind: 'column', numbers, label: `Column ${which}` }
}

export function straightBet(n: Pocket): Bet {
  return { key: `straight-${n}`, kind: 'straight', numbers: [n], label: `${n}` }
}

export function toplineBet(): Bet {
  return { key: 'topline', kind: 'topline', numbers: [0, '00', 1, 2, 3], label: 'Top line' }
}

/** The inside bets you make by dropping a chip on a shared edge or corner:
 *  a split (two numbers), a street (a row of three), a corner (four), or a six
 *  line (two rows). The geometry — which numbers a given edge touches — lives in
 *  the UI; this just packages the numbers into a bet with a stable key. */
const INSIDE_NAME: Record<'split' | 'street' | 'corner' | 'sixline', string> = {
  split: 'Split',
  street: 'Street',
  corner: 'Corner',
  sixline: 'Line',
}

export function insideBet(kind: 'split' | 'street' | 'corner' | 'sixline', numbers: Pocket[]): Bet {
  const key = `${kind}-${numbers.map(String).join('-')}`
  return { key, kind, numbers, label: `${INSIDE_NAME[kind]} ${numbers.join('/')}` }
}

/** Does this bet win on `result`, and if so what does one unit return (stake +
 *  winnings)? La partage returns half the stake on an even-money loss to zero. */
export function settleBet(bet: Bet, result: Pocket, variant: Variant, amount: number): number {
  const hit = bet.numbers.some((n) => n === result)
  if (hit) return amount * (PAYOUT[bet.kind] + 1)

  if (variant === 'french' && EVEN_MONEY.includes(bet.kind) && result === 0) {
    return amount / 2 // la partage: half back
  }
  return 0
}
