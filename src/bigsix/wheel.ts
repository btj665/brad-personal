// The Big Six money wheel. Fifty-four equal stops behind a leather clapper, and
// six symbols that each pay their own face value. That's the whole apparatus —
// which is why this file is the whole game: there is no strategy, only a stop
// count and a payoff, and the two never line up in the player's favour.

export type Symbol6 = '1' | '2' | '5' | '10' | '20' | 'joker' | 'logo'

export const SYMBOLS: readonly Symbol6[] = ['1', '2', '5', '10', '20', 'joker', 'logo']

/** How many of the 54 stops carry each symbol. */
export const STOPS: Record<Symbol6, number> = {
  '1': 24,
  '2': 15,
  '5': 7,
  '10': 4,
  '20': 2,
  joker: 1,
  logo: 1,
}

/** What a winning bet is paid, to one. The dollar symbols pay their own face
 *  value; the joker and the house logo both pay 40. */
export const PAYS: Record<Symbol6, number> = {
  '1': 1,
  '2': 2,
  '5': 5,
  '10': 10,
  '20': 20,
  joker: 40,
  logo: 40,
}

export const LABEL: Record<Symbol6, string> = {
  '1': '$1',
  '2': '$2',
  '5': '$5',
  '10': '$10',
  '20': '$20',
  joker: 'Joker',
  logo: 'Logo',
}

/** Six peg-separated sections of nine stops each. The order around the rim is
 *  cosmetic — every stop is equally likely, so only the counts matter — but the
 *  wheel is laid out the way a real one is: dollar bills spread so no two big
 *  payers sit together, and the joker and the logo dead opposite each other. */
const SECTIONS: readonly (readonly Symbol6[])[] = [
  ['1', '2', '1', '2', '1', '5', '1', '2', 'joker'],
  ['1', '2', '1', '5', '1', '10', '1', '2', '5'],
  ['1', '2', '1', '2', '1', '5', '1', '2', '20'],
  ['1', '2', '1', '5', '1', '10', '1', '2', 'logo'],
  ['1', '2', '1', '2', '1', '5', '1', '2', '10'],
  ['1', '2', '1', '5', '1', '20', '1', '2', '10'],
]

export const SECTION_SIZE = 9

/** The rim, clockwise from the clapper. */
export const WHEEL: readonly Symbol6[] = SECTIONS.flat()

export const TOTAL_STOPS = WHEEL.length // 54

/** Chips returned on a winning `amount` staked on `symbol`, stake included. */
export function payout(bet: Symbol6, landed: Symbol6, amount: number): number {
  return bet === landed ? amount * (PAYS[bet] + 1) : 0
}

/** The exact house edge on a flat bet, straight off the wheel: a bet covering
 *  `n` of 54 stops at `p` to one returns n(p+1) stops' worth of the 54 staked.
 *  No sampling — 54 outcomes is a small enough world to just count. */
export function houseEdge(symbol: Symbol6): number {
  const n = STOPS[symbol]
  return (TOTAL_STOPS - n * (PAYS[symbol] + 1)) / TOTAL_STOPS
}

/** Same number, arrived at by walking every stop on the built ring. Kept
 *  separate from `houseEdge` so the ring and the stop counts can be checked
 *  against each other instead of both being taken on trust. */
export function enumerateEdge(symbol: Symbol6): number {
  let net = 0
  for (const landed of WHEEL) net += payout(symbol, landed, 1) - 1
  return -net / TOTAL_STOPS
}
