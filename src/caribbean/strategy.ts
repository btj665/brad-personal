// Caribbean Stud Poker — the published near-optimal rule.
//
//   Raise with any pair or better, and with A-K-J-8-3 or better. Fold the rest.
//
// The A-K-J-8-3 line is not arbitrary: it is the weakest ace-king hand that is
// still worth two units against a dealer who opens on ace-king. Read the hand
// high card first and compare it position by position — A-K-J-9-2 clears the
// line at the fourth card, A-K-J-7-6 fails there.
//
// True optimal play also looks at the dealer's upcard: it folds a few ace-king
// hands when the dealer shows an ace or a king, and raises a few when the
// upcard matches one of the player's own low cards. Doing that perfectly is
// worth about 0.01–0.02% of the ante — a few hundredths of a percent — which is
// why nobody bothers and why this function never asks for the upcard.

import type { Card } from '../engine/types'
import { Category, rankValue, score5, type Score } from '../poker/eval'

/** The threshold hand, high card first. */
const AKJ83 = [14, 13, 11, 8, 3]

/** Raise (two units), or fold. Pass `score` when the caller already has it —
 *  the engine and the edge simulator both do, and score5 is the expensive part. */
export function shouldRaise(cards: Card[], score?: Score): boolean {
  const s = score ?? score5(cards, {})
  if (s.category >= Category.Pair) return true

  // A no-pair hand: its tiebreak is already the five rank values, high first.
  const values =
    s.tiebreak.length === 5 ? s.tiebreak : cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)

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
