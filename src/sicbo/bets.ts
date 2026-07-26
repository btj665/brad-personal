// Every Sic Bo bet, as the rolls it covers and what it pays. Structurally this
// is roulette with dice: you back a region of the outcome space, the dice land,
// and nothing you decide afterwards matters. The one real difference is that the
// space is 216 rolls, small enough that every house edge below is an exact
// fraction over 216 rather than a number somebody simulated.

export type Face = 1 | 2 | 3 | 4 | 5 | 6

export const FACES: readonly Face[] = [1, 2, 3, 4, 5, 6]

export interface Roll {
  a: Face
  b: Face
  c: Face
}

export type BetKind =
  | 'small' // total 4–10, 1:1 — loses to any triple
  | 'big' // total 11–17, 1:1 — loses to any triple
  | 'odd' // 1:1 — loses to any triple
  | 'even' // 1:1 — loses to any triple
  | 'anyTriple' // three of a kind, any rank, 30:1
  | 'triple' // three of a named rank, 180:1
  | 'double' // at least two of a named rank, 10:1
  | 'single' // a named rank, 1:1 / 2:1 / 3:1 by how often it shows
  | 'combo' // two named ranks both present, 5:1
  | 'total' // an exact total 4–17, paid off the total paytable

/** What each total pays, to one. The steep ends of the curve are the rare ones:
 *  a 4 or a 17 is three rolls out of 216. */
export const TOTAL_PAYOUT: Record<number, number> = {
  4: 60,
  17: 60,
  5: 30,
  16: 30,
  // 17:1, the standard Macau price. A few layouts pay 18:1 here, which cuts the
  // edge on these two spots from 16.67% to 12.04% — the only spot on the table
  // where houses meaningfully differ.
  6: 17,
  15: 17,
  7: 12,
  14: 12,
  8: 8,
  13: 8,
  9: 6,
  12: 6,
  10: 6,
  11: 6,
}

export const TOTALS: readonly number[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

/** The fifteen unordered pairs of distinct faces, in layout order. */
export const COMBOS: ReadonlyArray<readonly [Face, Face]> = FACES.flatMap((a) =>
  FACES.filter((b) => b > a).map((b) => [a, b] as readonly [Face, Face]),
)

export interface Bet {
  /** A stable key, so repeated clicks stack on the same spot. */
  key: string
  kind: BetKind
  label: string
  /** What the spot prints, to one — the way a real layout is painted. */
  pays: string
  /** The faces this spot names, for lighting up the dice that made it win. */
  faces: Face[]
  /** The total this spot names, for a `total` bet. */
  total?: number
}

export const totalOf = (r: Roll): number => r.a + r.b + r.c

export const isTriple = (r: Roll): boolean => r.a === r.b && r.b === r.c

/** How many of the three dice show `face`. */
export function faceCount(r: Roll, face: Face): number {
  return (r.a === face ? 1 : 0) + (r.b === face ? 1 : 0) + (r.c === face ? 1 : 0)
}

// --- the bets ---------------------------------------------------------------

export function smallBet(): Bet {
  return { key: 'small', kind: 'small', label: 'Small 4–10', pays: '1:1', faces: [] }
}

export function bigBet(): Bet {
  return { key: 'big', kind: 'big', label: 'Big 11–17', pays: '1:1', faces: [] }
}

export function oddBet(): Bet {
  return { key: 'odd', kind: 'odd', label: 'Odd', pays: '1:1', faces: [] }
}

export function evenBet(): Bet {
  return { key: 'even', kind: 'even', label: 'Even', pays: '1:1', faces: [] }
}

export function anyTripleBet(): Bet {
  return { key: 'anytriple', kind: 'anyTriple', label: 'Any triple', pays: '30:1', faces: [] }
}

export function tripleBet(face: Face): Bet {
  return { key: `triple-${face}`, kind: 'triple', label: `Triple ${face}s`, pays: '180:1', faces: [face] }
}

export function doubleBet(face: Face): Bet {
  return { key: `double-${face}`, kind: 'double', label: `Double ${face}s`, pays: '10:1', faces: [face] }
}

export function singleBet(face: Face): Bet {
  // One spot, three prices: the more of your number that shows, the more it pays.
  return { key: `single-${face}`, kind: 'single', label: `Single ${face}`, pays: '1:1/2:1/3:1', faces: [face] }
}

export function comboBet(x: Face, y: Face): Bet {
  if (x === y) throw new Error(`a combination needs two different faces: ${x}`)
  const [a, b] = x < y ? [x, y] : [y, x]
  return { key: `combo-${a}-${b}`, kind: 'combo', label: `${a} & ${b}`, pays: '5:1', faces: [a, b] }
}

export function totalBet(n: number): Bet {
  const pay = TOTAL_PAYOUT[n]
  if (pay === undefined) throw new Error(`no total spot for ${n}`)
  return { key: `total-${n}`, kind: 'total', label: `Total ${n}`, pays: `${pay}:1`, faces: [], total: n }
}

/** The whole layout, in the order it is painted. Fifty-two spots. */
export const LAYOUT: readonly Bet[] = [
  smallBet(),
  oddBet(),
  anyTripleBet(),
  evenBet(),
  bigBet(),
  ...FACES.map(tripleBet),
  ...FACES.map(doubleBet),
  ...TOTALS.map(totalBet),
  ...COMBOS.map(([a, b]) => comboBet(a, b)),
  ...FACES.map(singleBet),
]

// --- settlement -------------------------------------------------------------

/** What one unit on this bet wins, to one, or 0 if the bet loses. Small, big,
 *  odd and even all lose to any triple — the house's only claim on an otherwise
 *  even-money proposition, and the whole reason they sit at 2.78% instead of 0.
 *  Note that only four of the six triples are actually inside those ranges;
 *  111 (total 3) and 666 (total 18) already miss them. */
export function oddsFor(bet: Bet, roll: Roll): number {
  const t = totalOf(roll)
  switch (bet.kind) {
    case 'small':
      return !isTriple(roll) && t >= 4 && t <= 10 ? 1 : 0
    case 'big':
      return !isTriple(roll) && t >= 11 && t <= 17 ? 1 : 0
    case 'odd':
      return !isTriple(roll) && t % 2 === 1 ? 1 : 0
    case 'even':
      return !isTriple(roll) && t % 2 === 0 ? 1 : 0
    case 'anyTriple':
      return isTriple(roll) ? 30 : 0
    case 'triple':
      return isTriple(roll) && roll.a === bet.faces[0] ? 180 : 0
    case 'double':
      return faceCount(roll, bet.faces[0]) >= 2 ? 10 : 0
    case 'single':
      // The count is the price: one showing pays 1:1, two 2:1, three 3:1.
      return faceCount(roll, bet.faces[0])
    case 'combo':
      return faceCount(roll, bet.faces[0]) > 0 && faceCount(roll, bet.faces[1]) > 0 ? 5 : 0
    case 'total':
      return t === bet.total ? TOTAL_PAYOUT[t] : 0
  }
}

/** Does this bet win on `roll`? Used to light the winning spots on the felt. */
export function covers(bet: Bet, roll: Roll): boolean {
  return oddsFor(bet, roll) > 0
}

/** What comes back on `roll` — stake plus winnings, or nothing. */
export function settleBet(bet: Bet, roll: Roll, amount: number): number {
  const odds = oddsFor(bet, roll)
  return odds > 0 ? amount * (1 + odds) : 0
}

// --- the exact outcome space -------------------------------------------------

/** All 216 rolls, ordered. Three dice are few enough that nothing about this
 *  game needs sampling: the edge of every spot is a count, not an estimate. */
export const ALL_ROLLS: readonly Roll[] = (() => {
  const out: Roll[] = []
  for (const a of FACES) for (const b of FACES) for (const c of FACES) out.push({ a, b, c })
  return out
})()

/** How many of the 216 rolls this bet wins on. */
export function hitCount(bet: Bet): number {
  let n = 0
  for (const roll of ALL_ROLLS) if (covers(bet, roll)) n++
  return n
}

/** The house's take over all 216 rolls with one unit staked on each, in whole
 *  units. Every payout on the layout is an integer, so this is exact integer
 *  arithmetic and the edge is the fraction `edgeUnits(bet) / 216`. */
export function edgeUnits(bet: Bet): number {
  let net = 0
  for (const roll of ALL_ROLLS) net += settleBet(bet, roll, 1) - 1
  return -net
}

export function houseEdge(bet: Bet): number {
  return edgeUnits(bet) / ALL_ROLLS.length
}

/** The house edge of every spot on this layout, as published, in percent.
 *
 *  `edgeUnits` recomputes all of these from the 216 rolls, so the two must
 *  agree — and the test asserts they do, which is the only reason this table is
 *  worth keeping. Two figures that circulate widely belong to other bets and are
 *  deliberately not used here: 30.09% is a *specific* triple paying 150:1, not
 *  any triple at 30:1; and 18.98% is the total-9-or-12 number, not a specific
 *  double. Both are easy to copy onto the wrong row. */
export function publishedEdge(bet: Bet): number {
  switch (bet.kind) {
    case 'small':
    case 'big':
    case 'odd':
    case 'even':
      return 2.78
    case 'anyTriple':
      return 13.89
    case 'triple':
      return 16.2
    case 'double':
      return 18.52
    case 'single':
      return 7.87
    case 'combo':
      return 16.67
    case 'total': {
      const t = bet.total ?? 0
      const low = Math.min(t, 21 - t) // 4/17, 5/16, … fold onto one another
      return { 4: 15.28, 5: 13.89, 6: 16.67, 7: 9.72, 8: 12.5, 9: 18.98, 10: 12.5 }[low] ?? 0
    }
  }
}
