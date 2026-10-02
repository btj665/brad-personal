// Mississippi Stud's house edge, computed exactly — no sampling.
//
// The game is small enough to enumerate. There is no dealer hand, so a starting
// hand's whole future is the 50 x 49 x 48 orders in which the community cards can
// arrive, and with the positions canonicalised by suit that collapses to a few
// thousand distinct spots. So this script walks all 1,326 two-card hands and
// every community card behind them, once, and reports the true numbers rather
// than a simulation of them.
//
// Two strategies are booked:
//   * the exact solver in src/mstud/strategy.ts, which is what the published
//     figures assume;
//   * the memorisable published chart, whose cost is then a measured number.
//
// A short engine simulation follows, only to prove the table pays what the
// mathematics says it does.
//
//   npm run mstud:edge
//   npm run mstud:edge -- 200000        (rounds for the accounting check)

import { buildShoeCards } from '../src/engine/cards'
import { MStudGame } from '../src/mstud/engine'
import {
  bestAction,
  chartAction,
  evaluatePolicy,
  type Policy,
  type PolicyEval,
} from '../src/mstud/strategy'

const ROUNDS = Number(process.argv[2] ?? 200_000)

// Published: house edge 4.91% of the ante, element of risk about 1.37% of the
// average total wagered, average total wager 3.5934 antes.
const PUBLISHED = { edge: 0.0491, risk: 0.0137, wager: 3.5934 }

const DECK = buildShoeCards(1)

/** Weighted average over all 1,326 starting hands. Every one is equally likely,
 *  so the book is a plain mean. */
function book(policy: Policy): PolicyEval & { folds: number } {
  const memo = new Map<string, PolicyEval>()
  let ev = 0
  let wager = 0
  let folds = 0
  let n = 0
  for (let i = 0; i < DECK.length; i++) {
    for (let j = i + 1; j < DECK.length; j++) {
      const hole = [DECK[i], DECK[j]]
      const r = evaluatePolicy(policy, hole, memo)
      ev += r.ev
      wager += r.wager
      if (r.wager === 1) folds++
      n++
    }
  }
  return { ev: ev / n, wager: wager / n, folds: folds / n }
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`
const delta = (measured: number, published: number) => {
  const d = measured - published
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(3)}pp`
}

function report(name: string, r: PolicyEval & { folds: number }) {
  const edge = -r.ev
  const risk = -r.ev / r.wager
  console.log(`\n  ${name}`)
  console.log(
    `    House edge   ${pct(edge).padStart(8)}  of the ante            ` +
      `(published ${pct(PUBLISHED.edge)}, ${delta(edge, PUBLISHED.edge)})`,
  )
  console.log(
    `    Element of risk ${pct(risk).padStart(5)}  of the total wagered   ` +
      `(published ${pct(PUBLISHED.risk)}, ${delta(risk, PUBLISHED.risk)})`,
  )
  console.log(
    `    Avg total wager ${r.wager.toFixed(4).padStart(5)} antes                  ` +
      `(published ${PUBLISHED.wager.toFixed(4)}, ${(r.wager - PUBLISHED.wager >= 0 ? '+' : '') + (r.wager - PUBLISHED.wager).toFixed(4)})`,
  )
  console.log(`    Third-street folds ${pct(r.folds)} of hands`)
}

console.log('\nMississippi Stud — exact, all 1,326 starting hands enumerated')

const exact = book(bestAction)
report('Exact optimal play', exact)

const chart = book(chartAction)
report('Published chart', chart)

console.log(
  `\n  The chart gives up ${pct(-chart.ev + exact.ev)} of an ante against the solver.`,
)

// --- the table itself -------------------------------------------------------
//
// The book above is pure mathematics. This checks the engine deals, ladders and
// settles to the same number, and that the bankroll only ever moves by
// -wagered + returned.

const game = new MStudGame({ seed: 0xd1ce5, bankroll: 1e12 })
const ante = game.rules.minBet
let staked = 0
let net = 0
let sumSq = 0
let drift = 0
for (let i = 0; i < ROUNDS; i++) {
  const before = game.bankroll
  game.playRound(ante)
  const h = game.last!
  staked += h.wagered
  net += h.net!
  sumSq += (h.net! / ante) ** 2
  drift += game.bankroll - before - (h.returned! - h.wagered)
}
// The 500:1 royal on ten units makes this the noisiest game in the building —
// about five antes of standard deviation a hand, so a sample of any sane size
// only brackets the exact number. That's why the book above is enumerated.
const sd = Math.sqrt(sumSq / ROUNDS - (net / ante / ROUNDS) ** 2)
const se = sd / Math.sqrt(ROUNDS)
console.log(`\n  Engine, ${ROUNDS.toLocaleString()} hands with the solver at the wheel`)
// The wager, unlike the result, barely varies — so this one converges, and it is
// the check that the engine's ladder is the ladder the book priced.
console.log(
  `    Measured avg total wager ${(staked / ante / ROUNDS).toFixed(4)} antes   exact ${exact.wager.toFixed(4)}`,
)
console.log(
  `    Measured house edge ${pct(-net / ante / ROUNDS)} ± ${pct(se)} (1 s.e.)   exact ${pct(-exact.ev)}`,
)
console.log(`    Per-hand standard deviation ${sd.toFixed(2)} antes`)
console.log(`    Bankroll drift beyond -wagered + returned: ${drift}`)
console.log('')
