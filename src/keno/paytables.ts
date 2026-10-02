// Keno rate cards.
//
// PAYTABLE: the traditional Nevada live-keno rate card — the $1.00 straight
// ticket that Las Vegas and Reno keno lounges have printed for decades: 1-spot
// pays 3, 2-spot pays 12, an 8-spot solid pays $18,000 and a 10-spot solid pays
// the $100,000 headline that the house aggregate limit exists to cap.
//
// Two caveats worth knowing before you trust a row. First, the top prizes are
// the part houses actually shade: plenty of properties pay the 7-spot solid at
// $7,000 or the 9-spot solid at $25,000 instead, and a single line like that
// moves the return for that pick count by two to four points. Second, nothing
// here asserts a return — `tsx scripts/keno-return.ts` derives all ten from the
// hypergeometric maths in odds.ts, so if you swap a number the printed edge
// follows it. That is the only honest way to publish a keno pay table.
//
// The returns this card computes to run 69.8%–75.0%, i.e. a house edge of 25.0%
// to 30.2%. That is not a typo and it is not softened anywhere in this codebase:
// keno is, by a wide margin, the worst bet in the building.

import { catchProbability, MAX_PICKS, MIN_PICKS } from './odds'

/** Pay per unit staked, keyed by how many spots were caught. Catch counts that
 *  are absent pay nothing — most of a keno ticket is nothing. */
export type PayRows = Readonly<Record<number, number>>

export interface Paytable {
  id: string
  label: string
  /** Where the numbers come from. */
  source: string
  note: string
  /** Keyed by pick count, 1 through 10. */
  rows: Readonly<Record<number, PayRows>>
}

export const PAYTABLES: readonly Paytable[] = [
  {
    id: 'nevada-1',
    label: 'Nevada straight ticket',
    source: 'Traditional Nevada live-keno $1.00 straight-ticket rate card',
    note: 'The lounge card. Every pick count holds between 25% and 30% for the house.',
    rows: {
      1: { 1: 3 },
      2: { 2: 12 },
      3: { 2: 1, 3: 42 },
      4: { 2: 1, 3: 4, 4: 112 },
      5: { 3: 1, 4: 9, 5: 810 },
      6: { 3: 1, 4: 4, 5: 88, 6: 1500 },
      7: { 4: 1, 5: 21, 6: 400, 7: 8000 },
      8: { 5: 9, 6: 92, 7: 1480, 8: 18000 },
      9: { 5: 4, 6: 44, 7: 300, 8: 4700, 9: 40000 },
      10: { 5: 2, 6: 20, 7: 132, 8: 960, 9: 3800, 10: 100000 },
    },
  },
]

export const DEFAULT_PAYTABLE = PAYTABLES[0]

export function paytableById(id: string): Paytable {
  return PAYTABLES.find((t) => t.id === id) ?? PAYTABLES[0]
}

export function payFor(table: Paytable, picks: number, caught: number): number {
  return table.rows[picks]?.[caught] ?? 0
}

/** The paying catch counts for a pick count, ascending — the rows a rate card
 *  actually prints. */
export function winningCatches(table: Paytable, picks: number): number[] {
  const row = table.rows[picks]
  if (!row) return []
  return Object.keys(row)
    .map(Number)
    .sort((a, b) => a - b)
}

/** The exact return for one pick count: every catch count weighted by its
 *  hypergeometric probability. No simulation — there is nothing to simulate. */
export function expectedReturn(table: Paytable, picks: number): number {
  let ev = 0
  for (let k = 0; k <= picks; k++) {
    const pay = payFor(table, picks, k)
    if (pay !== 0) ev += catchProbability(picks, k) * pay
  }
  return ev
}

export function houseEdge(table: Paytable, picks: number): number {
  return 1 - expectedReturn(table, picks)
}

/** Every pick count a ticket may carry. */
export const PICK_COUNTS: readonly number[] = Array.from(
  { length: MAX_PICKS - MIN_PICKS + 1 },
  (_, i) => MIN_PICKS + i,
)
