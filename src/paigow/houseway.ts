// The house way: how to split seven cards into a five-card high hand and a
// two-card low hand. The dealer must follow it by law, and the bots follow it
// too — it is a fixed, well-known procedure, and it plays close to optimally.
//
// The one iron rule is that the high hand must outrank the low hand; a split
// that breaks it is a "foul" and loses automatically. Every split this function
// returns is legal.
//
// The cards are always evaluated with Pai Gow's wheel ranking (A-2-3-4-5 is the
// second-highest straight), so a joker completes straights and flushes.

import { rankValue as pokerRank, score2, score5, type Score } from '../poker/eval'
import type { Card } from '../engine/types'
import type { Setting } from './types'

const OPTS = { wheelHigh: true }

/** An ace counts 14; the joker is treated as an ace for grouping. */
function rv(card: Card): number {
  return card.joker ? 14 : pokerRank(card.rank)
}

function setting(high: Card[], low: Card[]): Setting {
  return { high, low, highScore: score5(high, OPTS), lowScore: score2(low, OPTS) }
}

function descending(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => rv(b) - rv(a))
}

/** Cards grouped by rank value, each group sorted, groups ordered by size then
 *  rank. The joker joins the aces. */
interface Groups {
  quads: Card[][]
  trips: Card[][]
  pairs: Card[][]
  singles: Card[]
  /** Every card, highest first. */
  all: Card[]
}

function group(cards: Card[]): Groups {
  const byRank = new Map<number, Card[]>()
  for (const c of cards) {
    const k = rv(c)
    const arr = byRank.get(k) ?? []
    arr.push(c)
    byRank.set(k, arr)
  }
  const quads: Card[][] = []
  const trips: Card[][] = []
  const pairs: Card[][] = []
  const singles: Card[] = []
  // Highest rank first, so pairs[0] is the top pair.
  for (const [, arr] of [...byRank.entries()].sort((a, b) => b[0] - a[0])) {
    if (arr.length >= 4) quads.push(arr)
    else if (arr.length === 3) trips.push(arr)
    else if (arr.length === 2) pairs.push(arr)
    else singles.push(arr[0])
  }
  return { quads, trips, pairs, singles, all: descending(cards) }
}

/** The best five-card straight and/or flush hiding in seven cards, if any, as a
 *  Score. Used to decide whether to keep a straight/flush in the back. */
function bestFive(cards: Card[]): Score {
  // Enumerate the 21 five-card subsets; score5 already resolves the joker.
  let best: Score | null = null
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = cards.filter((_, k) => k !== i && k !== j)
      const s = score5(five, OPTS)
      if (!best || compareScore(s, best) > 0) best = s
    }
  }
  return best!
}

function compareScore(a: Score, b: Score): number {
  if (a.category !== b.category) return a.category - b.category
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Ensure the high hand outranks the low; if a rule ever produced a foul, fall
 *  back to the best legal split so the engine never deals an illegal hand. */
function legal(high: Card[], low: Card[], cards: Card[]): Setting {
  const s = setting(high, low)
  if (compareScore(s.highScore, s.lowScore) >= 0) return s
  return bestLegalSplit(cards)
}

/** The safety net: the highest low hand among all legal splits, then the highest
 *  high hand. Never fouls. */
function bestLegalSplit(cards: Card[]): Setting {
  let best: Setting | null = null
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const low = [cards[i], cards[j]]
      const high = cards.filter((_, k) => k !== i && k !== j)
      const s = setting(high, low)
      if (compareScore(s.highScore, s.lowScore) < 0) continue
      if (!best || compareScore(s.lowScore, best.lowScore) > 0) best = s
    }
  }
  return best!
}

/** Two highest cards for the front, given the leftovers after the back is set. */
function topTwo(cards: Card[]): Card[] {
  const d = descending(cards)
  return [d[0], d[1]]
}

export function houseWay(cards: Card[]): Setting {
  if (cards.length !== 7) throw new Error(`house way needs seven cards, got ${cards.length}`)
  const g = group(cards)

  // ---- five of a kind (four aces + joker): pair of aces in front. --------
  if (g.quads.length && g.quads[0].length + (hasJoker(cards) ? 0 : 0) >= 4 && isAces(g.quads[0])) {
    // If a natural pair of kings is present, keep it in front instead.
    if (g.pairs.length && rv(g.pairs[0][0]) === 13) {
      const back = [...g.quads[0].slice(0, 3), ...rest(cards, [...g.pairs[0]])].slice(0, 5)
      return legal(fill(back, cards, g.pairs[0]), g.pairs[0], cards)
    }
    const front = g.quads[0].slice(0, 2)
    const back = fill(g.quads[0].slice(2), cards, front)
    return legal(back, front, cards)
  }

  // ---- four of a kind ----------------------------------------------------
  if (g.quads.length) {
    const q = g.quads[0]
    const val = rv(q[0])
    if (val <= 6) {
      // Low quads: keep together, two highest others in front.
      const back = fill(q, cards, [])
      const front = topTwo(rest(cards, back))
      return legal(fill(q, cards, front), front, cards)
    }
    // Otherwise split into two pairs.
    const front = q.slice(0, 2)
    const back = fill(q.slice(2), cards, front)
    return legal(back, front, cards)
  }

  // ---- full house and better combinations of trips/pairs ------------------
  if (g.trips.length && (g.pairs.length || g.trips.length > 1)) {
    // Full house: play the pair in front, trips (plus kickers) in back. With two
    // sets of trips, the lower trips' pair goes in front.
    const trips = g.trips[0]
    const pair = g.pairs.length ? g.pairs[0] : g.trips[1].slice(0, 2)
    const back = fill(trips, cards, pair)
    return legal(back, pair, cards)
  }

  // ---- three of a kind ----------------------------------------------------
  if (g.trips.length) {
    const t = g.trips[0]
    if (isAces(t)) {
      // Trip aces: an ace and the highest kicker go in front.
      const others = rest(cards, t)
      const front = [t[0], descending(others)[0]]
      const back = fill(t.slice(1), cards, front)
      return legal(back, front, cards)
    }
    const front = topTwo(rest(cards, t))
    return legal(fill(t, cards, front), front, cards)
  }

  // ---- three pairs --------------------------------------------------------
  if (g.pairs.length === 3) {
    // Highest pair to the front, the other two pairs stay in back.
    const front = g.pairs[0]
    const back = rest(cards, front)
    return legal(back, front, cards)
  }

  // ---- two pair -----------------------------------------------------------
  if (g.pairs.length === 2) {
    const hi = g.pairs[0]
    const lo = g.pairs[1]
    const singles = descending(g.singles)
    const topSingle = singles[0] ? rv(singles[0]) : 0

    // Keep the two pair together in the back when they are both small and there
    // is a high card to show in front; otherwise split them.
    const bothLow = rv(hi[0]) <= 6 && rv(lo[0]) <= 6
    if (bothLow && topSingle >= 13) {
      const front = [singles[0], singles[1]]
      const back = rest(cards, front)
      return legal(back, front, cards)
    }
    // Split: higher pair back, lower pair front.
    const back = fill(hi, cards, lo)
    return legal(back, lo, cards)
  }

  // ---- one pair -----------------------------------------------------------
  if (g.pairs.length === 1) {
    const pair = g.pairs[0]
    const front = topTwo(rest(cards, pair))
    return legal(fill(pair, cards, front), front, cards)
  }

  // ---- no pair: keep a straight or flush if there is one -------------------
  const five = bestFive(cards)
  if (five.category >= 4) {
    // A straight or flush exists. Keep the best legal split whose back is that
    // straight/flush; among those, take the strongest front.
    return bestBackAtLeast(cards, five.category)
  }

  // ---- no pair, nothing made: second and third highest cards in front ------
  const d = g.all
  const front = [d[1], d[2]]
  const back = [d[0], d[3], d[4], d[5], d[6]]
  return legal(back, front, cards)
}

// --- helpers ---------------------------------------------------------------

function hasJoker(cards: Card[]): boolean {
  return cards.some((c) => c.joker)
}

function isAces(group: Card[]): boolean {
  return rv(group[0]) === 14
}

/** The cards not in `used` (by identity). */
function rest(cards: Card[], used: Card[]): Card[] {
  const set = new Set(used)
  return cards.filter((c) => !set.has(c))
}

/** Complete a five-card back hand: keep `core`, then add the highest remaining
 *  cards that aren't reserved for the front. */
function fill(core: Card[], cards: Card[], front: Card[]): Card[] {
  const reserved = new Set([...core, ...front])
  const extra = descending(cards.filter((c) => !reserved.has(c)))
  return [...core, ...extra].slice(0, 5)
}

/** Among all legal splits whose back reaches at least `category`, take the one
 *  with the strongest front (then strongest back). */
function bestBackAtLeast(cards: Card[], category: number): Setting {
  let best: Setting | null = null
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const low = [cards[i], cards[j]]
      const high = cards.filter((_, k) => k !== i && k !== j)
      const s = setting(high, low)
      if (s.highScore.category < category) continue
      if (compareScore(s.highScore, s.lowScore) < 0) continue
      if (
        !best ||
        compareScore(s.lowScore, best.lowScore) > 0 ||
        (compareScore(s.lowScore, best.lowScore) === 0 &&
          compareScore(s.highScore, best.highScore) > 0)
      ) {
        best = s
      }
    }
  }
  return best ?? bestLegalSplit(cards)
}
