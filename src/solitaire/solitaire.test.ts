import { describe, expect, it } from 'vitest'

import type { Card } from '../engine/types'
import { follows, isRun, Solitaire } from './game'
import type { Build, Pile } from './types'
import { VARIANTS, variantById } from './variants'

let uid = 0
const c = (spec: string): Card => {
  const suit = spec.slice(-1).toUpperCase() as Card['suit']
  const rank = spec.slice(0, -1) as Card['rank']
  return { uid: uid++, rank, suit }
}

const DOWN_ALT: Build = { direction: 'down', match: 'alternateColour', wrap: false }
const DOWN_SUIT: Build = { direction: 'down', match: 'sameSuit', wrap: false }
const UP_SUIT: Build = { direction: 'up', match: 'sameSuit', wrap: false }

describe('the build rule', () => {
  it('reads alternating colours, downward', () => {
    expect(follows(c('7S'), c('6H'), DOWN_ALT)).toBe(true) // red on black, one lower
    expect(follows(c('7S'), c('6C'), DOWN_ALT)).toBe(false) // same colour
    expect(follows(c('7S'), c('8H'), DOWN_ALT)).toBe(false) // wrong direction
    expect(follows(c('7S'), c('5H'), DOWN_ALT)).toBe(false) // skips a rank
  })

  it('reads same-suit foundations, upward', () => {
    expect(follows(c('7S'), c('8S'), UP_SUIT)).toBe(true)
    expect(follows(c('7S'), c('8H'), UP_SUIT)).toBe(false)
    expect(follows(c('KS'), c('AS'), UP_SUIT)).toBe(false) // no wrap by default
  })

  it('wraps king to ace only when asked', () => {
    expect(follows(c('AS'), c('KS'), { ...DOWN_SUIT, wrap: true })).toBe(true)
    expect(follows(c('AS'), c('KS'), DOWN_SUIT)).toBe(false)
  })

  it('recognises a correctly built run', () => {
    const pile: Pile = {
      id: 'tableau-0',
      kind: 'tableau',
      index: 0,
      cards: ['9H', '8S', '7H', '6C'].map((s) => ({ card: c(s), faceUp: true })),
    }
    expect(isRun(pile, 0, DOWN_ALT)).toBe(true)
    pile.cards[2].card = c('7S') // break the colour alternation
    expect(isRun(pile, 0, DOWN_ALT)).toBe(false)
  })
})

describe.each(VARIANTS.map((v) => [v.label, v.id] as const))('%s deals correctly', (_label, id) => {
  const variant = variantById(id)

  it('deals exactly the deck it should, once each', () => {
    const g = new Solitaire({ variant, seed: 7 })
    const all = g.piles.flatMap((p) => p.cards.map((pc) => pc.card))
    const ranks = 13 - (variant.strip?.length ?? 0)
    expect(all).toHaveLength(variant.decks * 4 * ranks)
    // No physical card appears twice.
    expect(new Set(all.map((x) => x.uid)).size).toBe(all.length)
  })

  it('builds every pile the variant asks for', () => {
    const g = new Solitaire({ variant, seed: 3 })
    expect(g.piles.filter((p) => p.kind === 'tableau')).toHaveLength(variant.tableau.piles)
    expect(g.piles.filter((p) => p.kind === 'foundation')).toHaveLength(variant.foundations.piles)
    expect(g.piles.filter((p) => p.kind === 'cell')).toHaveLength(variant.cells)
  })

  it('replays identically from its seed', () => {
    const a = new Solitaire({ variant, seed: 42 })
    const b = new Solitaire({ variant, seed: 42 })
    const flat = (g: Solitaire) => g.piles.map((p) => p.cards.map((x) => x.card.uid).join(',')).join('|')
    expect(flat(a)).toBe(flat(b))
  })

  it('never lets a face-down card move', () => {
    const g = new Solitaire({ variant, seed: 9 })
    for (const move of g.legalMoves()) {
      const src = g.get(move.from)!
      const moving = src.cards.slice(src.cards.length - move.count)
      expect(moving.every((x) => x.faceUp)).toBe(true)
    }
  })
})

describe('playing Klondike', () => {
  it('turns the stock and can run it back', () => {
    const g = new Solitaire({ variant: variantById('klondike-1'), seed: 5 })
    const stock = g.get('stock-0')!
    const waste = g.get('waste-0')!
    const start = stock.cards.length
    g.drawStock()
    expect(waste.cards).toHaveLength(1)
    expect(stock.cards).toHaveLength(start - 1)
    while (g.get('stock-0')!.cards.length) g.drawStock()
    g.drawStock() // the redeal
    expect(g.get('stock-0')!.cards.length).toBe(start)
    expect(g.get('waste-0')!.cards.length).toBe(0)
  })

  it('undoes a move and the flip it caused', () => {
    const g = new Solitaire({ variant: variantById('klondike-1'), seed: 11 })
    // Find any legal tableau-to-tableau move that exposes a face-down card.
    const before = g.piles.map((p) => p.cards.map((x) => `${x.card.uid}${x.faceUp ? 'U' : 'D'}`).join(','))
    const mv = g.legalMoves().find((m) => g.get(m.from)!.kind === 'tableau' && g.get(m.to)!.kind === 'tableau')
    if (mv) {
      g.move(mv.from, mv.to, mv.count)
      g.undo()
      const after = g.piles.map((p) => p.cards.map((x) => `${x.card.uid}${x.faceUp ? 'U' : 'D'}`).join(','))
      expect(after).toEqual(before)
    }
  })

  it('only sends a card home when the foundation wants it', () => {
    const g = new Solitaire({ variant: variantById('freecell'), seed: 1 })
    const foundation = g.get('foundation-0')!
    // Nothing but an ace can start a foundation.
    for (const src of g.piles.filter((p) => p.kind === 'tableau')) {
      const top = src.cards[src.cards.length - 1]
      const canGo = g.canMove(src.id, foundation.id, 1)
      expect(canGo).toBe(top.card.rank === 'A')
    }
  })
})

describe('a won game', () => {
  it('recognises when every card is home', () => {
    const g = new Solitaire({ variant: variantById('freecell'), seed: 2 })
    expect(g.won()).toBe(false)
    // Force a win by planting a full set of foundations.
    for (const p of g.piles) p.cards = []
    const suits: Card['suit'][] = ['S', 'H', 'D', 'C']
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    g.piles
      .filter((p) => p.kind === 'foundation')
      .forEach((p, i) => {
        p.cards = ranks.map((r) => ({ card: c(`${r}${suits[i]}`), faceUp: true }))
      })
    expect(g.won()).toBe(true)
  })
})
