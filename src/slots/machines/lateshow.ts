// The Late Show — five reels, twenty-five lines, expanding wilds in the free
// games.
//
// The shape behind every licensed party cabinet on the floor, minus the licence:
// three marquees anywhere buy ten free games, and for the length of that round
// the spotlight stops being an ordinary wild and takes over whatever reel it
// lands on, whole. Ten spins of that, doubled, is a violent amount of money —
// which is why the base game below is cut to 0.7090 and the round is left to
// carry the remaining quarter of the return.
//
// The strips and the pay table are the entire specification, but only half of it
// can be enumerated. `exactBaseReturn` gives the base game to the last decimal;
// the round cannot be reached that way, because an expanded reel is no longer
// distributed like a spun one and the whole screen pays at 2×. That half has to
// be measured, and measured with more care than a slot invites: per-spin return
// here has a standard deviation of 7.3, so a single stream of four million spins
// pins the figure only to ±0.4% and two such streams landing two standard errors
// high look, on their own, like a machine that returns 96%. The figure below is
// pooled over sixteen independent streams:
//
//   base game (enumerated)   0.708971
//   full return (measured)   96.18% ± 0.30% (2 s.e.) over 24,000,000 spins
//   of which the free games  26.2%, bought once in every 266 spins
//
// Over that run the non-free part of the measurement came out at 0.7094 against
// the enumerated 0.708971, which is the cross-check that the two halves are
// describing the same machine. The test asserts both, because either one alone
// would let the other drift.

import type { Machine, SymbolId } from '../types'

/** Counts per reel, in the order the symbols are declared below. Reel one is
 *  cut thinnest in premiums and carries no spotlight at all: leftmost alignment
 *  means reel one decides how often anything pays, and a wild that cannot land
 *  there cannot expand there either. That single restriction is most of what
 *  keeps the free games affordable. */
const COUNTS: Record<SymbolId, [number, number, number, number, number]> = {
  spot: [0, 3, 3, 3, 0],
  mrq: [1, 1, 1, 1, 1],
  mic: [2, 2, 2, 2, 2],
  mar: [2, 3, 3, 3, 3],
  sax: [3, 3, 3, 3, 3],
  crt: [3, 3, 3, 3, 3],
  A: [4, 4, 4, 4, 4],
  K: [4, 4, 4, 4, 4],
  Q: [4, 4, 4, 4, 4],
  J: [5, 4, 4, 4, 4],
  T: [5, 4, 4, 4, 4],
  '-': [7, 5, 5, 5, 8],
}

/** One reel, woven rather than blocked.
 *
 *  The weave is cosmetic for the line maths — expectation only sees the counts —
 *  but it is not cosmetic for the marquees, whose pay depends on how many land
 *  on the whole screen. Two marquees sitting next to each other on the strip can
 *  show up together in one three-row window; spread out, they cannot. The step
 *  below is coprime with the length, so it visits every stop once. */
function strip(reel: number): SymbolId[] {
  const out: SymbolId[] = []
  for (const [id, counts] of Object.entries(COUNTS)) {
    for (let i = 0; i < counts[reel]; i++) out.push(id)
  }
  const woven: SymbolId[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * 23) % out.length])
  return woven
}

export const LATESHOW: Machine = {
  id: 'lateshow',
  label: 'The Late Show',
  blurb: 'Twenty-five lines, and a spotlight that swallows a whole reel',
  note: 'Land three marquees anywhere and the house buys you ten free games. For all ten of them every win pays double, and any spotlight that turns up floods its whole reel from top to bottom — so one spotlight on the middle reel is three of them, on every line that runs through it.',
  symbols: [
    // Marked `expanding` for the cabinet glass; the round itself is driven by
    // `feature.expandingWild`, which is what `resolveSpin` reads.
    { id: 'spot', label: '☀', wild: true, expanding: true },
    { id: 'mrq', label: '★', scatter: true },
    { id: 'mic', label: 'MIC' },
    { id: 'mar', label: 'MAR' },
    { id: 'sax', label: 'SAX' },
    { id: 'crt', label: 'CRT' },
    { id: 'A', label: 'A' },
    { id: 'K', label: 'K' },
    { id: 'Q', label: 'Q' },
    { id: 'J', label: 'J' },
    { id: 'T', label: '10' },
    { id: '-', label: '' },
  ],
  strips: [strip(0), strip(1), strip(2), strip(3), strip(4)],
  rows: 3,
  // Twenty-five paths, every one of them walkable: no line steps more than one
  // row between neighbouring reels, because a payline a player cannot trace with
  // a finger is a payline they will not believe.
  lines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [1, 0, 1, 0, 1],
    [1, 2, 1, 2, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [0, 1, 2, 2, 2],
    [2, 1, 0, 0, 0],
    [0, 0, 0, 1, 2],
    [2, 2, 2, 1, 0],
  ],
  // Per coin staked on the line. The spotlight has no schedule of its own: it
  // only lives on reels two to four, so a run of spotlights could never start on
  // reel one and any pay written here would be unreachable.
  //
  // No multiplier on the wild either. A wild that doubled what it completed
  // would make every reel weigh a symbol at (count + 2·wilds)/len rather than
  // (count + wilds)/len — the doubling lands once in the odds and once in the
  // pay — and stacking that on top of the round's own 2× leaves nothing left to
  // pay the base game with.
  //
  // Scaling this table scales the line return exactly, and scales the free games
  // by the same factor, so the free-to-base split is a property of the strips
  // alone and the whole card is one scalar with the strips fixed. The last 1% of
  // that scalar is carried by the ace column rather than spread thin, because
  // pays are integers and a 1% rise spread over nine symbols rounds to nothing.
  linePays: {
    mic: [0, 0, 0, 75, 325, 1500],
    mar: [0, 0, 0, 50, 250, 1000],
    sax: [0, 0, 0, 35, 160, 600],
    crt: [0, 0, 0, 30, 125, 500],
    A: [0, 0, 0, 20, 70, 260],
    K: [0, 0, 0, 15, 55, 200],
    Q: [0, 0, 0, 10, 40, 150],
    J: [0, 0, 0, 9, 35, 125],
    T: [0, 0, 0, 7, 30, 100],
  },
  // Multiples of the total stake. The marquees pay a little in their own right
  // so the screen that buys the round is itself a win rather than a promise —
  // and because scatter pay is exactly enumerable, every coin spent here stays
  // in the part of the budget that `exactBaseReturn` can vouch for.
  scatterPays: { mrq: { 3: 2, 4: 12, 5: 60 } },
  feature: {
    kind: 'freeSpins',
    trigger: 'mrq',
    triggerCount: 3,
    spins: 10,
    multiplier: 2,
    expandingWild: 'spot',
  },
  targetRtp: 0.96,
}
