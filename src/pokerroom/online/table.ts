// An online poker table: one shared game across several browsers.
//
// Exactly one connected player is the host. The host owns the authoritative
// `PokerGame`, plays the bots that fill the empty seats, runs the clock, and after
// every change broadcasts a redacted snapshot plus each player's own hole cards.
// Everyone else is a guest: no engine, just the snapshots, sending their actions
// back for the host to apply. The host is simply the earliest-joined player still
// connected, so if they leave the next player takes over and the game continues.
//
// Seat changes (sitting down, standing up, a bot taking a vacated seat) only take
// effect between hands: the roster is rebuilt into a fresh `PokerGame` at the start
// of each hand, carrying stacks over, so a hand in progress is never disturbed.

import { randomSeed } from '../../engine/rng'
import type { HeldCard } from '../types'
import type { BotProfile, Action, Beat } from '../types'
import { PokerGame, type SeatSpec } from '../engine'
import { ranker } from '../ranker'
import { variantById } from '../variants'
import { pokerBrain, pokerDraw } from '../bot'
import type { PokerView } from '../view'
import type { SupabaseClient } from '@supabase/supabase-js'

import { LobbyChannel, TableChannel, type Presence } from './channel'
import {
  guestView,
  privatePayloads,
  toSnapshot,
  type GuestMessage,
  type HostMessage,
  type SeatKind,
  type TableMeta,
  type TableSnapshot,
  type Vacancy,
} from './protocol'

const BOT_STACK = 2000

/** The regulars who fill empty seats, same tempers as the solo table. */
const BOT_POOL: Array<{ name: string; profile: BotProfile }> = [
  { name: 'Renata', profile: { looseness: 0.34, aggression: 0.55, bluff: 0.09, quips: [] } },
  { name: 'Duke', profile: { looseness: 0.52, aggression: 0.28, bluff: 0.04, quips: [] } },
  { name: 'Mina', profile: { looseness: 0.4, aggression: 0.45, bluff: 0.12, quips: [] } },
  { name: 'Cole', profile: { looseness: 0.62, aggression: 0.66, bluff: 0.18, quips: [] } },
  { name: 'Yara', profile: { looseness: 0.28, aggression: 0.38, bluff: 0.05, quips: [] } },
  { name: 'Ivo', profile: { looseness: 0.46, aggression: 0.5, bluff: 0.1, quips: [] } },
]

const BEAT_MS: Partial<Record<Beat['type'], number>> = {
  handStart: 500,
  post: 240,
  deal: 520,
  action: 600,
  street: 320,
  showdown: 1300,
  award: 1200,
  handOver: 900,
}

/** One seat in the host's authoritative roster. */
interface RosterSeat {
  kind: SeatKind
  owner: string | null
  name: string
  stack: number
  profile: BotProfile | null
  away: boolean
}

export interface OnlineOptions {
  supabase: SupabaseClient
  meta: TableMeta
  user: string
  name: string
  /** True when this client created the table (it starts as host). */
  creator: boolean
  /** The creator's actual buy-in (capped to their wallet), which can be below the
   *  table's standard. Defaults to the table buy-in. */
  stake?: number
}

/** What the screen reads to draw its chrome around the felt. */
export interface TableInfo {
  meta: TableMeta
  mySeat: number
  amHost: boolean
  owners: (string | null)[]
  kinds: SeatKind[]
  away: boolean[]
  names: string[]
  stacks: number[]
  present: string[]
  vacancy: Vacancy | null
  players: number
  winners: number[]
  /** A seat claimed for the next hand while not yet seated, or -1. */
  joining: number
  /** True once we've left or been disconnected for good. */
  closed: boolean
}

export class OnlineTable {
  private supabase: SupabaseClient
  /** The table's settings. A joiner starts with a stub (just the code) and learns
   *  the real values from the host's first snapshot. */
  meta: TableMeta
  private user: string
  private name: string
  private creatorStake: number

  private channel: TableChannel
  private lobby: LobbyChannel | null = null

  private role: 'host' | 'guest' = 'guest'
  private presence: Presence[] = []

  // Host state.
  private game: PokerGame | null = null
  private roster: RosterSeat[] = []
  private seq = 0
  private winners: number[] = []
  private vacancy: Vacancy | null = null
  private lastButton = -1
  private timer: ReturnType<typeof setTimeout> | null = null
  private vacancyTimer: ReturnType<typeof setTimeout> | null = null
  /** Claims and conversions to apply at the next hand. A seat becomes a bot when a
   *  dropped player is replaced, or open when someone leaves voluntarily. */
  private pendingSits = new Map<number, { user: string; name: string; buyIn: number }>()
  private pendingConvert = new Map<number, 'bot' | 'empty'>()

  // Guest state.
  private snapshot: TableSnapshot | null = null
  private myCards: HeldCard[] | null = null

  private version = 0
  private listeners = new Set<() => void>()
  private closed = false
  /** A seat this client has asked for but isn't yet sitting in (takes the seat at
   *  the next hand). Drives the "joining…" notice, not the felt. */
  private pendingSitSeat = -1

  constructor(opts: OnlineOptions) {
    this.supabase = opts.supabase
    this.meta = opts.meta
    this.user = opts.user
    this.name = opts.name
    this.creatorStake = opts.stake ?? opts.meta.buyIn
    this.role = opts.creator ? 'host' : 'guest'
    this.channel = new TableChannel(opts.supabase, opts.meta.code, opts.user, opts.name)
  }

  // -------------------------------------------------------------- store

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version
  private touch(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  // -------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    this.channel.onPresence((p) => this.onPresence(p))
    this.channel.onHost((m) => this.onHostMessage(m))
    this.channel.onGuest((m) => this.onGuestMessage(m))
    await this.channel.join()

    if (this.role === 'host') {
      this.initHostRoster()
      if (this.meta.isPublic) {
        this.lobby = new LobbyChannel(this.supabase, this.user)
        await this.lobby.join()
        this.refreshLobby()
      }
      this.scheduleNextHand(600)
    } else {
      // Ask whoever is hosting for the current state.
      this.channel.sendGuest({ t: 'hello', user: this.user })
    }
    this.touch()
  }

  async leave(): Promise<void> {
    // Rack my chips back before dropping (handled by the screen reading mySeat).
    if (this.role === 'guest' && this.mySeat >= 0) {
      this.channel.sendGuest({ t: 'leave', user: this.user, seat: this.mySeat })
    }
    if (this.role === 'host' && this.mySeat >= 0) {
      this.freeSeat(this.mySeat)
    }
    this.clearTimers()
    this.closed = true
    if (this.lobby) await this.lobby.leave()
    await this.channel.leave()
    this.touch()
  }

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.vacancyTimer) clearTimeout(this.vacancyTimer)
    this.timer = null
    this.vacancyTimer = null
  }

  // -------------------------------------------------------------- presence / host election

  /** Who should host, or null if we can't tell yet. The creator hosts while it's
   *  connected (unambiguous, clock-independent). If the host is gone, we migrate —
   *  but only once we've seen a snapshot to continue from — to the lowest user id
   *  present, a deterministic pick that every client computes the same way. A fresh
   *  joiner that has neither returns null and simply waits for the host's state. */
  private electHost(): string | null {
    const present = new Set(this.presence.map((p) => p.user))
    if (this.meta.hostId && present.has(this.meta.hostId)) return this.meta.hostId
    if (this.snapshot || this.role === 'host') {
      const ids = this.presence.map((p) => p.user).sort()
      return ids[0] ?? this.user
    }
    return null
  }

  private onPresence(people: Presence[]): void {
    this.presence = people
    const host = this.electHost()
    if (host !== null) {
      const shouldHost = host === this.user
      if (shouldHost && this.role === 'guest') this.promoteToHost()
      if (!shouldHost && this.role === 'host') this.demoteToGuest()
    }

    if (this.role === 'host') {
      // Spot any seated human who dropped off presence.
      const here = new Set(people.map((p) => p.user))
      this.roster.forEach((r, i) => {
        if (r.kind === 'human' && r.owner && !here.has(r.owner) && !r.away) {
          this.markAway(i)
        }
        if (r.kind === 'human' && r.owner && here.has(r.owner) && r.away) {
          // They came back.
          r.away = false
          if (this.vacancy?.seat === i) this.clearVacancy()
        }
      })
      this.refreshLobby()
    }
    this.touch()
  }

  private promoteToHost(): void {
    this.role = 'host'
    // Take ownership so future joiners resolve the host to us by meta, not just the
    // migration fallback.
    this.meta = { ...this.meta, hostId: this.user }
    // Rebuild the roster from the last snapshot, refunding chips committed to the
    // in-progress (now voided) hand, then start fresh.
    if (this.snapshot) {
      this.roster = this.snapshot.seats.map((s, i) => {
        const kind = this.snapshot!.kinds[i]
        const owner = this.snapshot!.owners[i]
        return {
          kind,
          owner: kind === 'human' ? owner : null,
          name: kind === 'human' ? s.name : kind === 'bot' ? this.botName(i) : 'Open',
          // Refund chips committed to the voided hand; open seats carry nothing.
          stack: kind === 'empty' ? 0 : Math.max(0, s.stack + s.committed),
          profile: kind === 'bot' ? this.botProfile(i) : null,
          away: this.snapshot!.away[i] ?? false,
        }
      })
      this.lastButton = this.snapshot.button
    } else {
      this.initHostRoster()
    }
    if (this.meta.isPublic && !this.lobby) {
      this.lobby = new LobbyChannel(this.supabase, this.user)
      void this.lobby.join()
    }
    this.scheduleNextHand(600)
  }

  private demoteToGuest(): void {
    this.role = 'guest'
    this.clearTimers()
    this.game = null
  }

  // -------------------------------------------------------------- host: roster

  private botName(i: number): string {
    return BOT_POOL[i % BOT_POOL.length].name
  }
  private botProfile(i: number): BotProfile {
    return BOT_POOL[i % BOT_POOL.length].profile
  }

  private initHostRoster(): void {
    // Seat 0 is the creator. The next `bots` seats are bots; any seats beyond that
    // stay open for other people to sit down in.
    this.roster = []
    for (let i = 0; i < this.meta.seats; i++) {
      if (i === 0) {
        this.roster.push({ kind: 'human', owner: this.user, name: this.name, stack: this.creatorStake, away: false, profile: null })
      } else if (i <= this.meta.bots) {
        this.roster.push({ kind: 'bot', owner: null, name: this.botName(i), stack: BOT_STACK, away: false, profile: this.botProfile(i) })
      } else {
        this.roster.push({ kind: 'empty', owner: null, name: 'Open', stack: 0, away: false, profile: null })
      }
    }
  }

  /** Build a fresh game from the roster (applying queued seat changes), carrying
   *  stacks over, and deal the next hand. */
  private startHand(): void {
    // Fold the just-finished game's stacks back into the roster.
    if (this.game) {
      this.game.seats.forEach((s, i) => {
        if (this.roster[i]) this.roster[i].stack = s.stack
      })
    }

    // Apply pending sits (a human taking a bot seat).
    for (const [seat, claim] of this.pendingSits) {
      const r = this.roster[seat]
      if (r) {
        r.kind = 'human'
        r.owner = claim.user
        r.name = claim.name
        r.stack = claim.buyIn
        r.profile = null
        r.away = false
      }
    }
    this.pendingSits.clear()

    // Apply pending conversions: a dropped player's seat becomes a bot, a seat
    // left voluntarily becomes open again (pendingSits above already won this seat
    // if someone re-claimed it, so only convert seats nobody took).
    for (const [seat, to] of this.pendingConvert) {
      if (this.pendingSits.has(seat)) continue
      const r = this.roster[seat]
      if (!r) continue
      if (to === 'bot') {
        r.kind = 'bot'
        r.owner = null
        r.name = this.botName(seat)
        r.profile = this.botProfile(seat)
        r.stack = BOT_STACK
      } else {
        r.kind = 'empty'
        r.owner = null
        r.name = 'Open'
        r.profile = null
        r.stack = 0
      }
      r.away = false
    }
    this.pendingConvert.clear()
    this.clearVacancy()

    // Rebuy busted bots so the table stays full.
    for (const r of this.roster) if (r.kind === 'bot' && r.stack <= 0) r.stack = BOT_STACK

    // An open seat sits out (stack 0, no bot brain so the engine never waits on it).
    const specs: SeatSpec[] = this.roster.map((r) => ({
      name: r.name,
      bot: r.kind === 'bot' ? r.profile : null,
      stack: r.kind === 'empty' ? 0 : r.stack,
    }))

    const game = new PokerGame({
      variant: variantById(this.meta.variantId),
      ranker,
      brain: pokerBrain,
      botDraw: pokerDraw,
      seed: randomSeed(),
      bigBlind: this.meta.bigBlind,
      humanSeat: this.mySeat >= 0 ? this.mySeat : 0,
      roster: specs,
    })
    game.button = this.lastButton
    this.game = game
    this.winners = []
    game.subscribe(() => this.touch())

    // Need at least two seats with chips to play.
    const live = this.roster.filter((r) => r.stack > 0).length
    if (live < 2) {
      this.broadcast()
      this.scheduleNextHand(2500)
      return
    }

    game.startHand()
    this.lastButton = game.button
    this.broadcast()
    this.scheduleTick(BEAT_MS.handStart ?? 500)
  }

  private scheduleNextHand(delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.startHand(), delay)
  }

  // -------------------------------------------------------------- host: clock

  private scheduleTick(delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.tick(), delay)
  }

  private tick(): void {
    const game = this.game
    if (!game || this.role !== 'host') return

    const pend = game.pending()
    if (pend && (pend.type === 'awaitAction' || pend.type === 'awaitDraw')) {
      const seat = pend.type === 'awaitAction' ? pend.options.seat : pend.seat
      const r = this.roster[seat]
      if (r?.away) {
        // An absent player is checked or folded so the hand keeps moving.
        if (pend.type === 'awaitDraw') game.applyDraw([], seat)
        else game.act(pend.options.canCheck ? { kind: 'check' } : { kind: 'fold' }, seat)
        this.broadcast()
        this.scheduleTick(500)
        return
      }
      // A present human: wait for their action to arrive. Just publish the state.
      this.broadcast()
      return
    }

    if (game.over) {
      this.broadcast()
      this.scheduleNextHand(BEAT_MS.handOver ?? 900)
      return
    }

    const beat = game.step()
    if (beat.type === 'handStart') this.winners = []
    if (beat.type === 'award') this.winners = [...new Set([...this.winners, beat.seat])]
    this.broadcast()
    this.scheduleTick(BEAT_MS[beat.type] ?? 300)
  }

  // -------------------------------------------------------------- host: messages

  private onGuestMessage(m: GuestMessage): void {
    if (this.role !== 'host' || !this.game) return
    const game = this.game
    switch (m.t) {
      case 'hello':
        this.broadcast()
        break
      case 'act': {
        const r = this.roster[m.seat]
        if (r?.owner === m.user && game.onClock === m.seat) {
          game.act(m.action, m.seat)
          this.resume()
        }
        break
      }
      case 'draw': {
        const r = this.roster[m.seat]
        if (r?.owner === m.user) {
          game.applyDraw(m.discards, m.seat)
          this.resume()
        }
        break
      }
      case 'sit':
        this.claimSeat(m.seat, m.user, m.name, m.buyIn)
        break
      case 'leave':
        if (this.roster[m.seat]?.owner === m.user) this.freeSeat(m.seat)
        break
      case 'resolveVacancy':
        this.applyVacancyChoice(m.seat, m.choice)
        break
    }
  }

  /** After a human's move is applied, publish and let the clock run on. */
  private resume(): void {
    this.broadcast()
    this.scheduleTick(250)
  }

  private claimSeat(seat: number, user: string, name: string, buyIn: number): void {
    const r = this.roster[seat]
    if (!r) return
    // Only an open bot seat (or the same user re-buying) can be taken.
    if (r.kind === 'human' && r.owner !== user) return
    this.pendingSits.set(seat, { user, name, buyIn })
    if (this.vacancy?.seat === seat) this.clearVacancy()
    this.refreshLobby()
    this.touch()
  }

  private freeSeat(seat: number): void {
    const r = this.roster[seat]
    if (!r) return
    this.pendingSits.delete(seat)
    // Leaving voluntarily opens the seat for the next person — it doesn't spawn a
    // bot (that only happens on a disconnect, by the players' choice).
    this.pendingConvert.set(seat, 'empty')
    if (r.kind === 'human' && this.game && !this.game.over) {
      // Fold them out of the current hand immediately.
      r.away = true
      if (this.game.onClock === seat) {
        this.game.act({ kind: 'fold' }, seat)
        this.resume()
      }
    }
    if (this.vacancy?.seat === seat) this.clearVacancy()
    this.refreshLobby()
    this.touch()
  }

  private markAway(seat: number): void {
    const r = this.roster[seat]
    if (!r || r.kind !== 'human') return
    r.away = true
    // Offer the remaining players the choice; a bot takes over at the deadline.
    const ms = this.meta.disconnectMs
    this.vacancy = { seat, name: r.name, deadline: Date.now() + ms }
    if (this.vacancyTimer) clearTimeout(this.vacancyTimer)
    this.vacancyTimer = setTimeout(() => this.applyVacancyChoice(seat, 'bot'), ms)
    this.broadcast()
    // If the clock was parked waiting on this now-absent player, nudge it so the
    // seat gets auto-folded and the hand moves on.
    if (this.game && !this.game.over) this.scheduleTick(300)
  }

  private applyVacancyChoice(seat: number, choice: 'bot' | 'hold'): void {
    if (this.vacancy?.seat !== seat) return
    if (choice === 'bot') this.pendingConvert.set(seat, 'bot')
    // 'hold' keeps the seat human+away until they return or a later vacancy.
    this.clearVacancy()
    this.touch()
  }

  private clearVacancy(): void {
    this.vacancy = null
    if (this.vacancyTimer) clearTimeout(this.vacancyTimer)
    this.vacancyTimer = null
  }

  // -------------------------------------------------------------- host: broadcast

  private seatInfo(): { owners: (string | null)[]; kinds: SeatKind[]; away: boolean[] } {
    return {
      owners: this.roster.map((r) => r.owner),
      kinds: this.roster.map((r) => r.kind),
      away: this.roster.map((r) => r.away),
    }
  }

  private broadcast(): void {
    if (!this.game) return
    this.seq++
    const snap = toSnapshot(this.game, this.meta, this.seq, this.seatInfo(), this.winners, this.vacancy)
    this.snapshot = snap
    this.channel.sendHost({ t: 'snapshot', snapshot: snap })
    for (const p of privatePayloads(this.game, snap.owners)) {
      this.channel.sendHost({ t: 'private', payload: p })
      if (p.forUser === this.user) this.myCards = p.cards
    }
    this.touch()
  }

  private refreshLobby(): void {
    if (!this.lobby) return
    if (this.meta.isPublic) {
      const players = this.roster.filter((r) => r.kind === 'human').length
      void this.lobby.advertise(this.meta, players)
    }
  }

  // -------------------------------------------------------------- guest: messages

  private onHostMessage(m: HostMessage): void {
    if (this.role === 'host') return
    if (m.t === 'snapshot') {
      if (this.snapshot && m.snapshot.seq < this.snapshot.seq) return
      this.snapshot = m.snapshot
      // A joiner learns the real table settings from the host.
      this.meta = m.snapshot.meta
      this.touch()
    } else if (m.t === 'private') {
      if (m.payload.forUser === this.user) {
        this.myCards = m.payload.cards
        this.touch()
      }
    }
  }

  // -------------------------------------------------------------- public API

  /** Which seat this client actually holds in the live game (-1 if none yet). */
  get mySeat(): number {
    if (this.role === 'host') return this.roster.findIndex((r) => r.owner === this.user)
    if (this.snapshot) return this.snapshot.owners.findIndex((o) => o === this.user)
    return -1
  }

  /** Take a seat (must be a bot/open seat). Buy-in comes from the caller's wallet.
   *  The seat is claimed for the next hand, not the one in progress. */
  sit(seat: number, buyIn: number): void {
    this.pendingSitSeat = seat
    if (this.role === 'host') this.claimSeat(seat, this.user, this.name, buyIn)
    else this.channel.sendGuest({ t: 'sit', user: this.user, name: this.name, seat, buyIn })
    this.touch()
  }

  /** Stand up; a bot takes the seat next hand. Returns the chips to rack back. */
  stand(): number {
    const seat = this.mySeat
    const chips = seat >= 0 ? this.stacks[seat] : 0
    if (seat >= 0) {
      if (this.role === 'host') this.freeSeat(seat)
      else this.channel.sendGuest({ t: 'leave', user: this.user, seat })
    }
    this.pendingSitSeat = -1
    this.touch()
    return chips
  }

  resolveVacancy(choice: 'bot' | 'hold'): void {
    const seat = this.vacancyView?.seat
    if (seat == null) return
    if (this.role === 'host') this.applyVacancyChoice(seat, choice)
    else this.channel.sendGuest({ t: 'resolveVacancy', user: this.user, seat, choice })
  }

  // -------------------------------------------------------------- views

  private get stacks(): number[] {
    if (this.role === 'host' && this.game) return this.game.seats.map((s) => s.stack)
    return this.snapshot?.seats.map((s) => s.stack) ?? []
  }

  private get vacancyView(): Vacancy | null {
    return this.role === 'host' ? this.vacancy : (this.snapshot?.vacancy ?? null)
  }

  /** The seat metadata the screen draws its chrome from. */
  get info(): TableInfo {
    const mySeat = this.mySeat
    // Once we're actually seated, the "joining" notice is done.
    if (mySeat >= 0 && this.pendingSitSeat >= 0) this.pendingSitSeat = -1
    const owners = this.role === 'host' ? this.roster.map((r) => r.owner) : (this.snapshot?.owners ?? [])
    const kinds = this.role === 'host' ? this.roster.map((r) => r.kind) : (this.snapshot?.kinds ?? [])
    const away = this.role === 'host' ? this.roster.map((r) => r.away) : (this.snapshot?.away ?? [])
    const names = this.role === 'host' ? this.roster.map((r) => r.name) : (this.snapshot?.seats.map((s) => s.name) ?? [])
    return {
      meta: this.meta,
      mySeat,
      amHost: this.role === 'host',
      owners,
      kinds,
      away,
      names,
      stacks: this.stacks,
      present: this.presence.map((p) => p.user),
      vacancy: this.vacancyView,
      players: kinds.filter((k) => k === 'human').length,
      winners: this.role === 'host' ? this.winners : (this.snapshot?.winners ?? []),
      joining: this.pendingSitSeat,
      closed: this.closed,
    }
  }

  /** The table as a `PokerView`, however this client is playing it. */
  get view(): PokerView | null {
    if (this.role === 'host') {
      if (!this.game) return null
      return this.hostView(this.game)
    }
    if (!this.snapshot) return null
    return guestView(
      this.snapshot,
      this.mySeat,
      this.myCards,
      {
        act: (a: Action) => this.channel.sendGuest({ t: 'act', user: this.user, seat: this.mySeat, action: a }),
        draw: (idx: number[]) => this.channel.sendGuest({ t: 'draw', user: this.user, seat: this.mySeat, discards: idx }),
      },
      { subscribe: this.subscribe, getVersion: this.getVersion, version: this.version },
    )
  }

  /** The host renders its own live engine, but its moves have to re-pump the clock
   *  the same way a guest's arriving action does — otherwise the table stalls after
   *  the host acts on its own turn. So read everything live off the game, and route
   *  act/draw through `resume`. */
  private hostView(game: PokerGame): PokerView {
    const seat = this.mySeat >= 0 ? this.mySeat : 0
    return {
      get seats() { return game.seats },
      get board() { return game.board },
      get pot() { return game.pot },
      get hand() { return game.hand },
      get button() { return game.button },
      get onClock() { return game.onClock },
      get over() { return game.over },
      get variant() { return game.variant },
      humanSeat: seat,
      get smallBlind() { return game.smallBlind },
      get currentBet() { return game.currentBet },
      get human() { return game.seats[seat] ?? game.seats[0] },
      get version() { return game.version },
      get log() { return game.log },
      subscribe: game.subscribe,
      getVersion: game.getVersion,
      pending: () => game.pending(),
      act: (a: Action) => {
        game.act(a, seat)
        this.resume()
      },
      applyDraw: (idx: number[]) => {
        game.applyDraw(idx, seat)
        this.resume()
      },
    }
  }
}
