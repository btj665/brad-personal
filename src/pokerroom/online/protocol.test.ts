import { describe, expect, it, vi } from 'vitest'

import { PokerGame } from '../engine'
import { ranker } from '../ranker'
import { HOLDEM } from '../variants'
import { pokerBrain, pokerDraw } from '../bot'
import type { BotProfile } from '../types'
import {
  guestView,
  privatePayloads,
  toSnapshot,
  type SeatKind,
  type TableMeta,
} from './protocol'

const P: BotProfile = { looseness: 0.5, aggression: 0.4, bluff: 0.1, quips: [] }

const META: TableMeta = {
  code: 'ABCD',
  name: 'Test',
  isPublic: true,
  variantId: 'holdem',
  hostId: 'u0',
  bigBlind: 20,
  buyIn: 1000,
  seats: 3,
}

/** A 3-seat Hold'em table: seat 0 a human (owner u0), seats 1–2 bots. */
function hostGame(): { game: PokerGame; info: { owners: (string | null)[]; kinds: SeatKind[]; away: boolean[] } } {
  const game = new PokerGame({
    variant: HOLDEM,
    ranker,
    brain: pokerBrain,
    botDraw: pokerDraw,
    seed: 123,
    bigBlind: 20,
    humanSeat: 0,
    roster: [
      { name: 'You', bot: null, stack: 1000 },
      { name: 'Renata', bot: P, stack: 1000 },
      { name: 'Duke', bot: P, stack: 1000 },
    ],
  })
  game.startHand()
  const info = {
    owners: ['u0', null, null] as (string | null)[],
    kinds: ['human', 'bot', 'bot'] as SeatKind[],
    away: [false, false, false],
  }
  return { game, info }
}

describe('online snapshot redaction', () => {
  it('hides every hole card in the public snapshot preflop', () => {
    const { game, info } = hostGame()
    const snap = toSnapshot(game, META, 1, info, [], null)
    for (const seat of snap.seats) {
      for (const held of seat.cards) {
        // A redacted card is a face-down placeholder with a negative uid, never a
        // real dealt card (real uids are >= 0).
        expect(held.faceUp).toBe(false)
        expect(held.card.uid).toBeLessThan(0)
      }
    }
  })

  it('sends each human only their own real cards, addressed to them', () => {
    const { game, info } = hostGame()
    const payloads = privatePayloads(game, info.owners)
    // Only seat 0 is a human-owned seat, so only it gets a private payload.
    expect(payloads).toHaveLength(1)
    expect(payloads[0].seat).toBe(0)
    expect(payloads[0].forUser).toBe('u0')
    expect(payloads[0].cards).toHaveLength(2)
    // The private cards are the real ones (non-negative uids).
    for (const held of payloads[0].cards) expect(held.card.uid).toBeGreaterThanOrEqual(0)
    // They match what the engine actually dealt that seat.
    expect(payloads[0].cards.map((c) => c.card.uid)).toEqual(game.seats[0].cards.map((c) => c.card.uid))
  })

  it('reveals a seat that reached showdown', () => {
    const { game, info } = hostGame()
    // Force seat 1 to a showdown state.
    game.seats[1].showdown = { best: game.seats[1].cards.map((c) => c.card), name: 'Pair' }
    const snap = toSnapshot(game, META, 1, info, [], null)
    // Seat 1's cards are now the real ones (revealed at showdown).
    expect(snap.seats[1].cards.map((c) => c.card.uid)).toEqual(game.seats[1].cards.map((c) => c.card.uid))
    // Seat 2 (no showdown) stays hidden.
    for (const held of snap.seats[2].cards) expect(held.card.uid).toBeLessThan(0)
  })
})

describe('guest view', () => {
  it('lays the player’s own private cards over the redacted seat', () => {
    const { game, info } = hostGame()
    const snap = toSnapshot(game, META, 1, info, [], null)
    const myCards = game.seats[0].cards.map((c) => ({ ...c }))
    const send = { act: vi.fn(), draw: vi.fn() }
    const store = { subscribe: () => () => {}, getVersion: () => 0, version: 0 }
    const view = guestView(snap, 0, myCards, send, store)
    expect(view.seats[0].cards.map((c) => c.card.uid)).toEqual(myCards.map((c) => c.card.uid))
    expect(view.humanSeat).toBe(0)
    expect(view.human).toBe(view.seats[0])
  })

  it('surfaces the controls only on the local player’s turn and routes actions', () => {
    const { game, info } = hostGame()
    const send = { act: vi.fn(), draw: vi.fn() }
    const store = { subscribe: () => () => {}, getVersion: () => 0, version: 0 }
    const snap = toSnapshot(game, META, 1, info, [], null)
    expect(snap.onClock).toBeGreaterThanOrEqual(0)

    // Sitting in the seat on the clock surfaces an action and routes it to the host.
    const mineView = guestView(snap, snap.onClock, [], send, store)
    expect(mineView.pending()?.type).toBe('awaitAction')
    mineView.act({ kind: 'fold' })
    expect(send.act).toHaveBeenCalledWith({ kind: 'fold' })

    // Any other seat gets no controls.
    const otherSeat = (snap.onClock + 1) % META.seats
    const otherView = guestView(snap, otherSeat, [], send, store)
    expect(otherView.pending()).toBeNull()
  })
})
