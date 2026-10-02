// Bars & Sevens — a three-reel stepper with a top-box wheel.
//
// The oldest shape there is: one line through the middle, three reels, and a
// wild that doubles whatever it completes. Two wilds in a run therefore pay four
// times, and three of them pay eight times the sevens — which is the reel
// jackpot and the only reason anyone plays a machine this plain.
//
// Above the glass sits the wheel. Land the bonus symbol on all three reels and
// the stepper stops being a stepper: the wheel clicks round twenty-four wedges,
// and where it stops is the whole award. That is one of the very few features
// whose price needs no simulation at all — every wedge is equally likely, so the
// wheel is worth its own mean, and the trigger probability is a rational number
// off the strips. The two multiply, and the answer is exact:
//
//   trigger      3 bonus symbols  =  (6/32)³ = 27/4096 = 1 in 151.7 spins
//   wheel mean   492 / 24 wedges  =  20.5 × total stake
//   the wheel    27/4096 × 20.5   =  0.135132 of the return, exactly
//   the lines    enumerated       =  0.764862
//   ------------------------------------------------------------------------
//   the machine                      0.899994 against a target of 0.90
//
// The wheel is 15% of this cabinet, and it was paid for out of the line pays:
// the seven came down from 130 to 100, and everything below it in proportion.
//
// `npm run slots:rtp` plays it anyway, and gets 90.174% ± 0.599% over 12,000,000
// spins in eight streams (89.242%–92.045% per stream). That is a cross-check, not
// the price — one wedge in twenty-four pays 200× and takes the per-spin standard
// deviation to 10.4, so twelve million spins resolve this machine no better than
// half a percent, and the closed form above is the number to quote.

import type { Machine } from '../types'

/** 32 stops: 1 wild, 2 sevens, 3 triple bars, 4 double, 5 single, 2 cherries,
 *  2 bonus symbols, and 13 blanks.
 *
 *  The blanks are the machine. Without them every screen of three matching
 *  symbols would pay and the strips would return three and a half times the
 *  stake; it is the dead space between the symbols that sets the price. The
 *  bonus symbol is dead space too — it has no line pay at all — so trading two
 *  blanks for two of it left the line return untouched to the last digit and
 *  bought the top box for nothing. Everything the wheel costs was then taken
 *  out of the pay table instead, where it can be seen.
 *
 *  Two bonus symbols a reel rather than one, because one puts the wheel a mile
 *  away: (3/32)³ is once in 1214 spins, and a feature that rare has to average
 *  164× the stake to be worth 13% of the machine, which is not a wheel, it is a
 *  lottery. */
function strip(): string[] {
  const out: string[] = []
  const add = (id: string, n: number) => {
    for (let i = 0; i < n; i++) out.push(id)
  }
  add('W', 1)
  add('7', 2)
  add('BBB', 3)
  add('BB', 4)
  add('B', 5)
  add('C', 2)
  add('BON', 2)
  add('-', 13)
  // Interleaved rather than blocked, so the reel reads like a real one when it
  // spins past. The order changes nothing about the line return; only the counts
  // do. It does decide the wheel's trigger odds, though: the weave lands the two
  // bonus symbols at stops 7 and 30, twenty-three apart on a 32-stop reel, so no
  // three-row window can ever hold both. Each reel therefore shows one or none,
  // "three on screen" means "one on every reel", and the trigger is exactly
  // (6/32)³ rather than something that has to be convolved.
  const woven: string[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * 7) % out.length])
  return woven
}

export const BARS: Machine = {
  id: 'bars',
  label: 'Bars & Sevens',
  blurb: 'Three reels, one line, doubling wilds, and a wheel on the top box',
  note: 'The plainest machine on the floor. One line through the middle; each wild in a win doubles it, so three wilds pay eight hundred. Land the bonus symbol on all three reels and the wheel above the glass spins for anything from twice the bet to two hundred times it.',
  symbols: [
    { id: 'W', label: 'W', wild: true, multiplier: 2 },
    { id: '7', label: '7' },
    { id: 'BBB', label: '≡' },
    { id: 'BB', label: '=' },
    { id: 'B', label: '—' },
    { id: 'C', label: 'C' },
    // No line pay and not a scatter: it buys the wheel and nothing else, which
    // means the evaluator reads it as a blocker exactly like the blank.
    { id: 'BON', label: 'BON' },
    { id: '-', label: '' },
  ],
  strips: [strip(), strip(), strip()],
  rows: 3,
  // The centre row only. The rows above and below are there to be looked at.
  lines: [[1, 1, 1]],
  // Because a wild doubles what it completes, each reel weighs a symbol at
  // (count + 2)/32 rather than (count + 1)/32 — the multiplier counts twice over.
  // That one factor is most of the price of this machine, and getting it wrong
  // is how a strip that looks tight returns 160%.
  //
  // Cut to make room for the wheel. The lone cherry is the one entry that could
  // not be scaled: at 1 coin it is already at the floor, and it alone is 0.1091
  // of the return — 14% of the line pays sit in a symbol that pays for showing
  // up on one reel. So the 15% the wheel needed came out of the other five
  // entries, which is why the seven fell further than proportionally.
  linePays: {
    '7': [0, 0, 0, 100],
    BBB: [0, 0, 0, 45],
    BB: [0, 0, 0, 22],
    B: [0, 0, 0, 10],
    // One cherry on the first reel pays, two pay more. Nothing else pays short.
    C: [0, 1, 3, 12],
  },
  feature: { kind: 'none' },
  // Twenty-four wedges, the traditional count on a stepper's top box, and every
  // one equally likely — so the wheel is worth 492/24 = 20.5 × the total stake,
  // full stop. Weighted wedges would price the same way, but an unweighted wheel
  // is one a player can audit by counting it, which is the point of a top box.
  //
  // The shape is deliberately top-heavy in the wrong direction: twenty-one of
  // the twenty-four wedges pay between 2× and 15× and together are worth 7.6 of
  // the 20.5, while the three big ones carry the other 12.9. A wheel a player
  // can watch is a wheel that has to mostly miss.
  bonus: {
    kind: 'wheel',
    trigger: 'BON',
    triggerCount: 3,
    wedges: [
      2, 2, 2, 2, 2,
      3, 3, 3, 3,
      5, 5, 5, 5,
      10, 10, 10, 10,
      15, 15, 15, 15,
      50,
      100,
      200,
    ],
  },
  targetRtp: 0.9,
}
