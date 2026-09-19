// Monte Carlo hand equity — the poker room's yardstick.
//
// Everything else in this project is measured against a known truth; poker's
// known truths are hand equities. This estimator is that truth made computable:
// give it a hero's hole cards, an optional board, a variant, and either specific
// opponent hands or a count of random ones, and it deals the rest of the hand out
// many times and reports how often the hero wins (a chop counts as a fractional
// win). It reproduces the textbook heads-up numbers — AA is ~82% over KK, AKs vs
// 22 is the ~50/50 coin flip — which is what its test suite pins it to.
//
// Scoring goes through the same injected `ranker` the engine uses, so a hand is
// worth exactly the same here as it is at showdown, including Omaha's
// exactly-two-hole-cards rule. The estimator owns none of that logic itself.

import { buildShoeCards } from '../engine/cards'
import { makeRng } from '../engine/rng'
import type { Card, Rank, Suit } from '../engine/types'
import { ranker } from './ranker'
import type { Variant } from './types'

/** One unshuffled 52-card deck in a stable order; every run filters the dead
 *  cards out of a copy of this. */
const FULL_DECK = buildShoeCards(1)

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`
}

/** How many private cards each player holds in this variant (hole + stud up). */
function holeCardCount(variant: Variant): number {
  return variant.deal
    .filter((s) => s.kind === 'hole' || s.kind === 'up')
    .reduce((a, s) => a + s.count, 0)
}

/** How many community cards a completed board holds (0 for stud and draw). */
function communityCount(variant: Variant): number {
  return variant.deal.filter((s) => s.kind === 'community').reduce((a, s) => a + s.count, 0)
}

export interface EquityRequest {
  /** The hero's private cards. */
  hero: Card[]
  /** Community cards already out; the estimator completes the rest. */
  board?: Card[]
  variant: Variant
  /** Specific opponent hands (each may be partial — it's topped up at random). */
  opponents?: Card[][]
  /** How many opponents in total. Defaults to the number given in `opponents`,
   *  or 1. Any beyond the specified ones are dealt at random. */
  numOpponents?: number
  /** Trials to run. A few thousand pins the heads-up numbers to ~±1%. */
  samples?: number
  /** Seed, so an equity read replays exactly. */
  seed?: number
}

/** The hero's win probability, chops counted as fractional wins, in [0, 1]. */
export function estimateEquity(req: EquityRequest): number {
  const { hero, variant } = req
  const board = req.board ?? []
  const samples = req.samples ?? 4000
  const rng = makeRng((req.seed ?? 1) >>> 0)

  const holeCards = holeCardCount(variant)
  const boardTarget = communityCount(variant)

  const specified = req.opponents ?? []
  const nOpp = Math.max(req.numOpponents ?? specified.length, specified.length, 1)

  // Every card already accounted for is dead and can't be dealt again.
  const dead = new Set<string>()
  for (const c of hero) dead.add(cardKey(c))
  for (const c of board) dead.add(cardKey(c))
  for (const opp of specified) for (const c of opp) dead.add(cardKey(c))
  const pool = FULL_DECK.filter((c) => !dead.has(cardKey(c)))

  const boardNeed = Math.max(0, boardTarget - board.length)
  const oppNeed = Array.from({ length: nOpp }, (_, i) => Math.max(0, holeCards - (specified[i]?.length ?? 0)))
  const totalNeed = boardNeed + oppNeed.reduce((a, b) => a + b, 0)

  let heroShare = 0
  for (let s = 0; s < samples; s++) {
    // A partial Fisher–Yates over the pool: draw only the cards this hand needs,
    // swapping each to the back. The pool stays a permutation of the live deck,
    // so the next sample can reuse all of it with no rebuild.
    const drawn: Card[] = []
    let top = pool.length
    for (let d = 0; d < totalNeed && top > 0; d++) {
      const j = rng.int(top)
      top--
      const t = pool[j]
      pool[j] = pool[top]
      pool[top] = t
      drawn.push(t)
    }

    let di = 0
    const fullBoard = boardNeed === 0 ? board : board.concat(drawn.slice(0, boardNeed))
    di += boardNeed

    const heroRank = ranker.score(hero, fullBoard, variant).rank

    // The hero wins the pot outright if strictly best, and splits it with the
    // opponents tied at the top otherwise.
    let bestOpp = -Infinity
    let tiedAtTop = 0
    for (let i = 0; i < nOpp; i++) {
      const oh = oppNeed[i] === 0 ? (specified[i] ?? []) : (specified[i] ?? []).concat(drawn.slice(di, di + oppNeed[i]))
      di += oppNeed[i]
      const r = ranker.score(oh, fullBoard, variant).rank
      if (r > bestOpp) {
        bestOpp = r
        tiedAtTop = 1
      } else if (r === bestOpp) {
        tiedAtTop++
      }
    }

    if (heroRank > bestOpp) heroShare += 1
    else if (heroRank === bestOpp) heroShare += 1 / (tiedAtTop + 1)
  }

  return heroShare / samples
}

/** Parse a shorthand hand like "AsKh", "10dTh", or "As Kh Qc" into cards. Ranks
 *  are A 2-9 (10 or T) J Q K; suits s h d c, any case. For tests and the
 *  validation script — never on the hot path. */
export function handOf(text: string): Card[] {
  const s = text.replace(/\s+/g, '')
  const out: Card[] = []
  let uid = 900000
  for (let i = 0; i < s.length; ) {
    let rank: string
    if (s[i] === '1' && s[i + 1] === '0') {
      rank = '10'
      i += 2
    } else if (s[i].toUpperCase() === 'T') {
      rank = '10'
      i += 1
    } else {
      rank = s[i].toUpperCase()
      i += 1
    }
    const suit = s[i].toUpperCase()
    i += 1
    out.push({ uid: uid++, rank: rank as Rank, suit: suit as Suit })
  }
  return out
}
