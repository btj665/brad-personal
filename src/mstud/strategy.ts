// Mississippi Stud strategy.
//
// Two things live here.
//
//   `bestAction` is exact. Mississippi Stud has no dealer and no hidden cards
//   beyond the community cards, so every decision can be solved by enumeration:
//   at fifth street one card is unknown (48 of them), at fourth street two, at
//   third street three. Backing those up gives true optimal play, and once the
//   positions are canonicalised by suit the tables are small enough to memoise
//   and reuse across hands. This is what the edge script and the on-screen coach
//   use, and it is what lands the game on its published 4.91%.
//
//   `chartAction` is the published human strategy — the memorisable one, keyed
//   off pair ranks, high-card counts, draw shapes and the number of low cards.
//   `scripts/mstud-edge.ts` measures both, so the cost of the shortcut is a
//   printed number rather than a claim: it comes to 0.003% of an ante, all of it
//   at fourth street. Third and fifth street are written out exactly. Where the
//   chart is coarser is spelled out street by street below.
//
// One fact worth knowing before reading either: **the 2x raise is never
// correct.** The EV of raising r on top of w already wagered is V(w + r), and V
// is a maximum of payouts linear in w, backed up through further maxima — so it
// is convex in w. Maximising a convex function over {1, 2, 3} always lands on an
// endpoint. Every decision is fold, 1x, or 3x; the 2x circle is decoration.

import { buildShoeCards } from '../engine/cards'
import type { Card } from '../engine/types'
import { rankValue, score5 } from '../poker/eval'
import { multiplierFor } from './rules'
import type { MStudAction, Street } from './types'

export interface Spot {
  street: Street
  hole: Card[]
  /** Community cards face up: none at third street, one at fourth, two at fifth. */
  board: Card[]
  /** Everything already wagered, in ante units — 1 at third street. */
  wagered: number
}

const RAISES: MStudAction[] = ['raise1', 'raise2', 'raise3']

/** How many antes an action puts up. A fold puts up nothing. */
export function raiseUnits(action: MStudAction): number {
  switch (action) {
    case 'raise1':
      return 1
    case 'raise2':
      return 2
    case 'raise3':
      return 3
    default:
      return 0
  }
}

/** Values equal to within this are the same decision as far as we care. The
 *  solver's numbers are means of small integers, so exact ties are common. */
const TIE = 1e-9

// ------------------------------------------------------------------ hand shape

/** Pairing a jack or better pays, 6 through 10 pushes, 2 through 5 loses. The
 *  published charts score that as 2 / 1 / 0 points per card, and count "low
 *  cards" as the 2s through 5s. */
const HIGH = 11
const MID = 6

export function cardPoints(card: Card): number {
  const v = rankValue(card.rank)
  return v >= HIGH ? 2 : v >= MID ? 1 : 0
}

export interface Shape {
  /** Rank values, high first. */
  vals: number[]
  /** Size of the largest suit group, and the ranks in it. */
  suited: number
  suitedVals: number[]
  /** Size of the largest matched-rank group and its rank; zero when unpaired. */
  matched: number
  matchedRank: number
  /** Two separate pairs among the known cards. */
  twoPair: boolean
  highs: number
  mids: number
  lows: number
  points: number
  /** How many of the ten five-card straight windows hold every known rank. Two
   *  means open-ended, one means a gutshot or an end run, zero means dead. */
  windows: number
}

export function shapeOf(cards: Card[]): Shape {
  const vals = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)

  const bySuit = new Map<string, number[]>()
  for (const c of cards) {
    const arr = bySuit.get(c.suit)
    if (arr) arr.push(rankValue(c.rank))
    else bySuit.set(c.suit, [rankValue(c.rank)])
  }
  let suitedVals: number[] = []
  for (const arr of bySuit.values()) if (arr.length > suitedVals.length) suitedVals = arr

  const counts = new Map<number, number>()
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
  let matched = 0
  let matchedRank = 0
  let pairs = 0
  for (const [v, n] of counts) {
    if (n >= 2) pairs++
    if (n > matched || (n === matched && v > matchedRank)) {
      matched = n
      matchedRank = v
    }
  }
  if (matched < 2) {
    matched = 0
    matchedRank = 0
  }

  return {
    vals,
    suited: suitedVals.length,
    suitedVals: suitedVals.slice().sort((a, b) => b - a),
    matched,
    matchedRank,
    twoPair: pairs >= 2,
    highs: vals.filter((v) => v >= HIGH).length,
    mids: vals.filter((v) => v >= MID && v < HIGH).length,
    lows: vals.filter((v) => v < MID).length,
    points: cards.reduce((n, c) => n + cardPoints(c), 0),
    windows: straightWindows(vals),
  }
}

/** How many of the ten straight windows (A-2-3-4-5 up to 10-J-Q-K-A) hold every
 *  rank given. A duplicated rank kills it, which is what we want: a pair can't
 *  be half of a straight draw. */
export function straightWindows(vals: number[]): number {
  const uniq = new Set(vals)
  if (uniq.size !== vals.length) return 0
  let n = 0
  for (let top = 5; top <= 14; top++) {
    const window = new Set<number>()
    for (let i = 0; i < 5; i++) {
      const v = top - i
      window.add(v === 1 ? 14 : v) // the wheel counts the ace as one
    }
    let all = true
    for (const v of uniq) if (!window.has(v)) all = false
    if (all) n++
  }
  return n
}

// ------------------------------------------------------------------ the charts

/** The published Mississippi Stud strategy, street by street. See the three
 *  functions below for the rows and for exactly where each one is coarser than
 *  `bestAction`. */
export function chartAction(spot: Spot): MStudAction {
  const shape = shapeOf([...spot.hole, ...spot.board])
  switch (spot.street) {
    case 'third':
      return thirdChart(shape)
    case 'fourth':
      return fourthChart(shape, spot.wagered)
    case 'fifth':
      return fifthChart(shape, spot.wagered)
  }
}

/** Third street, two cards.
 *
 *    3x   — any pair. Even a pair of deuces: it pays nothing on its own, but the
 *           three chances at trips or two pair are worth more than the ladder
 *           costs, which is the one place this game is counter-intuitive.
 *    1x   — any high card (J–A), or two cards both 6 or better, or suited 6-5.
 *    fold — a mid card with a low card, or two low cards.
 *
 *  Exact: this is the whole 169-hand solver table, written out. */
function thirdChart(shape: Shape): MStudAction {
  if (shape.matched >= 2) return 'raise3'
  if (shape.highs >= 1 || shape.lows === 0) return 'raise1'
  // Suited 6-5 is the only mid-plus-low hand worth a unit: the one suited
  // connector that can still reach a straight, a flush, or both at once.
  const connected = shape.vals[0] - shape.vals[1] === 1
  if (shape.suited === 2 && shape.mids === 1 && shape.lows === 1 && connected) return 'raise1'
  return 'fold'
}

/** Fourth street, three cards.
 *
 *    3x   — a pair of 6s or better (so trips too); three to a straight flush
 *           with no low card and either two high cards or a run open both ends.
 *    1x   — a pair of 2s to 5s; any three to a flush; otherwise when
 *           2·(high cards) + (straight windows) + pot slack ≥ (low cards).
 *    fold — everything else.
 *
 *  The "pot slack" row is the honest form of the published advice to play looser
 *  once you have already raised 3x: it is `wagered - 3`, so -1 after a 1x, 0
 *  after a 2x and +1 after a 3x. A fold gives up whatever is already out, so the
 *  more that is, the cheaper one more unit looks.
 *
 *  SIMPLIFIED, and this is the only street where the chart is: the 1x-versus-3x
 *  line on three to a straight flush is genuinely non-linear in the solver, and
 *  three of its cells are wrong here — a run of three mid cards gets 3x where the
 *  solver wants 1x with only two units out, and a suited run holding one low card
 *  gets 1x where the solver wants 3x. That is 24 of the 22,100
 *  three-card positions, and `npm run mstud:edge` prices the lot at 0.003% of an
 *  ante. Third and fifth street are exactly optimal. */
function fourthChart(shape: Shape, wagered: number): MStudAction {
  // Trips pays 3:1 on its own and can only get better, whatever the rank.
  if (shape.matched >= 3) return 'raise3'
  if (shape.matched === 2) return shape.matchedRank >= MID ? 'raise3' : 'raise1'

  if (shape.suited === 3) {
    const straightFlushDraw = straightWindows(shape.suitedVals) > 0
    if (straightFlushDraw && shape.lows === 0 && (shape.highs >= 2 || shape.windows >= 2)) {
      return 'raise3'
    }
    return 'raise1'
  }

  const slack = wagered - 3
  // Exception: one high card with two low cards. A-3-2 looks like a straight
  // draw, but the only window it sits in is the wheel, and that is the same ace
  // being counted twice. With just the one unit out, throw it away.
  if (slack < 0 && shape.highs === 1 && shape.lows === 2) return 'fold'
  return 2 * shape.highs + shape.windows + slack >= shape.lows ? 'raise1' : 'fold'
}

/** Fifth street, four cards — the one street where the chart can be exact,
 *  because only one card is left to come and its 48 outcomes sort into four
 *  buckets that can be counted by hand.
 *
 *    3x   — a pair of 6s or better, two pair, trips; four to a flush; four to an
 *           open-ended straight unless it is buried in low cards.
 *    1x   — a pair of 2s to 5s; four to an inside straight; and any other hand
 *           whose high cards roughly cover its low cards.
 *    fold — everything else.
 *
 *  For an unpaired, unsuited hand the expected pay per unit is
 *  `(5·outs + 3·(highs − lows) − 36) / 48`: each straight out pays 4, pairing a
 *  high card pays 1, pairing a low card or missing entirely loses 1, and pairing
 *  a mid card pushes. Raise 3x when that is positive, and fold only when even a
 *  single unit can't beat walking away from the pot. */
function fifthChart(shape: Shape, wagered: number): MStudAction {
  if (shape.matched >= 3 || shape.twoPair) return 'raise3'
  if (shape.matched === 2) return shape.matchedRank >= MID ? 'raise3' : 'raise1'
  // Nine flush outs paying 6:1 swamp everything else.
  if (shape.suited === 4) return 'raise3'

  const outs = shape.windows === 2 ? 8 : shape.windows === 1 ? 4 : 0
  const edge = 5 * outs + 3 * (shape.highs - shape.lows) - 36 // 48 x expected pay
  if (edge > 0) return 'raise3'
  // Folding costs `wagered`; one more unit risks `wagered + 1` at `edge / 48`.
  return edge * (wagered + 1) >= -48 * wagered ? 'raise1' : 'fold'
}

// ------------------------------------------------------------------ the solver

const DECK = buildShoeCards(1)
const cardKey = (c: Card) => `${c.rank}${c.suit}`

function unseen(known: Card[]): Card[] {
  const seen = new Set(known.map(cardKey))
  return DECK.filter((c) => !seen.has(cardKey(c)))
}

/** A key that is the same for any two positions differing only in which suits
 *  they use. The pay table and the remaining deck are both suit-blind, so those
 *  positions have identical value, and collapsing them is what keeps the solver
 *  tables small. Suits are ordered by the ranks they hold, so the labelling
 *  doesn't depend on the order the cards arrived in. */
export function canonical(cards: Card[]): string {
  const bySuit = new Map<string, number[]>()
  for (const c of cards) {
    const arr = bySuit.get(c.suit)
    if (arr) arr.push(rankValue(c.rank))
    else bySuit.set(c.suit, [rankValue(c.rank)])
  }
  const groups = [...bySuit.entries()].map(([suit, vals]) => ({
    suit,
    vals: vals.slice().sort((a, b) => b - a),
  }))
  groups.sort((a, b) => byRanksDesc(a.vals, b.vals))
  const label = new Map<string, number>()
  groups.forEach((g, i) => label.set(g.suit, i))

  return cards
    .map((c) => [rankValue(c.rank), label.get(c.suit)!] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([v, l]) => `${v}.${l}`)
    .join(',')
}

function byRanksDesc(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = (b[i] ?? -1) - (a[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

const meanMemo = new Map<string, number>()
const fourthMemo = new Map<string, number>()
const thirdMemo = new Map<string, number>()

/** Expected pay-table multiplier per unit wagered over the last unknown card,
 *  given four known cards. Positive means the position is worth more money on
 *  the table, which is the whole 3x-versus-1x question. */
export function expectedMultiplier(known: Card[]): number {
  const key = canonical(known)
  const hit = meanMemo.get(key)
  if (hit !== undefined) return hit

  const rest = unseen(known)
  let sum = 0
  for (const c of rest) sum += multiplierFor(score5([...known, c]))
  const mean = sum / rest.length
  meanMemo.set(key, mean)
  return mean
}

/** Value of the fifth-street position with `w` already wagered, before deciding.
 *  Folding is -w; raising r is `mean * (w + r)`. Folding wins only when the hand
 *  is nearly certain to lose, because a fold gives up the whole pot while one
 *  more unit buys a chance at all of it. */
function fifthValue(known: Card[], w: number): number {
  const mean = expectedMultiplier(known)
  let best = -w
  for (let r = 1; r <= 3; r++) best = Math.max(best, mean * (w + r))
  return best
}

/** Value after committing to `w` total units at fourth street, averaged over the
 *  community card about to turn. */
function afterFourthRaise(known: Card[], w: number): number {
  const key = `${canonical(known)}|${w}`
  const hit = fourthMemo.get(key)
  if (hit !== undefined) return hit

  const rest = unseen(known)
  let sum = 0
  for (const c of rest) sum += fifthValue([...known, c], w)
  const value = sum / rest.length
  fourthMemo.set(key, value)
  return value
}

/** Value after committing to `w` total units at third street. */
function afterThirdRaise(hole: Card[], w: number): number {
  const key = `${canonical(hole)}|${w}`
  const hit = thirdMemo.get(key)
  if (hit !== undefined) return hit

  const rest = unseen(hole)
  let sum = 0
  for (const c of rest) {
    const three = [...hole, c]
    let best = -w
    for (let r = 1; r <= 3; r++) best = Math.max(best, afterFourthRaise(three, w + r))
    sum += best
  }
  const value = sum / rest.length
  thirdMemo.set(key, value)
  return value
}

function afterRaise(spot: Spot, w: number): number {
  switch (spot.street) {
    case 'third':
      return afterThirdRaise(spot.hole, w)
    case 'fourth':
      return afterFourthRaise([...spot.hole, ...spot.board], w)
    case 'fifth':
      return expectedMultiplier([...spot.hole, ...spot.board]) * w
  }
}

/** Exact optimal play.
 *
 *  Ties matter here. Because the outs sort into a handful of buckets, a raise is
 *  often worth *exactly* what folding is worth — the fifth-street threshold is
 *  a mean of -w/(w+1), which is a whole number of forty-eighths for several pot
 *  sizes. Those hands get raised, not folded: the player is indifferent, and it
 *  is what the published 3.59-antes average wager assumes. */
export function bestAction(spot: Spot): MStudAction {
  const w = spot.wagered
  let bestValue = -w
  let bestAct: MStudAction = 'fold'
  for (let r = 1; r <= 3; r++) {
    const value = afterRaise(spot, w + r)
    const beatsBest = value > bestValue + TIE
    const tiesFold = bestAct === 'fold' && value > bestValue - TIE
    if (beatsBest || tiesFold) {
      bestValue = value
      bestAct = RAISES[r - 1]
    }
  }
  return bestAct
}

/** Expected value in ante units of the whole hand played perfectly, from the two
 *  hole cards, including the option to fold the ante away. */
export function holeCardEv(hole: Card[]): number {
  let best = -1
  for (let r = 1; r <= 3; r++) best = Math.max(best, afterThirdRaise(hole, 1 + r))
  return best
}

/** For tests and tuning scripts. The tables are pure functions of the position,
 *  so dropping them changes nothing but memory. */
export function clearSolverTables(): void {
  meanMemo.clear()
  fourthMemo.clear()
  thirdMemo.clear()
}

// ------------------------------------------------------------------ exact books

export type Policy = (spot: Spot) => MStudAction

export interface PolicyEval {
  /** Expected result in ante units, ante included, over every possible deal. */
  ev: number
  /** Expected total amount wagered, in ante units. */
  wager: number
}

/** Exact expected result and expected total wager for one starting hand under an
 *  arbitrary policy — no sampling, every community card enumerated.
 *
 *  `memo` may be shared across calls to make a full 1,326-hand book cheap. It
 *  keys on the suit-canonicalised position, which assumes the policy is
 *  suit-blind: true of both policies here, and of any real strategy, since no
 *  suit pays more than another. */
export function evaluatePolicy(
  policy: Policy,
  hole: Card[],
  memo: Map<string, PolicyEval> = new Map(),
): PolicyEval {
  const act = policy({ street: 'third', hole, board: [], wagered: 1 })
  const r = raiseUnits(act)
  if (r === 0) return { ev: -1, wager: 1 }

  const w = 1 + r
  const rest = unseen(hole)
  let ev = 0
  let wager = 0
  for (const c of rest) {
    const next = fourthEval(policy, hole, [c], w, memo)
    ev += next.ev
    wager += next.wager
  }
  return { ev: ev / rest.length, wager: wager / rest.length }
}

function fourthEval(
  policy: Policy,
  hole: Card[],
  board: Card[],
  w: number,
  memo: Map<string, PolicyEval>,
): PolicyEval {
  const key = `4|${canonical([...hole, ...board])}|${w}`
  const hit = memo.get(key)
  if (hit) return hit

  const act = policy({ street: 'fourth', hole, board, wagered: w })
  const r = raiseUnits(act)
  let out: PolicyEval
  if (r === 0) {
    out = { ev: -w, wager: w }
  } else {
    const next = w + r
    const rest = unseen([...hole, ...board])
    let ev = 0
    let wager = 0
    for (const c of rest) {
      const leaf = fifthEval(policy, hole, [...board, c], next)
      ev += leaf.ev
      wager += leaf.wager
    }
    out = { ev: ev / rest.length, wager: wager / rest.length }
  }
  memo.set(key, out)
  return out
}

function fifthEval(policy: Policy, hole: Card[], board: Card[], w: number): PolicyEval {
  const act = policy({ street: 'fifth', hole, board, wagered: w })
  const r = raiseUnits(act)
  if (r === 0) return { ev: -w, wager: w }
  return { ev: expectedMultiplier([...hole, ...board]) * (w + r), wager: w + r }
}

/** The chart in words, for the screen. */
export const CHART_NOTES: Record<Street, string[]> = {
  third: [
    '3x — any pair, deuces included',
    '1x — any jack or better, both cards 6+, or suited 6-5',
    'Fold — a mid card with a low card, or two low cards',
  ],
  fourth: [
    '3x — pair of 6s or better, or three to a straight flush',
    '1x — low pair, three to a flush, or high cards covering the low ones',
    'Fold — everything else',
  ],
  fifth: [
    '3x — pair of 6s or better, four to a flush, four to an open straight',
    '1x — low pair, four to an inside straight, or high cards covering the lows',
    'Fold — everything else',
  ],
}
