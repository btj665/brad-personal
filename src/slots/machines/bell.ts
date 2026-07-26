// Bell Ringer — five reels, three rows, thirty lines.
//
// The hook is the bell. It is a scatter, so it pays on how many landed anywhere
// on the screen: not on a line, not adjacent, just present. The ladder is steep
// enough that the count itself is the game — three bells hands back half the bet
// and nine pays twelve hundred times it. That is the Quick Hit shape, reduced to
// the part that changes the arithmetic, and it needs no engine support at all:
// `scatterPays` already pays on a screen count, so `feature` is `none`.
//
// The strips below are cut to 95%. Roughly two thirds of that sits in the lines
// and the rest in the ladder; the split is asserted in the test, because moving
// a bell moves the price of the machine far more than moving a jack does.

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
  blurb: 'Thirty lines, and bells that pay from anywhere',
  note: 'Bells pay from anywhere. They do not have to be on a line and they do not have to touch: land three anywhere on the screen and you get half your bet back, and every bell past that is worth several times the one before it. Nine bells is the jackpot — twelve hundred times your total bet.',
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
  scatterPays: {
    BL: {
      3: 0.5,
      4: 2,
      5: 9,
      6: 24,
      7: 100,
      8: 300,
      9: 1200,
      10: 1200,
      11: 1200,
      12: 1200,
      13: 1200,
      14: 1200,
      15: 1200,
    },
  },
  feature: { kind: 'none' },
  targetRtp: 0.95,
}
