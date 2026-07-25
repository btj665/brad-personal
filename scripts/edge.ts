// Plays perfect basic strategy against every preset and reports the house edge.
//
// This is the real test of the engine. The house edge of these games is known to
// two decimal places from published combinatorial analysis; if the rules, the
// payouts, the dealer's draw or the strategy chart were wrong, the number would
// come out wrong. It is a cross-check on the whole thing at once.
//
//   npm run edge
//   npm run edge -- 2000000

import { BOT_ROSTER } from '../src/content/bots'
import { PRESETS } from '../src/content/presets'
import { Game } from '../src/engine/table'
import type { RuleSet } from '../src/engine/types'

const ROUNDS = Number(process.argv[2] ?? 500_000)
const ONLY = process.argv[3]
const BANKROLL = 1e12

const BASIC = BOT_ROSTER[0].profile // flat bets, textbook chart, no counting

interface Result {
  /** Net chips won by the player, as a fraction of everything originally bet. */
  edge: number
  /** Standard error of that estimate, in the same units. */
  stderr: number
}

function measure(rules: RuleSet, rounds: number, seed: number): Result {
  const game = new Game({
    rules,
    seed,
    humanSeat: 0,
    humanBankroll: BANKROLL,
    humanBot: BASIC,
    bots: [],
  })

  const seat = game.human
  let wagered = 0
  let net = 0
  let sumSq = 0

  for (let i = 0; i < rounds; i++) {
    const before = seat.bankroll
    game.playRound()
    // playRound stops on the settled table, so the original bet is still there.
    const bet = seat.baseBet
    const result = seat.bankroll - before

    wagered += bet
    net += result
    sumSq += (result / bet) ** 2 // per-round result in units of the original bet
  }

  // The player's mean result per unit wagered. The house edge is its negation.
  const mean = net / wagered
  // Rounds are independent, so the variance of the mean falls as 1/n.
  const variance = sumSq / rounds - mean ** 2
  const stderr = Math.sqrt(variance / rounds)

  return { edge: -mean, stderr }
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nHouse edge vs. basic strategy — ${ROUNDS.toLocaleString()} rounds each\n`)
console.log(
  ['game'.padEnd(18), 'simulated'.padStart(10), '±2σ'.padStart(8), 'published'.padStart(10)].join(
    '  ',
  ),
)
console.log('-'.repeat(52))

for (const preset of PRESETS) {
  if (ONLY && preset.id !== ONLY) continue
  const { edge, stderr } = measure(preset.rules, ROUNDS, 0xbeef)
  const expected = preset.edge / 100
  const off = Math.abs(edge - expected) > 2 * stderr
  console.log(
    [
      preset.rules.label.padEnd(18),
      pct(edge).padStart(10),
      pct(2 * stderr).padStart(8),
      pct(expected).padStart(10),
      off ? '  <-- off' : '',
    ].join('  '),
  )
}

console.log(
  '\nA positive edge is the house winning. The rightmost column is the figure\n' +
    'recorded in presets.ts; the simulation should land on it.\n',
)
