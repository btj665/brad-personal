// Plays the bots' Ultimate Texas Hold'em strategy and reports the house edge.
//
// Perfect play gives up about 2.19% of the ante per hand; that requires solving
// every decision exactly. These bots instead play the well-known simple charts —
// the published 4x/2x preflop-and-flop rules and a hidden-pair river — which is
// sound, never-embarrassing play but leaves a little on the table. The number
// below is what that strategy actually costs, measured, not the theoretical
// floor. (The engine itself is exact: `npm run uth:trips` and the settlement
// tests pin that down.)
//
//   npm run uth:edge
//   npm run uth:edge -- 2000000

import { UthGame } from '../src/uth/engine'

const ROUNDS = Number(process.argv[2] ?? 500_000)
const BANKROLL = 1e12

const game = new UthGame({
  seed: 0xace,
  humanSeat: 0,
  humanBankroll: BANKROLL,
  humanBot: true,
  bots: [],
})

const seat = game.human
let anteWagered = 0
let mandatoryWagered = 0 // ante + blind
let net = 0

for (let i = 0; i < ROUNDS; i++) {
  const before = seat.bankroll
  game.playRound()
  const h = seat.hand!
  anteWagered += h.ante
  mandatoryWagered += h.ante + h.blind
  net += seat.bankroll - before
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nUltimate Texas Hold'em — ${ROUNDS.toLocaleString()} hands, optimal play\n`)
console.log(`  Element of risk (loss / ante)          ${pct(-net / anteWagered)}`)
console.log(`  House edge     (loss / [ante + blind]) ${pct(-net / mandatoryWagered)}`)
console.log(`\n  Perfect play would be about 2.19% of the ante; these are the simple charts.\n`)
