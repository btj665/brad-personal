import { useCallback, useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react'

import { randomSeed } from '../../engine/rng'
import {
  anyTripleBet,
  bigBet,
  comboBet,
  COMBOS,
  doubleBet,
  evenBet,
  FACES,
  oddBet,
  singleBet,
  smallBet,
  totalBet,
  TOTALS,
  tripleBet,
  type Bet,
  type Face,
} from '../../sicbo/bets'
import { SicBoGame } from '../../sicbo/engine'
import { WinToast } from '../WinToast'

const START = 500
const CHIPS = [1, 5, 25, 100]
/** How long the dice tumble before the faces — and the winning spots — show. */
const SHAKE_MS = 1400

// Which of the nine cells in a 3×3 grid carry a pip, per face.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Die({
  face,
  size = 'sm',
  delay = 0,
  rolling = false,
}: {
  face: Face
  size?: 'sm' | 'lg'
  delay?: number
  rolling?: boolean
}) {
  const on = new Set(PIPS[face] ?? [])
  return (
    <span
      className={`sb-die sb-die-${size}${rolling ? ' sb-die-roll' : ''}`}
      style={rolling ? { animationDelay: `${delay}ms` } : undefined}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={`sb-pip${on.has(i) ? ' sb-pip-on' : ''}`} />
      ))}
    </span>
  )
}

/** What a spot prints above its price: the dice it names, or a word. */
function SpotFace({ bet }: { bet: Bet }) {
  if (bet.faces.length > 0) {
    return (
      <span className="sb-spot-dice">
        {bet.faces.map((f, i) => (
          <Die key={i} face={f} />
        ))}
        {/* A triple names one face but shows three; a double, two. */}
        {bet.kind === 'triple' ? (
          <>
            <Die face={bet.faces[0]} />
            <Die face={bet.faces[0]} />
          </>
        ) : bet.kind === 'double' ? (
          <Die face={bet.faces[0]} />
        ) : null}
      </span>
    )
  }
  if (bet.kind === 'total') return <span className="sb-spot-total">{bet.total}</span>
  return <span className="sb-spot-word">{bet.label}</span>
}

function Spot({
  bet,
  amount,
  locked,
  win,
  wide,
  place,
  clear,
}: {
  bet: Bet
  amount: number
  locked: boolean
  win: boolean
  wide?: boolean
  place: (bet: Bet) => void
  clear: (e: MouseEvent, key: string) => void
}) {
  return (
    <div
      className={`sb-spot sb-spot-${bet.kind}${wide ? ' sb-spot-wide' : ''}${win ? ' sb-spot-win' : ''}`}
      title={`${bet.label} — pays ${bet.pays}`}
      onClick={() => !locked && place(bet)}
      onContextMenu={(e) => clear(e, bet.key)}
    >
      <SpotFace bet={bet} />
      <span className="sb-spot-pay">{bet.pays}</span>
      {amount > 0 && <span className="sb-chip">{amount}</span>}
    </div>
  )
}

export function SicBoScreen() {
  const [game, setGame] = useState(() => new SicBoGame({ seed: randomSeed(), bankroll: START }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  // The engine settles the whole felt the moment the dice are shaken, so the
  // animation is purely a curtain: hold the faces back, tumble, then reveal and
  // light up the winning spots.
  const [revealed, setRevealed] = useState(true)
  const [tick, setTick] = useState(0)
  const busy = !revealed

  useEffect(() => {
    if (revealed) return
    const spin = window.setInterval(() => setTick((t) => t + 1), 90)
    const done = window.setTimeout(() => setRevealed(true), SHAKE_MS)
    return () => {
      window.clearInterval(spin)
      window.clearTimeout(done)
    }
  }, [revealed])

  const rebuy = useCallback(() => {
    setGame(new SicBoGame({ seed: randomSeed(), bankroll: START }))
    setRevealed(true)
  }, [])

  const shake = useCallback(() => {
    if (!game.canShake() || busy) return
    game.shake()
    setRevealed(false)
  }, [game, busy])

  const newBets = useCallback(
    (same: boolean) => {
      game.next()
      if (same) game.rebet()
      setRevealed(true)
    },
    [game],
  )

  const place = useCallback((bet: Bet) => game.place(bet), [game])
  const clear = useCallback(
    (e: MouseEvent, key: string) => {
      e.preventDefault()
      game.removeBet(key)
    },
    [game],
  )

  const result = game.lastResult
  const locked = game.phase !== 'betting'
  const net = result ? result.returned - result.staked : 0
  const broke = game.bankroll < 1 && game.phase === 'betting'
  const winners = new Set(revealed && result ? result.winners : [])
  const board = revealed ? game.history : game.history.slice(1)

  // While the dice are in the air, show faces that keep changing; they only
  // settle on what the engine already rolled.
  const shown: Face[] = result
    ? revealed
      ? [result.roll.a, result.roll.b, result.roll.c]
      : [0, 1, 2].map((i) => (((tick * 2 + i * 3) % 6) + 1) as Face)
    : [1, 1, 1]

  const spot = (bet: Bet, wide?: boolean) => (
    <Spot
      key={bet.key}
      bet={bet}
      amount={game.bets.get(bet.key)?.amount ?? 0}
      locked={locked}
      win={winners.has(bet.key)}
      wide={wide}
      place={place}
      clear={clear}
    />
  )

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Sic Bo</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={revealed && result ? net : 0} token={revealed && result ? `sb-${game.round}` : 'sb-live'} />

      <main className="main">
        <div className="sb">
          <div className="sb-stage">
            <div className={`sb-cup${busy ? ' sb-cup-shaking' : ''}`}>
              {shown.map((f, i) => (
                <Die key={i} face={f} size="lg" delay={i * 70} rolling={busy} />
              ))}
            </div>

            <div className="sb-readout">
              {revealed && result ? (
                <>
                  <span className="sb-total">{result.total}</span>
                  <span className="sb-total-tag">
                    {result.roll.a === result.roll.b && result.roll.b === result.roll.c
                      ? 'Triple'
                      : `${result.total <= 10 ? 'Small' : 'Big'} · ${result.total % 2 === 1 ? 'Odd' : 'Even'}`}
                  </span>
                  <span className={`sb-net${net >= 0 ? ' sb-up' : ' sb-down'}`}>{net >= 0 ? `+${net}` : net}</span>
                </>
              ) : (
                <span className="sb-readout-idle">{busy ? 'Shaking…' : 'Place your chips.'}</span>
              )}
            </div>

            <div className="sb-board">
              {board.length === 0 ? (
                <span className="sb-board-empty">No shakes yet</span>
              ) : (
                board.map((h, i) => {
                  const t = h.a + h.b + h.c
                  const trip = h.a === h.b && h.b === h.c
                  return (
                    <span
                      key={`${game.round}-${i}`}
                      className={`sb-hist${trip ? ' sb-hist-trip' : t <= 10 ? ' sb-hist-small' : ' sb-hist-big'}`}
                    >
                      {t}
                    </span>
                  )
                })
              )}
            </div>
          </div>

          <div className={`sb-layout${locked ? ' sb-layout-locked' : ''}`}>
            <div className="sb-row sb-row-top">
              {spot(smallBet(), true)}
              {spot(oddBet())}
              {spot(anyTripleBet())}
              {spot(evenBet())}
              {spot(bigBet(), true)}
            </div>

            <div className="sb-grid sb-grid-6">{FACES.map((f) => spot(tripleBet(f)))}</div>
            <div className="sb-grid sb-grid-6">{FACES.map((f) => spot(doubleBet(f)))}</div>
            <div className="sb-grid sb-grid-7">{TOTALS.map((t) => spot(totalBet(t)))}</div>
            <div className="sb-grid sb-grid-5">{COMBOS.map(([a, b]) => spot(comboBet(a, b)))}</div>
            <div className="sb-grid sb-grid-6">{FACES.map((f) => spot(singleBet(f)))}</div>
          </div>

          <div className="sb-controls">
            <div className="sb-chips">
              {CHIPS.map((v) => (
                <button
                  key={v}
                  className={`vp-coin${game.chip === v ? ' vp-coin-on' : ''}`}
                  onClick={() => game.setChip(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="sb-actions">
              <span className="sb-staked">On table: {game.staked}</span>
              {broke ? (
                <button className="btn btn-primary" onClick={rebuy}>
                  Buy in for {START}
                </button>
              ) : game.phase === 'result' && revealed ? (
                <>
                  <button className="btn btn-ghost" onClick={() => newBets(true)}>
                    Same bets
                  </button>
                  <button className="btn btn-primary btn-big" onClick={() => newBets(false)}>
                    New bets
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => game.clearBets()}>
                    Clear
                  </button>
                  <button className="btn btn-primary btn-big" disabled={!game.canShake() || busy} onClick={shake}>
                    {busy ? 'Shaking…' : 'Shake'}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="sb-hintline">
            Pick a chip, then click a spot; every spot prints what it pays. Right-click a chip to take it back. Small,
            Big, Odd and Even all lose to a triple.
          </p>
        </div>
      </main>
    </>
  )
}
