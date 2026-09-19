// Scoring a poker hand, for the engine and the bots.
//
// It wraps the shared five-card evaluator and adds the one rule the evaluator
// doesn't know: Omaha, where a hand must use *exactly* two of the four hole
// cards and three of the five board cards. Everything else — Hold'em, Stud,
// Draw — is "best five out of the cards you hold plus the board".
//
// The engine compares hands by a single number, so a Score is folded down to one
// here: category in the high digits, then the tiebreak ranks, base-32 so the
// wheel's half-integer still orders correctly. Bigger number, better hand.

import { Category, compare, score5, type Score } from '../poker/eval'
import type { Card } from '../engine/types'
import type { HandRanker } from './engine'
import type { Variant } from './types'

function scoreToNumber(s: Score): number {
  let n = s.category
  for (let i = 0; i < 5; i++) n = n * 32 + Math.round((s.tiebreak[i] ?? 0) * 2)
  return n
}

function combos<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (k > items.length) return []
  const [head, ...rest] = items
  const withHead = combos(rest, k - 1).map((c) => [head, ...c])
  const without = combos(rest, k)
  return [...withHead, ...without]
}

/** The best five-card hand out of any set of five-or-more, keeping the cards that
 *  made it (not just the score) so the table can show the five that play. */
function bestFive(cards: Card[]): { score: Score; best: Card[] } {
  let best: { score: Score; best: Card[] } | null = null
  for (const five of combos(cards, 5)) {
    const score = score5(five)
    if (!best || compare(score, best.score) > 0) best = { score, best: five }
  }
  return best!
}

/** Best Omaha five: exactly two hole cards with exactly three of the board. This
 *  is the rule everyone gets wrong — four to a flush on the board is nothing
 *  unless two of *your* four cards complete it, because you can never play more
 *  than two of your own or fewer than two either. */
function bestOmaha(hole: Card[], board: Card[]): { score: Score; best: Card[] } {
  let best: { score: Score; best: Card[] } | null = null
  for (const h of combos(hole, 2)) {
    for (const b of combos(board, 3)) {
      const five = [...h, ...b]
      const score = score5(five)
      if (!best || compare(score, best.score) > 0) best = { score, best: five }
    }
  }
  return best!
}

// The rank words a dealer would actually say. `rankValue` numbers them 2..14.
const RANK_WORD: Record<number, string> = {
  14: 'ace', 13: 'king', 12: 'queen', 11: 'jack', 10: 'ten', 9: 'nine',
  8: 'eight', 7: 'seven', 6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two',
}

function word(v: number | undefined): string {
  return RANK_WORD[Math.round(v ?? 0)] ?? 'unknown'
}
function plural(v: number | undefined): string {
  const w = word(v)
  return w.endsWith('x') ? `${w}es` : `${w}s` // six -> sixes
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A name the table would call out, using the tiebreak ranks to say *which* pair,
 *  *which* flush, *which* full house — not just the category. */
function nameOf(score: Score): string {
  const tb = score.tiebreak
  switch (score.category) {
    case Category.HighCard:
      return `${cap(word(tb[0]))} high`
    case Category.Pair:
      return `Pair of ${plural(tb[0])}`
    case Category.TwoPair:
      return `Two pair, ${plural(tb[0])} and ${plural(tb[1])}`
    case Category.Trips:
      return `Three of a kind, ${plural(tb[0])}`
    case Category.Straight:
      return `Straight, ${word(tb[0])} high`
    case Category.Flush:
      return `Flush, ${word(tb[0])} high`
    case Category.FullHouse:
      return `Full house, ${plural(tb[0])} full of ${plural(tb[1])}`
    case Category.Quads:
      return `Four of a kind, ${plural(tb[0])}`
    case Category.StraightFlush:
      return tb[0] === 14 ? 'Royal flush' : `Straight flush, ${word(tb[0])} high`
    default:
      return `${cap(word(tb[0]))} high`
  }
}

export const ranker: HandRanker = {
  score(hole: Card[], board: Card[], variant: Variant) {
    if (variant.family === 'draw') {
      // A draw hand is the five cards in front of you, nothing shared.
      const five = hole.slice(0, 5)
      const s = score5(five)
      return { rank: scoreToNumber(s), best: five, name: nameOf(s) }
    }
    if (variant.family === 'omaha' && hole.length >= 2 && board.length >= 3) {
      const { score, best } = bestOmaha(hole, board)
      return { rank: scoreToNumber(score), best, name: nameOf(score) }
    }
    // Hold'em and Stud (and an Omaha hand that ended in folds before the board
    // filled — a lone winner still gets scored): best five of everything held.
    const all = [...hole, ...board]
    if (all.length < 5) {
      // Not enough cards yet (a walk before the deal completes); rank what we have.
      const s = score5([...all, ...all].slice(0, 5))
      return { rank: scoreToNumber(s), best: all, name: nameOf(s) }
    }
    const { score, best } = bestFive(all)
    return { rank: scoreToNumber(score), best, name: nameOf(score) }
  },
}

export { scoreToNumber }
