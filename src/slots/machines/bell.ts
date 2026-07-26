// Bell Ringer — five reels, three rows, thirty lines, and bells that lock.
//
// The hook is the bell. It is a scatter, so it pays on how many landed anywhere
// on the screen: not on a line, not adjacent, just present. Three bells hands
// back half the bet, and from six the bells stop being a pay and become a game —
// they lock where they landed and the screen respins for more of them until it
// stops giving them up. That is the Quick Hit shape, reduced to the part that
// changes the arithmetic.
//
// ---------------------------------------------------------------- the rebalance
//
// The ladder used to run all the way to 1200× for nine bells, and it could not
// survive the round being bolted on: six bells now buys a hold-and-spin worth
// thirty times the stake, so paying the old 24× / 100× / 300× / 1200× on top
// would have taken the machine to 1.047 — a ten-point raise on a cabinet that
// claims 95%. The rungs from six up are exactly the rungs the round replaces, so
// those are the rungs that came down — and only those:
//
//   bells   old pay   new pay   old return   new return
//   3        0.5       0.5       0.030044     0.030044   untouched: no round here
//   4        2         2         0.071388     0.071388   untouched
//   5        9         9         0.063182     0.063182   untouched
//   6        24        10        0.065896     0.027457   the round starts here
//   7        100       25        0.035556     0.008889
//   8        300       60        0.029630     0.005926
//   9+       1200      200       0.009481     0.001580
//   ------------------------------------------------------------------------
//   6 and up                     0.140563     0.043852
//   hold-and-spin                       —     0.096808   ± 0.000144, measured
//   6 and up, all in                     —     0.140660
//
// The whole point of that table is the last two rows: the money did not move
// out of the machine, it moved out of a number on the glass and into a feature.
// Total return is 0.853105 enumerated plus 0.096808 measured = 0.949913, which
// is where it was before any of this (0.949816). Line pays were not touched at
// all — the bells and the jacks have nothing to do with each other, and a round
// bought by bells has no business being funded by the paylines.
//
// Nine bells falling from 1200× to 200× is the visible cost, and it is the right
// one: nine bells happens once in 126,563 spins and carried under 1% of the
// machine, so what came down is the rung nobody reaches. What replaced it is a
// jackpot a player can actually get to — the full screen pays 300× on top of the
// coins, lands once in fifty rounds, which is once in 15,700 spins rather than
// once in 126,563, and carries 0.0192 of the return against the old jackpot's
// 0.0095. Twice the money, eight times as often.
//
// The hold-and-spin is the one feature in this building that cannot be
// enumerated: every coin that lands buys the respins back, so the round can run
// as long as it likes and there is no finite state space to walk. It is measured
// — 30.1779 ± 0.0450 stakes over 3.2M rounds across eight streams, priced per
// seeded bell count and weighted by the exact conditional distribution of that
// count — and `bell.test.ts` holds it to that figure. Note that it is priced by
// playing *rounds*, not spins: a round happens once in 312 spins, so measuring it
// through the machine would waste 99.7% of the sample.
//
// `npm run slots:rtp` plays the whole thing and gets 94.901% ± 0.274% over
// 12,000,000 spins in eight streams (93.982%–95.634% per stream). The rebalance
// also made this cabinet a great deal calmer: taking 1200× off the top of the
// ladder dropped the per-spin standard deviation from about 12 to 4.7, so the
// same twelve million spins now resolve it four times as sharply.

import { makeRng } from '../../engine/rng'
import type { Machine, SymbolId } from '../types'

const STOPS = 60

/** Two bells, adjacent, appearing twice per reel.
 *
 *  Stacking matters and the count alone does not: line pays depend only on how
 *  many of a symbol sit on a strip, but a scatter pays on a whole-screen count,
 *  so it is the *clustering* that decides the shape of the ladder. Two adjacent
 *  bells let one reel show two at once, which is what makes six, seven and eight
 *  bells reachable at all — with four isolated bells per reel the screen could
 *  never hold more than five and the top of the ladder would be decoration.
 *
 *  The two stacks sit far enough apart that neither can ever appear in the same
 *  three-row window as the other, so each reel shows 0, 1 or 2 bells and never
 *  more, and the screen tops out at ten. */
const BELL_STACKS = [4, 34]
const STACK = 2

/** Deal a bag of symbols out so the reel reads like a real one going past rather
 *  than like a sorted list.
 *
 *  A shuffle is a permutation, so it moves nothing: line return is computed from
 *  each reel's marginal, which is a function of the counts alone. Only the bells
 *  care where they sit, and they are placed after this, not shuffled into it.
 *  The seed is fixed so the strips — and therefore the hit frequency, which does
 *  depend on which symbols end up in the same three-row window — are the same
 *  every run. */
function shuffle(bag: SymbolId[], seed: number): SymbolId[] {
  const rng = makeRng(seed)
  const out = [...bag]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** One reel. `counts` covers everything except the bells, which are placed at
 *  fixed stops, and must therefore total `STOPS` minus the bells. */
function buildStrip(seed: number, counts: Record<SymbolId, number>): SymbolId[] {
  const bag: SymbolId[] = []
  for (const [id, n] of Object.entries(counts)) for (let i = 0; i < n; i++) bag.push(id)
  const dealt = shuffle(bag, seed)

  const placed: Array<SymbolId | null> = new Array<SymbolId | null>(STOPS).fill(null)
  for (const start of BELL_STACKS) {
    for (let i = 0; i < STACK; i++) placed[(start + i) % STOPS] = 'BL'
  }

  const strip: SymbolId[] = []
  let next = 0
  for (let stop = 0; stop < STOPS; stop++) {
    const bell = placed[stop]
    strip.push(bell !== null ? bell : dealt[next++])
  }
  return strip
}

// Reel one is thinnest in the symbols worth having, because every run has to
// start there: a seven added to reel one costs more return than one added to
// reel five. The wild is scarcest there for the same reason.
const STRIPS: SymbolId[][] = [
  buildStrip(0x8e11, { W: 1, '7': 3, D: 4, BAR: 5, A: 6, K: 6, Q: 7, J: 8, T: 8, '-': 8 }),
  buildStrip(0x8e12, { W: 3, '7': 4, D: 4, BAR: 5, A: 6, K: 6, Q: 7, J: 7, T: 7, '-': 7 }),
  buildStrip(0x8e13, { W: 3, '7': 4, D: 5, BAR: 5, A: 6, K: 6, Q: 7, J: 7, T: 7, '-': 6 }),
  buildStrip(0x8e14, { W: 3, '7': 4, D: 5, BAR: 6, A: 6, K: 7, Q: 7, J: 7, T: 7, '-': 4 }),
  buildStrip(0x8e15, { W: 2, '7': 5, D: 5, BAR: 6, A: 7, K: 7, Q: 7, J: 7, T: 7, '-': 3 }),
]

/** Thirty lines: the three straights, the two chevrons, and the zigzags a
 *  cabinet fills the rest of the card with. Every one moves at most one row
 *  between adjacent reels, which is what makes a path a player can trace. */
const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 2, 1, 0, 1],
  [1, 0, 1, 2, 1],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 2, 2, 2],
  [2, 1, 0, 0, 0],
  [0, 0, 0, 1, 2],
  [2, 2, 2, 1, 0],
  [1, 1, 1, 0, 0],
  [1, 1, 1, 2, 2],
  [0, 0, 1, 1, 2],
  [2, 2, 1, 1, 0],
  [0, 1, 1, 2, 2],
]

export const BELL: Machine = {
  id: 'bell',
  label: 'Bell Ringer',
  blurb: 'Thirty lines, bells that pay from anywhere, and bells that lock',
  note: 'Bells pay from anywhere. They do not have to be on a line and they do not have to touch: land three anywhere on the screen and you get half your bet back, and four or five pay more. Six is where it turns into a game — every bell locks where it fell, you get three respins, and every new bell that lands gives you all three back. Fill all fifteen and the screen pays three hundred times your bet on top of the coins.',
  symbols: [
    { id: 'W', label: 'W', wild: true },
    { id: 'BL', label: 'BL', scatter: true },
    { id: '7', label: '7' },
    { id: 'D', label: '◆' },
    { id: 'BAR', label: '≡' },
    { id: 'A', label: 'A' },
    { id: 'K', label: 'K' },
    { id: 'Q', label: 'Q' },
    { id: 'J', label: 'J' },
    { id: 'T', label: '10' },
    { id: '-', label: '' },
  ],
  strips: STRIPS,
  rows: 3,
  lines: LINES,
  // The wild carries no multiplier, so a reel weighs a symbol at
  // (count + wilds)/60 and not (count + 2·wilds)/60. It has its own schedule
  // instead: five wilds is the biggest line award on the machine.
  linePays: {
    W: [0, 0, 0, 100, 750, 4000],
    '7': [0, 0, 0, 75, 400, 2000],
    D: [0, 0, 0, 50, 200, 1000],
    BAR: [0, 0, 0, 35, 150, 600],
    A: [0, 0, 0, 18, 60, 200],
    K: [0, 0, 0, 15, 50, 175],
    Q: [0, 0, 0, 12, 40, 150],
    J: [0, 0, 0, 8, 35, 100],
    T: [0, 0, 0, 6, 30, 90],
  },
  // Multiples of the TOTAL stake, not of a line. Ten is the most the strips can
  // put on screen, but eleven upward are listed so the table means "nine or
  // more" literally and a future strip edit that stacks three bells cannot
  // silently pay nothing for the best screen in the game.
  //
  // The ladder is steep to five and then almost flat, and the kink is exactly
  // where the hold-and-spin starts: three to five have to carry themselves, so
  // each is worth several times the one below it, while six and up are a token
  // on top of a round worth thirty times the stake. A rung that reads 10 next to
  // a rung that reads 9 looks like a mistake and is the opposite of one — the
  // sixth bell is worth 40× all in, not 10×.
  scatterPays: {
    BL: {
      3: 0.5,
      4: 2,
      5: 9,
      6: 10,
      7: 25,
      8: 60,
      9: 200,
      10: 200,
      11: 200,
      12: 200,
      13: 200,
      14: 200,
      15: 200,
    },
  },
  feature: { kind: 'none' },
  // Six bells locks the screen. Fifteen cells, three respins, re-granted in full
  // by any coin — so the round's length is a random walk and its price cannot be
  // written down, only measured (30.1779 ± 0.0450 stakes; see the header).
  //
  // Every number here is doing one job:
  //
  //   coinChance 0.08 sets how long the show runs and how often it ends in a full
  //   screen. Nine empty cells at 8% is 0.72 coins a respin, comfortably under
  //   one, which is what makes the walk terminate: at 14% the round fills once in
  //   six and stops being a jackpot at all. As cut it runs about eight respins
  //   and fills once in fifty.
  //
  //   The coins average 2.4× the stake, and the weights are what make that so:
  //   fifty-seven hundredths of them are the minimum. The 50 sits at one in a
  //   hundred and is a fifth of the coins' whole value on its own.
  //
  //   fullScreen 300 is the jackpot, and it is where the old nine-bell 1200×
  //   went. Ten coins average is 24× the stake; the fifteenth coin is worth 300
  //   more, so the round's tail is entirely in whether the screen fills.
  bonus: {
    kind: 'holdSpin',
    trigger: 'BL',
    triggerCount: 6,
    respins: 3,
    coins: [
      { value: 1, weight: 57 },
      { value: 2, weight: 24 },
      { value: 3, weight: 10 },
      { value: 5, weight: 5 },
      { value: 10, weight: 3 },
      { value: 50, weight: 1 },
    ],
    coinChance: 0.08,
    fullScreen: 300,
  },
  targetRtp: 0.95,
}
