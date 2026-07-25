// Plays house-way Pai Gow Poker (dealer banks, 5% commission, no Fortune) and
// reports the house edge. The published edge for a player who never banks and
// follows the house way is about 2.84% of the bet. Landing near it confirms the
// evaluator, the house way, the copies-go-to-dealer rule and the commission.
//
//   npm run paigow:edge
//   npm run paigow:edge -- 1000000

import { PaiGowGame } from '../src/paigow/engine'

const ROUNDS = Number(process.argv[2] ?? 500_000)
const BANKROLL = 1e12

const game = new PaiGowGame({
  seed: 0x9a1,
  humanSeat: 0,
  humanBankroll: BANKROLL,
  humanBot: true,
  bots: [],
})

const seat = game.human
let wagered = 0
let net = 0
let sumSq = 0

for (let i = 0; i < ROUNDS; i++) {
  const before = seat.bankroll
  game.playRound()
  const bet = seat.hand!.bet
  const result = seat.bankroll - before
  wagered += bet
  net += result
  sumSq += (result / bet) ** 2
}

const mean = net / wagered
const stderr = Math.sqrt((sumSq / ROUNDS - mean ** 2) / ROUNDS)
const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nPai Gow Poker — ${ROUNDS.toLocaleString()} hands, house way, dealer banks\n`)
console.log(`  house edge  ${pct(-mean)}  ± ${pct(2 * stderr)}   (published ≈ 2.84%)\n`)
console.log(
  '  Push-heavy game: most hands split one-and-one, so the edge is small and the\n' +
    '  variance is low. That is the whole character of Pai Gow.\n',
)
