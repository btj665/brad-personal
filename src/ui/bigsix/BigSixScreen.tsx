import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'

import { BigSixGame } from '../../bigsix/engine'
import { houseEdge, LABEL, PAYS, STOPS, SYMBOLS, TOTAL_STOPS, WHEEL, type Symbol6 } from '../../bigsix/wheel'
import { randomSeed } from '../../engine/rng'
import { WinToast } from '../WinToast'

const START = 500
const CHIPS = [1, 5, 25, 100]

// The wheel, in a square viewBox centred on the origin. Fifty-four stops, a peg
// on every boundary, and a leather clapper fixed at twelve o'clock.
const S = 300
const R_OUT = 140
const R_IN = 44
const R_TEXT = 110
const R_PEG = 146

/** A point at `deg` measured clockwise from twelve o'clock. */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)]
}

/** An annular sector between two radii and two clockwise-from-top angles. */
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const [x0o, y0o] = polar(r1, a0)
  const [x1o, y1o] = polar(r1, a1)
  const [x1i, y1i] = polar(r0, a1)
  const [x0i, y0i] = polar(r0, a0)
  return `M ${x0o} ${y0o} A ${r1} ${r1} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r0} ${r0} 0 0 0 ${x0i} ${y0i} Z`
}

const FACE: Record<Symbol6, string> = {
  '1': '1',
  '2': '2',
  '5': '5',
  '10': '10',
  '20': '20',
  joker: '★',
  logo: '♠',
}

/** The whole wheel turns and the clapper stays put, which is the opposite of
 *  roulette — but the deceleration is the same trick: accumulate the rotation
 *  forward so it always turns one way and stops with the winning stop under the
 *  clapper. */
function BigSixWheel({
  targetIndex,
  spinKey,
  spinning,
}: {
  targetIndex: number | null
  /** Bumps once per spin; that's what re-triggers the animation. */
  spinKey: number
  spinning: boolean
}) {
  const seg = 360 / TOTAL_STOPS

  const rotRef = useRef(0)
  const [rot, setRot] = useState(0)
  const lastKey = useRef(spinKey)

  useLayoutEffect(() => {
    if (spinKey === lastKey.current || targetIndex == null) return
    lastKey.current = spinKey
    // Stop `i` sits at i*seg clockwise from the top, so the wheel has to come
    // back by that much to put it under the clapper.
    const phi = -targetIndex * seg
    const prev = rotRef.current
    let next = prev - (prev % 360) + 360 * 5 + phi
    while (next <= prev + 360 * 4) next += 360
    rotRef.current = next
    setRot(next)
  }, [spinKey, targetIndex, seg])

  return (
    <div className="bs6-wheel" style={{ width: S, height: S }}>
      <div
        className="bs6-wheel-spin"
        style={{
          transform: `rotate(${rot}deg)`,
          transition: spinning ? 'transform 3.2s cubic-bezier(0.17, 0.75, 0.22, 1)' : 'none',
        }}
      >
        <svg viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`} className="bs6-wheel-svg">
          <circle cx={0} cy={0} r={R_PEG + 4} className="bs6-wheel-rim" />
          {WHEEL.map((sym, i) => {
            const [tx, ty] = polar(R_TEXT, i * seg)
            return (
              <g key={i}>
                <path
                  d={sector(R_IN, R_OUT, i * seg - seg / 2, i * seg + seg / 2)}
                  className={`bs6-seg bs6-seg-${sym}`}
                />
                <text x={tx} y={ty} className="bs6-seg-face" transform={`rotate(${i * seg} ${tx} ${ty})`}>
                  {FACE[sym]}
                </text>
              </g>
            )
          })}
          {/* A peg on every stop boundary — the clapper rides these. */}
          {WHEEL.map((_, i) => {
            const [px, py] = polar(R_PEG, i * seg + seg / 2)
            return <circle key={`peg-${i}`} cx={px} cy={py} r={2.4} className="bs6-peg" />
          })}
          <circle cx={0} cy={0} r={R_IN} className="bs6-wheel-hub" />
          <circle cx={0} cy={0} r={R_IN - 14} className="bs6-wheel-hub2" />
          <text x={0} y={0} className="bs6-wheel-mark">
            6
          </text>
        </svg>
      </div>

      <div className="bs6-clapper" />
    </div>
  )
}

export function BigSixScreen() {
  const [game, setGame] = useState(() => new BigSixGame({ seed: randomSeed(), bankroll: START }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  // Spin the engine first to learn the stop, then let the wheel ride to it
  // before the result is shown.
  const [anim, setAnim] = useState<{ key: number; index: number } | null>(null)
  const [revealed, setRevealed] = useState(true)
  const busy = anim !== null && !revealed

  const rebuy = useCallback(() => {
    setGame(new BigSixGame({ seed: randomSeed(), bankroll: START }))
    setAnim(null)
    setRevealed(true)
  }, [])

  const spin = useCallback(() => {
    if (!game.canSpin() || busy) return
    const r = game.spin()
    setAnim({ key: game.round, index: r.index })
    setRevealed(false)
    window.setTimeout(() => setRevealed(true), 3300)
  }, [game, busy])

  const newBets = useCallback(
    (same: boolean) => {
      game.next()
      if (same) game.rebet()
      setRevealed(true)
    },
    [game],
  )

  const clear = useCallback(
    (e: MouseEvent, symbol: Symbol6) => {
      e.preventDefault()
      game.removeBet(symbol)
    },
    [game],
  )

  const result = game.lastResult
  const broke = game.bankroll < 1 && game.phase === 'betting'
  const net = result ? result.returned - result.staked : 0
  const board = revealed ? game.history : game.history.slice(1)
  const locked = game.phase !== 'betting'

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Big Six</span>
          <span className="bs6-tagline">{TOTAL_STOPS} stops · every bet is a bad bet</span>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={revealed && result ? net : 0} token={revealed && result ? `bs6-${game.round}` : 'bs6-live'} />

      <main className="main">
        <div className="bs6">
          <div className="bs6-stage">
            <BigSixWheel targetIndex={anim?.index ?? null} spinKey={anim?.key ?? 0} spinning={busy} />

            <div className="bs6-readout">
              <div className="bs6-board">
                {board.length === 0 ? (
                  <span className="bs6-board-empty">No spins yet</span>
                ) : (
                  board.map((s, i) => (
                    <span key={`${game.round}-${i}`} className={`bs6-hist bs6-fill-${s}`}>
                      {LABEL[s]}
                    </span>
                  ))
                )}
              </div>

              {revealed && result ? (
                <div className="bs6-result">
                  <span className={`bs6-result-face bs6-fill-${result.landed}`}>{LABEL[result.landed]}</span>
                  <span className={`bs6-result-net${net >= 0 ? ' bs6-up' : ' bs6-down'}`}>
                    {net >= 0 ? `+${net}` : net}
                  </span>
                </div>
              ) : (
                <div className="bs6-result-idle">{busy ? 'Round and round…' : 'Pick a symbol.'}</div>
              )}
            </div>
          </div>

          {/* The layout, annotated with the exact arithmetic: stops out of 54
              against the odds paid. Nothing on this table comes close to even. */}
          <div className={`bs6-layout${locked ? ' bs6-locked' : ''}`}>
            {SYMBOLS.map((s) => {
              const amount = game.bets.get(s) ?? 0
              const won = revealed && result?.landed === s
              return (
                <button
                  key={s}
                  className={`bs6-spot bs6-fill-${s}${won ? ' bs6-spot-won' : ''}`}
                  disabled={locked}
                  onClick={() => game.place(s)}
                  onContextMenu={(e) => clear(e, s)}
                  title={`${STOPS[s]} of ${TOTAL_STOPS} stops, pays ${PAYS[s]}:1 — house edge ${(
                    houseEdge(s) * 100
                  ).toFixed(2)}%`}
                >
                  <span className="bs6-spot-face">{LABEL[s]}</span>
                  <span className="bs6-spot-pays">{PAYS[s]} to 1</span>
                  <span className="bs6-spot-math">
                    {STOPS[s]}/{TOTAL_STOPS} · {(houseEdge(s) * 100).toFixed(2)}%
                  </span>
                  {amount > 0 && <span className="bs6-spot-chip">{amount}</span>}
                </button>
              )
            })}
          </div>

          <div className="bs6-controls">
            <div className="bs6-chips">
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

            <div className="bs6-actions">
              <span className="bs6-staked">On table: {game.staked}</span>
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
                  <button className="btn btn-primary btn-big" disabled={!game.canSpin() || busy} onClick={spin}>
                    {busy ? 'Spinning…' : 'Spin'}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="bs6-hintline">
            Fifty-four stops, so every edge here is exact rather than estimated: the {LABEL['1']} covers{' '}
            {STOPS['1']} of them and still keeps {(houseEdge('1') * 100).toFixed(2)}% for the house — twice
            American roulette. The {PAYS.joker}:1 symbols keep {(houseEdge('joker') * 100).toFixed(2)}%.
            Right-click a spot to take a chip back.
          </p>
        </div>
      </main>
    </>
  )
}
