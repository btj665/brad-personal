// High Roller — a three-reel stepper whose top box is the banker on the phone.
//
// The base game is the plainest thing on the floor: three reels, five lines, a
// wild that stands in for anything, no cascade and no free games. All the drama
// is in the feature. Land the golden phone on all three reels and the banker
// starts calling with offers — one at a time, each a multiple of the bet. Take
// the one in front of you or pass it for the next, and the last call is forced.
//
// Passing is a real decision, and there is a right answer to it: take an offer
// when it beats what one more call is worth on average, and pass when it doesn't.
// So this cabinet quotes its return the way video poker does — under optimal play
// — and the exact price is a backward induction over the offer pool, not a
// simulation:
//
//   the pool     mean 8.30 × the total stake, five independent calls
//   optimal line take an offer ≥ the value of continuing; last is forced
//   the offer    backward induction, EV 21.504541 × the total stake
//   the trigger  three phones anywhere = (6/32)³ = 27/4096 = 1 in 151.7 spins
//   the feature  27/4096 × 21.504541  =  0.141773 of the return, exactly
//   the lines    enumerated            =  0.778227
//   ------------------------------------------------------------------------
//   the machine                          0.920000 against a target of 0.92
//
// The offer is 15% of this cabinet, paid for out of the pay table. Every figure
// above is closed form; `slots:rtp` plays it as a cross-check, never a
// measurement — the offer's 100× call and the take/pass swings make the per-spin
// standard deviation large, so the exact figures are the ones to quote.

import type { Machine } from '../types'

/** 32 stops: 2 wild, 2 sevens, 3 diamonds, 4 crowns, 5 chips, 2 phones, 14 blank.
 *
 *  Woven rather than blocked so the reel reads like a real one and, more to the
 *  point, so the two phones land far apart — at stops 7 and 30 of 32, twenty-three
 *  apart one way and nine the other, both wider than the three rows on the glass.
 *  So every reel shows one phone or none, "three on screen" is exactly "one on
 *  every reel", and the trigger is the clean rational (6/32)³ rather than
 *  something that has to be convolved. The phone has no line pay — it buys the
 *  banker and nothing else — so it reads as a blocker exactly like a blank, and
 *  trading two blanks for two phones left the line return untouched. */
function strip(): string[] {
  const out: string[] = []
  const add = (id: string, n: number) => {
    for (let i = 0; i < n; i++) out.push(id)
  }
  add('W', 2)
  add('7', 2)
  add('DIA', 3)
  add('CRN', 4)
  add('CHP', 5)
  add('PH', 2)
  add('-', 14)
  const woven: string[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * 7) % out.length])
  return woven
}

export const TOPDOLLAR: Machine = {
  id: 'highroller',
  label: 'High Roller',
  blurb: 'Three reels, five lines, and a banker on the top box who keeps calling',
  note: 'A plain three-reel stepper with five lines and a wild that fills in for anything. Land the golden phone on all three reels and the banker starts calling with offers — take the one in front of you or hold out for the next, but the last call you have to take. Hold out for the big one and you might walk away with nothing extra; the machine plays the odds for you.',
  symbols: [
    { id: 'W', label: '★', wild: true },
    { id: '7', label: '7' },
    { id: 'DIA', label: '◆' },
    { id: 'CRN', label: '♛' },
    { id: 'CHP', label: '⬤' },
    // No line pay and not a scatter: it buys the banker and nothing else, so the
    // evaluator reads it as a blocker exactly like the blank.
    { id: 'PH', label: '☎' },
    { id: '-', label: '' },
  ],
  strips: [strip(), strip(), strip()],
  rows: 3,
  // Five lines: the three straight rows and the two diagonals. Every line sees
  // the same marginal, so the per-line return `exactLineReturn` computes is the
  // whole line return per coin staked, whatever the line count.
  lines: [
    [1, 1, 1],
    [0, 0, 0],
    [2, 2, 2],
    [0, 1, 2],
    [2, 1, 0],
  ],
  // Cut to leave room for the banker. The wild carries its own top award rather
  // than a multiplier, so a run's price is the plain (count)/32 per reel and the
  // arithmetic stays legible — no doubling to weigh twice over.
  linePays: {
    W: [0, 0, 0, 155],
    '7': [0, 0, 0, 60],
    DIA: [0, 0, 0, 35],
    CRN: [0, 0, 0, 20],
    // One chip on the first reel pays, two pay more — the oldest rule on a
    // stepper and most of what keeps it feeling alive.
    CHP: [0, 1, 3, 12],
  },
  feature: { kind: 'none' },
  // The banker's offer. Five independent calls drawn from one pool, shown one at
  // a time; take one or pass to the next, and the last is forced. The pool's mean
  // is 8.30× the bet, but optimal stopping — pass the small calls, take a big one
  // — lifts the round to 21.504541× under best play, and that is the figure the
  // cabinet is priced on.
  //
  // The pool is deliberately bottom-heavy: the two small calls carry 70% of the
  // weight, so most calls are ones a player should pass, and the 100× call at 2%
  // is the one worth holding out for. That spread is what makes passing a real
  // decision instead of a formality.
  bonus: {
    kind: 'offer',
    trigger: 'PH',
    triggerCount: 3,
    offers: 5,
    pool: [
      { value: 2, weight: 40 },
      { value: 5, weight: 30 },
      { value: 10, weight: 20 },
      { value: 25, weight: 8 },
      { value: 100, weight: 2 },
    ],
  },
  targetRtp: 0.92,
}
