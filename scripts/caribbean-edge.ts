// Caribbean Stud Poker — the house edge, and the honest number on the side bet.
//
// Two halves, because the game splits cleanly into one thing that can be
// counted and one that can't:
//
//   1. The progressive is exact. It only depends on the frequency of the
//      player's own five cards, so we enumerate all 2,598,960 hands, check the
//      counts in rules.ts against the enumeration, and read the return straight
//      off them. No sampling, no error bars.
//
//   2. The main game is sampled. Its payoff depends on the player's five cards
//      AND the dealer's five from the remaining 47 — 2,598,960 × 1,533,939 ≈
//      4×10¹² deals, which is not a thing you enumerate in an afternoon. So:
//      Monte Carlo, with the standard error printed next to the estimate so the
//      reader can see whether the published figure is inside it.
//
//   npx tsx scripts/caribbean-edge.ts
//   npx tsx scripts/caribbean-edge.ts 20000000

import { buildShoeCards } from '../src/engine/cards'
import { score5 } from '../src/poker/eval'
import { CaribbeanGame } from '../src/caribbean/engine'
import {
  breakEvenMeter,
  DEFAULT_CARIBBEAN,
  HAND_COUNTS,
  PAY_ORDER,
  payKey,
  progressiveReturn,
  TOTAL_HANDS,
  type PayKey,
} from '../src/caribbean/rules'
import { shouldRaise } from '../src/caribbean/strategy'

const ROUNDS = Number(process.argv[2] ?? 2_000_000)
const BANKROLL = 1e13

// Published figures for the standard schedule played with the A-K-J-8-3 rule.
const PUBLISHED_EDGE = 0.0522
const PUBLISHED_RISK = 0.0256

const pct = (x: number) => `${(x * 100).toFixed(3)}%`
const pad = (s: string, n: number) => s.padEnd(n)

// ------------------------------------------------------------------ exact half

function enumerateHands(): Record<PayKey, number> {
  const deck = buildShoeCards(1)
  const counts = Object.fromEntries(PAY_ORDER.map((k) => [k, 0])) as Record<PayKey, number>
  const hand = new Array(5)

  for (let a = 0; a < 48; a++) {
    hand[0] = deck[a]
    for (let b = a + 1; b < 49; b++) {
      hand[1] = deck[b]
      for (let c = b + 1; c < 50; c++) {
        hand[2] = deck[c]
        for (let d = c + 1; d < 51; d++) {
          hand[3] = deck[d]
          for (let e = d + 1; e < 52; e++) {
            hand[4] = deck[e]
            counts[payKey(score5(hand, {}))]++
          }
        }
      }
    }
  }
  return counts
}

console.log(`\n${DEFAULT_CARIBBEAN.label}\n`)
console.log('Five-card frequencies — all 2,598,960 hands, enumerated:\n')

const counts = enumerateHands()
let total = 0
let mismatch = 0
for (const key of PAY_ORDER) {
  const n = counts[key]
  total += n
  const expected = HAND_COUNTS[key]
  const ok = n === expected
  if (!ok) mismatch++
  console.log(
    `  ${pad(key, 15)} ${String(n).padStart(9)}  ` +
      `${pct(n / TOTAL_HANDS).padStart(9)}  ` +
      `pays ${String(DEFAULT_CARIBBEAN.raisePay[key]).padStart(3)}:1  ` +
      `${ok ? 'ok' : `MISMATCH — rules.ts says ${expected}`}`,
  )
}
console.log(`  ${pad('total', 15)} ${String(total).padStart(9)}`)
if (total !== TOTAL_HANDS || mismatch > 0) {
  throw new Error('the frequency table in rules.ts does not match the deck')
}

// ---------------------------------------------------- the progressive, exactly

const prog = DEFAULT_CARIBBEAN.progressive
const evenMeter = breakEvenMeter(prog)

console.log(`\nThe $${prog.cost} progressive — exact, no sampling:\n`)
console.log('  Royal flush wins the meter, straight flush 10% of it,')
console.log('  four of a kind $500, full house $100, flush $50.')
console.log('  Payouts are amounts won: the $1 stake never comes back.\n')
for (const meter of [10_000, 100_000, prog.meter, Math.ceil(evenMeter), 400_000]) {
  const ret = progressiveReturn({ ...prog, meter })
  const edge = 1 - ret
  console.log(
    `  meter $${String(meter.toLocaleString()).padStart(9)}   ` +
      `return ${pct(ret).padStart(9)}   ` +
      `${edge >= 0 ? `house edge ${pct(edge)}` : `PLAYER edge ${pct(-edge)}`}`,
  )
}
console.log(`\n  Break-even meter: $${evenMeter.toFixed(0)}.`)
console.log('  Below it the side bet is a donation; above it it is one of the few')
console.log('  positive-expectation bets on a casino floor — at a variance that')
console.log('  means you will not live to collect the average.')

// ------------------------------------------------------------- sampled half

const ante = DEFAULT_CARIBBEAN.minAnte
const game = new CaribbeanGame({ seed: 0xcabbeef, bankroll: BANKROLL, ante })

let anteWagered = 0
let totalWagered = 0
let net = 0
let sumSq = 0 // of the per-round result, in ante units, for the standard error
let raised = 0
let noQualify = 0
const results = { fold: 0, win: 0, lose: 0, push: 0 }

for (let i = 0; i < ROUNDS; i++) {
  const before = game.bankroll
  game.deal()
  const hand = game.hand!
  const raising = shouldRaise(hand.cards, hand.score)
  if (raising) {
    game.raise()
    raised++
  } else {
    game.fold()
  }

  const s = hand.settlement!
  results[s.result]++
  if (raising && !s.qualifies) noQualify++

  const delta = game.bankroll - before
  anteWagered += hand.ante
  totalWagered += hand.ante + hand.raise
  net += delta
  sumSq += (delta / ante) ** 2
}

// Per-round net in ante units: mean, and the standard error of that mean.
const mean = net / ante / ROUNDS
const variance = sumSq / ROUNDS - mean * mean
const stderr = Math.sqrt(variance / ROUNDS)

console.log(`\nThe main game — ${ROUNDS.toLocaleString()} hands, A-K-J-8-3 strategy:\n`)
console.log(`  Raised                                ${pct(raised / ROUNDS)}`)
console.log(`  Folded                                ${pct(results.fold / ROUNDS)}`)
console.log(`  Raised, dealer did not open           ${pct(noQualify / ROUNDS)}`)
console.log(`  Won / lost / pushed                   ${pct(results.win / ROUNDS)} / ${pct(results.lose / ROUNDS)} / ${pct(results.push / ROUNDS)}`)
console.log(`  Average total wagered per hand        ${(totalWagered / anteWagered).toFixed(4)} antes`)
console.log()
console.log(
  `  House edge      (loss / ante)         ${pct(-net / anteWagered)}  ±${pct(stderr)}   (published: ${pct(PUBLISHED_EDGE)})`,
)
console.log(
  `  Element of risk (loss / ante + Raise) ${pct(-net / totalWagered)}             (published: ${pct(PUBLISHED_RISK)})`,
)

const off = Math.abs(-net / anteWagered - PUBLISHED_EDGE)
console.log(
  `\n  Measured edge is ${(off / stderr).toFixed(2)} standard errors from the published 5.22%.` +
    `\n  Perfect play — which also reads the dealer's upcard — would save a few` +
    `\n  hundredths of a percent more; this is the published simple rule.\n`,
)
