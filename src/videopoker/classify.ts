// Classifying a five-card video-poker hand into a paying category.
//
// Two families. The "standard" family (Jacks or Better and its bonus cousins)
// ranks a normal poker hand and then splits fours-of-a-kind and pairs the way
// the pay tables need. The "deuces" family treats every 2 as fully wild and adds
// the categories a wild game needs — five of a kind, a wild royal, four deuces.

import { rankValue } from '../poker/eval'
import type { Card } from '../engine/types'

export type PayCategory =
  // shared
  | 'royalFlush'
  | 'straightFlush'
  | 'flush'
  | 'straight'
  | 'threeOfAKind'
  | 'twoPair'
  | 'nothing'
  // standard family
  | 'fourAces'
  | 'fourTwoThruFour'
  | 'fourFiveThruKing'
  | 'fourOfAKind'
  | 'fullHouse'
  | 'jacksOrBetter'
  // deuces family
  | 'naturalRoyal'
  | 'fourDeuces'
  | 'wildRoyal'
  | 'fiveOfAKind'

export type Family = 'standard' | 'deuces'

function counts(values: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return m
}

function isFlush(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit)
}

/** Straight high card, or 0. Ace plays high and low; there is no wheel bonus in
 *  video poker, the wheel is just a five-high straight. */
function straightHigh(values: number[]): number {
  const uniq = [...new Set(values)].sort((a, b) => a - b)
  if (uniq.length !== 5) return 0
  if (uniq[4] - uniq[0] === 4) return uniq[4]
  // A-2-3-4-5
  if (uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 4 && uniq[3] === 5 && uniq[4] === 14) return 5
  return 0
}

// ---------------------------------------------------------------- standard

export function classifyStandard(cards: Card[]): PayCategory {
  const values = cards.map((c) => rankValue(c.rank))
  const flush = isFlush(cards)
  const high = straightHigh(values)
  const cnt = counts(values)
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const shape = groups.map((g) => g[1]).join('')

  if (flush && high === 14) return 'royalFlush'
  if (flush && high) return 'straightFlush'
  if (shape === '41') {
    const quadRank = groups[0][0]
    if (quadRank === 14) return 'fourAces'
    if (quadRank >= 2 && quadRank <= 4) return 'fourTwoThruFour'
    return 'fourFiveThruKing'
  }
  if (shape === '32') return 'fullHouse'
  if (flush) return 'flush'
  if (high) return 'straight'
  if (shape === '311') return 'threeOfAKind'
  if (shape === '221') return 'twoPair'
  if (shape === '2111') {
    // A pair only pays if it is jacks or better.
    const pairRank = groups[0][0]
    return pairRank >= 11 || pairRank === 14 ? 'jacksOrBetter' : 'nothing'
  }
  return 'nothing'
}

// ---------------------------------------------------------------- deuces

/** Deuces (twos) are fully wild. The category is computed from the non-wild
 *  cards plus the number of wilds. */
export function classifyDeuces(cards: Card[]): PayCategory {
  const wild = cards.filter((c) => c.rank === '2')
  const nat = cards.filter((c) => c.rank !== '2')
  const w = wild.length

  if (w === 4) return 'fourDeuces'

  const values = nat.map((c) => rankValue(c.rank))
  const cnt = counts(values)
  const groupSizes = [...cnt.values()].sort((a, b) => b - a)
  const flush = nat.length > 0 && nat.every((c) => c.suit === nat[0].suit)
  const maxSame = groupSizes[0] ?? 0

  // Ranking, highest first. A royal/straight flush needs one suit and so can't
  // coexist with five of a kind (which needs one rank), which is why the order
  // below is unambiguous.
  if (flush) {
    const sf = bestStraightFlushWithWilds(values, w)
    if (sf === 'royal') return w === 0 ? 'naturalRoyal' : 'wildRoyal'
    if (sf === 'straightFlush') return 'straightFlush'
  }

  // Five of a kind: every natural is the same rank, wilds make up the rest.
  if (maxSame + w >= 5) return 'fiveOfAKind'

  // Four of a kind: the majority rank plus wilds. It outranks a flush or a
  // straight in video poker, so it is taken before them.
  if (maxSame + w >= 4) return 'fourOfAKind'

  // Full house: three of one rank + pair of another, wilds included.
  if (isFullHouseWithWilds(groupSizes, w)) return 'fullHouse'

  if (flush) return 'flush'

  const st = bestStraightWithWilds(values, w)
  if (st) return 'straight'

  if (maxSame + w >= 3) return 'threeOfAKind'

  // Deuces Wild pays nothing below three of a kind.
  return 'nothing'
}

/** 'royal' | 'straightFlush' | null — the best flush-run the naturals (all one
 *  suit) plus `w` wilds can complete. */
function bestStraightFlushWithWilds(values: number[], w: number): 'royal' | 'straightFlush' | null {
  const set = new Set(values)
  let royal = false
  let straightFlush = false

  // Try every five-card window. Ace high (14) and low (1).
  const windows: number[][] = []
  for (let lo = 1; lo <= 10; lo++) windows.push([lo, lo + 1, lo + 2, lo + 3, lo + 4])
  windows.push([10, 11, 12, 13, 14]) // broadway (royal)

  for (const win of windows) {
    let have = 0
    for (const v of win) {
      if (set.has(v) || (v === 1 && set.has(14))) have++
    }
    const missing = 5 - have
    if (missing <= w) {
      if (win[4] === 14 && win[0] === 10) royal = true
      else straightFlush = true
    }
  }
  if (royal) return 'royal'
  if (straightFlush) return 'straightFlush'
  return null
}

function bestStraightWithWilds(values: number[], w: number): boolean {
  const set = new Set(values)
  for (let lo = 1; lo <= 10; lo++) {
    const win = [lo, lo + 1, lo + 2, lo + 3, lo + 4]
    let have = 0
    const used = new Set<number>()
    for (const v of win) {
      const present = set.has(v) || (v === 1 && set.has(14))
      // Each distinct rank can only satisfy one slot; guard against duplicates.
      if (present && !used.has(v)) {
        have++
        used.add(v)
      }
    }
    if (5 - have <= w) return true
  }
  return false
}

function isFullHouseWithWilds(groupSizes: number[], w: number): boolean {
  // groupSizes are the natural rank counts, descending. A full house is 3+2.
  const a = groupSizes[0] ?? 0
  const b = groupSizes[1] ?? 0
  // Distribute wilds to reach [>=3, >=2] using the two biggest natural groups.
  for (let toA = 0; toA <= w; toA++) {
    const toB = w - toA
    if (a + toA >= 3 && b + toB >= 2) return true
    if (a + toA >= 2 && b + toB >= 3) return true
  }
  return false
}

export function classify(cards: Card[], family: Family): PayCategory {
  return family === 'deuces' ? classifyDeuces(cards) : classifyStandard(cards)
}
