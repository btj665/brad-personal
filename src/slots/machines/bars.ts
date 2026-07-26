// Bars & Sevens — a three-reel stepper.
//
// The oldest shape there is: one line through the middle, three reels, and a
// wild that doubles whatever it completes. Two wilds in a run therefore pay four
// times, and three of them pay eight times the sevens — which is the jackpot and
// the only reason anyone plays a machine this plain.
//
// Strips are 32 stops, the traditional length for a mechanical stepper, and the
// composition below is what cuts the return to its target. Move one symbol and
// `npm run slots:rtp` will tell you what it cost.

import type { Machine } from '../types'

/** 32 stops: 1 wild, 2 sevens, 3 triple bars, 4 double, 5 single, 6 cherries,
 *  and 11 blanks.
 *
 *  The blanks are the machine. Without them every screen of three matching
 *  symbols would pay and the strips would return three and a half times the
 *  stake; it is the dead space between the symbols that sets the price. */
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
  add('-', 15)
  // Interleaved rather than blocked, so the reel reads like a real one when it
  // spins past. The order changes nothing about the return; only the counts do.
  const woven: string[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * 7) % out.length])
  return woven
}

export const BARS: Machine = {
  id: 'bars',
  label: 'Bars & Sevens',
  blurb: 'Three reels, one line, doubling wilds',
  note: 'The plainest machine on the floor. One line through the middle; each wild in a win doubles it, so three wilds pay eight times the sevens.',
  symbols: [
    { id: 'W', label: 'W', wild: true, multiplier: 2 },
    { id: '7', label: '7' },
    { id: 'BBB', label: '≡' },
    { id: 'BB', label: '=' },
    { id: 'B', label: '—' },
    { id: 'C', label: 'C' },
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
  linePays: {
    '7': [0, 0, 0, 130],
    BBB: [0, 0, 0, 50],
    BB: [0, 0, 0, 25],
    B: [0, 0, 0, 12],
    // One cherry on the first reel pays, two pay more. Nothing else pays short.
    C: [0, 1, 4, 15],
  },
  feature: { kind: 'none' },
  targetRtp: 0.9,
}
