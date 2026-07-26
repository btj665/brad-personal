import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { MStudGame, MAX_EXPOSURE } from '../../mstud/engine'
import { payLabel } from '../../mstud/rules'
import { raiseUnits } from '../../mstud/strategy'
import type { MStudAction, Street } from '../../mstud/types'
import { PlayingCard } from '../Card'
import { Chip, ChipStack } from '../Chips'
import { WinToast } from '../WinToast'

const START = 1000

/** The three decision points, and what each one is called at the table. */
const STREETS: Array<{ street: Street; label: string }> = [
  { street: 'third', label: '3rd street' },
  { street: 'fourth', label: '4th street' },
  { street: 'fifth', label: '5th street' },
]

const RAISE_ACTIONS: MStudAction[] = ['raise1', 'raise2', 'raise3']

function make(bankroll: number, ante: number): MStudGame {
  const game = new MStudGame({ seed: randomSeed(), bankroll })
  game.setAnte(ante)
  return game
}

export function MStudScreen() {
  const [game, setGame] = useState(() => make(START, 5))
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  const hand = game.hand ?? game.last
  const street = game.street
  const settled = game.phase === 'settled'
  const live = street !== null

  // The solver is exact and memoised, so the first call of the session does some
  // real work and the rest are free. Only pay for it when the coach is on.
  const hint = useMemo(
    () => (coach && live ? game.hint() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coach, live, game, game.version],
  )

  const rebuy = useCallback(() => setGame(make(START, 5)), [])

  const ante = game.ante
  const wagered = hand?.wagered ?? 0
  const broke = !game.canDeal() && !live
  const net = settled ? game.last?.net ?? 0 : 0

  const log = useMemo(() => game.log.slice(-7).reverse(), [game.log, game.version])

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Mississippi Stud</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((c) => !c)}
            title="Show the play the solver would make"
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast net={net} token={settled ? `ms-${game.round}` : 'ms-live'} />

      <main className="main">
        <div className="ms-wrap">
          <div className="ms-felt">
            <div className="ms-board">
              <section className="ms-hole">
                <h3 className="ms-caption">Your hand</h3>
                <div className="ms-cards">
                  {hand
                    ? hand.hole.map((card, i) => (
                        <PlayingCard key={card.uid} card={card} tilt={i === 0 ? -2 : 2} />
                      ))
                    : [0, 1].map((i) => <span key={i} className="card-ghost" />)}
                </div>
              </section>

              <section className="ms-community">
                <h3 className="ms-caption">Community</h3>
                <div className="ms-cards">
                  {[0, 1, 2].map((i) => {
                    const card = hand?.community[i]
                    if (!card) return <span key={i} className="card-ghost" />
                    const down = i >= (hand?.revealed ?? 0)
                    return (
                      // Keying on the face-up state remounts the card as it turns,
                      // which is what plays the flip.
                      <span key={`${card.uid}-${down ? 'down' : 'up'}`} className="ms-slot">
                        <PlayingCard card={card} down={down} />
                        <span className={`ms-slot-tag${down ? '' : ' ms-slot-tag-on'}`}>
                          {STREETS[i].label}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </section>
            </div>

            <div className="ms-ladder">
              {STREETS.map(({ street: s, label }) => {
                const put = hand?.raises[s]
                const folded = hand?.foldedOn === s
                const now = street === s
                const cls = [
                  'ms-rung',
                  now ? 'ms-rung-now' : '',
                  put ? 'ms-rung-in' : '',
                  folded ? 'ms-rung-fold' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <span key={s} className={cls}>
                    <b className="ms-rung-label">{label}</b>
                    <span className="ms-rung-amt">
                      {folded ? 'fold' : put ? `${put / (hand?.ante ?? 1)}x · ${put}` : now ? '?' : '—'}
                    </span>
                  </span>
                )
              })}
            </div>

            <div className="ms-total">
              <span className="ms-total-label">On the table</span>
              <b className="ms-total-amt">{wagered.toLocaleString()}</b>
              <span className="ms-total-note">
                {hand
                  ? `ante ${hand.ante}${
                      wagered > hand.ante ? ` + ${wagered - hand.ante} raised` : ''
                    } — the pay table applies to all of it`
                  : `up to ${(ante * MAX_EXPOSURE).toLocaleString()} if you climb the whole ladder`}
              </span>
            </div>

            {settled && game.last && (
              <div
                className={`ms-result ${
                  net > 0 ? 'ms-result-win' : net < 0 ? 'ms-result-lose' : 'ms-result-push'
                }`}
              >
                {game.last.folded ? (
                  <>
                    <b>Folded on {game.last.foldedOn} street.</b> {game.last.wagered} gone — and the
                    board came {payLabel(game.last.payKey)}.
                  </>
                ) : (
                  <>
                    <b>{payLabel(game.last.payKey)}.</b>{' '}
                    {net > 0
                      ? `Pays ${net / game.last.wagered}:1 on ${game.last.wagered} — win ${net.toLocaleString()}.`
                      : net === 0
                        ? `Push — ${game.last.wagered} back.`
                        : `Loses ${game.last.wagered}.`}
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="ms-paytable">
            <h3 className="ms-caption">Pay table</h3>
            <table>
              <tbody>
                {game.rules.paytable.map((row) => {
                  const hit = settled && !game.last?.folded && game.last?.payKey === row.key
                  return (
                    <tr key={row.key} className={hit ? 'ms-pay-hit' : undefined}>
                      <td className="ms-pay-name">{row.label}</td>
                      <td className="ms-pay-odds">{row.pay === 0 ? 'push' : `${row.pay}:1`}</td>
                      <td className="ms-pay-cash">
                        {wagered > 0 && row.pay > 0 ? (wagered * row.pay).toLocaleString() : ''}
                      </td>
                    </tr>
                  )
                })}
                <tr className="ms-pay-foot">
                  <td colSpan={3}>
                    A pair of 2s through 5s loses, like any other non-hand. Everything is paid on the
                    total wagered, not on the ante.
                  </td>
                </tr>
              </tbody>
            </table>
          </aside>
        </div>

        <div className="tray">
          {broke ? (
            <div className="controls controls-idle">
              <div className="prompt">
                <b>Out of chips.</b> Three raises deep is ten antes, and the table wants to see them
                all before it deals.
              </div>
              <div className="button-row">
                <button className="btn btn-primary" onClick={rebuy}>
                  Buy in for {START}
                </button>
              </div>
            </div>
          ) : live ? (
            <div className="controls">
              <div className="prompt">
                {street === 'third'
                  ? 'Two cards, nothing turned yet. Fold, or put money up.'
                  : street === 'fourth'
                    ? 'One card up, two to come.'
                    : 'Last card to come. Folding now gives up everything already out.'}
                {coach && hint && (
                  <span className="ms-coach">
                    {' '}
                    Solver: <b>{hint === 'fold' ? 'fold' : `${raiseUnits(hint)}x`}</b>
                  </span>
                )}
              </div>
              <div className="button-row button-row-actions">
                <button
                  className={`btn btn-fold${coach && hint === 'fold' ? ' ms-btn-hint' : ''}`}
                  onClick={() => game.decide('fold')}
                >
                  Fold
                  <span className="ms-btn-sub">lose {wagered}</span>
                </button>
                {RAISE_ACTIONS.map((action) => {
                  const units = raiseUnits(action)
                  return (
                    <button
                      key={action}
                      className={`btn btn-primary btn-big${
                        coach && hint === action ? ' ms-btn-hint' : ''
                      }`}
                      onClick={() => game.decide(action)}
                    >
                      {units}x
                      <span className="ms-btn-sub">{(ante * units).toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="controls">
              <div className="ms-bet-row">
                <div className="chip-tray">
                  {game.rules.chips.map((value) => (
                    <Chip
                      key={value}
                      value={value}
                      onClick={() => game.setAnte(value)}
                      label={`Ante ${value}`}
                      disabled={!game.canDeal(value)}
                    />
                  ))}
                </div>
                <div className="ms-bet-readout">
                  <span className="ms-total-label">Ante</span>
                  <ChipStack amount={ante} denominations={game.rules.chips} />
                </div>
              </div>
              <div className="button-row button-row-actions">
                <button
                  className="btn btn-primary btn-big"
                  disabled={!game.canDeal(ante)}
                  onClick={() => game.deal(ante)}
                >
                  Deal <span className="ms-btn-sub">{ante}</span>
                </button>
              </div>
            </div>
          )}

          <ul className="log">
            {log.map((entry, i) => (
              <li key={`${game.version}-${i}`} className={i === 0 ? 'log-fresh' : undefined}>
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  )
}
