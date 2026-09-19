// Nova Ways — five reels, three rows, two hundred and forty-three ways, and a
// feature that is still exact.
//
// The all-ways mechanic. There are no paylines: a symbol pays when it lands on
// consecutive reels from reel one, wherever in the three rows it sits, and the
// win is multiplied by the "ways" — how many of that symbol stand on each matched
// reel. Three rows on five reels is 3⁵ = 243 ways, and one spin buys all of them
// at once, which is why the stake is `waysCost` coins per coin-per-line rather
// than one-per-line: 25 coins here.
//
// ---------------------------------------------------------------- why it is exact
//
// A ways return looks harder to enumerate than a payline one and is in fact
// easier. `wayWins` scores every symbol on its own and *sums* the wins rather
// than taking a max (a reel of pure wilds matches every symbol at once, and
// summing is the standard rule), so each symbol's expected pay is independent of
// the others. And within one symbol the reels are independent, so the whole thing
// factorizes. For a run of exactly length k the pay is `linePays[s][k] · ways`,
// where the ways are the product of the matched-counts on reels 0..k-1; take the
// expectation and it is `∏_{i<k} E[match_i]` times the chance reel k breaks the
// run — with `E[match_i]` the expected number of that symbol (or a wild) in reel
// i's window. `exactWaysReturn` in rtp.ts is exactly that sum, walking every stop
// of every strip for the two per-reel numbers it needs. No sampling, no error bar
// on the base game.
//
// The rarer trick is that the feature is exact too, which the two licensed-shape
// cabinets in this directory cannot say. The Late Show's free games expand a wild
// over a whole reel, so an expanded reel is no longer distributed like a spun one
// and the round has to be measured; Rockslide's tumble feeds a screen back into
// itself and never terminates as a closed form. Nova's free games do neither:
// they are ten more spins of the very same strips, every win paid at a flat 3×,
// with no expanding wild and no cascade. A free spin is therefore worth exactly
// 3 × the base game, and the round is worth
//
//   P(3+ scatters) · spins · multiplier · base
//
// with `P(3+ scatters)` given exactly by `screenCountDistribution`. So the whole
// machine has a closed form:
//
//   ways pays (enumerated)        0.829461
//   scatter pays (enumerated)     0.009424
//   ------------------------------ base    0.838884
//   × free games  (1 + 0.120303)          →  0.939804   featureFactor = p·10·3
//   -----------------------------------------------------------------------------
//   the machine                              0.939804   against a target of 0.94
//
// where the scatter turns up 3-or-more once in 249 spins (0.00401008, exact), and
// buys ten free games at triple pay — 0.120303 of extra return laid on top of the
// base, so the round is 10.7% of everything the cabinet pays. The simulation in
// the test is a cross-check against 0.939804, not the measurement: both halves are
// enumerated and the played game has to land on them.
//
// One number worth calling out: a five-reel run pays with no reel left to break
// it, so its breakFactor is 1 and the five-of-a-kind carries about a third of the
// ways return on its own — the run-length split is a real design lever here, and
// the pay ladder is cut wide (two-of-a-kind pays too) rather than piled onto the
// top rung, which keeps the per-spin standard deviation near 2.7 instead of the 4+
// a top-heavy ladder would bring.
//
// ---------------------------------------------------------------- the strips
//
// Reel one is cut thinnest in the premiums and carries only two wilds, because on
// a ways game reel one is the gate twice over: a run has to start there, and
// `E[match_0]` multiplies every term for every symbol. A premium added to reel one
// costs far more return than the same premium added to reel five, so the counts
// rise left to right. The scatter sits one to a reel, spread across the strip so a
// reel shows it at most once and the screen tops out at five.

import type { Machine, SymbolId } from '../types'

/** Per-reel counts, one column per reel, in the order the symbols are declared
 *  below. There are no blanks: the run-breaks come from the sheer variety of
 *  symbols — for any one symbol, most reels are "not it" — which is what a ways
 *  reel does instead of the dead space a stepper leans on. The strip lengths fall
 *  out of the column sums: 36, 38, 39, 41, 42. */
const COUNTS: Record<SymbolId, readonly [number, number, number, number, number]> = {
  W: [2, 2, 2, 3, 3],
  SC: [1, 1, 1, 1, 1],
  NV: [2, 2, 3, 3, 3],
  CM: [3, 3, 3, 4, 4],
  ST: [3, 4, 4, 4, 4],
  MN: [4, 4, 4, 4, 5],
  A: [4, 4, 4, 4, 4],
  K: [4, 4, 4, 4, 4],
  Q: [4, 4, 4, 4, 4],
  J: [4, 5, 5, 5, 5],
  T: [5, 5, 5, 5, 5],
}

/** One reel, woven with a stride coprime to its length so it reads like a reel
 *  going past rather than a sorted list. The weave is a permutation, so it moves
 *  neither the ways return (which sees only each reel's counts) nor the scatter
 *  count distribution's marginals; it only decides which symbols share a window,
 *  and the scatter is one-a-reel so it never shares a window with itself. */
function strip(reel: number): SymbolId[] {
  const out: SymbolId[] = []
  for (const [id, counts] of Object.entries(COUNTS)) {
    for (let i = 0; i < counts[reel]; i++) out.push(id)
  }
  const stride = [7, 13, 19, 23, 29][reel]
  const woven: SymbolId[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * stride) % out.length])
  return woven
}

export const WAYS: Machine = {
  id: 'nova',
  label: 'Nova Ways',
  blurb: 'Two hundred and forty-three ways, stacking wilds, and ten free games at triple pay',
  note: 'No paylines. A symbol pays whenever it lands on reels next to each other starting from the left, wherever it sits in the three rows, and the more of it on each reel the more ways it pays — up to two hundred and forty-three of them at once. Wilds stand in for anything and multiply the ways they land in. Three galaxies anywhere buy ten free games, and for all ten of them every win pays three times over.',
  symbols: [
    { id: 'W', label: '✦', wild: true },
    { id: 'SC', label: '◈', scatter: true },
    { id: 'NV', label: 'NV' },
    { id: 'CM', label: 'CM' },
    { id: 'ST', label: 'ST' },
    { id: 'MN', label: 'MN' },
    { id: 'A', label: 'A' },
    { id: 'K', label: 'K' },
    { id: 'Q', label: 'Q' },
    { id: 'J', label: 'J' },
    { id: 'T', label: '10' },
  ],
  strips: [strip(0), strip(1), strip(2), strip(3), strip(4)],
  rows: 3,
  ways: true,
  // No paylines on a ways cabinet: it pays by adjacency instead. `stakeUnits`
  // prices the spin as coinsPerLine × waysCost, so one bet buys every way.
  lines: [],
  waysCost: 25,
  // Per-way pay by run length: `linePays[s][k]` is what one way of a k-long run of
  // s pays per coin-per-line, and the win is that times the number of ways. Entries
  // 0–1 are zero because a run has to reach two reels to pay, and the low symbols
  // carry fractional per-way pays because two-of-a-kind on a ways game lands
  // constantly — a whole coin there would return the machine several times over.
  //
  // The wild has no schedule of its own: it multiplies the ways rather than paying
  // as a run, so it is weighed at (count)/len like any symbol in `E[match]`, once,
  // and never priced twice the way a doubling wild would be.
  linePays: {
    NV: [0, 0, 10, 34, 95, 105],
    CM: [0, 0, 7, 22, 60, 69],
    ST: [0, 0, 4, 15, 40, 49],
    MN: [0, 0, 3, 11, 29, 35],
    A: [0, 0, 2, 7.5, 18, 23],
    K: [0, 0, 1.5, 6, 14, 17],
    Q: [0, 0, 1.2, 4.5, 11, 13],
    J: [0, 0, 1, 3.5, 9, 11],
    T: [0, 0, 0.8, 3, 7.5, 9],
  },
  // Multiples of the TOTAL stake, and small: the galaxy pays a little in its own
  // right so the screen that buys the round is itself a win, but its job is to
  // trigger. It appears once a reel on five short strips, so 3-or-more is the same
  // 3-of-5 convolution the licensed cabinets use, landing once in 249 spins.
  scatterPays: { SC: { 3: 2, 4: 10, 5: 50 } },
  // Ten free games at a flat 3×, with no expanding wild and no retrigger, so the
  // free games are distributed exactly like paid ones and the round has a closed
  // form: p(trigger) · 10 · 3 · base = 0.1203 of extra return. That is the whole
  // reason this feature can sit in `exactBaseReturn`'s company and be enumerated
  // rather than measured — see the header.
  feature: {
    kind: 'freeSpins',
    trigger: 'SC',
    triggerCount: 3,
    spins: 10,
    multiplier: 3,
  },
  targetRtp: 0.94,
}
