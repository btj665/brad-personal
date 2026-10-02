import { useLayoutEffect, useRef, useState } from 'react'

import { colourOf, pocketOrder, type Variant } from '../../roulette/wheel'

// A wheel in a square viewBox centred on the origin. The pockets are drawn in
// the real pocket order; a ball rides the rim and drops onto the winning pocket.
const S = 260 // container size, px
const R_OUT = 122
const R_IN = 80
const R_TEXT = 101
const R_BALL = 100 // how far from centre the ball sits, px in the S-box

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

export function RouletteWheel({
  variant,
  targetIndex,
  spinKey,
  spinning,
}: {
  variant: Variant
  /** Index into pocketOrder of the pocket the ball must land on, or null. */
  targetIndex: number | null
  /** Bumps once per spin; that's what re-triggers the animation. */
  spinKey: number
  spinning: boolean
}) {
  const order = pocketOrder(variant)
  const seg = 360 / order.length

  // The ball's rotation accumulates forward so every spin turns the same way and
  // lands exactly on the winning pocket's angle.
  const rotRef = useRef(0)
  const [rot, setRot] = useState(0)
  const lastKey = useRef(spinKey)

  useLayoutEffect(() => {
    if (spinKey === lastKey.current || targetIndex == null) return
    lastKey.current = spinKey
    const phi = targetIndex * seg
    const prev = rotRef.current
    let next = prev - (prev % 360) + 360 * 5 + phi
    while (next <= prev + 360 * 4) next += 360
    rotRef.current = next
    setRot(next)
  }, [spinKey, targetIndex, seg])

  return (
    <div className="rl-wheel" style={{ width: S, height: S }}>
      <svg viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`} className="rl-wheel-svg">
        <circle cx={0} cy={0} r={R_OUT + 8} className="rl-wheel-rim" />
        {order.map((n, i) => {
          const col = colourOf(n)
          const [tx, ty] = polar(R_TEXT, i * seg)
          return (
            <g key={String(n)}>
              <path d={sector(R_IN, R_OUT, i * seg - seg / 2, i * seg + seg / 2)} className={`rl-poc rl-poc-${col}`} />
              <text x={tx} y={ty} className="rl-poc-num" transform={`rotate(${i * seg} ${tx} ${ty})`}>
                {n}
              </text>
            </g>
          )
        })}
        <circle cx={0} cy={0} r={R_IN} className="rl-wheel-hub" />
        <circle cx={0} cy={0} r={R_IN - 22} className="rl-wheel-hub2" />
        <path d="M0 0 L18 -8 L0 4 L-18 -8 Z" className="rl-wheel-turret" transform="rotate(30)" />
        <path d="M0 0 L18 -8 L0 4 L-18 -8 Z" className="rl-wheel-turret" transform="rotate(150)" />
        <path d="M0 0 L18 -8 L0 4 L-18 -8 Z" className="rl-wheel-turret" transform="rotate(270)" />
        <circle cx={0} cy={0} r={7} className="rl-wheel-cap" />
        {/* The marker the ball drops past, at twelve o'clock. */}
        <path d={`M 0 ${-R_OUT - 12} l -7 -13 l 14 0 Z`} className="rl-wheel-pointer" />
      </svg>

      <div
        className="rl-ball-arm"
        style={{
          transform: `rotate(${rot}deg)`,
          transition: spinning ? 'transform 3.2s cubic-bezier(0.17, 0.75, 0.22, 1)' : 'none',
        }}
      >
        <div className="rl-ball" style={{ top: S / 2 - R_BALL }} />
      </div>
    </div>
  )
}
