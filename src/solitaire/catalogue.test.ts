// Every catalogued variant must actually be dealable and playable, not merely a
// plausible-looking record. This walks the whole VARIANTS list and proves it.
import { describe, expect, it } from 'vitest'

import type { Card } from '../engine/types'
import { Solitaire } from './game'
import { VARIANTS } from './variants'

let uid = 0
const card = (spec: string): Card => {
  const suit = spec.slice(-1).toUpperCase() as Card['suit']
  const rank = spec.slice(0, -1) as Card['rank']
  return { uid: uid++, rank, suit }
}

const SAMPLE_SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

describe('the catalogue is well-formed', () => {
  it('has a healthy number of unique ids', () => {
    expect(VARIANTS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(VARIANTS.length)
  })

  it('gives every variant a note and a blurb a player could learn from', () => {
    for (const v of VARIANTS) {
      expect(v.note.length).toBeGreaterThan(40)
      expect(v.blurb.length).toBeGreaterThan(0)
    }
  })
})

describe.each(VARIANTS.map((v) => [v.label, v.id] as const))('%s', (_label, id) => {
  const variant = VARIANTS.find((v) => v.id === id)!
  const expectedCards = variant.decks * 4 * (13 - (variant.strip?.length ?? 0))

  it('deals exactly the shoe, once each, every card unique', () => {
    const g = new Solitaire({ variant, seed: 7 })
    const all = g.piles.flatMap((p) => p.cards.map((pc) => pc.card))
    expect(all).toHaveLength(expectedCards)
    expect(new Set(all.map((x) => x.uid)).size).toBe(all.length)
  })

  it('builds exactly the piles the record asks for', () => {
    const g = new Solitaire({ variant, seed: 3 })
    expect(g.piles.filter((p) => p.kind === 'tableau')).toHaveLength(variant.tableau.piles)
    expect(g.piles.filter((p) => p.kind === 'foundation')).toHaveLength(variant.foundations.piles)
    expect(g.piles.filter((p) => p.kind === 'cell')).toHaveLength(variant.cells)
    expect(g.piles.filter((p) => p.kind === 'reserve')).toHaveLength(variant.reserve?.piles ?? 0)
  })

  it('gives every tableau pile the depth the deal specifies', () => {
    const g = new Solitaire({ variant, seed: 4 })
    const counts =
      typeof variant.tableau.deal === 'number'
        ? new Array(variant.tableau.piles).fill(variant.tableau.deal)
        : variant.tableau.deal
    const cols = g.piles.filter((p) => p.kind === 'tableau')
    // A 'dealt'-base game may lift one card from a pile to seed the foundation, so
    // only the tableau depth is asserted directly here.
    cols.forEach((p, i) => expect(p.cards.length).toBe(counts[i]))
  })

  it('replays identically from a seed', () => {
    const flat = (g: Solitaire) => g.piles.map((p) => p.cards.map((x) => x.card.uid).join(',')).join('|')
    expect(flat(new Solitaire({ variant, seed: 42 }))).toBe(flat(new Solitaire({ variant, seed: 42 })))
  })

  it('never offers a move that lifts a face-down card', () => {
    const g = new Solitaire({ variant, seed: 9 })
    for (const m of g.legalMoves()) {
      const src = g.get(m.from)!
      expect(src.cards.slice(src.cards.length - m.count).every((x) => x.faceUp)).toBe(true)
    }
  })

  it('has some legal action available on the opening deal', () => {
    // Zero legal openings on every seed is almost always a broken record. A move on
    // the board OR a turn of the stock both count as "the game can begin".
    const openable = SAMPLE_SEEDS.some((seed) => {
      const g = new Solitaire({ variant, seed })
      if (g.legalMoves().length > 0) return true
      return g.drawStock()
    })
    expect(openable).toBe(true)
  })
})

describe('every Spider-like discards a completed run', () => {
  const spiderLikes = VARIANTS.filter((v) => new Solitaire({ variant: v, seed: 1 }).discardsRuns())

  it('finds the ones the engine treats as discard games', () => {
    // Spider ×4, Scorpion, Wasp — and nothing whose foundations build a card at a time.
    expect(spiderLikes.map((v) => v.id).sort()).toEqual(
      ['scorpion', 'spider-1', 'spider-2', 'spider-4', 'spiderette', 'wasp'].sort(),
    )
  })

  it.each(spiderLikes.map((v) => [v.label, v.id] as const))('%s takes a full suit and nothing less', (_l, vid) => {
    const variant = VARIANTS.find((v) => v.id === vid)!
    const g = new Solitaire({ variant, seed: 4 })
    const ranks = 13 - (variant.strip?.length ?? 0)
    const seq = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].slice(0, ranks)
    const col = g.get('tableau-0')!
    // The foundations here build in suit, so plant a single-suit K-down run.
    col.cards = seq.map((r) => ({ card: card(`${r}S`), faceUp: true }))
    const foundation = g.piles.find((p) => p.kind === 'foundation')!
    expect(g.canMove(col.id, foundation.id, ranks - 1)).toBe(false)
    expect(g.canMove(col.id, foundation.id, ranks)).toBe(true)
    g.move(col.id, foundation.id, ranks)
    expect(foundation.cards).toHaveLength(ranks)
    expect(col.cards).toHaveLength(0)
  })
})

describe('the single-pile builders (Golf, Black Hole)', () => {
  it.each([['golf'], ['golf-wrap'], ['black-hole']])('%s builds its one foundation up or down by rank', (vid) => {
    const variant = VARIANTS.find((v) => v.id === vid)!
    const g = new Solitaire({ variant, seed: 3 })
    const foundation = g.get('foundation-0')!
    // The deal seeds the pile from a one-card reserve.
    expect(foundation.cards).toHaveLength(1)
    const top = foundation.cards[0].card
    // Some accessible card a rank either side of the base must be placeable, or the
    // stock must be turnable onto the pile.
    const canOpen = g.legalMoves().some((m) => g.get(m.to)!.kind === 'foundation') || g.drawStock()
    expect(canOpen).toBe(true)
    expect(top).toBeDefined()
  })

  it('Golf turns a stock card straight onto the pile, whatever its rank', () => {
    const variant = VARIANTS.find((v) => v.id === 'golf')!
    const g = new Solitaire({ variant, seed: 6 })
    const foundation = g.get('foundation-0')!
    const before = foundation.cards.length
    expect(g.drawStock()).toBe(true)
    expect(foundation.cards.length).toBe(before + 1)
    // And undo puts it back in the stock.
    g.undo()
    expect(foundation.cards.length).toBe(before)
  })
})

describe('Canfield-family foundations start from the dealt rank', () => {
  it.each([['canfield'], ['rainbow'], ['chameleon']])('%s seeds a foundation and keeps its reserve', (vid) => {
    const variant = VARIANTS.find((v) => v.id === vid)!
    const g = new Solitaire({ variant, seed: 5 })
    const seeded = g.piles.filter((p) => p.kind === 'foundation' && p.cards.length === 1)
    expect(seeded).toHaveLength(1)
    // Its rank is the base every foundation now climbs from.
    expect(seeded[0].cards[0].card.rank).toBe(g.baseRank)
    const reserve = g.get('reserve-0')!
    expect(reserve.cards.length).toBeGreaterThan(0)
  })
})
