import { useCallback, useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react'

import { randomSeed } from '../../engine/rng'
import {
  columnBet,
  dozenBet,
  insideBet,
  outsideBet,
  straightBet,
  toplineBet,
  type Bet,
  type BetKind,
} from '../../roulette/bets'
import { RouletteGame } from '../../roulette/engine'
import { colourOf, pocketOrder, VARIANT_EDGE, VARIANT_LABEL, type Variant } from '../../roulette/wheel'
import { WinToast } from '../WinToast'
import { RouletteWheel } from './RouletteWheel'

const START = 500
const CHIPS = [1, 5, 25, 100]

// The number grid, laid out the way a real layout is: three rows of twelve, the
// top row the 3-6-9 column, the bottom the 1-4-7 column.
const GRID: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
]

// SVG geometry for the felt layout.
const Z = 42 // zero column width
const W = 44 // number cell
const H = 46
const COL = 40 // the 2:1 column boxes on the right
const NUMS_W = 12 * W
const DOZ_Y = 3 * H
const DOZ_H = 34
const OUT_Y = DOZ_Y + DOZ_H
const OUT_H = 34
const VB_W = Z + NUMS_W + COL
const VB_H = OUT_Y + OUT_H

type Colour = 'red' | 'black' | 'green' | 'felt'

interface Cell {
  bet: Bet
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  colour: Colour
  text: string
  size: number
}

interface Node {
  bet: Bet
  cx: number
  cy: number
}

/** Every clickable box on the felt, with its rectangle and chip anchor. */
function buildCells(variant: Variant): Cell[] {
  const cells: Cell[] = []
  const box = (bet: Bet, x: number, y: number, w: number, h: number, colour: Colour, text: string, size = 16) =>
    cells.push({ bet, x, y, w, h, cx: x + w / 2, cy: y + h / 2, colour, text, size })

  // Zeros.
  if (variant === 'american') {
    box(straightBet(0), 0, 0, Z, DOZ_Y / 2, 'green', '0')
    box(straightBet('00'), 0, DOZ_Y / 2, Z, DOZ_Y / 2, 'green', '00')
  } else {
    box(straightBet(0), 0, 0, Z, DOZ_Y, 'green', '0', 20)
  }

  // The 36 numbers.
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 12; c++) {
      const n = GRID[r][c]
      box(straightBet(n), Z + c * W, r * H, W, H, colourOf(n), String(n))
    }

  // The 2:1 column boxes: top row covers the 3-column, bottom the 1-column.
  for (let r = 0; r < 3; r++) box(columnBet((3 - r) as 1 | 2 | 3), Z + NUMS_W, r * H, COL, H, 'felt', '2:1', 12)

  // Dozens.
  const dozenLabels = ['1st 12', '2nd 12', '3rd 12']
  for (let d = 0; d < 3; d++)
    box(dozenBet((d + 1) as 1 | 2 | 3), Z + (d * NUMS_W) / 3, DOZ_Y, NUMS_W / 3, DOZ_H, 'felt', dozenLabels[d], 13)

  // Even-money row.
  const outs: Array<[BetKind, string, Colour]> = [
    ['low', '1–18', 'felt'],
    ['even', 'EVEN', 'felt'],
    ['red', 'RED', 'red'],
    ['black', 'BLACK', 'black'],
    ['odd', 'ODD', 'felt'],
    ['high', '19–36', 'felt'],
  ]
  outs.forEach(([k, text, colour], i) =>
    box(outsideBet(k), Z + (i * NUMS_W) / 6, OUT_Y, NUMS_W / 6, OUT_H, colour, text, 12),
  )

  return cells
}

/** Every inside bet you make on a shared edge or corner, as a clickable point. */
function buildNodes(variant: Variant): Node[] {
  const nodes: Node[] = []
  const at = (bet: Bet, cx: number, cy: number) => nodes.push({ bet, cx, cy })
  const col = (c: number) => [GRID[0][c], GRID[1][c], GRID[2][c]]

  // Splits — horizontal (adjacent in a row) and vertical (adjacent in a column).
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 11; c++)
      at(insideBet('split', [GRID[r][c], GRID[r][c + 1]]), Z + (c + 1) * W, r * H + H / 2)
  for (let c = 0; c < 12; c++)
    for (let r = 0; r < 2; r++) at(insideBet('split', [GRID[r][c], GRID[r + 1][c]]), Z + c * W + W / 2, (r + 1) * H)

  // Corners — the four numbers meeting at an interior vertex.
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 11; c++)
      at(
        insideBet('corner', [GRID[r][c], GRID[r][c + 1], GRID[r + 1][c], GRID[r + 1][c + 1]]),
        Z + (c + 1) * W,
        (r + 1) * H,
      )

  // Streets (a column of three) and six lines (two columns), at the bottom edge.
  for (let c = 0; c < 12; c++) at(insideBet('street', col(c)), Z + c * W + W / 2, DOZ_Y)
  for (let c = 0; c < 11; c++) at(insideBet('sixline', [...col(c), ...col(c + 1)]), Z + (c + 1) * W, DOZ_Y)

  if (variant === 'american') {
    // The top line (0/00/1/2/3) sits at the corner where the zeros meet the grid.
    at(toplineBet(), Z, DOZ_Y / 2)
  } else {
    // Single-zero splits: 0 with each of 1, 2, 3 along the zero box's edge.
    for (let r = 0; r < 3; r++) at(insideBet('split', [0, GRID[r][0]]), Z, r * H + H / 2)
  }

  return nodes
}

function Board({
  game,
  locked,
}: {
  game: RouletteGame
  locked: boolean
}) {
  const cells = useMemo(() => buildCells(game.variant), [game.variant])
  const nodes = useMemo(() => buildNodes(game.variant), [game.variant])
  const amountOn = (key: string) => game.bets.get(key)?.amount ?? 0

  const place = (bet: Bet) => !locked && game.place(bet)
  const clear = (e: MouseEvent, key: string) => {
    e.preventDefault()
    if (!locked) game.removeBet(key)
  }

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className={`rl2 ${locked ? 'rl2-locked' : ''}`}>
      {cells.map((cell) => (
        <g key={cell.bet.key} className="rl2-cell" onClick={() => place(cell.bet)} onContextMenu={(e) => clear(e, cell.bet.key)}>
          <title>{cell.bet.label}</title>
          <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx={3} className={`rl2-rect rl2-${cell.colour}`} />
          <text x={cell.cx} y={cell.cy} className="rl2-num" style={{ fontSize: cell.size }}>
            {cell.text}
          </text>
        </g>
      ))}

      {nodes.map((node) => (
        <g
          key={node.bet.key}
          className="rl2-node"
          onClick={() => place(node.bet)}
          onContextMenu={(e) => clear(e, node.bet.key)}
        >
          <title>{node.bet.label}</title>
          <circle cx={node.cx} cy={node.cy} r={11} className="rl2-node-hit" />
          <circle cx={node.cx} cy={node.cy} r={3.4} className="rl2-node-dot" />
        </g>
      ))}

      {/* Chips ride on top of everything, at each spot's anchor. */}
      {[...cells, ...nodes].map((spot) => {
        const amt = amountOn(spot.bet.key)
        if (!amt) return null
        return (
          <g key={`chip-${spot.bet.key}`} className="rl2-chip" transform={`translate(${spot.cx} ${spot.cy})`}>
            <circle r={11} className="rl2-chip-disc" />
            <text className="rl2-chip-txt">{amt}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function RouletteScreen() {
  const [game, setGame] = useState(() => new RouletteGame({ seed: randomSeed(), bankroll: START }))
  useSyncExternalStore(game.subscribe, game.getVersion)

  // The spin animation is driven here: spin the engine to learn the pocket, then
  // let the wheel ride to it before the number is revealed.
  const [anim, setAnim] = useState<{ key: number; index: number } | null>(null)
  const [revealed, setRevealed] = useState(true)
  const busy = anim !== null && !revealed

  const setVariant = useCallback(
    (v: Variant) => {
      if (busy) return
      setAnim(null)
      setRevealed(true)
      game.setVariant(v)
    },
    [game, busy],
  )
  const rebuy = useCallback(() => {
    setGame(new RouletteGame({ seed: randomSeed(), variant: game.variant, bankroll: START }))
    setAnim(null)
    setRevealed(true)
  }, [game])

  const spin = useCallback(() => {
    if (!game.canSpin() || busy) return
    const pocket = game.spin()
    const index = pocketOrder(game.variant).indexOf(pocket)
    setAnim({ key: game.round, index })
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

  const result = game.lastResult
  const broke = game.bankroll < 1 && game.phase === 'betting'
  const net = result ? result.returned - result.staked : 0
  const board = revealed ? game.history : game.history.slice(1)

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select
            className="vp-variant"
            value={game.variant}
            disabled={busy}
            onChange={(e) => setVariant(e.target.value as Variant)}
          >
            {(Object.keys(VARIANT_LABEL) as Variant[]).map((v) => (
              <option key={v} value={v}>
                {VARIANT_LABEL[v]} — {VARIANT_EDGE[v]}%
              </option>
            ))}
          </select>
        </div>
        <div className="topbar-right">
          <span className="bankroll">
            <span className="bankroll-label">Bankroll</span>
            <b>{game.bankroll.toLocaleString()}</b>
          </span>
        </div>
      </header>

      <WinToast net={revealed && result ? net : 0} token={revealed && result ? `rl-${game.round}` : 'rl-live'} />

      <main className="main">
        <div className="rl">
          <div className="rl-stage">
            <RouletteWheel
              variant={game.variant}
              targetIndex={anim?.index ?? null}
              spinKey={anim?.key ?? 0}
              spinning={busy}
            />

            <div className="rl-readout">
              <div className="rl-board">
                {board.length === 0 ? (
                  <span className="rl-board-empty">No spins yet</span>
                ) : (
                  board.map((n, i) => (
                    <span key={`${game.round}-${i}`} className={`rl-hist rl-${colourOf(n)}`}>
                      {n}
                    </span>
                  ))
                )}
              </div>

              {revealed && result ? (
                <div className={`rl-result rl-${colourOf(result.pocket)}-text`}>
                  <span className="rl-result-num">{result.pocket}</span>
                  <span className={`rl-result-net${net >= 0 ? ' rl-up' : ' rl-down'}`}>
                    {net >= 0 ? `+${net}` : net}
                  </span>
                </div>
              ) : (
                <div className="rl-result rl-result-idle">{busy ? 'No more bets…' : 'Place your chips.'}</div>
              )}
            </div>
          </div>

          <Board game={game} locked={game.phase !== 'betting'} />

          <div className="rl-controls">
            <div className="rl-chips">
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

            <div className="rl-actions">
              <span className="rl-staked">On table: {game.staked}</span>
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
                  <button
                    className="btn btn-primary btn-big"
                    disabled={!game.canSpin() || busy}
                    onClick={spin}
                  >
                    {busy ? 'Spinning…' : 'Spin'}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="rl-hintline">
            Click a number for a straight-up; the dots on the edges and corners are splits, streets, corners and lines.
            Right-click a chip to take it back.
          </p>
        </div>
      </main>
    </>
  )
}
