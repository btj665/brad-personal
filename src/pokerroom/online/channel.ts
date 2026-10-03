// Thin wrappers over Supabase Realtime for the poker lobby and the tables.
//
// Realtime gives us two primitives with nothing but the public anon key and no
// database tables: presence (who is connected to a channel right now) and
// broadcast (fire a message to everyone else on it). That is all an online table
// needs — presence tracks who is seated and spots a disconnect, broadcast carries
// the host's snapshots one way and the guests' actions the other.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

import type { GuestMessage, HostMessage, TableMeta } from './protocol'

/** One connected person, as presence sees them. */
export interface Presence {
  user: string
  name: string
  /** ms epoch they joined; the earliest-joined present user is the host. */
  joinedAt: number
}

/** A public table advertised in the lobby. */
export interface TableAd {
  code: string
  name: string
  variantId: string
  players: number
  seats: number
  hostId: string
  updatedAt: number
}

const LOBBY = 'poker-lobby-v1'
const tableChannelName = (code: string) => `poker-table-v1-${code}`

// ---------------------------------------------------------------- table

export class TableChannel {
  private channel: RealtimeChannel
  private presence: Presence
  private hostHandlers = new Set<(m: HostMessage) => void>()
  private guestHandlers = new Set<(m: GuestMessage) => void>()
  private presenceHandlers = new Set<(p: Presence[]) => void>()

  constructor(
    private supabase: SupabaseClient,
    public readonly code: string,
    user: string,
    name: string,
  ) {
    this.presence = { user, name, joinedAt: Date.now() }
    this.channel = supabase.channel(tableChannelName(code), {
      config: { presence: { key: user }, broadcast: { self: false } },
    })
  }

  onHost(fn: (m: HostMessage) => void): () => void {
    this.hostHandlers.add(fn)
    return () => this.hostHandlers.delete(fn)
  }
  onGuest(fn: (m: GuestMessage) => void): () => void {
    this.guestHandlers.add(fn)
    return () => this.guestHandlers.delete(fn)
  }
  onPresence(fn: (p: Presence[]) => void): () => void {
    this.presenceHandlers.add(fn)
    return () => this.presenceHandlers.delete(fn)
  }

  sendHost(m: HostMessage): void {
    void this.channel.send({ type: 'broadcast', event: 'host', payload: m })
  }
  sendGuest(m: GuestMessage): void {
    void this.channel.send({ type: 'broadcast', event: 'guest', payload: m })
  }

  private emitPresence(): void {
    const state = this.channel.presenceState<Presence>()
    const people: Presence[] = []
    for (const key of Object.keys(state)) {
      const metas = state[key]
      if (metas && metas[0]) people.push(metas[0])
    }
    people.sort((a, b) => a.joinedAt - b.joinedAt || a.user.localeCompare(b.user))
    for (const fn of this.presenceHandlers) fn(people)
  }

  async join(): Promise<void> {
    this.channel.on('broadcast', { event: 'host' }, ({ payload }) => {
      for (const fn of this.hostHandlers) fn(payload as HostMessage)
    })
    this.channel.on('broadcast', { event: 'guest' }, ({ payload }) => {
      for (const fn of this.guestHandlers) fn(payload as GuestMessage)
    })
    this.channel.on('presence', { event: 'sync' }, () => this.emitPresence())
    this.channel.on('presence', { event: 'join' }, () => this.emitPresence())
    this.channel.on('presence', { event: 'leave' }, () => this.emitPresence())

    await new Promise<void>((resolve) => {
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void this.channel.track(this.presence).then(() => resolve())
        }
      })
    })
  }

  async leave(): Promise<void> {
    try {
      await this.channel.untrack()
    } catch {
      // best effort
    }
    await this.supabase.removeChannel(this.channel)
  }
}

// ---------------------------------------------------------------- lobby

/** Watches the lobby channel and keeps a live list of advertised public tables.
 *  A host advertises its table by tracking it in presence; when the host leaves,
 *  presence drops it automatically, so the list self-cleans with no stored state. */
export class LobbyChannel {
  private channel: RealtimeChannel
  private handlers = new Set<(ads: TableAd[]) => void>()
  private ad: TableAd | null = null

  constructor(
    private supabase: SupabaseClient,
    user: string,
  ) {
    this.channel = supabase.channel(LOBBY, {
      config: { presence: { key: user }, broadcast: { self: false } },
    })
  }

  onTables(fn: (ads: TableAd[]) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  private emit(): void {
    const state = this.channel.presenceState<TableAd & { kind?: string }>()
    const ads: TableAd[] = []
    const seen = new Set<string>()
    for (const key of Object.keys(state)) {
      for (const meta of state[key] ?? []) {
        if (meta && (meta as { code?: string }).code && !seen.has(meta.code)) {
          seen.add(meta.code)
          ads.push(meta as TableAd)
        }
      }
    }
    ads.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const fn of this.handlers) fn(ads)
  }

  /** Start or update this client's own advertisement (host of a public table). */
  async advertise(meta: TableMeta, players: number): Promise<void> {
    this.ad = {
      code: meta.code,
      name: meta.name,
      variantId: meta.variantId,
      players,
      seats: meta.seats,
      hostId: meta.hostId,
      updatedAt: Date.now(),
    }
    await this.channel.track(this.ad)
  }

  /** Stop advertising (table went private, emptied, or host left). */
  async unadvertise(): Promise<void> {
    this.ad = null
    try {
      await this.channel.untrack()
    } catch {
      // best effort
    }
  }

  async join(): Promise<void> {
    this.channel.on('presence', { event: 'sync' }, () => this.emit())
    this.channel.on('presence', { event: 'join' }, () => this.emit())
    this.channel.on('presence', { event: 'leave' }, () => this.emit())
    await new Promise<void>((resolve) => {
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
      })
    })
  }

  async leave(): Promise<void> {
    await this.unadvertise()
    await this.supabase.removeChannel(this.channel)
  }
}
