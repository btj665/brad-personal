// Bonus rounds.
//
// Every one of these is decided the instant it is triggered. The wheel already
// knows where it stops; the pick board is already dealt; the respins have already
// been rolled. The player's clicks choose the order of the reveal, not the total.
//
// That is deliberate, and it is what the real cabinets do — a pick bonus that
// genuinely depended on which box you touched could not have a stated return, and
// the whole point of this repository is that every game can state its return and
// be held to it. `paid` here goes straight into the spin's total, so a bonus is
// measured by the same `slots:rtp` sweep as everything else.

import type { Rng } from '../engine/rng'
import type { Bonus, BonusPlay } from './types'

/** Fisher–Yates on a copy, off the seeded stream so a bonus replays with its spin. */
function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

/** Pick one entry by weight. */
function weighted(coins: Array<{ value: number; weight: number }>, rng: Rng): number {
  let total = 0
  for (const c of coins) total += c.weight
  let roll = rng.next() * total
  for (const c of coins) {
    roll -= c.weight
    if (roll <= 0) return c.value
  }
  return coins[coins.length - 1].value
}

function playWheel(bonus: Extract<Bonus, { kind: 'wheel' }>, stake: number, rng: Rng): BonusPlay {
  const wedge = rng.int(bonus.wedges.length)
  return { kind: 'wheel', wedge, paid: bonus.wedges[wedge] * stake }
}

/** Turn boxes over until a dud shows up. The award is decided by the board's
 *  composition — how many prizes against how many duds — and nothing else, which
 *  is why the player choosing boxes doesn't change the price of the feature. */
function playPick(bonus: Extract<Bonus, { kind: 'pick' }>, stake: number, rng: Rng): BonusPlay {
  const board = shuffled(
    [
      ...bonus.prizes.map((p) => p * stake),
      ...new Array<number>(bonus.enders).fill(0),
    ],
    rng,
  )

  const reveals: number[] = []
  for (const value of board) {
    reveals.push(value)
    if (value === 0) break // a dud, and the round is over
  }

  return {
    kind: 'pick',
    reveals,
    missed: board.slice(reveals.length),
    paid: reveals.reduce((a, b) => a + b, 0),
  }
}

/** Coins lock in place and every new one buys the respins back. Runs until the
 *  respins are spent or the screen is full — which is the whole appeal, and also
 *  why the coin chance has to be kept low or it never stops. */
function playHoldSpin(
  bonus: Extract<Bonus, { kind: 'holdSpin' }>,
  stake: number,
  cells: number,
  seeded: number,
  rng: Rng,
): BonusPlay {
  const grid: Array<number | null> = new Array(cells).fill(null)

  // The symbols that triggered it are already coins.
  for (let i = 0; i < seeded && i < cells; i++) grid[i] = weighted(bonus.coins, rng) * stake

  const grids: Array<Array<number | null>> = [grid.slice()]
  let respinsLeft = bonus.respins

  while (respinsLeft > 0 && grid.some((c) => c === null)) {
    respinsLeft--
    let landed = 0
    for (let i = 0; i < cells; i++) {
      if (grid[i] !== null) continue
      if (rng.next() < bonus.coinChance) {
        grid[i] = weighted(bonus.coins, rng) * stake
        landed++
      }
    }
    grids.push(grid.slice())
    if (landed > 0) respinsLeft = bonus.respins
  }

  const full = grid.every((c) => c !== null)
  const coins = grid.reduce<number>((a, c) => a + (c ?? 0), 0)
  return {
    kind: 'holdSpin',
    grids,
    full,
    paid: coins + (full ? bonus.fullScreen * stake : 0),
  }
}

/** Play whichever bonus this is. `seeded` is how many trigger symbols were on the
 *  screen, which hold-and-spin starts from and the others ignore. */
export function playBonus(
  bonus: Bonus,
  stake: number,
  cells: number,
  seeded: number,
  rng: Rng,
): BonusPlay {
  switch (bonus.kind) {
    case 'wheel':
      return playWheel(bonus, stake, rng)
    case 'pick':
      return playPick(bonus, stake, rng)
    case 'holdSpin':
      return playHoldSpin(bonus, stake, cells, seeded, rng)
  }
}

// ---------------------------------------------------------------- the price

/** The exact expected award of a wheel, in multiples of the stake. Every wedge is
 *  equally likely, so this is just the mean. */
export function wheelValue(bonus: Extract<Bonus, { kind: 'wheel' }>): number {
  return bonus.wedges.reduce((a, b) => a + b, 0) / bonus.wedges.length
}

/** The exact expected award of a pick round, in multiples of the stake.
 *
 *  Closed form rather than sampled. With `p` prizes and `d` duds shuffled
 *  together, consider one particular prize: it is collected exactly when it comes
 *  before all `d` duds. Those `d + 1` cards are in uniform random order, so that
 *  happens with probability 1/(d + 1) — independent of `p`, and of where the other
 *  prizes fall. So the expected take is simply the whole prize pool divided by
 *  (duds + 1). */
export function pickValue(bonus: Extract<Bonus, { kind: 'pick' }>): number {
  const pool = bonus.prizes.reduce((a, b) => a + b, 0)
  return pool / (bonus.enders + 1)
}
