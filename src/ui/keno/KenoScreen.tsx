import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { KenoGame } from '../../keno/engine'
import { BALLS, DRAWN, MAX_PICKS, oneIn, oneInFloor } from '../../keno/odds'
import { houseEdge, payFor, winningCatches } from '../../keno/paytables'
import { WinToast } from '../WinToast'

const START = 1000
const BETS = [1, 5, 25, 100]
/** How long between balls. A real keno board takes a few seconds a ball; this is
 *  the same ceremony at a pace nobody will sit through twice. */
const REVEAL_MS = 150

/** The rack, laid out the way a keno ticket prints it: eight rows of ten. */
const ROWS = Array.from({ length: BALLS / 10 }, (_, r) =>
  Array.from({ length: 10 }, (_, c) => r * 10 + c + 1),
)

const SPOT_COUNTS = Array.from({ length: MAX_PICKS }, (_, i) => i + 1)

function odds(picks: number, caught: number): string {
  const n = oneIn(picks, caught)
  if (!Number.isFinite(n)) return '—'
  return n < 1000 ? `1 in ${n.toFixed(1)}` : `1 in ${oneInFloor(picks, caught).toLocaleString()}`
}

export function KenoScreen() {
  const [game, setGame] = useState(() => new KenoGame({ seed: randomSeed(), bankroll: START }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  // The engine fixed all twenty numbers when the ticket was bought, so the
  // ceremony is only a timer — unmounting or switching games cannot change an
  // outcome, it just stops showing it.
  useEffect(() => {
    if (game.phase !== 'drawing') return
    const t = window.setInterval(() => game.revealNext(), REVEAL_MS)
    return () => window.clearInterval(t)
  }, [game, game.phase, game.round])

  const rebuy = useCallback(
    () => setGame(new KenoGame({ seed: randomSeed(), bankroll: START })),
    [],
  )

  const spots = game.picks.length
  const marked = new Set(game.picks)
  const calledList = game.called()
  const called = new Set(calledList)
  const latest = calledList.length > 0 ? calledList[calledList.length - 1] : null
  const caughtNow = game.caughtSoFar().length

  const result = game.last
  const settled = game.phase === 'complete' && result !== null
  const net = settled && result ? result.returned - result.staked : 0
  const rows = spots > 0 ? winningCatches(game.table, spots) : []
  const edge = spots > 0 ? houseEdge(game.table, spots) : null
  // Only offer a rebuy when the smallest chip is out of reach — a short bankroll
  // can still play down, and nagging someone into a rebuy is the casino's job.
  const broke = game.bankroll < BETS[0] && game.phase === 'pick'
  const short = !broke && game.bankroll < game.bet

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Keno</span>
          <span className="kn-card-name">{game.table.label}</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={net} token={settled ? `kn-${game.round}` : 'kn-live'} />

      <main className="main">
        <div className="kn">
          <div className="kn-layout">
            <div className="kn-left">
              <div className="kn-rack">
                {ROWS.map((row, r) => (
                  <div className="kn-row-nums" key={r}>
                    {row.map((n) => {
                      const isMarked = marked.has(n)
                      const isCalled = called.has(n)
                      const cls = [
                        'kn-cell',
                        isMarked && isCalled ? 'kn-hit' : '',
                        isMarked && !isCalled ? 'kn-mark' : '',
                        !isMarked && isCalled ? 'kn-call' : '',
                        n === latest ? 'kn-latest' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                      return (
                        <button
                          key={n}
                          className={cls}
                          disabled={game.phase === 'drawing'}
                          aria-pressed={isMarked}
                          onClick={() => game.togglePick(n)}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="kn-board">
                <span className="kn-board-label">
                  Called <b>{calledList.length}</b>/{DRAWN}
                </span>
                <div className="kn-balls">
                  {calledList.length === 0 ? (
                    <span className="kn-balls-empty">
                      {game.phase === 'pick' ? 'Mark your spots.' : 'Here they come…'}
                    </span>
                  ) : (
                    calledList.map((n, i) => (
                      <span
                        key={`${game.round}-${i}`}
                        className={`kn-ball${marked.has(n) ? ' kn-ball-hit' : ''}`}
                      >
                        {n}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="kn-side">
              <div className="kn-ticket">
                <span className="kn-ticket-line">
                  <span>Spots</span>
                  <b>{spots || '—'}</b>
                </span>
                <span className="kn-ticket-line">
                  <span>Bet</span>
                  <b>{game.bet}</b>
                </span>
                <span className="kn-ticket-line">
                  <span>Caught</span>
                  <b>
                    {spots > 0 ? `${caughtNow} of ${spots}` : '—'}
                  </b>
                </span>
              </div>

              <div className="kn-pay">
                <div className="kn-pay-head">
                  <span>{spots > 0 ? `${spots}-spot pays` : 'Pay table'}</span>
                  {edge !== null && (
                    <span className="kn-edge" title="Exact, from the hypergeometric distribution">
                      House edge {(edge * 100).toFixed(2)}%
                    </span>
                  )}
                </div>
                {spots === 0 ? (
                  <p className="kn-pay-empty">
                    Mark one to ten numbers to see what the card pays for them.
                  </p>
                ) : (
                  <table className="kn-pay-table">
                    <thead>
                      <tr>
                        <th>Catch</th>
                        <th>Pays</th>
                        <th>Odds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((k) => {
                        const live = caughtNow === k && calledList.length > 0
                        const won = settled && result !== null && result.caught.length === k
                        return (
                          <tr
                            key={k}
                            className={won ? 'kn-pay-won' : live ? 'kn-pay-live' : undefined}
                          >
                            <td>{k}</td>
                            <td>{payFor(game.table, spots, k).toLocaleString()}</td>
                            <td className="kn-pay-odds">{odds(spots, k)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                <p className="kn-truth">
                  Keno is the worst bet in the building — this card keeps 25–30% of every
                  ticket. Blackjack keeps about 0.4%.
                </p>
              </div>

              <div className="kn-result">
                {settled && result ? (
                  result.returned > 0 ? (
                    <>
                      <span className="kn-result-head kn-up">
                        Caught {result.caught.length} of {result.picks.length}
                      </span>
                      <span className="kn-result-sub">
                        Pays {result.odds} for 1 — {result.returned.toLocaleString()} back on{' '}
                        {result.staked}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="kn-result-head kn-down">
                        Caught {result.caught.length} of {result.picks.length}
                      </span>
                      <span className="kn-result-sub">No pay. The ticket keeps the stake.</span>
                    </>
                  )
                ) : (
                  <span className="kn-result-sub">
                    {game.phase === 'drawing' ? 'Twenty balls, one at a time.' : 'Ticket not bought.'}
                  </span>
                )}
              </div>
            </aside>
          </div>

          <div className="kn-controls">
            <div className="kn-quick">
              <span className="kn-quick-label">Quick pick</span>
              {SPOT_COUNTS.map((k) => (
                <button
                  key={k}
                  className={`kn-spot${spots === k ? ' kn-spot-on' : ''}`}
                  disabled={game.phase === 'drawing'}
                  onClick={() => game.quickPick(k)}
                >
                  {k}
                </button>
              ))}
              <button
                className="btn btn-ghost"
                disabled={game.phase === 'drawing' || spots === 0}
                onClick={() => game.clearPicks()}
              >
                Clear
              </button>
            </div>

            <div className="kn-bets">
              {BETS.map((v) => (
                <button
                  key={v}
                  className={`kn-chip${game.bet === v ? ' kn-chip-on' : ''}`}
                  disabled={game.phase === 'drawing'}
                  onClick={() => game.setBet(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="kn-actions">
              {broke ? (
                <button className="btn btn-primary btn-big" onClick={rebuy}>
                  Buy in for {START}
                </button>
              ) : game.phase === 'drawing' ? (
                <button className="btn btn-ghost btn-big" onClick={() => game.revealAll()}>
                  Skip the ceremony
                </button>
              ) : game.phase === 'complete' ? (
                <button className="btn btn-primary btn-big" onClick={() => game.next()}>
                  Same ticket
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-big"
                  disabled={!game.canDraw()}
                  onClick={() => game.draw()}
                >
                  {spots === 0
                    ? 'Mark your spots'
                    : short
                      ? `Not enough for ${game.bet}`
                      : `Buy ticket — ${game.bet}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
