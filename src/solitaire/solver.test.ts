import { describe, expect, it } from 'vitest'

import type { Card } from '../engine/types'
import { Solitaire } from './game'
import { canonicalHash, solve, solveDeal } from './solver'
import { variantById } from './variants'

let uid = 0
const c = (spec: string): Card => {
  const suit = spec.slice(-1).toUpperCase() as Card['suit']
  const rank = spec.slice(0, -1) as Card['rank']
  return { uid: uid++, rank, suit }
}

const RANKS_UP = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

describe('the solver reaches a verdict', () => {
  it('wins a nearly-finished position almost instantly', () => {
    const g = new Solitaire({ variant: variantById('freecell'), seed: 1 })
    // Foundations built to the queen in every suit; the four kings sit waiting in
    // the tableau. Safe auto-play finishes it with no real search.
    for (const p of g.piles) p.cards = []
    const suits: Card['suit'][] = ['S', 'H', 'D', 'C']
    g.piles
      .filter((p) => p.kind === 'foundation')
      .forEach((p, i) => {
        p.cards = RANKS_UP.slice(0, 12).map((r) => ({ card: c(`${r}${suits[i]}`), faceUp: true }))
      })
    g.piles
      .filter((p) => p.kind === 'tableau')
      .slice(0, 4)
      .forEach((p, i) => {
        p.cards = [{ card: c(`K${suits[i]}`), faceUp: true }]
      })

    const result = solve(g, { nodeBudget: 1000 })
    expect(result.verdict).toBe('won')
    expect(result.nodes).toBeLessThan(50)
  })

  it('calls a dead position a loss, not a give-up', () => {
    // Klondike only lets a king into an empty column, so a lone low card with an
    // empty stock and no redeals has nowhere to go and is genuinely lost.
    const g = new Solitaire({ variant: variantById('klondike-1'), seed: 1 })
    for (const p of g.piles) p.cards = []
    g.redealsLeft = 0
    g.get('tableau-0')!.cards = [{ card: c('5C'), faceUp: true }]

    expect(g.legalMoves()).toHaveLength(0)
    const result = solve(g, { nodeBudget: 1000 })
    expect(result.verdict).toBe('lost')
    expect(result.nodes).toBeLessThan(5)
  })
})

describe('the canonical hash', () => {
  it('is stable: the same position hashes the same', () => {
    const a = new Solitaire({ variant: variantById('freecell'), seed: 99 })
    const b = new Solitaire({ variant: variantById('freecell'), seed: 99 })
    expect(canonicalHash(a)).toBe(canonicalHash(b))
    // ...and is a pure function of the board, so re-reading it doesn't drift.
    expect(canonicalHash(a)).toBe(canonicalHash(a))
  })

  it('distinguishes genuinely different positions', () => {
    const g = new Solitaire({ variant: variantById('klondike-1'), seed: 7 })
    const before = canonicalHash(g)
    const mv = g.legalMoves()[0]
    expect(mv).toBeDefined()
    g.move(mv.from, mv.to, mv.count)
    expect(canonicalHash(g)).not.toBe(before)
    g.undo()
    // Undo returns to the same board, so back to the same hash.
    expect(canonicalHash(g)).toBe(before)
  })

  it('folds together column orderings but not card differences', () => {
    const g1 = new Solitaire({ variant: variantById('freecell'), seed: 3 })
    for (const p of g1.piles) p.cards = []
    g1.get('tableau-0')!.cards = [{ card: c('5H'), faceUp: true }]
    g1.get('tableau-1')!.cards = [{ card: c('9S'), faceUp: true }]

    const g2 = new Solitaire({ variant: variantById('freecell'), seed: 3 })
    for (const p of g2.piles) p.cards = []
    // Same two cards, swapped between columns — an interchangeable arrangement.
    g2.get('tableau-0')!.cards = [{ card: c('9S'), faceUp: true }]
    g2.get('tableau-1')!.cards = [{ card: c('5H'), faceUp: true }]
    expect(canonicalHash(g1)).toBe(canonicalHash(g2))

    // A different card really is a different position.
    g2.get('tableau-1')!.cards = [{ card: c('6H'), faceUp: true }]
    expect(canonicalHash(g1)).not.toBe(canonicalHash(g2))
  })
})

// A Solitaire that flags any move it is asked to make illegally, so we can prove
// the search only ever plays legal moves.
class MoveAudit extends Solitaire {
  illegal = 0
  override move(from: string, to: string, count = 1): boolean {
    if (!this.canMove(from, to, count)) this.illegal++
    return super.move(from, to, count)
  }
}

describe('the solver plays only legal moves', () => {
  it('never asks the engine for a move it cannot make', () => {
    for (const id of ['freecell', 'klondike-1', 'spider-1']) {
      const g = new MoveAudit({ variant: variantById(id), seed: 5 })
      solve(g, { nodeBudget: 3000 })
      expect(g.illegal).toBe(0)
    }
  })
})

describe('the solver is deterministic', () => {
  // Six real solves at a 4,000-node budget run past vitest's 5s default, so give
  // it room. The point is the invariant — same variant and seed, same verdict and
  // same node count — not the wall-clock.
  it('gives the same verdict for the same variant and seed', { timeout: 30000 }, () => {
    for (const id of ['freecell', 'klondike-1', 'spider-4']) {
      const a = solveDeal(variantById(id), 12, { nodeBudget: 4000 })
      const b = solveDeal(variantById(id), 12, { nodeBudget: 4000 })
      expect(a.verdict).toBe(b.verdict)
      expect(a.nodes).toBe(b.nodes)
    }
  })
})
