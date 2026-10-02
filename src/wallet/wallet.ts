// The wallet — one play-money balance, shared by every game and carried between
// them and between visits.
//
// It is deliberately a plain module-level store, not React state, because the
// balance outlives any one game screen: you take it from blackjack to pai gow and
// back, and it has to be the same number the whole time. Screens read it through
// `useWallet()`; games settle rounds through `settle()`.
//
// Two modes, chosen by whether a backend is configured and someone is signed in:
//   * cloud — the balance lives in Supabase. Rounds update a local optimistic
//     copy at once and flush to the server in debounced batches, so play feels
//     instant but the truth is server-side and survives a refresh or a new device.
//   * guest — no backend (or signed out): the balance lives in localStorage, so a
//     shared zip or `npm run dev` still plays and still remembers between reloads.

import { supabase } from '../supa/client'

/** Starting stake, and what a broke wallet is refilled to. Mirrors schema.sql. */
export const BASE_STAKE = 1000

const GUEST_KEY = 'tables.guest.balance'
const FLUSH_MS = 2500

type Mode = 'guest' | 'cloud'

interface Pending {
  wagered: number
  won: number
  rounds: number
}

let balance = readGuest()
let mode: Mode = 'guest'
let userId: string | null = null
let ready = true

const pendingByGame = new Map<string, Pending>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let guestTopupAt = 0

const listeners = new Set<() => void>()

// ---------------------------------------------------------------- store

function emit() {
  for (const fn of listeners) fn()
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getBalance(): number {
  return balance
}
/** True once the cloud balance has loaded; always true in guest mode. Screens can
 *  wait on it before funding a game so a hand isn't dealt against a stale number. */
export function isReady(): boolean {
  return ready
}

function setBalance(n: number) {
  const next = Math.max(0, Math.round(n))
  if (next !== balance) {
    balance = next
    if (mode === 'guest') writeGuest(balance)
    emit()
  }
}

// ---------------------------------------------------------------- guest storage

function readGuest(): number {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    const n = raw == null ? BASE_STAKE : Number(raw)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : BASE_STAKE
  } catch {
    return BASE_STAKE
  }
}
function writeGuest(n: number) {
  try {
    localStorage.setItem(GUEST_KEY, String(n))
  } catch {
    // Private mode or blocked storage: the balance simply won't persist. Fine.
  }
}

// ---------------------------------------------------------------- session

/** Enter cloud mode for a signed-in user: load their server balance. */
export async function connect(id: string): Promise<void> {
  userId = id
  mode = 'cloud'
  ready = false
  pendingByGame.clear()
  emit()
  if (!supabase) return
  const { data, error } = await supabase.from('wallets').select('balance').eq('user_id', id).single()
  if (!error && data) balance = Math.max(0, Math.round(Number(data.balance)))
  ready = true
  emit()
}

/** Leave cloud mode (sign-out): flush what's owed, then fall back to guest. */
export async function disconnect(): Promise<void> {
  await flush()
  userId = null
  mode = 'guest'
  ready = true
  balance = readGuest()
  emit()
}

// ---------------------------------------------------------------- settling

/** Record a round: what it staked and what it returned. Updates the balance at
 *  once and queues the amounts for the next flush. `won` is the gross return, so
 *  a push is `settle(game, bet, bet)` and a total loss is `settle(game, bet, 0)`. */
export function settle(game: string, wagered: number, won: number): void {
  const w = Math.max(0, wagered)
  const g = Math.max(0, won)
  if (w === 0 && g === 0) return
  setBalance(balance - w + g)
  const p = pendingByGame.get(game) ?? { wagered: 0, won: 0, rounds: 0 }
  p.wagered += w
  p.won += g
  p.rounds += 1
  pendingByGame.set(game, p)
  scheduleFlush()
}

/** Mirror a game engine's bankroll change into the wallet. Games hold a working
 *  `bankroll` that falls when a bet is placed and rises when it's paid, so a
 *  negative delta is money wagered and a positive one is money won. This keeps the
 *  shared balance in lock-step with whatever game is on screen, and feeds the same
 *  wagered/won totals to the flush. */
export function recordDelta(game: string, delta: number): void {
  if (delta === 0) return
  const p = pendingByGame.get(game) ?? { wagered: 0, won: 0, rounds: 0 }
  if (delta < 0) {
    p.wagered += -delta
    p.rounds += 1
  } else {
    p.won += delta
  }
  pendingByGame.set(game, p)
  setBalance(balance + delta)
  scheduleFlush()
}

/** Make sure there's money to play with: if broke, top up to the base stake.
 *  Returns the balance afterwards. Cloud mode asks the server (which enforces the
 *  cooldown); guest mode refills locally with a short cooldown of its own. */
export async function ensureFunds(): Promise<number> {
  if (balance > 0) return balance
  if (mode === 'guest' || !supabase || !userId) {
    const now = Date.now()
    if (now - guestTopupAt > 15000) {
      guestTopupAt = now
      setBalance(BASE_STAKE)
    }
    return balance
  }
  await flush()
  const { data, error } = await supabase.rpc('top_up')
  if (!error && data != null) {
    balance = Math.max(0, Math.round(Number(data)))
    emit()
  }
  return balance
}

function scheduleFlush() {
  if (mode !== 'cloud' || flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, FLUSH_MS)
}

/** Push every queued game's batch to the server and reconcile to the authoritative
 *  balance it returns. Safe to call any time; a no-op with nothing pending. */
export async function flush(): Promise<void> {
  if (mode !== 'cloud' || !supabase || !userId || flushing) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const batches = [...pendingByGame.entries()]
  if (batches.length === 0) return
  pendingByGame.clear()
  flushing = true
  try {
    let authoritative = balance
    for (const [game, p] of batches) {
      const { data, error } = await supabase.rpc('settle_batch', {
        p_game: game,
        p_wagered: p.wagered,
        p_won: p.won,
        p_rounds: p.rounds,
      })
      if (error) {
        // Put it back and try again on the next flush rather than losing the play.
        const back = pendingByGame.get(game) ?? { wagered: 0, won: 0, rounds: 0 }
        back.wagered += p.wagered
        back.won += p.won
        back.rounds += p.rounds
        pendingByGame.set(game, back)
        continue
      }
      if (data != null) authoritative = Math.max(0, Math.round(Number(data)))
    }
    // Reconcile to the server's number. It already reflects everything we flushed;
    // anything queued again after an error stays pending for next time.
    balance = authoritative
    emit()
  } finally {
    flushing = false
    if (pendingByGame.size > 0) scheduleFlush()
  }
}
