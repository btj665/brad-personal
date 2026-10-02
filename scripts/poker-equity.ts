// How we know the poker room is right.
//
// Two artifacts, printed side by side with the published truth:
//
//   1. The equity table. The estimator's heads-up preflop reads against the
//      textbook numbers every solver agrees on. If these drift, the yardstick
//      itself is broken and nothing downstream can be trusted.
//
//   2. A bot-vs-bot session. Chips in must equal chips out over a long run (the
//      engine's conservation law), and the profiles must actually behave
//      differently — a loose-aggressive seat should voluntarily put money in the
//      pot far more often than a tight one (VPIP).
//
// Run it with: npx tsx scripts/poker-equity.ts

import { PokerGame } from '../src/pokerroom/engine'
import { estimateEquity, handOf } from '../src/pokerroom/equity'
import { botTuning, pokerBrain, pokerDraw } from '../src/pokerroom/bot'
import { ranker } from '../src/pokerroom/ranker'
import type { BotProfile } from '../src/pokerroom/types'
import { HOLDEM } from '../src/pokerroom/variants'

// ---------------------------------------------------------------- equity table

interface Matchup {
  label: string
  hero: string
  villain: string
  /** The published heads-up equity for the hero, as a fraction. */
  published: number
}

const MATCHUPS: Matchup[] = [
  { label: 'AA vs KK', hero: 'AsAh', villain: 'KsKh', published: 0.82 },
  { label: 'AKs vs 22 (coin flip)', hero: 'AsKs', villain: '2c2d', published: 0.5 },
  { label: 'AKo vs QQ', hero: 'AsKh', villain: 'QcQd', published: 0.43 },
  { label: '72o vs AA', hero: '7h2c', villain: 'AsAd', published: 0.12 },
  { label: 'JTs vs AKo', hero: 'Js10s', villain: 'AcKd', published: 0.42 },
  { label: 'QQ vs AKs', hero: 'QsQh', villain: 'AsKs', published: 0.54 },
]

function printEquityTable(): void {
  const N = 40000
  console.log('EQUITY — measured vs published (heads-up preflop, %s trials each)\n'.replace('%s', String(N)))
  console.log('  matchup                     measured   published   error')
  console.log('  ' + '-'.repeat(58))
  let worst = 0
  for (const m of MATCHUPS) {
    const measured = estimateEquity({
      hero: handOf(m.hero),
      opponents: [handOf(m.villain)],
      variant: HOLDEM,
      samples: N,
      seed: 20240517,
    })
    const err = Math.abs(measured - m.published)
    worst = Math.max(worst, err)
    console.log(
      '  ' +
        m.label.padEnd(28) +
        pct(measured).padStart(8) +
        pct(m.published).padStart(12) +
        (`${(err * 100).toFixed(1)}pt`).padStart(9),
    )
  }
  console.log('\n  worst deviation from published: ' + (worst * 100).toFixed(1) + ' points')
  console.log(worst < 0.02 ? '  PASS — inside Monte Carlo error.\n' : '  CHECK — larger than expected sampling error.\n')
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

// ---------------------------------------------------------------- the session

interface Style {
  name: string
  profile: BotProfile
}

const STYLES: Style[] = [
  { name: 'Rock (tight-passive)', profile: { looseness: 0.15, aggression: 0.2, bluff: 0.02, quips: [] } },
  { name: 'TAG (tight-aggressive)', profile: { looseness: 0.3, aggression: 0.65, bluff: 0.07, quips: [] } },
  { name: 'LAG (loose-aggressive)', profile: { looseness: 0.7, aggression: 0.8, bluff: 0.18, quips: [] } },
  { name: 'Station (loose-passive)', profile: { looseness: 0.8, aggression: 0.2, bluff: 0.03, quips: [] } },
  { name: 'Reg (balanced)', profile: { looseness: 0.4, aggression: 0.45, bluff: 0.08, quips: [] } },
]

function runSession(hands: number): void {
  const seats = STYLES.length
  const game = new PokerGame({
    variant: HOLDEM,
    ranker,
    brain: pokerBrain,
    botDraw: pokerDraw,
    seed: 777,
    bigBlind: 20,
    buyIn: 8000,
    humanSeat: -1,
    seats,
    bots: STYLES.map((s) => ({ name: s.name, profile: s.profile })),
  })

  const start = game.seats.reduce((a, s) => a + s.stack, 0)

  let played = 0
  for (let h = 0; h < hands; h++) {
    const eligible = game.seats.filter((s) => s.stack > 0).length
    if (eligible < 2) break
    game.startHand()
    game.playOut()
    played++

    const total = game.seats.reduce((a, s) => a + s.stack, 0)
    if (total !== start) {
      console.log(`  CONSERVATION BROKEN at hand ${h}: ${total} != ${start}`)
      return
    }
  }

  console.log('BOT-VS-BOT SESSION — ' + played + ' hands, ' + seats + ' seats\n')
  console.log('  chips at start: ' + start)
  console.log('  chips at end:   ' + game.seats.reduce((a, s) => a + s.stack, 0))
  console.log('  conserved:      ' + (game.seats.reduce((a, s) => a + s.stack, 0) === start ? 'YES' : 'NO'))
  console.log('\n  final stacks:')
  console.log('    seat                        stack     net')
  console.log('    ' + '-'.repeat(46))
  game.seats.forEach((s) => {
    const net = s.stack - 8000
    console.log(
      '    ' + s.name.padEnd(26) + String(s.stack).padStart(7) + (net >= 0 ? '  +' : '  ') + String(net).padStart(net >= 0 ? 5 : 6),
    )
  })

  // VPIP by measuring, over a fresh instrumented run, how often each style put
  // chips in voluntarily. Re-run to read the per-hand preflop action cleanly.
  measureVpip(hands)
}

/** A second run that watches the preflop log to compute each seat's VPIP — the
 *  headline read on how loose a style plays. */
function measureVpip(hands: number): void {
  const seats = STYLES.length
  const game = new PokerGame({
    variant: HOLDEM,
    ranker,
    brain: pokerBrain,
    botDraw: pokerDraw,
    seed: 2222,
    bigBlind: 20,
    buyIn: 100000, // deep, so nobody busts and every style keeps getting dealt in
    humanSeat: -1,
    seats,
    bots: STYLES.map((s) => ({ name: s.name, profile: s.profile })),
  })

  const dealt = new Array(seats).fill(0)
  const voluntary = new Array(seats).fill(0)

  for (let h = 0; h < hands; h++) {
    // Top everyone back up so nobody busts out of the sample: this run measures
    // how each style plays a hand, not who wins the session.
    for (const s of game.seats) s.stack = 100000
    game.startHand()
    // The forced money already posted (blinds) before anyone chooses to act.
    const forced = game.seats.map((s) => s.committed)
    game.playOut()
    game.seats.forEach((s, i) => {
      dealt[i]++
      // Voluntary = committed beyond the forced blind. A seat that folded the big
      // blind for free never got above it; one that called or raised did.
      if (s.committed > forced[i]) voluntary[i]++
    })
  }

  console.log('\n  VPIP by style (voluntary money in pot, ' + hands + ' hands):')
  console.log('    seat                        VPIP')
  console.log('    ' + '-'.repeat(38))
  STYLES.forEach((st, i) => {
    console.log('    ' + st.name.padEnd(26) + pct(voluntary[i] / dealt[i]).padStart(7))
  })

  const loose = voluntary[2] / dealt[2] // LAG
  const tight = voluntary[0] / dealt[0] // Rock
  console.log(
    '\n  loose-aggressive VPIP (' +
      pct(loose) +
      ') vs tight-passive (' +
      pct(tight) +
      '): ' +
      (loose > tight ? 'PASS — the loose seat plays far more hands.' : 'CHECK — profiles are not separating.'),
  )
}

// ---------------------------------------------------------------- main

console.log('='.repeat(64))
console.log('POKER — measured against known truth')
console.log('='.repeat(64) + '\n')
printEquityTable()
console.log('-'.repeat(64) + '\n')
// The session and VPIP reads don't need the equity table's fidelity; a lighter
// postflop sample keeps a few hundred hands quick without changing how the bots
// play in any way a human would notice.
botTuning.samples = 96
botTuning.preflopSamples = 96
runSession(300)
console.log('\n' + '='.repeat(64))
