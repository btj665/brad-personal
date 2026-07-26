import { useCallback, useState, useSyncExternalStore } from 'react'

import { randomSeed } from '../../engine/rng'
import { LetItRideGame } from '../../letitride/engine'
import { labelFor, PAYTABLE } from '../../letitride/rules'
import { BET1_CHART, BET2_CHART } from '../../letitride/strategy'
import { ChipStack } from '../Chips'
import { PlayingCard } from '../Card'
import { WinToast } from '../WinToast'

const START = 1000
const UNITS = [5, 25, 100]
const CHIPS = [5, 25, 100, 500]

/** The three circles a real layout prints: 1, 2 and $. The dollar sign is bet 3,
 *  the one the player never gets to take back. */
const CIRCLES = ['1', '2', '$']

export function LetItRideScreen() {
  const [game, setGame] = useState(() => new LetItRideGame({ seed: randomSeed(), bankroll: START }))
  const [coach, setCoach] = useState(false)
  useSyncExternalStore(game.subscribe, game.getVersion)

  const rebuy = useCallback(
    () => setGame(new LetItRideGame({ seed: randomSeed(), bankroll: START, unit: game.unit })),
    [game],
  )

  const round = game.round ?? game.last
  const deciding = game.phase === 'decision1' || game.phase === 'decision2'
  const pending = game.pendingBet()
  const advice = game.advice()
  const settled = game.phase === 'complete' && game.last !== null
  const broke = !game.canDeal() && !deciding

  // The chart being read right now; before the deal, show the first one as a
  // reference rather than an empty panel.
  const chart = game.phase === 'decision2' ? BET2_CHART : BET1_CHART
  const chartTitle = game.phase === 'decision2' ? 'Bet 2 — let it ride with' : 'Bet 1 — let it ride with'

  const net = settled ? game.last!.net : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Let It Ride</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
          <button
            className={`btn btn-ghost${coach ? ' btn-on' : ''}`}
            onClick={() => setCoach((v) => !v)}
            title="Show the published pull-back chart and what it says about this hand"
          >
            Coach
          </button>
        </div>
      </header>

      <WinToast net={net} token={settled ? `lir-${game.last!.n}` : 'lir-live'} />

      <main className="main">
        <div className="lir">
          <div className="lir-layout">
            <aside className="lir-paytable">
              <h3 className="lir-paytable-title">Pays on every bet still out</h3>
              <table>
                <tbody>
                  {PAYTABLE.map((row) => (
                    <tr key={row.key} className={round?.payKey === row.key ? 'lir-pay-hit' : undefined}>
                      <td className="lir-pay-name">{row.label}</td>
                      <td className="lir-pay-odds">{row.odds}:1</td>
                    </tr>
                  ))}
                  <tr className={settled && round?.payKey === null ? 'lir-pay-hit' : undefined}>
                    <td className="lir-pay-name lir-pay-lose">Anything else</td>
                    <td className="lir-pay-odds lir-pay-lose">loses</td>
                  </tr>
                </tbody>
              </table>
              <p className="lir-paytable-foot">
                No dealer, nothing to beat. Three bets out, one hand, paid three times.
              </p>
            </aside>

            <div className="lir-felt">
              <div className="lir-community">
                <span className="lir-label">Community</span>
                <div className="lir-community-cards">
                  {[0, 1].map((i) => {
                    const up = (round?.revealed ?? 0) > i
                    const card = round?.community[i]
                    if (!card) return <span key={i} className="card-ghost" />
                    // Keying on the face-up flag remounts the slot when the card
                    // turns, which is what fires the flip animation — one card at
                    // a time, as the dealer turns them.
                    return (
                      <div key={`${round!.n}-${i}-${up}`} className={`lir-flip${up ? ' lir-flip-up' : ''}`}>
                        <PlayingCard card={card} down={!up} />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="lir-hand">
                <span className="lir-label">Your three</span>
                <div className="lir-hand-cards">
                  {round
                    ? round.cards.map((card, i) => (
                        <PlayingCard key={card.uid} card={card} tilt={(i - 1) * 2} />
                      ))
                    : [0, 1, 2].map((i) => <span key={i} className="card-ghost" />)}
                </div>
              </div>

              <div className="lir-circles">
                {CIRCLES.map((mark, i) => {
                  const riding = round ? round.riding[i] : false
                  const idle = !round
                  const active = pending === i
                  const cls = [
                    'lir-circle',
                    riding ? 'lir-circle-on' : 'lir-circle-empty',
                    idle ? 'lir-circle-idle' : '',
                    active ? 'lir-circle-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <div key={mark} className={cls}>
                      <span className="lir-circle-mark">{mark}</span>
                      {riding && round ? (
                        <ChipStack amount={round.unit} denominations={CHIPS} />
                      ) : (
                        <span className="lir-circle-back">{idle ? game.unit : 'back'}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="lir-result">
                {settled ? (
                  <span className={`lir-verdict${net > 0 ? ' lir-verdict-win' : net < 0 ? ' lir-verdict-lose' : ''}`}>
                    {game.last!.payKey ? labelFor(game.last!.payKey) : 'No pair of tens'} —{' '}
                    {game.last!.riding.filter(Boolean).length} bet
                    {game.last!.riding.filter(Boolean).length === 1 ? '' : 's'} out,{' '}
                    {net > 0 ? `win ${net.toLocaleString()}` : net < 0 ? `lose ${(-net).toLocaleString()}` : 'even'}
                  </span>
                ) : deciding ? (
                  <span className="prompt">
                    <b>Bet {pending! + 1}</b> — pull it back, or let it ride.
                    {game.phase === 'decision1'
                      ? ' Nothing is showing yet.'
                      : ' One community card is up.'}
                  </span>
                ) : (
                  <span className="prompt">
                    Three equal bets of <b>{game.unit}</b> buy three cards. Bet 3 always rides.
                  </span>
                )}
              </div>
            </div>
          </div>

          {coach && (
            <div className="lir-coach">
              <h4 className="lir-coach-title">{chartTitle}</h4>
              <ol className="lir-chart">
                {chart.map((line, i) => (
                  <li key={line} className={advice && advice.clause === i ? 'lir-chart-hit' : undefined}>
                    {line}
                  </li>
                ))}
              </ol>
              <p className={`lir-coach-say${advice ? (advice.ride ? ' lir-say-ride' : ' lir-say-pull') : ''}`}>
                {advice
                  ? advice.ride
                    ? `Let it ride — ${advice.reason.toLowerCase()}.`
                    : `Pull it back — ${advice.reason.toLowerCase()}.`
                  : 'The chart applies at each of the two decisions.'}
              </p>
            </div>
          )}

          <div className="lir-controls">
            <div className="lir-units">
              {UNITS.map((n) => (
                <button
                  key={n}
                  className={`lir-unit${game.unit === n ? ' lir-unit-on' : ''}`}
                  disabled={deciding}
                  onClick={() => game.setUnit(n)}
                >
                  {n}
                </button>
              ))}
              <span className="lir-unit-label">per bet — {game.unit * 3} in play</span>
            </div>

            <div className="button-row button-row-actions">
              {deciding ? (
                <>
                  <button
                    className={`btn btn-ghost${coach && advice && !advice.ride ? ' lir-advise' : ''}`}
                    onClick={() => game.decide('pull')}
                  >
                    Pull back bet {pending! + 1}
                  </button>
                  <button
                    className={`btn btn-primary btn-big${coach && advice?.ride ? ' lir-advise' : ''}`}
                    onClick={() => game.decide('ride')}
                  >
                    Let it ride
                  </button>
                </>
              ) : broke ? (
                <button className="btn btn-primary" onClick={rebuy}>
                  Buy in for {START}
                </button>
              ) : (
                <button className="btn btn-primary btn-big" onClick={() => game.deal()}>
                  Deal
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
