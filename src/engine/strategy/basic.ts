// Basic strategy for a multi-deck shoe game.
//
// The tables below are the standard 4–8 deck charts. Each cell is a *code*, not
// an action, because the right play depends on what the house lets you do: "D"
// means "double if you're allowed to, otherwise hit", and so on. `decide()`
// resolves a code into a legal action using the actual RuleSet, which is why one
// chart covers DAS/no-DAS, surrender/no-surrender and every double restriction.
//
// H17 differs from S17 in exactly five cells; they're listed in H17_OVERRIDES
// rather than duplicating the whole chart, so the difference is auditable.

import { rankValue } from '../cards'
import { evaluate, isSplittable } from '../hand'
import { canDouble, canSplit, canSurrender } from '../rules'
import type { Action, Card, Hand, RuleSet, Seat } from '../types'

export type Code =
  | 'H'   // hit
  | 'S'   // stand
  | 'D'   // double, else hit
  | 'Ds'  // double, else stand
  | 'P'   // split
  | 'Ph'  // split if double-after-split is allowed, else hit
  | 'Rh'  // surrender, else hit
  | 'Rs'  // surrender, else stand
  | 'Rp'  // surrender, else split

/** Dealer upcards, in chart order. Index 9 is the ace. */
const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

function upcardIndex(up: Card): number {
  return UPCARDS.indexOf(rankValue(up.rank) as (typeof UPCARDS)[number])
}

// Rows are keyed by hard total 5..21.                2    3    4    5    6    7    8    9    10   A
const HARD: Record<number, Code[]> = {
  5:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:  ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh', 'H'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

// Rows are keyed by the soft total 13..21 (A,2 = 13 … A,9 = 20).
const SOFT: Record<number, Code[]> = {
  12: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'], // A,A when it can't be split
  13: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  14: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  15: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  16: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  17: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

// Rows are keyed by the rank value of one card of the pair. 5,5 and 10,10 are
// deliberately absent: they are never split, so they fall through to the hard
// chart, which stands 20 and doubles 10 without needing a special case.
const PAIRS: Record<number, Code[]> = {
  2:  ['Ph', 'Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3:  ['Ph', 'Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4:  ['H', 'H', 'H', 'Ph', 'Ph', 'H', 'H', 'H', 'H', 'H'],
  6:  ['Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  7:  ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  8:  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  9:  ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
  11: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
}

/** The five cells where "dealer hits soft 17" changes the correct play. */
const H17_OVERRIDES: Array<{ chart: 'hard' | 'soft' | 'pair'; row: number; up: number; code: Code }> = [
  { chart: 'hard', row: 11, up: 11, code: 'D' },  // 11 v A: double
  { chart: 'hard', row: 15, up: 11, code: 'Rh' }, // 15 v A: surrender
  { chart: 'hard', row: 17, up: 11, code: 'Rs' }, // 17 v A: surrender
  { chart: 'soft', row: 18, up: 2, code: 'Ds' },  // A,7 v 2: double
  { chart: 'soft', row: 19, up: 6, code: 'Ds' },  // A,8 v 6: double
  { chart: 'pair', row: 8, up: 11, code: 'Rp' },  // 8,8 v A: surrender
]

function h17Override(chart: 'hard' | 'soft' | 'pair', row: number, up: number): Code | null {
  const hit = H17_OVERRIDES.find((o) => o.chart === chart && o.row === row && o.up === up)
  return hit ? hit.code : null
}

/** The chart cell for a hand, before any legality is applied. Exported so the
 *  UI coach and the tests can read the raw chart. */
export function chartCode(hand: Hand, up: Card, rules: RuleSet, canSplitHand: boolean): Code {
  const ui = upcardIndex(up)
  const upValue = UPCARDS[ui]
  const h17 = rules.dealerHitsSoft17

  if (canSplitHand && isSplittable(hand, rules)) {
    // Unlike tens (K,Q) share the ten row, which is absent, so they stand.
    const pairRank = rankValue(hand.cards[0].rank)
    const row = PAIRS[pairRank]
    if (row) {
      const override = h17 ? h17Override('pair', pairRank, upValue) : null
      return override ?? row[ui]
    }
  }

  const { total, soft } = evaluate(hand.cards)
  const chart = soft ? SOFT : HARD
  const key = soft ? Math.max(12, Math.min(21, total)) : Math.max(5, Math.min(21, total))
  const row = chart[key]
  const override = h17 ? h17Override(soft ? 'soft' : 'hard', key, upValue) : null
  return override ?? row[ui]
}

/** Resolve a chart code into an action this hand may actually take. */
function resolve(code: Code, hand: Hand, up: Card, seat: Seat, rules: RuleSet): Action {
  const mayDouble = canDouble(hand, seat, rules)
  const maySplit = canSplit(hand, seat, rules)
  const maySurrender = canSurrender(hand, rules)

  switch (code) {
    case 'H':
      return 'hit'
    case 'S':
      return 'stand'
    case 'D':
      return mayDouble ? 'double' : 'hit'
    case 'Ds':
      return mayDouble ? 'double' : 'stand'
    case 'P':
      return maySplit ? 'split' : fallbackForPair(hand, up, seat, rules)
    case 'Ph':
      // Split only if the house lets you double afterwards; without DAS these
      // marginal pairs are better played as a single hand.
      return maySplit && rules.doubleAfterSplit ? 'split' : fallbackForPair(hand, up, seat, rules)
    case 'Rh':
      return maySurrender ? 'surrender' : 'hit'
    case 'Rs':
      return maySurrender ? 'surrender' : 'stand'
    case 'Rp':
      if (maySurrender) return 'surrender'
      return maySplit ? 'split' : fallbackForPair(hand, up, seat, rules)
  }
}

/** When a pair can't be split (table max, or no chips), replay the hand against
 *  the hard/soft chart as an ordinary total. */
function fallbackForPair(hand: Hand, up: Card, seat: Seat, rules: RuleSet): Action {
  const code = chartCode(hand, up, rules, false)
  // chartCode with canSplitHand=false never returns a split code, so this
  // can't recurse.
  return resolve(code, hand, up, seat, rules)
}

/** The basic-strategy play for a hand. Always returns a legal action. */
export function basicStrategy(hand: Hand, up: Card, seat: Seat, rules: RuleSet): Action {
  const canSplitHand = canSplit(hand, seat, rules)
  const code = chartCode(hand, up, rules, canSplitHand)
  return resolve(code, hand, up, seat, rules)
}

/** Basic strategy never takes insurance: it's a side bet on the hole card with a
 *  house edge of about 6% in a six-deck game. Only a card counter should. */
export function basicInsurance(): boolean {
  return false
}
