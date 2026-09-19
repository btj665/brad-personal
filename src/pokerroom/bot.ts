// The bots at the table.
//
// The house rule is simple: a bot never makes a play that makes a human at the
// table wince. That means solid, tight-aggressive, pot-odds-aware poker — it
// folds its trash, raises its big hands, calls when the price is right, and
// bluffs just often enough that it isn't a pure calling station. It gives up a
// little to a theoretical solver and doesn't try to be one; it just refuses to
// look silly.
//
// Two things drive every decision: how strong the hand is, and what continuing
// costs relative to the pot. Strength preflop is a Chen-style heuristic in
// Hold'em (fast, no dealing needed) and a small equity sample in the other
// families; postflop it's a Monte Carlo equity read against the live opponents.
// Price is the classic pot-odds ratio, call / (pot + call). Aggression, looseness
// and bluff frequency come off the seat's `BotProfile`.
//
// A bot's randomness (its occasional bluff) runs on its OWN seeded stream, mixed
// from the hand number and seat rather than the engine's rng, so decisions replay
// from a seed but never line up with the shuffle that dealt the cards.

import { makeRng } from '../engine/rng'
import { rankValue } from '../poker/eval'
import type { Card } from '../engine/types'
import type { BotBrain, BotDraw, PokerGame } from './engine'
import { estimateEquity } from './equity'
import type { Action, BotProfile, Options, Seat } from './types'

/** Sample budgets, exposed so tests can turn them down for speed. Higher is
 *  steadier; the defaults keep a full autonomous table brisk. */
export const botTuning = {
  /** Postflop equity trials per decision. */
  samples: 240,
  /** Preflop equity trials in the non-Hold'em families. */
  preflopSamples: 160,
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Live opponents still contesting the pot with the hero (at least one — the
 *  engine wouldn't be asking for a decision otherwise). */
function liveOpponents(game: PokerGame, seat: Seat): number {
  let n = 0
  for (const s of game.seats) {
    if (s.index === seat.index) continue
    if (s.folded || s.sittingOut) continue
    if (s.cards.length === 0 && s.committed === 0) continue
    n++
  }
  return Math.max(1, n)
}

/** A per-decision seed: deterministic in the game's seed but decorrelated from
 *  the shuffle, and varying by street so a bot doesn't repeat one coin-flip all
 *  hand. Mixed with a salt to give the bluff stream and the equity read
 *  independent draws. */
function decisionSeed(game: PokerGame, seat: Seat, salt: number): number {
  const base = Math.imul(game.hand * 131 + seat.index * 7919 + 1, 2654435761)
  const street = Math.imul(game.board.length + 1, 40503)
  const bet = Math.imul(Math.round(game.currentBet) + 1, 27644437)
  return (base ^ street ^ bet ^ (game.seed >>> 0) ^ Math.imul(salt + 1, 2246822519)) >>> 0
}

// ---------------------------------------------------------------- strength

/** Bill Chen's starting-hand score for two Hold'em hole cards. Roughly -1 (72o)
 *  to 20 (AA); the standard cutoff for "playable" is around 8. */
function chenScore(cards: Card[]): number {
  const a = rankValue(cards[0].rank)
  const b = rankValue(cards[1].rank)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const highBase = (v: number): number =>
    v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2

  if (a === b) {
    // A pair scores twice its high-card value, floored at a pair of deuces = 5.
    return Math.round(Math.max(highBase(hi) * 2, 5))
  }

  let score = highBase(hi)
  if (cards[0].suit === cards[1].suit) score += 2
  const gaps = hi - lo - 1
  if (gaps === 1) score -= 1
  else if (gaps === 2) score -= 2
  else if (gaps === 3) score -= 4
  else if (gaps >= 4) score -= 5
  // A little something for connectedness that can make a straight.
  if (gaps <= 1 && hi < 12) score += 1
  return Math.round(score)
}

/** Map a Chen score to a rough win-probability estimate, so preflop strength
 *  compares against pot odds on the same [0, 1] scale as postflop equity. */
function chenStrength(chen: number): number {
  return clamp(0.3 + chen * 0.028, 0.02, 0.92)
}

// ---------------------------------------------------------------- sizing

interface SizingCtx {
  pot: number
  currentBet: number
  callAmount: number
  aggression: number
}

/** A pot-proportional bet or raise, clamped into the legal window (which also
 *  makes it exactly the fixed increment in a limit game and caps it at the pot in
 *  pot-limit). `to` is the total street commitment, as the engine expects. */
function sized(opt: Options, ctx: SizingCtx, mode: 'value' | 'bluff'): Action {
  const potAfterCall = ctx.pot + ctx.callAmount
  const frac = mode === 'value' ? 0.5 + 0.25 * ctx.aggression : 0.45 + 0.1 * ctx.aggression
  const raiseBy = Math.max(1, Math.round(frac * potAfterCall))
  const to = clamp(ctx.currentBet + raiseBy, opt.minTo, opt.maxTo)
  return { kind: opt.canBet ? 'bet' : 'raise', to }
}

/** When nothing else is right, check if it's free, otherwise fold — the play
 *  that can never be illegal or embarrassing. */
function fallback(opt: Options): { kind: 'check' | 'fold' } {
  return opt.canCheck ? { kind: 'check' } : { kind: 'fold' }
}

// ---------------------------------------------------------------- decision

interface Decision {
  /** Estimated win probability, [0, 1]. */
  strength: number
  /** Hands too weak to continue with for value (preflop trash, or near-dead
   *  postflop): they only ever fold or make a rare, disciplined bluff. */
  junk: boolean
}

export const pokerBrain: BotBrain = (game, seat, opt) => {
  const profile: BotProfile = seat.bot ?? { looseness: 0.4, aggression: 0.3, bluff: 0.05, quips: [] }
  const rng = makeRng(decisionSeed(game, seat, 1))
  const nOpp = liveOpponents(game, seat)
  const { strength, junk } = assess(game, seat, nOpp, profile)

  const price = opt.callAmount > 0 ? opt.callAmount / (game.pot + opt.callAmount) : 0
  const ctx: SizingCtx = {
    pot: game.pot,
    currentBet: game.currentBet,
    callAmount: opt.callAmount,
    aggression: profile.aggression,
  }

  // More opponents means a hand needs to be stronger to raise for value; more
  // aggression means it needs to be a touch less strong.
  const valueThresh = clamp(0.6 + 0.05 * (nOpp - 1) - profile.aggression * 0.12, 0.5, 0.9)
  const callSlack = 0.02 + profile.looseness * 0.07

  if (opt.canCheck) {
    if (!junk && strength >= valueThresh && (opt.canBet || opt.canRaise)) return sized(opt, ctx, 'value')
    if (!junk && (opt.canBet || opt.canRaise) && strength >= 0.35 && rng.next() < profile.bluff) {
      return sized(opt, ctx, 'bluff')
    }
    return { kind: 'check' }
  }

  // Facing a bet: raise the strong, call when the price is right, and fold the
  // rest — with the occasional bluff-raise so we're not transparent.
  if (!junk && strength >= valueThresh && opt.canRaise) return sized(opt, ctx, 'value')
  if (!junk && strength >= price - callSlack) return { kind: 'call' }
  if (!junk && opt.canRaise && strength >= 0.3 && rng.next() < profile.bluff * 0.7) {
    return sized(opt, ctx, 'bluff')
  }
  return opt.canFold ? { kind: 'fold' } : fallback(opt)
}

/** Estimate the hero's strength for the spot: a Chen read preflop in Hold'em, a
 *  small equity sample preflop elsewhere, and a full equity read postflop. */
function assess(game: PokerGame, seat: Seat, nOpp: number, profile: BotProfile): Decision {
  const hole = seat.cards.map((c) => c.card)
  const preflop = game.street === 'preflop' && game.board.length === 0

  if (preflop && game.variant.family === 'holdem' && hole.length >= 2) {
    const chen = chenScore(hole)
    const n = game.seats.length
    // Late position (near the button, which acts last) can afford looser hands.
    const lateness = ((seat.index - game.button - 1 + n) % n) / Math.max(1, n - 1)
    const playMin = 8 - profile.looseness * 8 - lateness * 1.5
    return { strength: chenStrength(chen), junk: chen < playMin }
  }

  const seed = decisionSeed(game, seat, 2)
  const samples = preflop ? botTuning.preflopSamples : botTuning.samples
  const strength = estimateEquity({
    hero: hole,
    board: game.board,
    variant: game.variant,
    numOpponents: nOpp,
    samples,
    seed,
  })
  // Near-dead postflop hands only ever fold or bluff, never call off.
  return { strength, junk: !preflop && strength < 0.08 }
}

// ---------------------------------------------------------------- the draw

/** Five-card draw: keep what's already working — any made hand, a pair or
 *  better, or four to a flush — and draw to the rest. A sound heuristic, not an
 *  optimal one. Returns the indices to discard. */
export const pokerDraw: BotDraw = (_game, seat) => {
  const cards = seat.cards.map((c) => c.card)
  if (cards.length !== 5) return []

  // A made straight or flush is complete; stand pat.
  const straightOrFlush = isFlush(cards) || isStraight(cards)
  if (straightOrFlush) return []

  const byRank = new Map<number, number[]>()
  cards.forEach((c, i) => {
    const v = rankValue(c.rank)
    const list = byRank.get(v) ?? []
    list.push(i)
    byRank.set(v, list)
  })

  // Keep every card that's part of a pair, trips or quads.
  const keep = new Set<number>()
  for (const list of byRank.values()) if (list.length >= 2) for (const i of list) keep.add(i)

  if (keep.size > 0) {
    return cards.map((_, i) => i).filter((i) => !keep.has(i))
  }

  // No pair: chase four to a flush if we hold it, else keep only the top card.
  const bySuit = new Map<string, number[]>()
  cards.forEach((c, i) => {
    const list = bySuit.get(c.suit) ?? []
    list.push(i)
    bySuit.set(c.suit, list)
  })
  for (const list of bySuit.values()) {
    if (list.length === 4) return cards.map((_, i) => i).filter((i) => !list.includes(i))
  }

  let hiIdx = 0
  for (let i = 1; i < cards.length; i++) if (rankValue(cards[i].rank) > rankValue(cards[hiIdx].rank)) hiIdx = i
  return cards.map((_, i) => i).filter((i) => i !== hiIdx)
}

function isFlush(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit)
}

function isStraight(cards: Card[]): boolean {
  const v = [...new Set(cards.map((c) => rankValue(c.rank)))].sort((a, b) => a - b)
  if (v.length !== 5) return false
  if (v[4] - v[0] === 4) return true
  // The wheel: A-2-3-4-5, where the ace reads as 14.
  return v[0] === 2 && v[1] === 3 && v[2] === 4 && v[3] === 5 && v[4] === 14
}
