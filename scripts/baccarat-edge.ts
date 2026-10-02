// Baccarat house edges, two ways.
//
// 1. Exactly. Only ten point values matter, so an 8-deck shoe's whole outcome
//    space is at most six ordered draws — about a million weighted sequences,
//    which enumerates in a couple of seconds. The walk calls straight into
//    `resolveCoup`, so this is the real tableau being measured, not a copy of it.
//
// 2. By simulation, through `BaccaratGame` itself — the same beats the screen
//    drives, the same shoe, the same settlement code. The exact numbers verify
//    the tableau; the simulation verifies the engine that wraps it.
//
//   npx tsx scripts/baccarat-edge.ts            (25M coups, about 40 seconds)
//   npx tsx scripts/baccarat-edge.ts 2000000
//
// The default is 25 million because of the Tie bet: one coup in ten pays 8:1, so
// its standard error falls slowly, and a couple of million coups would leave it
// a quarter of a percent adrift. Player and Banker settle down inside 100,000.
//
// Published (8 decks): Banker 1.06%, Player 1.24%, Tie at 8:1 14.36%,
// either pair at 11:1 10.36%.

import { BaccaratGame } from '../src/baccarat/engine'
import { BET_NAMES, DEFAULT_BACCARAT, ratio, resolveCoup } from '../src/baccarat/rules'
import type { BetName, Winner } from '../src/baccarat/types'

const ROUNDS = Number(process.argv[2] ?? 25_000_000)
const RULES = DEFAULT_BACCARAT
const DECKS = RULES.decks
const CARDS = DECKS * 52

const PUBLISHED: Record<BetName, number> = {
  banker: 0.0106,
  player: 0.0124,
  tie: 0.1436,
  playerPair: 0.1036,
  bankerPair: 0.1036,
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

// ------------------------------------------------------------------ exact

/** Cards of each point value in a fresh shoe. The zero column holds four ranks
 *  — ten, jack, queen, king — so it is four times as deep as the others. */
function freshShoe(): number[] {
  const shoe = [4 * 4 * DECKS]
  for (let v = 1; v <= 9; v++) shoe.push(4 * DECKS)
  return shoe
}

function enumerateExact(): Record<Winner, number> {
  const shoe = freshShoe()
  let left = CARDS
  const wins: Record<Winner, number> = { player: 0, banker: 0, tie: 0 }

  const take = (v: number): number => {
    const p = shoe[v] / left
    shoe[v]--
    left--
    return p
  }
  const untake = (v: number): void => {
    shoe[v]++
    left++
  }

  for (let a = 0; a <= 9; a++) {
    const pa = take(a)
    for (let b = 0; b <= 9; b++) {
      const pb = take(b) * pa
      for (let c = 0; c <= 9; c++) {
        const pc = take(c) * pb
        for (let d = 0; d <= 9; d++) {
          const p4 = take(d) * pc

          // A probe with padding tells us how many cards this coup wants. Its
          // winner is only trustworthy when the padding went unused.
          const probe = resolveCoup([a, b, c, d, 0, 0])
          if (probe.used === 4) {
            wins[probe.winner] += p4
          } else if (probe.playerPoints.length === 2) {
            // The player stood on two; only the banker draws, and that one card
            // cannot change whose turn it is to draw.
            for (let e = 0; e <= 9; e++) {
              const p5 = take(e) * p4
              wins[resolveCoup([a, b, c, d, e]).winner] += p5
              untake(e)
            }
          } else {
            for (let e = 0; e <= 9; e++) {
              const p5 = take(e) * p4
              const probe2 = resolveCoup([a, b, c, d, e, 0])
              if (probe2.used === 5) {
                wins[probe2.winner] += p5
              } else {
                for (let f = 0; f <= 9; f++) {
                  const p6 = take(f) * p5
                  wins[resolveCoup([a, b, c, d, e, f]).winner] += p6
                  untake(f)
                }
              }
              untake(e)
            }
          }
          untake(d)
        }
        untake(c)
      }
      untake(b)
    }
    untake(a)
  }
  return wins
}

/** Two cards of the same rank off the top of a shuffled shoe. Every pair of
 *  positions in a random shoe has this same chance, so it holds for the banker's
 *  two cards as well as the player's, and at any depth. */
function exactPairChance(): number {
  return (4 * DECKS - 1) / (CARDS - 1)
}

const t0 = Date.now()
const wins = enumerateExact()
const enumMs = Date.now() - t0
const pPair = exactPairChance()

const exact: Record<BetName, number> = {
  // Ties push, so a tie costs the Player and Banker bets nothing — but it is
  // still a coup the chips sat out, and the published edges count it in the
  // denominator.
  player: wins.banker - wins.player * ratio(RULES.pays.player),
  banker: wins.player - wins.banker * ratio(RULES.pays.banker) * (1 - RULES.commission),
  tie: 1 - wins.tie * (1 + ratio(RULES.pays.tie)),
  playerPair: 1 - pPair * (1 + ratio(RULES.pays.playerPair)),
  bankerPair: 1 - pPair * (1 + ratio(RULES.pays.bankerPair)),
}

// ------------------------------------------------------------------ simulate

const game = new BaccaratGame({ seed: 0xbacc, bankroll: 1e15, rules: RULES })
const net: Record<BetName, number> = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 }
const sumSq: Record<BetName, number> = {
  player: 0,
  banker: 0,
  tie: 0,
  playerPair: 0,
  bankerPair: 0,
}
const counts: Record<Winner, number> = { player: 0, banker: 0, tie: 0 }
let naturals = 0

const t1 = Date.now()
for (let i = 0; i < ROUNDS; i++) {
  // One unit on all five spots, every coup: five samples for the price of one.
  for (const name of BET_NAMES) game.wagers[name] = 1
  game.deal()
  game.finishRound()

  const r = game.lastResult!
  counts[r.winner]++
  if (r.natural) naturals++
  for (const name of BET_NAMES) {
    const result = r.returned[name] - 1
    net[name] += result
    sumSq[name] += result * result
  }
}
const simMs = Date.now() - t1

// ------------------------------------------------------------------ report

console.log(`\nBaccarat — ${DECKS} decks, ${pct(RULES.commission)} commission on Banker\n`)
console.log(`  exact enumeration of the shoe (${enumMs} ms)`)
console.log(`    Player wins   ${wins.player.toFixed(6)}`)
console.log(`    Banker wins   ${wins.banker.toFixed(6)}`)
console.log(`    Ties          ${wins.tie.toFixed(6)}`)
console.log(`    total         ${(wins.player + wins.banker + wins.tie).toFixed(12)}`)
console.log(`    either pair   ${pPair.toFixed(6)}`)

console.log(`\n  ${ROUNDS.toLocaleString()} coups through the engine (${(simMs / 1000).toFixed(1)}s)`)
console.log(
  `    Player ${(counts.player / ROUNDS).toFixed(6)}   ` +
    `Banker ${(counts.banker / ROUNDS).toFixed(6)}   ` +
    `Tie ${(counts.tie / ROUNDS).toFixed(6)}   ` +
    `naturals ${(naturals / ROUNDS).toFixed(6)}`,
)

const ORDER: BetName[] = ['banker', 'player', 'tie', 'playerPair', 'bankerPair']
const NAME: Record<BetName, string> = {
  banker: 'Banker',
  player: 'Player',
  tie: 'Tie 8:1',
  playerPair: 'Player Pair 11:1',
  bankerPair: 'Banker Pair 11:1',
}

console.log('\n  bet                 published      exact      measured        2σ    delta')
let worst = 0
for (const name of ORDER) {
  const mean = net[name] / ROUNDS
  const stderr = Math.sqrt((sumSq[name] / ROUNDS - mean * mean) / ROUNDS)
  const measured = -mean
  const delta = measured - PUBLISHED[name]
  worst = Math.max(worst, Math.abs(delta))
  console.log(
    `  ${NAME[name].padEnd(18)}` +
      `${pct(PUBLISHED[name]).padStart(9)}` +
      `${pct(exact[name]).padStart(12)}` +
      `${pct(measured).padStart(12)}` +
      `${pct(2 * stderr).padStart(10)}` +
      `${(delta >= 0 ? '+' : '') + pct(delta)}`.padStart(10),
  )
}

console.log(
  `\n  Worst miss against the published figure: ${pct(worst)}.\n\n` +
    '  Banker wins more often than Player because the banker acts last and gets\n' +
    '  to draw against what the player did. The 5% commission is the house taking\n' +
    '  that advantage back, and slightly overtaking it.\n',
)
