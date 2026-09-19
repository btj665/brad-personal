import { describe, expect, it } from 'vitest'

import { splitPot, splitTotal, type Split } from './pots'

const commit = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]))
const folded = (...s: number[]) => new Set(s)

/** Every split must conserve chips: pots + refunds == total committed. */
function conserves(split: Split, committed: Record<number, number>) {
  const total = Object.values(committed).reduce((a, b) => a + b, 0)
  expect(splitTotal(split)).toBe(total)
}

describe('splitPot', () => {
  it('makes one pot when everyone matched', () => {
    const c = { 0: 100, 1: 100, 2: 100 }
    const s = splitPot(commit(c), folded())
    expect(s.pots).toEqual([{ amount: 300, eligible: [0, 1, 2] }])
    expect(s.refunds.size).toBe(0)
    conserves(s, c)
  })

  it('returns an uncalled bet — everyone folds to a raise', () => {
    // 0 bets 100, blinds already in for 5 and 10, both fold.
    const c = { 0: 100, 1: 5, 2: 10 }
    const s = splitPot(commit(c), folded(1, 2))
    // 0 is refunded the 90 above the next-highest, and wins a pot of the rest.
    expect(s.refunds.get(0)).toBe(90)
    expect(s.pots).toEqual([{ amount: 25, eligible: [0] }])
    conserves(s, c)
  })

  it('layers one short all-in into a main and a side pot', () => {
    // 1 is all-in for 50; 0 and 2 keep betting to 120.
    const c = { 0: 120, 1: 50, 2: 120 }
    const s = splitPot(commit(c), folded())
    // Main pot: 50 from each of three = 150, all eligible.
    // Side pot: 70 from each of 0 and 2 = 140, only they are eligible.
    expect(s.pots).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 140, eligible: [0, 2] },
    ])
    conserves(s, c)
  })

  it('makes three pots from two all-ins at different depths', () => {
    // 0 all-in 30, 1 all-in 80, 2 covers to 200 (uncalled top comes back first).
    const c = { 0: 30, 1: 80, 2: 200 }
    const s = splitPot(commit(c), folded())
    // 2's top 120 over 1's 80 is uncalled → refunded, 2 effectively at 80.
    expect(s.refunds.get(2)).toBe(120)
    expect(s.pots).toEqual([
      { amount: 90, eligible: [0, 1, 2] }, // 30 × 3
      { amount: 100, eligible: [1, 2] }, // 50 × 2
    ])
    conserves(s, c)
  })

  it('keeps a folded player’s chips in the pot as dead money', () => {
    // 2 called 100 then is not folded; 3 put in 40 and folded.
    const c = { 0: 100, 1: 100, 3: 40 }
    const s = splitPot(commit(c), folded(3))
    // 40 layer: contributors 0,1,3 → 120, eligible 0,1.
    // 60 layer: contributors 0,1 → 120, eligible 0,1. Merged.
    expect(s.pots).toEqual([{ amount: 240, eligible: [0, 1] }])
    conserves(s, c)
  })

  it('handles the short all-in also having folded neighbours', () => {
    // 0 all-in 25; 1 folds after putting 25; 2 and 3 go to 90.
    const c = { 0: 25, 1: 25, 2: 90, 3: 90 }
    const s = splitPot(commit(c), folded(0 === 0 ? 1 : -1))
    // 25 layer: four contributors = 100, eligible 0,2,3 (1 folded).
    // 65 layer: 2,3 = 130, eligible 2,3.
    expect(s.pots).toEqual([
      { amount: 100, eligible: [0, 2, 3] },
      { amount: 130, eligible: [2, 3] },
    ])
    conserves(s, c)
  })

  it('never lets a layer no one can win orphan chips', () => {
    // Contrived: 0 all-in 50 then folds (dead), 1 in for 50. The 50 layer has one
    // eligible seat; nothing is orphaned and chips conserve.
    const c = { 0: 50, 1: 50 }
    const s = splitPot(commit(c), folded(0))
    expect(s.pots).toEqual([{ amount: 100, eligible: [1] }])
    conserves(s, c)
  })

  it('ignores seats that never put money in', () => {
    const c = { 0: 100, 1: 100, 2: 0 }
    const s = splitPot(commit(c), folded())
    expect(s.pots).toEqual([{ amount: 200, eligible: [0, 1] }])
    conserves(s, c)
  })

  it('conserves chips across a thousand random commitments', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let t = 0; t < 1000; t++) {
      const n = 2 + Math.floor(rnd() * 6)
      const c: Record<number, number> = {}
      const f = new Set<number>()
      for (let i = 0; i < n; i++) {
        c[i] = Math.floor(rnd() * 300)
        if (rnd() < 0.4) f.add(i)
      }
      // At least one seat must be live, or there is no hand to settle.
      if ([...Array(n).keys()].every((i) => f.has(i))) f.delete(0)
      const s = splitPot(commit(c), f)
      conserves(s, c)
      // Every pot must have someone who can win it.
      for (const p of s.pots) expect(p.eligible.length).toBeGreaterThan(0)
    }
  })
})
