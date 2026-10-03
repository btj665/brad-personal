// The online poker room: a lobby to make or find a table, and the table itself.
//
// A table is one shared `OnlineTable` (see ../../pokerroom/online/table.ts) — the
// host runs the game, everyone else follows over Supabase Realtime. This file is
// just the chrome: it mounts the table, draws the felt through the same components
// the solo room uses, and lets a player sit, leave, and settle their chips with the
// shared wallet.

import { useEffect, useReducer, useRef, useState } from 'react'

import { useAuth } from '../../auth/AuthProvider'
import { requireSupabase } from '../../supa/client'
import { LobbyChannel, type TableAd } from '../../pokerroom/online/channel'
import { OnlineTable } from '../../pokerroom/online/table'
import type { TableMeta } from '../../pokerroom/online/protocol'
import { VARIANTS, variantById } from '../../pokerroom/variants'
import { ensureFunds, getBalance, recordDelta } from '../../wallet/wallet'
import { PokerTable } from './PokerTable'
import { BetControls } from './BetControls'

const BIG_BLIND = 20
const BUY_IN = 2000
const SEATS = 6

interface Session {
  code: string
  meta: TableMeta
  creator: boolean
}

function randomCode(): string {
  // Four unambiguous characters — easy to read aloud or paste into a message.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/** What to buy in for, capped at the wallet, topping up if broke. */
async function sizeBuyIn(): Promise<number> {
  let bal = getBalance()
  if (bal <= 0) bal = await ensureFunds()
  return Math.min(BUY_IN, Math.max(0, bal))
}

export function OnlinePoker({ onExitOnline }: { onExitOnline: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  if (!session) return <Lobby onStart={setSession} onBack={onExitOnline} />
  return <TableView key={session.code} session={session} onLeave={() => setSession(null)} />
}

// ---------------------------------------------------------------- lobby

function Lobby({ onStart, onBack }: { onStart: (s: Session) => void; onBack: () => void }) {
  const { userId, profile } = useAuth()
  const [name, setName] = useState('')
  const [variantId, setVariantId] = useState(VARIANTS[0].id)
  const [isPublic, setIsPublic] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [tables, setTables] = useState<TableAd[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const lobby = new LobbyChannel(requireSupabase(), userId)
    const off = lobby.onTables(setTables)
    void lobby.join()
    return () => {
      off()
      void lobby.leave()
    }
  }, [userId])

  const create = async () => {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      const buyIn = await sizeBuyIn()
      if (buyIn <= 0) throw new Error('Your wallet is empty — nothing to buy in with.')
      recordDelta('poker', -buyIn)
      const code = randomCode()
      const meta: TableMeta = {
        code,
        name: name.trim() || `${profile?.username ?? 'Player'}'s table`,
        isPublic,
        variantId,
        hostId: userId,
        bigBlind: BIG_BLIND,
        buyIn,
        seats: SEATS,
      }
      onStart({ code, meta, creator: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the table.')
      setBusy(false)
    }
  }

  const join = (code: string) => {
    if (!userId || !code.trim()) return
    const clean = code.trim().toUpperCase()
    // A joiner starts with a stub; the host's first snapshot fills in the real
    // settings (variant, blinds, seats).
    const meta: TableMeta = {
      code: clean,
      name: '',
      isPublic: false,
      variantId: VARIANTS[0].id,
      hostId: '',
      bigBlind: BIG_BLIND,
      buyIn: BUY_IN,
      seats: SEATS,
    }
    onStart({ code: clean, meta, creator: false })
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn pk-back" onClick={onBack}>
            ← Solo play
          </button>
          <span className="sl-blurb pk-blurb">Play with other people. Bots fill any empty seats.</span>
        </div>
      </header>

      <main className="main pk-lobby">
        <section className="pk-lobby-make">
          <h2 className="pk-lobby-h">Start a table</h2>
          <label className="auth-field">
            <span>Table name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday night" maxLength={40} />
          </label>
          <label className="auth-field">
            <span>Game</span>
            <select className="sl-picker" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              {VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pk-lobby-check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>List publicly (anyone can join). Off = private, join by code only.</span>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create table'}
          </button>
        </section>

        <section className="pk-lobby-join">
          <h2 className="pk-lobby-h">Join by code</h2>
          <div className="pk-join-row">
            <input
              className="pk-code-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={6}
            />
            <button className="btn btn-primary" disabled={!joinCode.trim()} onClick={() => join(joinCode)}>
              Join
            </button>
          </div>

          <h2 className="pk-lobby-h pk-lobby-h-pub">Public tables</h2>
          {tables.length === 0 ? (
            <p className="pk-lobby-empty">No public tables right now. Start one above.</p>
          ) : (
            <ul className="pk-table-list">
              {tables.map((t) => (
                <li key={t.code} className="pk-table-row">
                  <div className="pk-table-meta">
                    <b>{t.name}</b>
                    <span>
                      {variantById(t.variantId)?.label ?? t.variantId} · {t.players}/{t.seats} seated
                    </span>
                  </div>
                  <button className="btn" onClick={() => join(t.code)}>
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}

// ---------------------------------------------------------------- the table

function TableView({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { userId, profile } = useAuth()
  const myName = profile?.username ?? 'Player'
  const [, force] = useReducer((c: number) => c + 1, 0)
  const tableRef = useRef<OnlineTable | null>(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!userId) return
    const table = new OnlineTable({
      supabase: requireSupabase(),
      meta: session.meta,
      user: userId,
      name: myName,
      creator: session.creator,
    })
    tableRef.current = table
    const off = table.subscribe(() => force())
    void table.start().then(() => setReady(true))
    return () => {
      off()
      void table.leave()
      tableRef.current = null
    }
    // Depend on primitives only: a background token refresh makes a new `profile`
    // object, and we must not tear the table down and rejoin mid-hand for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userId, myName])

  const table = tableRef.current
  if (!table || !ready) {
    return (
      <main className="main pk-connecting">
        <span className="dealing">Connecting to the table…</span>
      </main>
    )
  }

  const info = table.info
  const view = table.view
  const winners = new Set(info.winners)

  const leave = () => {
    const seat = info.mySeat
    if (seat >= 0) recordDelta('poker', info.stacks[seat] ?? 0)
    onLeave()
  }

  const sit = async (seat: number) => {
    const buyIn = await sizeBuyIn()
    if (buyIn <= 0) return
    recordDelta('poker', -buyIn)
    table.sit(seat, buyIn)
  }

  const seated = info.mySeat >= 0
  const myStack = seated ? (info.stacks[info.mySeat] ?? 0) : 0
  const openSeats = info.kinds
    .map((k, i) => ({ k, i }))
    .filter((s) => s.k === 'bot')
    .map((s) => s.i)
  const busted = seated && myStack <= 0 && (view?.over ?? false)
  // A vacancy prompt goes to seated players other than the one who dropped.
  const showVacancy = info.vacancy && seated && info.vacancy.seat !== info.mySeat

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn pk-back" onClick={leave}>
            ← Leave table
          </button>
          <span className="pk-online-name">{info.meta.name || 'Table'}</span>
          <button
            className="btn pk-code-chip"
            title="Copy the join code"
            onClick={() => {
              void navigator.clipboard?.writeText(info.meta.code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied!' : `Code ${info.meta.code}`}
          </button>
          <span className="sl-blurb pk-blurb">
            {variantById(info.meta.variantId)?.label} · {info.players} playing
            {info.amHost ? ' · you host' : ''}
          </span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Your stack</span>
            <b>{seated ? myStack.toLocaleString() : '—'}</b>
          </span>
        </div>
      </header>

      <main className="main">
        {view ? (
          <PokerTable game={view} winners={winners} awardNet={0} />
        ) : (
          <div className="pk-connecting">
            <span className="dealing">Waiting for the next hand…</span>
          </div>
        )}

        <div className="tray pk-tray">
          {showVacancy ? (
            <div className="controls pk-controls pk-vacancy">
              <div className="prompt">
                <b>{info.vacancy!.name}</b> dropped out. Keep their seat, or let a bot take over?
              </div>
              <div className="button-row button-row-actions">
                <button className="btn btn-primary" onClick={() => table.resolveVacancy('bot')}>
                  Replace with a bot
                </button>
                <button className="btn" onClick={() => table.resolveVacancy('hold')}>
                  Hold their seat
                </button>
              </div>
            </div>
          ) : busted ? (
            <div className="controls controls-idle pk-idle">
              <div className="prompt">
                <b>You're out of chips.</b> Buy back in for another go.
              </div>
              <div className="button-row button-row-actions">
                <button className="btn btn-primary" onClick={() => void sit(info.mySeat)}>
                  Buy back in
                </button>
              </div>
            </div>
          ) : info.joining >= 0 ? (
            <div className="controls controls-idle pk-idle">
              <div className="prompt">
                <b>You're in.</b> Taking seat {info.joining + 1} at the next hand…
              </div>
            </div>
          ) : !seated ? (
            <div className="controls controls-idle pk-idle">
              <div className="prompt">
                <b>You're watching.</b> {openSeats.length ? 'Take a seat to play — bots keep any you leave.' : 'The table is full right now.'}
              </div>
              {openSeats.length > 0 && (
                <div className="button-row button-row-actions pk-seat-pick">
                  {openSeats.map((i) => (
                    <button key={i} className="btn btn-primary" onClick={() => void sit(i)}>
                      Sit (seat {i + 1})
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : view ? (
            <BetControls game={view} pending={view.pending()} />
          ) : (
            <div className="controls controls-idle pk-controls">
              <span className="dealing">Waiting for the next hand…</span>
            </div>
          )}

          <ul className="log">
            {(view?.log ?? []).slice(-8).reverse().map((entry, i) => (
              <li key={`${view?.version}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
                {entry}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  )
}
