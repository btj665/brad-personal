// Auditing the bonus rounds.
//
// Three mechanics, three different kinds of claim to check:
//
//   · a wheel is a uniform draw, so it can be checked wedge by wedge,
//   · a pick board has a closed-form price whose derivation is short enough to
//     be wrong in a way that looks right, so the closed form is checked against a
//     long simulation of the thing it claims to price,
//   · a hold-and-spin has no closed form at all, so what is checked is that it
//     terminates, that it re-grants respins only when it should, and that the
//     full-screen award is paid exactly when the screen filled.
//
// Where the closed form and the simulation disagree, the closed form is the one
// to trust — after re-deriving it. `pickValue` is an identity, not an estimate:
// with `d` enders, one particular prize is collected exactly when it precedes all
// `d` of them, and those `d + 1` items are in uniform random order, so it is
// collected with probability 1/(d + 1) whatever the rest of the board does. The
// expected take is therefore the whole pool over `d + 1`, and the number of
// prizes does not enter it. A simulation that disagrees is a simulation that has
// not run long enough.

import { describe, expect, it } from 'vitest'

import { makeRng } from '../engine/rng'
import { pickValue, playBonus, wheelValue } from './bonus'
import { resolveSpin } from './machine'
import { MACHINES } from './machines'
import { BARS } from './machines/bars'
import { BELL } from './machines/bell'
import { LATESHOW } from './machines/lateshow'
import { ROCKSLIDE } from './machines/rockslide'
import { exactBaseReturn, screenCountDistribution } from './rtp'
import type { Bonus, Machine, SymbolId } from './types'

/** Every cabinet's own bonus, narrowed to the kind it is — and throwing rather
 *  than skipping if it is not, so a cabinet that quietly loses its round fails
 *  these tests instead of passing them vacuously. */
function bonusOf<K extends Bonus['kind']>(machine: Machine, kind: K): Extract<Bonus, { kind: K }> {
  const bonus = machine.bonus
  if (!bonus) throw new Error(`${machine.id} has no bonus`)
  if (bonus.kind !== kind) throw new Error(`${machine.id} is a ${bonus.kind}, not a ${kind}`)
  return bonus as Extract<Bonus, { kind: K }>
}

/** How often the paid screen buys the round, exactly — the same convolution
 *  `rtp.ts` uses for scatter pays, which is what makes a bonus's contribution to
 *  return a closed form rather than a measurement. */
function triggerProbability(machine: Machine): number {
  const bonus = machine.bonus
  if (!bonus) return 0
  const dist = screenCountDistribution(machine, bonus.trigger)
  return dist.slice(bonus.triggerCount).reduce((a, b) => a + b, 0)
}

const CELLS = (m: Machine): number => m.strips.length * m.rows

// ---------------------------------------------------------------- the wheel

describe('the wheel', () => {
  const wheel = bonusOf(BARS, 'wheel')

  it('pays the wedge it stopped on, whatever wedge that is', () => {
    // Twenty-four spins of the wheel off one stream: each has to name a wedge
    // that exists and pay exactly that wedge times the stake.
    const rng = makeRng(0x2468)
    for (let i = 0; i < 24; i++) {
      const play = playBonus(wheel, 7, CELLS(BARS), 3, rng)
      expect(play.kind).toBe('wheel')
      expect(play.wedge).toBeGreaterThanOrEqual(0)
      expect(play.wedge).toBeLessThan(wheel.wedges.length)
      expect(play.paid).toBe(wheel.wedges[play.wedge ?? -1] * 7)
    }
  })

  it('scales with the stake and nothing else', () => {
    const a = playBonus(wheel, 1, CELLS(BARS), 3, makeRng(99))
    const b = playBonus(wheel, 40, CELLS(BARS), 3, makeRng(99))
    expect(b.wedge).toBe(a.wedge)
    expect(b.paid).toBe(a.paid * 40)
  })

  it('is worth its own mean, and a long run of it says so', () => {
    expect(wheelValue(wheel)).toBeCloseTo(
      wheel.wedges.reduce((a, b) => a + b, 0) / wheel.wedges.length,
      12,
    )

    const rng = makeRng(0x1357)
    const seen = new Array<number>(wheel.wedges.length).fill(0)
    let paid = 0
    const spins = 400_000
    for (let i = 0; i < spins; i++) {
      const play = playBonus(wheel, 1, CELLS(BARS), 3, rng)
      seen[play.wedge ?? -1]++
      paid += play.paid
    }

    // Every wedge is equally likely, which is the whole reason the mean is the
    // price. A wheel with a wedge it never stops on is not this wheel.
    for (const count of seen) expect(count / spins).toBeCloseTo(1 / wheel.wedges.length, 2)
    expect(paid / spins).toBeCloseTo(wheelValue(wheel), 0)
  })

  it('has a top wedge worth more than the rest of the wheel put together', () => {
    // The shape of the thing, asserted so a future edit that flattens it says so:
    // three wedges out of twenty-four carry most of the value.
    const sorted = [...wheel.wedges].sort((a, b) => b - a)
    const top3 = sorted.slice(0, 3).reduce((a, b) => a + b, 0)
    const rest = sorted.slice(3).reduce((a, b) => a + b, 0)
    expect(top3).toBeGreaterThan(rest)
  })
})

// ---------------------------------------------------------------- the pick

describe('a pick round', () => {
  const boards: Array<[string, Extract<Bonus, { kind: 'pick' }>, Machine]> = [
    ['Rockslide boulders', bonusOf(ROCKSLIDE, 'pick'), ROCKSLIDE],
    ['Late Show doors', bonusOf(LATESHOW, 'pick'), LATESHOW],
  ]

  it.each(boards)('%s — ends on an ender, or by running the board out', (_label, pick, machine) => {
    const rng = makeRng(0x1a1a)
    for (let i = 0; i < 20_000; i++) {
      const play = playBonus(pick, 3, CELLS(machine), pick.triggerCount, rng)
      const reveals = play.reveals ?? []
      expect(reveals.length).toBeGreaterThan(0)

      // Only the last reveal may be an ender. Anything earlier would mean the
      // round carried on past the thing that is supposed to stop it.
      for (const value of reveals.slice(0, -1)) expect(value).toBeGreaterThan(0)
      const last = reveals[reveals.length - 1]
      const exhausted = reveals.length === pick.prizes.length + pick.enders
      expect(last === 0 || exhausted).toBe(true)
    }
  })

  it.each(boards)('%s — reveals plus missed is the whole board, every time', (_label, pick, machine) => {
    const dealt = [...pick.prizes.map((p) => p * 3), ...new Array<number>(pick.enders).fill(0)].sort(
      (a, b) => a - b,
    )
    const rng = makeRng(0x2b2b)

    for (let i = 0; i < 20_000; i++) {
      const play = playBonus(pick, 3, CELLS(machine), pick.triggerCount, rng)
      const all = [...(play.reveals ?? []), ...(play.missed ?? [])].sort((a, b) => a - b)
      // Not just the right size — the same multiset. A board that dealt two of a
      // prize, or dropped one, would pass a length check and fail this.
      expect(all).toEqual(dealt)
      expect(play.paid).toBe((play.reveals ?? []).reduce((a, b) => a + b, 0))
    }
  })

  it.each(boards)('%s — the closed form matches a long simulation of it', (_label, pick, machine) => {
    // 600k rounds. The award's standard deviation is a few stakes, so this pins
    // the mean to a hundredth or two — enough to catch a closed form that is off
    // by a prize or by an ender, which is the mistake worth catching.
    const rng = makeRng(0x3c3c)
    const rounds = 600_000
    let paid = 0
    let sumSq = 0
    for (let i = 0; i < rounds; i++) {
      const play = playBonus(pick, 1, CELLS(machine), pick.triggerCount, rng)
      paid += play.paid
      sumSq += play.paid * play.paid
    }
    const mean = paid / rounds
    const stderr = Math.sqrt(Math.max(sumSq / rounds - mean * mean, 0) / rounds)

    expect(pickValue(pick)).toBeCloseTo(
      pick.prizes.reduce((a, b) => a + b, 0) / (pick.enders + 1),
      12,
    )
    expect(Math.abs(mean - pickValue(pick))).toBeLessThan(4 * stderr)
  }, 20_000)

  it('is worth its pool over its enders regardless of how the pool is split up', () => {
    // The derivation says the number of prizes cannot matter, only their total
    // and the ender count. Two boards with the same pool and the same enders,
    // one of nine prizes and one of two, therefore have to price the same — and
    // simulate the same. This is the claim that makes `pickValue` a closed form
    // rather than a coincidence of one board's shape.
    const shapes: Array<Extract<Bonus, { kind: 'pick' }>> = [
      { kind: 'pick', trigger: 'BON', triggerCount: 3, prizes: [1, 2, 3, 4, 5, 8, 10, 15, 30], enders: 3 },
      { kind: 'pick', trigger: 'BON', triggerCount: 3, prizes: [8, 70], enders: 3 },
      { kind: 'pick', trigger: 'BON', triggerCount: 3, prizes: new Array<number>(78).fill(1), enders: 3 },
    ]
    for (const shape of shapes) expect(pickValue(shape)).toBeCloseTo(19.5, 12)

    for (const shape of shapes) {
      const rng = makeRng(0x4d4d)
      let paid = 0
      const rounds = 200_000
      for (let i = 0; i < rounds; i++) paid += playBonus(shape, 1, 20, 3, rng).paid
      expect(paid / rounds).toBeCloseTo(19.5, 0)
    }
  }, 20_000)

  it('never collects anything at all when the board is nothing but enders', () => {
    const allEnders: Extract<Bonus, { kind: 'pick' }> = {
      kind: 'pick',
      trigger: 'BON',
      triggerCount: 3,
      prizes: [],
      enders: 5,
    }
    expect(pickValue(allEnders)).toBe(0)
    const play = playBonus(allEnders, 10, 20, 3, makeRng(1))
    expect(play.reveals).toEqual([0])
    expect(play.paid).toBe(0)
  })

  it('clears the whole board when there is nothing to end it', () => {
    const noEnders: Extract<Bonus, { kind: 'pick' }> = {
      kind: 'pick',
      trigger: 'BON',
      triggerCount: 3,
      prizes: [1, 2, 3],
      enders: 0,
    }
    expect(pickValue(noEnders)).toBe(6)
    const play = playBonus(noEnders, 10, 20, 3, makeRng(1))
    expect(play.missed).toEqual([])
    expect(play.paid).toBe(60)
  })
})

// ---------------------------------------------------------------- hold and spin

describe('a hold-and-spin', () => {
  const hold = bonusOf(BELL, 'holdSpin')
  const cells = CELLS(BELL)
  const coinValues = new Set(hold.coins.map((c) => c.value))

  it('starts with the bells that triggered it already locked', () => {
    for (const seeded of [6, 7, 8, 9, 10]) {
      const play = playBonus(hold, 1, cells, seeded, makeRng(0x5e5e + seeded))
      const opening = (play.grids ?? [])[0]
      expect(opening).toHaveLength(cells)
      expect(opening.filter((c) => c !== null)).toHaveLength(seeded)
      for (const cell of opening) if (cell !== null) expect(coinValues.has(cell)).toBe(true)
    }
  })

  it('terminates, and pays exactly the coins on the final grid', () => {
    const rng = makeRng(0x6f6f)
    let worst = 0
    for (let i = 0; i < 50_000; i++) {
      const play = playBonus(hold, 1, cells, 6, rng)
      const grids = play.grids ?? []
      const last = grids[grids.length - 1]
      worst = Math.max(worst, grids.length)

      const coins = last.reduce<number>((a, c) => a + (c ?? 0), 0)
      expect(play.paid).toBe(coins + (play.full ? hold.fullScreen : 0))
      expect(play.full).toBe(last.every((c) => c !== null))
    }
    // A coin chance of 0.08 over nine empty cells is 0.72 coins a respin, so the
    // walk drifts towards ending. If it ever stopped doing that this is the
    // assertion that would say so rather than the suite hanging.
    expect(worst).toBeLessThan(80)
  }, 30_000)

  it('locks a coin once and never moves or replaces it', () => {
    const rng = makeRng(0x7070)
    for (let i = 0; i < 10_000; i++) {
      const grids = playBonus(hold, 1, cells, 6, rng).grids ?? []
      for (let g = 1; g < grids.length; g++) {
        for (let c = 0; c < cells; c++) {
          if (grids[g - 1][c] !== null) expect(grids[g][c]).toBe(grids[g - 1][c])
        }
      }
    }
  }, 30_000)

  it('re-grants the respins only when a coin actually landed', () => {
    const rng = makeRng(0x8181)
    let sawReset = false

    for (let i = 0; i < 20_000; i++) {
      const grids = playBonus(hold, 1, cells, 6, rng).grids ?? []
      const filled = grids.map((g) => g.filter((c) => c !== null).length)
      const full = filled[filled.length - 1] === cells

      // Walk the round the way the mechanic describes it and check the length of
      // the grid list against it, rather than trusting the implementation to
      // agree with itself.
      let left = hold.respins
      let respins = 0
      for (let g = 1; g < filled.length; g++) {
        expect(left).toBeGreaterThan(0)
        left--
        respins++
        if (filled[g] > filled[g - 1]) {
          left = hold.respins
          sawReset = true
        }
      }
      expect(respins).toBe(grids.length - 1)

      // The round stops for one of exactly two reasons, and this is what pins
      // "re-granted in full" down: unless the screen filled, the last three
      // respins have to have been dead ones.
      if (!full) {
        expect(left).toBe(0)
        const tail = filled.slice(-1 - hold.respins)
        expect(tail[tail.length - 1]).toBe(tail[0])
      }
    }
    expect(sawReset).toBe(true)
  }, 30_000)

  it('pays the full-screen award exactly when every cell filled, and never otherwise', () => {
    const rng = makeRng(0x9292)
    let fulls = 0
    let rounds = 0
    for (let i = 0; i < 200_000; i++) {
      const play = playBonus(hold, 1, cells, 6, rng)
      rounds++
      const last = (play.grids ?? [])[(play.grids ?? []).length - 1]
      const complete = last.every((c) => c !== null)
      const coins = last.reduce<number>((a, c) => a + (c ?? 0), 0)
      expect(play.full).toBe(complete)
      if (complete) {
        fulls++
        expect(play.paid).toBe(coins + hold.fullScreen)
        expect(play.paid).toBeGreaterThanOrEqual(hold.fullScreen + cells * Math.min(...coinValues))
      } else {
        // Not "less than fullScreen" — fourteen top coins would beat it. The claim
        // is that the award simply isn't in there.
        expect(play.paid).toBe(coins)
      }
    }
    // Measured at once in fifty rounds; the band is wide enough not to flake and
    // tight enough to notice the jackpot going missing or becoming routine.
    expect(fulls / rounds).toBeGreaterThan(0.012)
    expect(fulls / rounds).toBeLessThan(0.030)
  }, 30_000)

  it('is worth the thirty stakes Bell Ringer was cut around', () => {
    // The one feature in the building with no closed form, so this is a
    // measurement and is quoted as one. Priced per seeded bell count and weighted
    // by the exactly-enumerated conditional distribution of that count, because
    // seven bells is worth more than six and the mix matters.
    const dist = screenCountDistribution(BELL, 'BL')
    const pTrigger = triggerProbability(BELL)
    const rounds = 120_000

    let value = 0
    let variance = 0
    for (let seeded = hold.triggerCount; seeded < dist.length; seeded++) {
      if (!dist[seeded]) continue
      const rng = makeRng(0xa3a3 + seeded)
      let paid = 0
      let sumSq = 0
      for (let i = 0; i < rounds; i++) {
        const p = playBonus(hold, 1, cells, seeded, rng).paid
        paid += p
        sumSq += p * p
      }
      const mean = paid / rounds
      const w = dist[seeded] / pTrigger
      value += w * mean
      variance += w * w * (Math.max(sumSq / rounds - mean * mean, 0) / rounds)
      // More bells locked is more coins kept, on every count.
      expect(mean).toBeGreaterThan(20)
    }

    const stderr = Math.sqrt(variance)
    expect(stderr).toBeLessThan(0.5)
    expect(Math.abs(value - 30.1779)).toBeLessThan(4 * stderr)
    // And the contribution that Bell Ringer's ladder was cut against.
    expect(pTrigger * value).toBeCloseTo(0.0968, 3)
  }, 60_000)
})

// ---------------------------------------------------------------- the trigger

describe('the trigger is the paid screen and nothing else', () => {
  const withBonus = MACHINES.filter((m) => m.bonus)

  it('gives every cabinet a bonus', () => {
    expect(withBonus).toHaveLength(MACHINES.length)
    expect(withBonus.map((m) => m.bonus?.kind).sort()).toEqual(['holdSpin', 'pick', 'pick', 'wheel'])
  })

  it.each(withBonus.map((m) => [m.label, m] as const))(
    '%s — awards at most one bonus a spin, and only when the first screen bought it',
    (_label, machine) => {
      const bonus = machine.bonus
      if (!bonus) throw new Error('filtered above')
      const rng = makeRng(0xb4b4)
      let triggers = 0

      for (let spin = 0; spin < 40_000; spin++) {
        const result = resolveSpin(machine, 1, rng)
        const onPaidScreen = result.steps[0].window
          .flat()
          .filter((id) => id === bonus.trigger).length
        const bought = onPaidScreen >= bonus.triggerCount

        // `bonus` is a single field, so "never twice in one spin" is structural;
        // what has to be checked is that it is present exactly when the paid
        // screen bought it, and absent otherwise.
        expect(Boolean(result.bonus)).toBe(bought)
        if (result.bonus) {
          triggers++
          expect(result.bonus.kind).toBe(bonus.kind)
          // And that its award is inside the spin's total rather than beside it.
          const steps = result.steps.reduce((a, s) => a + s.paid, 0)
          expect(result.paid).toBeCloseTo(steps + result.bonus.paid, 8)
        }
      }

      expect(triggers).toBeGreaterThan(20)
    },
    30_000,
  )

  it('will not let a free game buy a bonus, however many triggers it deals', () => {
    // Three-stop strips are shown whole in a three-row window, so every screen
    // this rig can deal — the ten free games included — carries three marquees
    // and three stage doors. The paid screen buys one round of each; the ten free
    // ones buy nothing, because `resolveSpin` reads both triggers off `steps[0]`.
    const both: SymbolId[] = ['mrq', 'BON', '-']
    const blank: SymbolId[] = ['-', '-', '-']
    const rigged: Machine = { ...LATESHOW, strips: [both, both, both, blank, blank] }
    const result = resolveSpin(rigged, 1, makeRng(77))

    expect(result.freeSpinsAwarded).toBe(10)
    expect(result.steps.filter((s) => s.free)).toHaveLength(10)
    expect(result.bonus?.kind).toBe('pick')
    for (const step of result.steps) {
      expect(step.window.flat().filter((id) => id === 'BON')).toHaveLength(3)
    }
  })

  it('will not let a cascade buy a bonus on a screen the boulders fell into', () => {
    // Reel three is the only reel that moves, so the opening screen is known and
    // every cascade after it refills from strips that are nothing but boulders.
    // The trigger is still read once, off the first drop.
    const rigged: Machine = {
      ...ROCKSLIDE,
      symbols: [
        { id: 'A', label: 'A' },
        { id: 'BON', label: 'BON' },
        { id: '-', label: '' },
      ],
      strips: [['A'], ['A'], ['A', '-'], ['BON'], ['BON']],
      lines: [[0, 0, 0, 0, 0]],
      linePays: { A: [0, 0, 0, 5] },
      scatterPays: undefined,
    }

    let chains = 0
    for (const seed of [3, 4, 27, 739]) {
      const result = resolveSpin(rigged, 1, makeRng(seed))
      // Eight boulders on screen from reels four and five alone, every step of
      // the way — and no bonus, because the trigger needs three on the *paid*
      // screen and this rig has them on every screen including that one.
      expect(result.steps[0].window[3]).toEqual(['BON', 'BON', 'BON', 'BON'])
      expect(result.bonus?.kind).toBe('pick')
      // One award, not one per cascade: the pick's own reveal list is a single
      // board, and the spin's total is the steps plus that one board.
      const steps = result.steps.reduce((a, s) => a + s.paid, 0)
      expect(result.paid).toBeCloseTo(steps + (result.bonus?.paid ?? 0), 8)
      if (result.steps.length > 1) chains++
    }
    expect(chains).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------- the strips

describe('the bonus symbol is dead space', () => {
  const bonusSymbol = MACHINES.filter((m) => m.bonus?.trigger === 'BON')

  it.each(bonusSymbol.map((m) => [m.label, m] as const))(
    '%s — is declared, is on every reel, pays no line, and is not a scatter',
    (_label, machine) => {
      const symbol = machine.symbols.find((s) => s.id === 'BON')
      expect(symbol).toBeDefined()
      expect(symbol?.scatter).toBeUndefined()
      expect(symbol?.wild).toBeUndefined()
      // A blocker with a line pay would be a paying symbol, and a scatter would
      // be paid twice — once by `scatterPays` and once by the round.
      expect(machine.linePays.BON).toBeUndefined()
      expect(machine.scatterPays?.BON).toBeUndefined()
      for (const strip of machine.strips) expect(strip.filter((id) => id === 'BON').length).toBeGreaterThan(0)
    },
  )

  it.each(bonusSymbol.map((m) => [m.label, m] as const))(
    '%s — costs nothing at the pay table, because it replaced blanks',
    (_label, machine) => {
      // The strips with every boulder or door turned back into a blank. The
      // enumerated return has to be identical, which is the whole reason adding
      // the symbol did not move any of these cabinets' base figures: the
      // evaluator cannot tell the two apart.
      const asBlanks: Machine = {
        ...machine,
        strips: machine.strips.map((strip) => strip.map((id) => (id === 'BON' ? '-' : id))),
      }
      expect(exactBaseReturn(asBlanks)).toBeCloseTo(exactBaseReturn(machine), 12)
    },
  )
})
