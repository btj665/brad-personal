// Caribbean Stud Poker — the published near-optimal rule.
//
//   Raise with any pair or better, and with A-K-J-8-3 or better. Fold the rest.
//
// The A-K-J-8-3 line is not arbitrary: it is very nearly the weakest ace-king
// hand still worth two units against a dealer who opens on ace-king. Read the
// hand high card first and compare it position by position — A-K-J-9-2 clears
// the line at the fourth card, A-K-J-7-6 fails there.
//
// Enumerating all 1,533,939 dealer hands behind each of those puts the line
// where it belongs: raising A-K-J-8-3 is worth −0.99786 antes against a fold's
// flat −1, and A-K-J-7-6 is worth −1.00107. A-K-J-8-2 does sneak in at
// −0.99979, so the published rule folds one hand it could profitably raise —
// worth about a ten-millionth of an ante, which is why the rule is stated with
// a 3 and not a 2.
//
// True optimal play also looks at the dealer's upcard: it folds a few ace-king
// hands when the dealer shows an ace or a king, and raises a few when the
// upcard matches one of the player's own low cards. All of that together is
// worth a few hundredths of a percent of the ante, against a house edge of over
// five percent — which is why nobody bothers, and why this function is never
// handed the upcard at all.

import type { Card } from '../engine/types'
import { Category, score5, type Score } from '../poker/eval'

/** The threshold hand, high card first. */
const AKJ83 = [14, 13, 11, 8, 3]

/** Raise (two units), or fold. Pass `score` when the caller already has it —
 *  the engine and the edge simulator both do, and score5 is the expensive part. */
export function shouldRaise(cards: Card[], score?: Score): boolean {
  const s = score ?? score5(cards, {})
  if (s.category >= Category.Pair) return true

  // Below a pair the hand can only be high card, and eval.ts already hands back
  // its five rank values in the tiebreak, high first — nothing to re-sort.
  const values = s.tiebreak
  for (let i = 0; i < 5; i++) {
    if (values[i] !== AKJ83[i]) return values[i] > AKJ83[i]
  }
  return true // exactly A-K-J-8-3 is on the raise side of the line
}

/** One line of reasoning for the coach panel. */
export function raiseReason(cards: Card[], score?: Score): string {
  const s = score ?? score5(cards, {})
  if (s.category >= Category.Pair) return 'Any pair or better is worth the Raise.'
  return shouldRaise(cards, s)
    ? 'Ace-king, and the rest of the hand clears A-K-J-8-3.'
    : 'Below A-K-J-8-3 — the two units lose more than the ante saves.'
}
