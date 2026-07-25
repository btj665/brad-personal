// The Fortune side bet reads the whole seven-card hand — the best five of the
// seven, plus a few hands the normal categories can't name: a pair of aces (the
// bottom of the pay table on some felts), five aces (four aces and the joker),
// and a seven-card straight flush.

import { bestOf, Category, rankValue, type Score } from '../poker/eval'
import type { Card } from '../engine/types'

const OPTS = { wheelHigh: true }

export interface FortuneHand {
  score: Score
  royal: boolean
  fiveAces: boolean
  sevenStraightFlush: boolean
}

export function fortuneEvaluate(cards: Card[]): FortuneHand {
  const score = bestOf(cards, OPTS)

  const royal =
    score.category === Category.StraightFlush && score.tiebreak[0] === 14

  // Five aces: four natural aces plus the joker (which counts as an ace).
  const aces = cards.filter((c) => c.joker || c.rank === 'A').length
  const fiveAces = aces >= 5

  const sevenStraightFlush = isSevenCardStraightFlush(cards)

  return { score, royal, fiveAces, sevenStraightFlush }
}

/** All seven cards forming one straight flush — the top of every Fortune table.
 *  The joker fills a gap or an end. */
function isSevenCardStraightFlush(cards: Card[]): boolean {
  if (cards.length !== 7) return false
  const joker = cards.find((c) => c.joker)
  const real = cards.filter((c) => !c.joker)

  // All real cards must share a suit.
  const suit = real[0]?.suit
  if (!real.every((c) => c.suit === suit)) return false

  const values = real.map((c) => rankValue(c.rank))
  return sevenRunPossible(values, !!joker)
}

/** Can these ranks (plus maybe one wild) form seven in a row? Aces count high
 *  and low. */
function sevenRunPossible(values: number[], wild: boolean): boolean {
  const withAceLow = new Set(values)
  if (values.includes(14)) withAceLow.add(1) // ace can also be the low end

  for (const variant of [new Set(values), withAceLow]) {
    for (let start = 1; start <= 8; start++) {
      let gaps = 0
      let ok = true
      for (let v = start; v < start + 7; v++) {
        if (!variant.has(v)) gaps++
        if (gaps > (wild ? 1 : 0)) {
          ok = false
          break
        }
      }
      // Every rank distinct and the run length exactly seven.
      if (ok && variant.size >= (wild ? 6 : 7)) return true
    }
  }
  return false
}
