// Deals a table in the terminal so you can watch the robots play.
//
//   npm run sim              20 rounds of the default game
//   npm run sim -- 50 european

import { BOT_ROSTER } from '../src/content/bots'
import { PRESETS, presetById } from '../src/content/presets'
import { evaluate } from '../src/engine/hand'
import { Game } from '../src/engine/table'
import { SUIT_PIP } from '../src/engine/cards'
import type { Card, Hand, Seat } from '../src/engine/types'

const ROUNDS = Number(process.argv[2] ?? 20)
const PRESET = process.argv[3] ?? 'vegas-strip'

if (!PRESETS.some((p) => p.id === PRESET)) {
  console.error(`Unknown game "${PRESET}". Try: ${PRESETS.map((p) => p.id).join(', ')}`)
  process.exit(1)
}

const preset = presetById(PRESET)

const game = new Game({
  rules: preset.rules,
  seed: 20260714,
  humanSeat: 2,
  humanName: 'You',
  humanBankroll: 1000,
  // The human seat gets a bot brain too, so the table plays itself.
  humanBot: BOT_ROSTER[0].profile,
  bots: BOT_ROSTER.slice(1, 5).map((b) => ({
    name: b.name,
    profile: b.profile,
    bankroll: b.bankroll,
  })),
})

const show = (c: Card) => `${c.rank}${SUIT_PIP[c.suit]}`
const cards = (cs: Card[]) => cs.map(show).join(' ')

function readHand(h: Hand): string {
  const { total, soft, busted } = evaluate(h.cards)
  const value = busted ? `bust ${total}` : soft && total !== 21 ? `s${total}` : `${total}`
  const flags = [h.doubled && 'DBL', h.surrendered && 'SURR'].filter(Boolean).join(' ')
  return `${cards(h.cards).padEnd(17)} ${value.padStart(7)}  ${(h.outcome ?? '').padEnd(9)} ${flags}`
}

const bank = (s: Seat) => s.bankroll.toLocaleString().padStart(7)

console.log(`\n${preset.rules.label} — ${preset.note}`)
console.log(`House edge vs. basic strategy: ${preset.edge > 0 ? '+' : ''}${preset.edge}%\n`)

const opening = game.seats.map((s) => s.bankroll)

for (let round = 1; round <= ROUNDS; round++) {
  game.playRound()

  console.log(`── Round ${round} ${'─'.repeat(58)}`)
  console.log(
    `   ${'DEALER'.padEnd(12)} ${cards(game.dealer.cards).padEnd(17)} ${String(
      evaluate(game.dealer.cards).total,
    ).padStart(7)}`,
  )

  for (const seat of game.seats) {
    if (seat.name === '' || seat.hands.length === 0) continue
    const style = seat.bot ? seat.bot.style : 'you'
    for (const [i, hand] of seat.hands.entries()) {
      const who = i === 0 ? `${seat.name} (${style})` : ''
      console.log(`   ${who.padEnd(22)} ${readHand(hand)}`)
    }
    if (seat.insurance > 0) console.log(`   ${''.padEnd(22)} insurance ${seat.insurance}`)
  }
  console.log(`   shoe ${game.shoe.cardsRemaining} · true count ${game.trueCount.toFixed(1)}\n`)
}

console.log('─'.repeat(70))
console.log(`\n${'Player'.padEnd(14)} ${'Style'.padEnd(12)} ${'Bankroll'.padStart(9)} ${'Net'.padStart(9)}`)
for (const [i, seat] of game.seats.entries()) {
  if (seat.name === '') continue
  const net = seat.bankroll - opening[i]
  console.log(
    `${seat.name.padEnd(14)} ${(seat.bot?.style ?? 'you').padEnd(12)} ${bank(seat)} ${
      (net >= 0 ? `+${net}` : String(net)).padStart(9)
    }`,
  )
}
console.log(
  `\n${ROUNDS} rounds. Short runs say nothing about the edge — that is the whole point of the game.\n`,
)
