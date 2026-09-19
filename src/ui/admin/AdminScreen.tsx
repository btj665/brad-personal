// The owner's back office.
//
// Everything here comes from the admin_* functions in the database, which check
// is_admin server-side before returning a row — so this screen can't show a
// non-admin anything even if it were somehow rendered for them. It's read-only:
// signups, who's playing, and what they've wagered.

import { useCallback, useEffect, useState } from 'react'

import { requireSupabase } from '../../supa/client'

interface Overview {
  players: number
  active_24h: number
  rounds: number
  total_wagered: number
  total_won: number
  on_table: number
  signups: Array<{ day: string; count: number }>
  by_game: Array<{ game: string; wagered: number; won: number; rounds: number }>
}
interface Player {
  username: string
  is_admin: boolean
  balance: number
  total_wagered: number
  total_won: number
  rounds: number
  topups: number
  joined: string
  last_active: string | null
}
interface Activity {
  username: string
  game: string
  wagered: number
  won: number
  rounds: number
  at: string
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const whenShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export function AdminScreen() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = requireSupabase()
    setLoading(true)
    setError(null)
    try {
      const [o, p, a] = await Promise.all([
        supabase.rpc('admin_overview'),
        supabase.rpc('admin_players'),
        supabase.rpc('admin_activity', { p_limit: 40 }),
      ])
      if (o.error) throw o.error
      if (p.error) throw p.error
      if (a.error) throw a.error
      setOverview(o.data as Overview)
      setPlayers((p.data as Player[]) ?? [])
      setActivity((a.data as Activity[]) ?? [])
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const peakSignup = Math.max(1, ...(overview?.signups.map((s) => s.count) ?? [1]))

  return (
    <div className="adm">
      <header className="adm-head">
        <h1>Back office</h1>
        <button className="adm-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {error && <div className="adm-error">{error}</div>}

      {overview && (
        <>
          <section className="adm-stats">
            <Stat label="Players" value={overview.players.toLocaleString()} />
            <Stat label="Active (24h)" value={overview.active_24h.toLocaleString()} />
            <Stat label="Rounds played" value={overview.rounds.toLocaleString()} />
            <Stat label="Total wagered" value={money(overview.total_wagered)} />
            <Stat label="Total won" value={money(overview.total_won)} />
            <Stat label="On tables now" value={money(overview.on_table)} />
          </section>

          <section className="adm-panel">
            <h2>Signups — last 30 days</h2>
            {overview.signups.length === 0 ? (
              <p className="adm-empty">No signups yet.</p>
            ) : (
              <div className="adm-bars">
                {overview.signups.map((s) => (
                  <div className="adm-bar" key={s.day} title={`${s.day}: ${s.count}`}>
                    <div className="adm-bar-fill" style={{ height: `${(s.count / peakSignup) * 100}%` }} />
                    <span className="adm-bar-day">{new Date(s.day).getDate()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="adm-cols">
            <section className="adm-panel">
              <h2>Players</h2>
              <div className="adm-tablewrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th className="r">Balance</th>
                      <th className="r">Wagered</th>
                      <th className="r">Won</th>
                      <th className="r">Rounds</th>
                      <th className="r">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.username}>
                        <td>
                          {p.username}
                          {p.is_admin && <span className="adm-badge">admin</span>}
                        </td>
                        <td className="r">{money(p.balance)}</td>
                        <td className="r">{money(p.total_wagered)}</td>
                        <td className="r">{money(p.total_won)}</td>
                        <td className="r">{p.rounds.toLocaleString()}</td>
                        <td className="r">{whenShort(p.joined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="adm-panel">
              <h2>Recent play</h2>
              <div className="adm-tablewrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Game</th>
                      <th className="r">Wagered</th>
                      <th className="r">Won</th>
                      <th className="r">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a, i) => (
                      <tr key={i}>
                        <td>{a.username}</td>
                        <td>{a.game}</td>
                        <td className="r">{money(a.wagered)}</td>
                        <td className="r">{money(a.won)}</td>
                        <td className="r">{whenShort(a.at)}</td>
                      </tr>
                    ))}
                    {activity.length === 0 && (
                      <tr>
                        <td colSpan={5} className="adm-empty">
                          No play recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-stat">
      <span className="adm-stat-value">{value}</span>
      <span className="adm-stat-label">{label}</span>
    </div>
  )
}
