import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { Card } from '../../engine/types'
import { randomSeed, Solitaire } from '../../solitaire/game'
import type { Move, Pile } from '../../solitaire/types'
import { families, variantById } from '../../solitaire/variants/index'
import { PlayingCard } from '../Card'

// The screen is deliberately layout-agnostic: it is handed a bag of piles by the
// engine and arranges them by `kind`, never by variant. That is the whole point —
// Klondike, FreeCell, Spider and the Canfield-likes are the same machine with a
// different bag of piles, so one render path has to draw all of them.

/** The vertical fan in a tableau column, as fractions of a card's height. A
 *  face-up card must show its rank and pip (top ~30%); a face-down card only has
 *  to prove it exists, so it can tuck much tighter. */
const FAN_UP = 0.3
const FAN_DOWN = 0.15
const CARD_RATIO = 1.4 // 5:7 playing-card box, matching PlayingCard's viewBox.

interface Metrics {
  cardW: number
  gap: number
  /** The span the piles actually occupy — column count × card width + gaps. Both
   *  rows are set to this and centred, so the top piles line up over the columns
   *  instead of the top row spreading to the felt's full width. */
  innerW: number
  /** How tall a tableau column may grow before its fan has to tighten. */
  budgetH: number
}

/** What the floating drag stack needs to draw itself and validate a drop. */
interface DragView {
  from: string
  count: number
  cards: Card[]
  /** Pile ids a drop would be legal onto, computed once when the lift starts —
   *  the board can't change mid-drag, so there's nothing to recompute. */
  targets: Set<string>
  cardW: number
  x: number
  y: number
  offX: number
  offY: number
}

type StartDrag = (pileId: string, cardIndex: number, e: ReactPointerEvent<HTMLDivElement>) => void
type SendHome = (pileId: string, cardIndex: number) => void

export function SolitaireScreen() {
  const [game, setGame] = useState(() => new Solitaire({ variant: variantById('klondike-1') }))
  // Subscribe to the engine store; every move/undo/deal bumps the version and
  // re-renders, exactly like the slots and video-poker screens.
  useSyncExternalStore(game.subscribe, game.getVersion)
  // `game` is captured by the window-level pointer handlers below; a ref keeps
  // those closures reading the live instance across new deals.
  const gameRef = useRef(game)
  gameRef.current = game

  const [metrics, setMetrics] = useState<Metrics>({ cardW: 82, gap: 8, innerW: 700, budgetH: 560 })
  const [drag, setDrag] = useState<DragView | null>(null)
  const [hint, setHint] = useState<Move | null>(null)

  const feltRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const dragMeta = useRef<{ from: string; count: number; offX: number; offY: number } | null>(null)
  const hintTimer = useRef<number>(0)

  const piles = game.piles
  const tableaux = piles.filter((p) => p.kind === 'tableau')

  // --- responsive sizing --------------------------------------------------
  //
  // Card size is measured, not guessed: the tableau must fit its column count
  // across the felt without a horizontal scrollbar, so the card width falls out
  // of "board width ÷ columns". The height budget is whatever is left between the
  // top of the tableau and the bottom of the window, which is what caps a tall
  // Spider column's fan.

  useLayoutEffect(() => {
    const felt = feltRef.current
    if (!felt) return
    const measure = () => {
      // The felt's inner width (padding removed) is the space to divide; card
      // width is capped so a 4-column game doesn't print billboard-sized cards.
      const cs = getComputedStyle(felt)
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const width = felt.clientWidth - pad
      if (width <= 0) return
      const cols = tableaux.length || 1
      const gap = width < 520 ? 4 : width < 820 ? 6 : 8
      const cardW = Math.max(30, Math.min(110, Math.floor((width - gap * (cols - 1)) / cols)))
      const innerW = cardW * cols + gap * (cols - 1)
      const topY = boardRef.current?.getBoundingClientRect().top ?? felt.getBoundingClientRect().top
      const budgetH = Math.max(220, Math.floor(window.innerHeight - topY - 18))
      setMetrics((prev) =>
        prev.cardW === cardW && prev.gap === gap && prev.innerW === innerW && prev.budgetH === budgetH
          ? prev
          : { cardW, gap, innerW, budgetH },
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(felt)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
    // Re-measure when the column count changes (new variant) or the deal resets.
  }, [tableaux.length, game])

  // --- dragging -----------------------------------------------------------
  //
  // Pointer events, not native HTML5 DnD: they touch-support for free and let one
  // code path drive mouse and finger. The dragged stack is a fixed-position layer
  // moved by mutating its transform directly, so a drag doesn't re-render the
  // whole board on every pointermove.

  const positionLayer = useCallback((x: number, y: number) => {
    const m = dragMeta.current
    const el = layerRef.current
    if (!m || !el) return
    el.style.transform = `translate(${x - m.offX}px, ${y - m.offY}px)`
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragMeta.current) positionLayer(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      const m = dragMeta.current
      if (!m) return
      // The drag layer is pointer-events:none, so elementFromPoint reports the
      // pile underneath rather than the card in hand.
      const under = document.elementFromPoint(e.clientX, e.clientY)
      const pileEl = under?.closest('[data-pile-id]') as HTMLElement | null
      const to = pileEl?.dataset.pileId
      if (to) gameRef.current.move(m.from, to, m.count) // move() is a no-op if illegal
      dragMeta.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [positionLayer])

  const startDrag = useCallback<StartDrag>(
    (pileId, cardIndex, e) => {
      // Ignore secondary mouse buttons; touch/pen have no button to check.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const pile = game.get(pileId)
      if (!pile) return
      const grabbed = pile.cards[cardIndex]
      if (!grabbed || !grabbed.faceUp) return

      // Count is the grabbed card plus everything fanned below it — higher indices
      // in the pile, which sit lower on screen. Grab the 5th-from-top and you lift
      // five. The engine decides on drop whether that run may actually move.
      const count = pile.cards.length - cardIndex
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const offX = e.clientX - rect.left
      const offY = e.clientY - rect.top

      const targets = new Set<string>()
      for (const p of game.piles) if (game.canMove(pileId, p.id, count)) targets.add(p.id)

      dragMeta.current = { from: pileId, count, offX, offY }
      setDrag({
        from: pileId,
        count,
        cards: pile.cards.slice(cardIndex).map((c) => c.card),
        targets,
        cardW: metrics.cardW,
        x: e.clientX,
        y: e.clientY,
        offX,
        offY,
      })
    },
    [game, metrics.cardW],
  )

  // --- click interactions -------------------------------------------------

  const sendHome = useCallback<SendHome>(
    (pileId, cardIndex) => {
      const pile = game.get(pileId)
      // Only the exposed card of a pile can be sent home by a double-click; a
      // buried one isn't reachable and the gesture would silently send the wrong
      // card.
      if (!pile || cardIndex !== pile.cards.length - 1) return
      const home = game
        .legalMoves()
        .filter((m) => m.from === pileId && game.get(m.to)?.kind === 'foundation')
        .sort((a, b) => a.count - b.count)[0]
      if (home) game.move(home.from, home.to, home.count)
    },
    [game],
  )

  const drawStock = useCallback(() => {
    game.drawStock()
  }, [game])

  const showHint = useCallback(() => {
    const moves = game.legalMoves()
    // Prefer a move that makes progress over one that only shuffles the tableau:
    // anything reaching a foundation first, then a genuine column-to-column move.
    // `legalMoves()` never includes turning the stock, so if nothing is playable
    // the hint points at the stock itself.
    const pick: Move | null =
      moves.find((m) => game.get(m.to)?.kind === 'foundation') ??
      moves.find(
        (m) => game.get(m.from)?.kind === 'tableau' && game.get(m.to)?.kind === 'tableau',
      ) ??
      moves[0] ??
      (canDrawStock(game) ? { from: 'stock-0', to: 'stock-0', count: 0 } : null)
    if (!pick) return
    setHint(pick)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 1300)
  }, [game])

  useEffect(() => () => window.clearTimeout(hintTimer.current), [])

  // --- controls -----------------------------------------------------------

  const cancelInteractions = () => {
    dragMeta.current = null
    setDrag(null)
    setHint(null)
  }

  const pickVariant = useCallback((id: string) => {
    cancelInteractions()
    setGame(new Solitaire({ variant: variantById(id), seed: randomSeed() }))
  }, [])
  const newDeal = useCallback(() => {
    cancelInteractions()
    setGame(new Solitaire({ variant: game.variant, seed: randomSeed() }))
  }, [game.variant])
  const restart = useCallback(() => {
    cancelInteractions()
    // Same seed reproduces the identical deal — the engine is fully seeded.
    setGame(new Solitaire({ variant: game.variant, seed: game.seed }))
  }, [game.variant, game.seed])

  // --- pile grouping ------------------------------------------------------
  //
  // The one place layout is derived from `kind`. Non-tableau piles split into a
  // left cluster (what you draw and stash from) and a right cluster (the
  // foundations you're building), with the tableau fanned below. No variant is
  // named anywhere in here.

  const foundations = piles.filter((p) => p.kind === 'foundation')
  const cells = piles.filter((p) => p.kind === 'cell')
  const reserves = piles.filter((p) => p.kind === 'reserve')
  const stock = piles.find((p) => p.kind === 'stock')
  const waste = piles.find((p) => p.kind === 'waste')
  const hasStock = game.variant.stock.kind !== 'none' && !!stock
  const leftPiles: Pile[] = [
    ...reserves,
    ...(hasStock && stock ? [stock] : []),
    ...(waste ? [waste] : []),
    ...cells,
  ]

  const st = game.variant.stock
  const redeal = st.kind === 'waste' ? (st.redeals === -1 ? '∞' : String(game.redealsLeft)) : null
  const won = game.won()

  const cardH = Math.round(metrics.cardW * CARD_RATIO)

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <select
            className="sol-picker"
            value={game.variant.id}
            onChange={(e) => pickVariant(e.target.value)}
          >
            {families().map((g) => (
              <optgroup key={g.family} label={g.family}>
                {g.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="sol-blurb">{game.variant.blurb}</span>
        </div>
        <div className="topbar-right">
          <span className="sol-stat">
            <i>Moves</i>
            <b>{game.moves}</b>
          </span>
          {redeal !== null && (
            <span className="sol-stat">
              <i>Redeals</i>
              <b>{redeal}</b>
            </span>
          )}
        </div>
      </header>

      <main className="main">
        <div className="sol">
          <p className="sol-note">{game.variant.note}</p>

          <div className="sol-bar">
            <button className="btn btn-ghost" onClick={newDeal}>
              New deal
            </button>
            <button className="btn btn-ghost" onClick={restart}>
              Restart
            </button>
            <button className="btn btn-ghost" onClick={() => game.undo()} disabled={game.moves === 0}>
              Undo
            </button>
            <button className="btn btn-ghost" onClick={showHint}>
              Hint
            </button>
            <button className="btn btn-ghost" onClick={() => game.autoFinish()}>
              Auto-finish
            </button>
          </div>

          <div className="sol-felt" ref={feltRef}>
           <div className="sol-inner" style={{ width: metrics.innerW }}>
            {/* Non-tableau piles: draw/stash on the left, foundations on the right. */}
            <div className="sol-top" style={{ gap: metrics.gap }}>
              <div className="sol-cluster" style={{ gap: metrics.gap }}>
                {leftPiles.map((p) => (
                  <TopPile
                    key={p.id}
                    pile={p}
                    cardW={metrics.cardW}
                    cardH={cardH}
                    drag={drag}
                    hint={hint}
                    onStart={startDrag}
                    onSend={sendHome}
                    onStock={drawStock}
                  />
                ))}
              </div>
              <div className="sol-cluster" style={{ gap: metrics.gap }}>
                {foundations.map((p) => (
                  <TopPile
                    key={p.id}
                    pile={p}
                    cardW={metrics.cardW}
                    cardH={cardH}
                    drag={drag}
                    hint={hint}
                    onStart={startDrag}
                    onSend={sendHome}
                    onStock={drawStock}
                  />
                ))}
              </div>
            </div>

            <div className="sol-tableau" ref={boardRef} style={{ gap: metrics.gap }}>
              {tableaux.map((p) => (
                <TableauColumn
                  key={p.id}
                  pile={p}
                  cardW={metrics.cardW}
                  budgetH={metrics.budgetH}
                  drag={drag}
                  hint={hint}
                  onStart={startDrag}
                  onSend={sendHome}
                />
              ))}
            </div>

           </div>

            {won && (
              <div className="sol-win" role="status">
                <div className="sol-win-card">
                  <b>You win</b>
                  <span>{game.moves} moves</span>
                  <button className="btn btn-primary" onClick={newDeal}>
                    New deal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* The lifted stack, following the pointer. Initial transform comes from
          the inline style; pointermove then mutates it directly. */}
      {drag && (
        <div
          ref={layerRef}
          className="sol-draglayer"
          style={{
            width: drag.cardW,
            transform: `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px)`,
          }}
        >
          {drag.cards.map((c, i) => (
            <div
              key={c.uid}
              className="sol-card"
              style={{
                position: 'absolute',
                top: Math.round(drag.cardW * CARD_RATIO * FAN_UP) * i,
                width: drag.cardW,
                height: Math.round(drag.cardW * CARD_RATIO),
              }}
            >
              <PlayingCard card={c} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Can the stock still be turned (or the waste recycled)? Used only to decide
 *  whether a dead board's hint should point at the stock. */
function canDrawStock(game: Solitaire): boolean {
  if (game.variant.stock.kind === 'none') return false
  const stock = game.get('stock-0')
  if (stock && stock.cards.length > 0) return true
  return game.variant.stock.kind === 'waste' && game.redealsLeft !== 0
}

// A single stacked slot: stock, waste, a cell, a reserve heap, or a foundation.
// Only its top card is playable, so the whole pile shows just that card (or an
// empty frame that still accepts a drop).
function TopPile({
  pile,
  cardW,
  cardH,
  drag,
  hint,
  onStart,
  onSend,
  onStock,
}: {
  pile: Pile
  cardW: number
  cardH: number
  drag: DragView | null
  hint: Move | null
  onStart: StartDrag
  onSend: SendHome
  onStock: () => void
}) {
  const isStock = pile.kind === 'stock'
  const topIndex = pile.cards.length - 1
  const top = pile.cards[topIndex]
  const isTarget = drag?.targets.has(pile.id) ?? false
  const hintTo = hint?.to === pile.id && hint.from !== hint.to
  const hintStock = hint?.from === 'stock-0' && hint.to === 'stock-0' && isStock
  const hintFrom = hint?.from === pile.id && hint.from !== hint.to
  const lifted = drag?.from === pile.id
  // A face-down top card can't be dragged (a reserve or stock), only clicked.
  const draggable = !isStock && !!top && top.faceUp

  return (
    <div
      className={
        'sol-pile' +
        (isStock ? ' sol-stock' : '') +
        (isTarget ? ' sol-target' : '') +
        (hintTo || hintStock ? ' sol-hint-to' : '')
      }
      data-pile-id={pile.id}
      style={{ width: cardW, height: cardH }}
      onClick={isStock ? onStock : undefined}
    >
      {top ? (
        <div
          className={'sol-card' + (lifted ? ' sol-lifted' : '') + (hintFrom ? ' sol-hint-from' : '')}
          style={{ position: 'absolute', inset: 0 }}
          onPointerDown={draggable ? (e) => onStart(pile.id, topIndex, e) : undefined}
          onDoubleClick={draggable ? () => onSend(pile.id, topIndex) : undefined}
        >
          <PlayingCard card={top.card} down={!top.faceUp} />
        </div>
      ) : (
        <div className="sol-empty" style={{ width: cardW, height: cardH }}>
          {isStock && <span className="sol-recycle">↻</span>}
        </div>
      )}
      {pile.cards.length > 1 && (isStock || pile.kind === 'reserve') && (
        <span className="sol-count">{pile.cards.length}</span>
      )}
    </div>
  )
}

// A tableau column: cards fanned downward, face-down ones tucked tighter. The fan
// is capped so even a 20-card Spider/Yukon column stays inside the felt.
function TableauColumn({
  pile,
  cardW,
  budgetH,
  drag,
  hint,
  onStart,
  onSend,
}: {
  pile: Pile
  cardW: number
  budgetH: number
  drag: DragView | null
  hint: Move | null
  onStart: StartDrag
  onSend: SendHome
}) {
  const cardH = Math.round(cardW * CARD_RATIO)
  const n = pile.cards.length

  // Cumulative offset of each card from the top of the column. The step *into* a
  // card depends on whether the card it covers is face up (needs to stay read) or
  // face down (can be nearly hidden).
  const upFan = cardH * FAN_UP
  const downFan = cardH * FAN_DOWN
  let tops: number[] = [0]
  for (let i = 1; i < n; i++) tops.push(tops[i - 1] + (pile.cards[i - 1].faceUp ? upFan : downFan))

  // If the natural fan overflows the height budget, scale every step down by one
  // factor so the whole column just fits. Cards keep their size; only the overlap
  // tightens, which is exactly how a real tall column is squeezed.
  const natural = (tops[n - 1] ?? 0) + cardH
  if (n > 1 && natural > budgetH) {
    const scale = Math.max(0.08, (budgetH - cardH) / (natural - cardH))
    tops = tops.map((t) => t * scale)
  }
  const colH = (tops[n - 1] ?? 0) + cardH

  const isTarget = drag?.targets.has(pile.id) ?? false
  const hintTo = hint?.to === pile.id && hint.from !== hint.to
  // The head of a hinted move is `count` cards up from the bottom of the column.
  const hintHead = hint?.from === pile.id && hint.from !== hint.to ? n - hint.count : -1
  // While dragging out of this column, the lifted run is the top `count` cards.
  const liftedFrom = drag?.from === pile.id ? n - drag.count : n

  return (
    <div
      className={'sol-col' + (isTarget ? ' sol-target' : '') + (hintTo ? ' sol-hint-to' : '')}
      data-pile-id={pile.id}
      style={{ width: cardW, height: n ? colH : cardH }}
    >
      {n === 0 && <div className="sol-empty" style={{ width: cardW, height: cardH }} />}
      {pile.cards.map((pc, i) => {
        const isTop = i === n - 1
        return (
          <div
            key={pc.card.uid}
            className={
              'sol-card' +
              (i >= liftedFrom ? ' sol-lifted' : '') +
              (hintHead >= 0 && i >= hintHead ? ' sol-hint-from' : '')
            }
            style={{ position: 'absolute', left: 0, top: tops[i], width: cardW, height: cardH }}
            onPointerDown={pc.faceUp ? (e) => onStart(pile.id, i, e) : undefined}
            onDoubleClick={pc.faceUp && isTop ? () => onSend(pile.id, i) : undefined}
          >
            <PlayingCard card={pc.card} down={!pc.faceUp} />
          </div>
        )
      })}
    </div>
  )
}
