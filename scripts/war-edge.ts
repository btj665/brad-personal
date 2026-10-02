// Casino War, six decks. The headline result is that both answers to a tie are
// losing propositions and the worse-looking one is the better bet: going to war
// risks a second unit to win one, and still beats handing back half the bet on
// every tie. Surrendering costs 3.70%, going to war 2.88%. The Tie side bet, at
// 10:1 against a 7.4% event, is 18.65% — one of the worst bets on any table.
//
// War has only thirteen ranks, so the edges are enumerated exactly over the
// 312-card composition rather than sampled. The engine is then dealt the same
// strategies as a cross-check that it plays the rules the enumeration assumes;
// a flat-bet simulation of this game has a standard error near 0.1 percentage
// points per million rounds, so it can only ever confirm the exact figure to
// about one decimal.
//
// Published figures are quoted per *original* wager, which is the convention.
// The element-of-risk column divides by the chips actually put at risk, which
// on the war strategy exceeds one unit because of the raise.
//
//   npx tsx scripts/war-edge.ts
//   npx tsx scripts/war-edge.ts 4000000

import { RANKS } from '../src/engine/cards'
import { HOUSE_EDGE, TIE_PAYS, warValue, WarGame } from '../src/war/engine'

const ROUNDS = Number(process.argv[2] ?? 1_000_000)

const DECKS = 6
const PER_RANK = 4 * DECKS // 24 of every rank in a six-deck shoe
const SHOE = PER_RANK * RANKS.length // 312

const VALUES = RANKS.map(warValue)

/** Probability of each ordered pair of ranks drawn from a shoe with `counts[i]`
 *  of rank i. Returns a 13x13 matrix. */
function pairProbabilities(counts: number[]): number[][] {
  const total = counts.reduce((a, b) => a + b, 0)
  const denom = total * (total - 1)
  return counts.map((ci, i) => counts.map((cj, j) => (ci * (i === j ? ci - 1 : cj)) / denom))
}

const FIRST = pairProbabilities(new Array(RANKS.length).fill(PER_RANK))

/** Expected units on the war, per unit of original bet, given the first two
 *  cards tied on rank `i`. Two of that rank are now gone; the three burn cards
 *  are never seen so they cannot shift the distribution. */
function warExpectation(i: number): number {
  const counts = new Array(RANKS.length).fill(PER_RANK)
  counts[i] = PER_RANK - 2
  const second = pairProbabilities(counts)
  let ev = 0
  for (let a = 0; a < RANKS.length; a++) {
    for (let b = 0; b < RANKS.length; b++) {
      // Higher *or equal* wins, but only the raise is paid: +1 on two at risk.
      ev += second[a][b] * (VALUES[a] >= VALUES[b] ? 1 : -2)
    }
  }
  return ev
}

interface Exact {
  edge: number
  elementOfRisk: number
  tieRate: number
}

function enumerate(strategy: 'war' | 'surrender'): Exact {
  let ev = 0
  let tieRate = 0
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      const p = FIRST[i][j]
      if (i === j) {
        tieRate += p
        ev += p * (strategy === 'war' ? warExpectation(i) : -0.5)
      } else {
        ev += p * (VALUES[i] > VALUES[j] ? 1 : -1)
      }
    }
  }
  // The raise only ever appears on a tie, and it is always one more unit.
  const atRisk = strategy === 'war' ? 1 + tieRate : 1
  return { edge: -ev, elementOfRisk: -ev / atRisk, tieRate }
}

function enumerateTieBet(): Exact {
  let tieRate = 0
  for (let i = 0; i < RANKS.length; i++) tieRate += FIRST[i][i]
  const ev = tieRate * TIE_PAYS - (1 - tieRate)
  return { edge: -ev, elementOfRisk: -ev, tieRate }
}

// ------------------------------------------------------------------ the engine

interface Sim {
  edge: number
  tieRate: number
}

function simulate(strategy: 'war' | 'surrender', seed: number, side: boolean): Sim {
  const game = new WarGame({ seed, bankroll: 1e12, bet: 1 })
  if (side) game.setTieBet(1)
  let base = 0
  let net = 0
  let ties = 0
  for (let i = 0; i < ROUNDS; i++) {
    const r = game.playRound(strategy)!
    if (side) {
      base += r.tieBet
      net += r.tieReturned - r.tieBet
    } else {
      base += r.bet // the edge is quoted per original wager
      net += r.returned - r.wagered
    }
    if (r.tied) ties++
  }
  return { edge: -net / base, tieRate: ties / ROUNDS }
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

const cases: Array<[string, Exact, Sim, number]> = [
  ['Go to war on every tie', enumerate('war'), simulate('war', 0x77a4, false), HOUSE_EDGE.war],
  [
    'Surrender on every tie',
    enumerate('surrender'),
    simulate('surrender', 0x51e2, false),
    HOUSE_EDGE.surrender,
  ],
  [`Tie side bet (${TIE_PAYS}:1)`, enumerateTieBet(), simulate('war', 0x71e0, true), HOUSE_EDGE.tie],
]

console.log(`\nCasino War — ${DECKS} decks, ${SHOE} cards`)
console.log(`Exact enumeration; dealt column is ${ROUNDS.toLocaleString()} rounds through the engine.\n`)
console.log(
  `${'strategy'.padEnd(24)} ${'exact'.padStart(8)} ${'published'.padStart(10)} ${'dealt'.padStart(8)} ${'elem. risk'.padStart(11)}`,
)
console.log('-'.repeat(66))
for (const [label, exact, sim, published] of cases) {
  console.log(
    `${label.padEnd(24)} ${pct(exact.edge).padStart(8)} ${pct(published).padStart(10)} ` +
      `${pct(sim.edge).padStart(8)} ${pct(exact.elementOfRisk).padStart(11)}`,
  )
}
console.log('-'.repeat(66))
console.log(
  `${'Tie rate (23/311)'.padEnd(24)} ${pct(cases[0][1].tieRate).padStart(8)} ${''.padStart(10)} ${pct(cases[0][2].tieRate).padStart(8)}`,
)

const gap = cases[1][1].edge - cases[0][1].edge
console.log(
  `\nGoing to war is ${pct(gap)} cheaper per unit bet than surrendering. There is no` +
    `\ngood play here — only a less bad one — which is the whole game.\n`,
)
