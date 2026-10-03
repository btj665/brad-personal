// What travels between the host and the guests at an online table.
//
// One player's browser is the authoritative host: it runs the real `PokerGame`,
// plays the bots, and broadcasts a redacted snapshot of the table after every
// change. The other players are guests — they have no engine, only the snapshots,
// and they send their actions back for the host to apply.
//
// Card privacy: the snapshot that goes to everyone has every unrevealed hole card
// replaced with a face-down placeholder, exactly the cards a player at the table
// could actually see (their own, stud up-cards, and whatever is turned over at
// showdown). A player's own hole cards reach them in a separate `private` message
// addressed to their user id. This is play money, so this is "good enough": the
// host's own browser necessarily holds every card, and a determined guest could
// read a private message addressed to someone else off the wire. It is not meant
// to withstand a cheater, only to keep honest play honest.

import type { Card, Rank, Suit } from '../../engine/types'
import type { PokerGame } from '../engine'
import type { PokerView } from '../view'
import type { Action, HeldCard, Options, Seat, Street } from '../types'

export const PROTOCOL_VERSION = 1

/** Each seat is one of these. A bot fills any spot no human holds. */
export type SeatKind = 'human' | 'bot' | 'empty'

export interface TableMeta {
  code: string
  name: string
  isPublic: boolean
  variantId: string
  hostId: string
  bigBlind: number
  buyIn: number
  /** Total seats at the table. */
  seats: number
  /** How many seats start as bots; the rest (beyond the creator) stay open for
   *  other people. Humans may also take a bot's seat, so this is the starting
   *  count, not a cap. */
  bots: number
  /** How long a dropped player's seat is held before a bot takes it, in ms. */
  disconnectMs: number
}

/** The authoritative table state, redacted for broadcast. */
export interface TableSnapshot {
  v: number
  seq: number
  meta: TableMeta
  hand: number
  button: number
  pot: number
  board: Card[]
  street: Street
  onClock: number
  over: boolean
  currentBet: number
  smallBlind: number
  log: string[]
  /** Redacted seats — safe to show anyone. */
  seats: Seat[]
  /** Per seat: who holds it (user id), what kind it is, and whether its human is
   *  away. Parallel to `seats`. */
  owners: (string | null)[]
  kinds: SeatKind[]
  away: boolean[]
  /** Options for the seat on the clock, so that seat's client can raise legally. */
  options: Options | null
  /** True for a community-card game (Hold'em/Omaha), so the felt draws a board. */
  hasBoard: boolean
  /** True when the seat on the clock owes a draw, not a bet (five-card draw). */
  drawTurn: boolean
  /** Seats that just won, for the reveal. */
  winners: number[]
  /** A seat has been vacated and the table is deciding what to do with it. */
  vacancy: Vacancy | null
}

/** A seat whose human dropped: the table holds it until someone picks, or a bot
 *  takes over when the deadline passes. */
export interface Vacancy {
  seat: number
  name: string
  /** epoch ms after which the host auto-fills with a bot. */
  deadline: number
}

/** Hole cards for one seat, sent only to that seat's owner. */
export interface PrivateCards {
  seat: number
  forUser: string
  cards: HeldCard[]
}

// ---------------------------------------------------------------- messages

/** Host → everyone. */
export type HostMessage =
  | { t: 'snapshot'; snapshot: TableSnapshot }
  | { t: 'private'; payload: PrivateCards }

/** Guest → host. `user` lets the host check the sender owns the seat it names. */
export type GuestMessage =
  | { t: 'act'; user: string; seat: number; action: Action }
  | { t: 'draw'; user: string; seat: number; discards: number[] }
  | { t: 'sit'; user: string; name: string; seat: number; buyIn: number }
  | { t: 'leave'; user: string; seat: number }
  | { t: 'resolveVacancy'; user: string; seat: number; choice: 'bot' | 'hold' }
  | { t: 'hello'; user: string }

// ---------------------------------------------------------------- redaction

/** A face-down stand-in for a hole card we must not reveal. Rendered as a card
 *  back, so its rank/suit are never shown; the negative uid can't collide with a
 *  real card's and stays stable for React keys. */
function hiddenCard(seat: number, pos: number): HeldCard {
  return { card: { uid: -(seat * 32 + pos) - 1, rank: 'A' as Rank, suit: 'S' as Suit }, faceUp: false }
}

/** Redact one seat's cards: keep face-up (stud) cards and, once a seat has a
 *  showdown, its whole hand; hide everything else. Mirrors the reveal rule the
 *  seat component uses, so the snapshot shows exactly what a watcher should see. */
function redactSeat(seat: Seat): Seat {
  const revealed = !!seat.showdown
  const cards = seat.cards.map((c, i) => (c.faceUp || revealed ? c : hiddenCard(seat.index, i)))
  return { ...seat, cards, discarded: [], bot: null }
}

/** Build the broadcast snapshot from the live game plus the host's seat bookkeeping. */
export function toSnapshot(
  game: PokerGame,
  meta: TableMeta,
  seq: number,
  info: { owners: (string | null)[]; kinds: SeatKind[]; away: boolean[] },
  winners: number[],
  vacancy: Vacancy | null,
): TableSnapshot {
  const onClock = game.onClock
  const pend = game.pending()
  return {
    v: PROTOCOL_VERSION,
    seq,
    meta,
    hand: game.hand,
    button: game.button,
    pot: game.pot,
    board: game.board.map((c) => ({ ...c })),
    street: game.street,
    onClock,
    over: game.over,
    currentBet: game.currentBet,
    smallBlind: game.smallBlind,
    log: game.log.slice(-12),
    seats: game.seats.map(redactSeat),
    owners: info.owners.slice(),
    kinds: info.kinds.slice(),
    away: info.away.slice(),
    options: pend?.type === 'awaitAction' ? pend.options : onClock >= 0 ? game.options(onClock) : null,
    hasBoard: game.variant.deal.some((d) => d.kind === 'community'),
    drawTurn: pend?.type === 'awaitDraw',
    winners: winners.slice(),
    vacancy,
  }
}

/** The private hole cards for every human seat, each addressed to its owner. */
export function privatePayloads(
  game: PokerGame,
  owners: (string | null)[],
): PrivateCards[] {
  const out: PrivateCards[] = []
  game.seats.forEach((s, i) => {
    const owner = owners[i]
    if (owner && s.cards.length) out.push({ seat: i, forUser: owner, cards: s.cards.map((c) => ({ ...c })) })
  })
  return out
}

// ---------------------------------------------------------------- guest view

const EMPTY_SEAT: Seat = {
  index: -1,
  name: '',
  bot: null,
  stack: 0,
  cards: [],
  discarded: [],
  folded: false,
  allIn: false,
  sittingOut: true,
  committed: 0,
  streetCommitted: 0,
  actedThisStreet: false,
  canReopen: false,
}

/** Turn a snapshot into a `PokerView` a guest can render. `mySeat` is the seat this
 *  client holds (-1 for a watcher), and `myCards` are the private cards last sent
 *  for it — laid over the redacted seat so the player sees their own hand. The
 *  `act`/`applyDraw` callbacks send the move to the host. */
export function guestView(
  snapshot: TableSnapshot,
  mySeat: number,
  myCards: HeldCard[] | null,
  send: { act: (a: Action) => void; draw: (idx: number[]) => void },
  store: { subscribe: (fn: () => void) => () => void; getVersion: () => number; version: number },
): PokerView {
  const seats = snapshot.seats.map((s) => ({ ...s }))
  if (mySeat >= 0 && seats[mySeat] && myCards) seats[mySeat] = { ...seats[mySeat], cards: myCards }
  const me = mySeat >= 0 && seats[mySeat] ? seats[mySeat] : EMPTY_SEAT

  const myTurn = snapshot.onClock === mySeat && mySeat >= 0 && !snapshot.over

  return {
    seats,
    board: snapshot.board,
    pot: snapshot.pot,
    hand: snapshot.hand,
    button: snapshot.button,
    onClock: snapshot.onClock,
    over: snapshot.over,
    // The felt reads only `variant.deal` — and only to learn whether there's a
    // board. `hasBoard` carries that one bit, so a stand-in deal is enough.
    variant: { deal: snapshot.hasBoard ? COMMUNITY_DEAL : NO_BOARD_DEAL } as PokerView['variant'],
    humanSeat: mySeat,
    smallBlind: snapshot.smallBlind,
    currentBet: snapshot.currentBet,
    human: me,
    version: store.version,
    log: snapshot.log,
    subscribe: store.subscribe,
    getVersion: store.getVersion,
    pending: () => {
      if (!myTurn) return null
      if (snapshot.drawTurn) return { type: 'awaitDraw', seat: mySeat }
      if (snapshot.options) return { type: 'awaitAction', options: snapshot.options }
      return null
    },
    act: (a) => send.act(a),
    applyDraw: (idx) => send.draw(idx),
  }
}

const COMMUNITY_DEAL = [{ kind: 'community' as const, count: 5 }]
const NO_BOARD_DEAL = [{ kind: 'hole' as const, count: 2 }]
