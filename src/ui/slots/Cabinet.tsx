import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'

// The furniture. Everything a slot machine is that isn't the reels: the lit top
// box that carries its name, the mouldings either side of the glass, the belly
// panel, the coin tray, and the show it puts on when it pays properly.
//
// Drawn the way `Symbols.tsx` and `Card.tsx` are drawn — inline SVG, geometry and
// flat colour, one palette per cabinet, every gradient id prefixed so four
// cabinets' <defs> can share a document.
//
// One rule governs the wide pieces. A top box is a *band*: it has to fill a
// 1180px cabinet and still fill a 360px phone, so the background is a separate
// <svg preserveAspectRatio="none"> that stretches, and the motifs sit in a second
// <svg preserveAspectRatio="xMidYMid meet"> on top so bells stay round. A nested
// <svg> would not have saved them — an ancestor's non-uniform scale reaches
// through it — hence two layers rather than one.

/* ------------------------------------------------------------------ helpers */

type Stop = [offset: number, color: string, opacity?: number]

function toStops(list: Stop[]) {
  return list.map(([o, c, op], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={op} />)
}

function Lin({
  id,
  s,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
}: {
  id: string
  s: Stop[]
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}) {
  return (
    <defs>
      <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
        {toStops(s)}
      </linearGradient>
    </defs>
  )
}

function Rad({
  id,
  s,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
}: {
  id: string
  s: Stop[]
  cx?: number
  cy?: number
  r?: number
}) {
  return (
    <defs>
      <radialGradient id={id} cx={cx} cy={cy} r={r}>
        {toStops(s)}
      </radialGradient>
    </defs>
  )
}

/** A gradient in user units that repeats along x. One declaration draws every
 *  fold in a curtain, however wide the cabinet turns out to be. */
function Ribs({ id, period, s }: { id: string; period: number; s: Stop[] }) {
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2={period}
        y2="0"
        spreadMethod="repeat"
      >
        {toStops(s)}
      </linearGradient>
    </defs>
  )
}

/** A radial gradient in user units, so it can be shared by a fan of wedges that
 *  each have their own bounding box. */
function RadU({ id, cx, cy, r, s }: { id: string; cx: number; cy: number; r: number; s: Stop[] }) {
  return (
    <defs>
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
        {toStops(s)}
      </radialGradient>
    </defs>
  )
}

/** Tapered wedges thrown from a point. Same reasoning as the scatter rays on the
 *  reels: a line reads as wire, a wedge reads as a beam. */
function Rays({
  n,
  r0,
  r1,
  w,
  color,
  o = 0.6,
  cx = 50,
  cy = 50,
  phase = 0,
}: {
  n: number
  r0: number
  r1: number
  w: number
  color: string
  o?: number
  cx?: number
  cy?: number
  phase?: number
}) {
  return (
    <g opacity={o} fill={color}>
      {Array.from({ length: n }, (_, i) => (
        <polygon
          key={i}
          points={`${-w} ${-r0} ${w} ${-r0} 0 ${-r1}`}
          transform={`translate(${cx} ${cy}) rotate(${phase + (i * 360) / n})`}
        />
      ))}
    </g>
  )
}

/** A five-pointed star, because three of the four cabinets want one somewhere. */
function star(cx: number, cy: number, ro: number, ri: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * (Math.PI / 180)
    const r = i % 2 === 0 ? ro : ri
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** A gently uneven horizontal line across the band. Rock has no canonical
 *  proportion, so this is one of the few motifs that survives being stretched. */
function wave(y: number, amp: number, seed: number, w = 700): string {
  const pts: string[] = []
  for (let i = 0; i <= 8; i++) {
    const x = (i * w) / 8
    pts.push(`${x.toFixed(1)} ${(y + Math.sin(seed + i * 1.63) * amp).toFixed(1)}`)
  }
  return pts.join(' L ')
}

/* --------------------------------------------------------------- the palettes */

/** The four machines, each with its metal and its light. These repeat the accents
 *  the stylesheet sets on `.sl-bars` and friends, so a cabinet part drawn on its
 *  own — in a harness, in a picker — still comes out in the right colours. */
interface Skin {
  /** Bright edge, body, shadow and hairline of this cabinet's metal. */
  light: string
  mid: string
  dark: string
  line: string
  /** The lamp colour: matches --sl-accent / --sl-glow. */
  accent: string
  glow: string
  /** Behind the glass. */
  well: string
  name: string
}

const SKIN: Record<string, Skin> = {
  bars: {
    light: '#eef4f7',
    mid: '#8e9aa3',
    dark: '#232a30',
    line: '#f4f9fb',
    accent: '#d8452f',
    glow: '#ff8a6c',
    well: '#0c0f12',
    name: 'Bars & Sevens',
  },
  bell: {
    light: '#ffeeb4',
    mid: '#c8a04a',
    dark: '#5d3f0c',
    line: '#f0d98a',
    accent: '#e0a326',
    glow: '#ffd070',
    well: '#120608',
    name: 'Bell Ringer',
  },
  rockslide: {
    light: '#b6c4cb',
    mid: '#55646d',
    dark: '#12181c',
    line: '#d6e6ec',
    accent: '#55b98a',
    glow: '#7eebb4',
    well: '#0a0f11',
    name: 'Rockslide',
  },
  lateshow: {
    light: '#ffe6a8',
    mid: '#a9772f',
    dark: '#2a0b26',
    line: '#ffd7ea',
    accent: '#b06ad0',
    glow: '#d696f0',
    well: '#0e0512',
    name: 'The Late Show',
  },
}

const FALLBACK = 'bell'

function skinOf(machine: string): Skin {
  return SKIN[machine] ?? SKIN[FALLBACK]
}

function key(machine: string): string {
  const clean = machine.replace(/[^A-Za-z0-9]+/g, '_')
  return clean === '' || clean === '_' ? 'x' : clean
}

/* ------------------------------------------------------------- drawn lettering */

/** The machine's name, cut rather than typeset: sized down as it gets longer so a
 *  thirteen-character name can't run off its plate, and offset back by half a
 *  letter-space because SVG puts the trailing gap inside the centred advance. */
function nameSize(label: string, room: number): number {
  // 0.74em per character is a bold uppercase sans advance plus the tracking.
  return Math.min(36, Math.floor(room / (Math.max(label.length, 1) * 0.74)))
}

interface NameProps {
  label: string
  x: number
  y: number
  room: number
  fill: string
  /** A darker copy one unit down: what makes a letter look struck into a plate. */
  shadow?: string
  /** An outline, for the neon. */
  stroke?: string
  strokeWidth?: number
}

function DrawnName({ label, x, y, room, fill, shadow, stroke, strokeWidth }: NameProps) {
  const text = label.toUpperCase()
  const fs = nameSize(text, room)
  const ls = fs * 0.09
  const common = {
    x: x - ls / 2,
    y,
    textAnchor: 'middle' as const,
    fontFamily: 'sans-serif',
    fontWeight: 800,
    fontSize: fs,
    letterSpacing: ls,
  }
  return (
    <>
      {shadow && (
        <text {...common} y={y + fs * 0.06} fill={shadow}>
          {text}
        </text>
      )}
      {stroke && (
        <text {...common} fill="none" stroke={stroke} strokeWidth={strokeWidth ?? fs * 0.2} strokeLinejoin="round">
          {text}
        </text>
      )}
      <text {...common} fill={fill}>
        {text}
      </text>
    </>
  )
}

/* ============================================================== the top boxes */
//
// Each is a band 700 x 100 — a 7:1 panel, which is roughly what the lit box above
// a real reel window measures. `band` stretches, `art` does not.

interface TopArt {
  band: (u: string) => JSX.Element
  art: (u: string, label: string) => JSX.Element
}

/* --- bars: a chrome-and-cherry-red stepper front ------------------------- */
// The plainest machine on the floor, so it gets the plainest sign: brushed
// chrome, one red race stripe, and the bar stack it pays for, twice.

/** Chrome, not red: the sign already has a red stripe running behind these, and a
 *  red bar on a red field has no silhouette left. `fill` is a paint string so the
 *  caller owns the gradient — this gets drawn in two different <svg>s. */
function barStack(fill: string): JSX.Element {
  const bars: Array<[w: number, y: number]> = [
    [58, -30],
    [76, -8],
    [94, 14],
  ]
  return (
    <g>
      {bars.map(([w, y], i) => (
        <g key={i}>
          <rect x={-w / 2} y={y} width={w} height={16} rx="5" fill={fill} stroke="#171d22" strokeWidth="2" />
          <rect x={-w / 2 + 4} y={y + 2} width={w - 8} height={4.2} rx="2.1" fill="#ffffff" fillOpacity="0.62" />
          <rect x={-w / 2 + 4} y={y + 11.6} width={w - 8} height={2.4} rx="1.2" fill="#000000" fillOpacity="0.3" />
        </g>
      ))}
    </g>
  )
}

/** The metal those bars are pressed from. */
const BAR_METAL: Stop[] = [
  [0, '#ffffff'],
  [0.26, '#c9d3da'],
  [0.5, '#69757d'],
  [0.6, '#9aa6ae'],
  [1, '#262e34'],
]

const BARS_TOP: TopArt = {
  band: (u) => (
    <>
      <Lin
        id={`${u}-ch`}
        s={[
          [0, '#dbe3e8'],
          [0.16, '#9aa6ae'],
          [0.42, '#eef4f7'],
          [0.5, '#7e8a93'],
          [0.78, '#39434a'],
          [1, '#171d22'],
        ]}
      />
      <Lin id={`${u}-red`} s={[[0, '#ff8074'], [0.34, '#d8452f'], [1, '#701009']]} />
      <Lin id={`${u}-bead`} s={[[0, '#ffffff'], [0.45, '#b9c5cd'], [1, '#4e5a61']]} />
      <rect width="700" height="100" fill={`url(#${u}-ch)`} />
      {/* Brush. Vertical hairlines stay vertical however far the band stretches. */}
      <g stroke="#ffffff" strokeOpacity="0.055" strokeWidth="1">
        {Array.from({ length: 50 }, (_, i) => (
          <path key={i} d={`M${4 + i * 14} 0 V100`} />
        ))}
      </g>
      <rect y="33" width="700" height="34" fill={`url(#${u}-red)`} />
      <rect y="33" width="700" height="4.5" fill="#ffffff" fillOpacity="0.36" />
      <rect y="63.5" width="700" height="3.5" fill="#000000" fillOpacity="0.34" />
      <rect width="700" height="9" fill={`url(#${u}-bead)`} />
      <rect y="91" width="700" height="9" fill={`url(#${u}-bead)`} transform="translate(0 100) scale(1 -1)" />
      <rect y="9" width="700" height="1.4" fill="#000000" fillOpacity="0.4" />
      <rect y="89.6" width="700" height="1.4" fill="#000000" fillOpacity="0.4" />
    </>
  ),
  art: (u, label) => (
    <>
      <Lin id={`${u}-bar`} s={BAR_METAL} />
      <Lin id={`${u}-plate`} s={[[0, '#2b3238'], [0.5, '#12171b'], [1, '#050708']]} />
      <Lin id={`${u}-rim`} s={[[0, '#ffffff'], [0.42, '#a9b6bf'], [0.56, '#5d6a72'], [1, '#e3ebf0']]} />
      <Rad id={`${u}-lit`} s={[[0, '#ff8a6c', 0.5], [0.6, '#d8452f', 0.16], [1, '#d8452f', 0]]} />

      <g transform="translate(105 50)">{barStack(`url(#${u}-bar)`)}</g>
      <g transform="translate(595 50)">{barStack(`url(#${u}-bar)`)}</g>

      {/* The name plate: chrome bezel, dark glass, a lamp behind it. */}
      <rect x="176" y="17" width="348" height="66" rx="12" fill={`url(#${u}-rim)`} />
      <rect x="182" y="23" width="336" height="54" rx="8" fill={`url(#${u}-plate)`} stroke="#000000" strokeOpacity="0.55" strokeWidth="1.4" />
      <ellipse cx="350" cy="50" rx="150" ry="34" fill={`url(#${u}-lit)`} />
      <DrawnName label={label} x={350} y={62} room={306} fill="#fbeae4" shadow="#5c0f08" />
      <rect x="188" y="26" width="324" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.12" />

      {/* Bolts. Chrome furniture is bolted to something. */}
      <g fill={`url(#${u}-rim)`} stroke="#2b3238" strokeWidth="1.2">
        {[
          [24, 22],
          [24, 78],
          [676, 22],
          [676, 78],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" />
        ))}
      </g>
    </>
  ),
}

/* --- bell: brass bells and a red seven ----------------------------------- */
// Warm and loud. Deep red glass, brass beading, a burst behind a seven that
// carries the name on a ribbon across its foot.

/** The bell from the reel strip, on its own 100-unit grid so it can be placed
 *  and scaled into a band. */
function brassBell(u: string): JSX.Element {
  return (
    <g>
      <circle cx="50" cy="17" r="6.5" fill={`url(#${u}-knob)`} stroke="#6f4f12" strokeWidth="1.4" />
      <path
        d="M50 21 C36 21 32 38 28 60 C26 69 22 72 19 77 H81 C78 72 74 69 72 60 C68 38 64 21 50 21 Z"
        fill={`url(#${u}-brass)`}
        stroke="#6f4f12"
        strokeWidth="1.8"
      />
      <path d="M45 25 C38 30 36 45 33 62 C31 70 29 73 27 77 H35 C36 70 37 60 39 48 C41 34 43 28 47 25 Z" fill="#fff3c8" fillOpacity="0.55" />
      <rect x="17" y="75" width="66" height="7.5" rx="3.75" fill={`url(#${u}-brass)`} stroke="#6f4f12" strokeWidth="1.5" />
      <circle cx="50" cy="89" r="7" fill={`url(#${u}-knob)`} stroke="#6f4f12" strokeWidth="1.5" />
    </g>
  )
}

const BELL_TOP: TopArt = {
  band: (u) => (
    <>
      <Lin id={`${u}-glass`} s={[[0, '#96182a'], [0.38, '#630c17'], [1, '#20040a']]} />
      <Rad id={`${u}-warm`} s={[[0, '#ffcf5c', 0.45], [0.5, '#ff9b2f', 0.16], [1, '#ff9b2f', 0]]} cy={0.62} r={0.62} />
      <Lin id={`${u}-bead`} s={[[0, '#fff3cd'], [0.4, '#d9ae52'], [1, '#6a4a10']]} />
      <rect width="700" height="100" fill={`url(#${u}-glass)`} />
      <rect width="700" height="100" fill={`url(#${u}-warm)`} />
      {/* Beading top and bottom, with the dark reveal a real moulding casts. */}
      <rect width="700" height="10" fill={`url(#${u}-bead)`} />
      <rect y="90" width="700" height="10" fill={`url(#${u}-bead)`} transform="translate(0 100) scale(1 -1)" />
      <rect y="10" width="700" height="2" fill="#2c0508" fillOpacity="0.7" />
      <rect y="88" width="700" height="2" fill="#2c0508" fillOpacity="0.7" />
      <rect y="13" width="700" height="1" fill="#ffdc8f" fillOpacity="0.28" />
      <rect y="86" width="700" height="1" fill="#ffdc8f" fillOpacity="0.28" />
    </>
  ),
  art: (u, label) => (
    <>
      <Lin id={`${u}-brass`} s={[[0, '#ffeeb4'], [0.4, '#d9ae52'], [0.72, '#a97e28'], [1, '#6f4f12']]} />
      <Rad id={`${u}-knob`} s={[[0, '#fff4cd'], [1, '#c08f2a']]} />
      <Lin id={`${u}-seven`} s={[[0, '#ff6e73'], [0.5, '#c8121f'], [1, '#5e050d']]} />
      <Lin id={`${u}-ribbon`} s={[[0, '#fff6d8'], [0.34, '#e0b95c'], [0.62, '#a97e28'], [1, '#f2dc9a']]} />

      {/* The burst. Twenty wedges is enough to read as light and few enough that
          the seven still sits clear of them. */}
      <Rays n={24} r0={40} r1={196} w={5} color="#ffdc8f" o={0.26} cx={350} cy={40} phase={7.5} />

      {/* The seven, on the same geometry the reel strip uses. */}
      <g transform="translate(306 -12) scale(0.86)">
        <path d="M25 18 H77 L50 86 H32 L57 32 H25 Z" fill="none" stroke="#6f4f12" strokeWidth="12" strokeLinejoin="round" />
        <path d="M25 18 H77 L50 86 H32 L57 32 H25 Z" fill="none" stroke="#f0d98a" strokeWidth="7" strokeLinejoin="round" />
        <path d="M25 18 H77 L50 86 H32 L57 32 H25 Z" fill={`url(#${u}-seven)`} />
        <path d="M29 21 H70 L67 28 H29 Z" fill="#ffffff" fillOpacity="0.34" />
      </g>

      <g transform="translate(75 0) scale(0.9)">{brassBell(u)}</g>
      <g transform="translate(535 0) scale(0.9)">{brassBell(u)}</g>

      {/* The ribbon. Brass, bevelled, with the name struck into it. */}
      <path
        d="M152 62 H548 L536 92 H164 Z"
        fill={`url(#${u}-ribbon)`}
        stroke="#6f4f12"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M156 65 H544 L542 71 H158 Z" fill="#fffbe8" fillOpacity="0.45" />
      <DrawnName label={label} x={350} y={86} room={340} fill="#4a0a10" shadow="#ffeeb4" />
    </>
  ),
}

/* --- rockslide: a canyon face, strata, a gem seam ------------------------ */
// Ground, then figure. The strata are in the stretching layer because rock has no
// proportion to violate; the gems and the slab are not, because they do.

function facetGem(u: string, grade: 'green' | 'cyan' | 'ochre'): JSX.Element {
  const spec = {
    green: {
      d: 'M30 22 H70 L82 34 V66 L70 78 H30 L18 66 V34 Z',
      crown: 'M30 22 H70 L64 32 H36 Z',
      pav: 'M30 78 H70 L64 68 H36 Z',
      lines: 'M36 32 H64 V68 H36 Z M43 40 H57 V60 H43 Z M18 34 L30 22 M82 34 L70 22',
    },
    cyan: {
      d: 'M31 26 H69 L86 45 L50 88 L14 45 Z',
      crown: 'M31 26 H69 L60 39 H40 Z',
      pav: 'M50 88 L86 45 L69 45 Z',
      lines: 'M14 45 H86 M31 26 L40 39 L50 88 M69 26 L60 39 L50 88',
    },
    ochre: {
      d: 'M26 40 L38 22 L62 18 L80 34 L84 58 L68 80 L40 82 L20 66 Z',
      crown: 'M38 22 L62 18 L58 34 L34 36 Z',
      pav: 'M68 80 L84 58 L62 60 L48 82 Z',
      lines: 'M34 36 L58 34 L68 56 L48 68 L26 58 Z M58 34 L80 34 M68 56 L84 58',
    },
  }[grade]
  const edge = { green: '#04301f', cyan: '#dff4ff', ochre: '#5f3d05' }[grade]
  return (
    <g>
      <path d={spec.d} fill={`url(#${u}-${grade})`} stroke={edge} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={spec.crown} fill="#ffffff" fillOpacity="0.4" />
      <path d={spec.pav} fill="#000000" fillOpacity="0.28" />
      <path d={spec.lines} fill="none" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="1.6" />
    </g>
  )
}

function gemCluster(u: string): JSX.Element {
  return (
    <g>
      <g transform="translate(24 2) scale(0.44)">{facetGem(u, 'cyan')}</g>
      <g transform="translate(120 36) scale(0.42)">{facetGem(u, 'ochre')}</g>
      <g transform="translate(48 14) scale(0.78)">{facetGem(u, 'green')}</g>
    </g>
  )
}

const ROCK_TOP: TopArt = {
  band: (u) => {
    // Five beds, each darker than the one above and each with its own bright
    // upper face, so a boundary reads as a step in the rock rather than a change
    // of grey. Two of them are ochre: without a warm bed the whole face goes to
    // slate and the green seam has nothing to sit against.
    const strata: Array<[y: number, fill: string, lip: string, seed: number]> = [
      [17, '#4e5b64', '#7d8d96', 0.4],
      [33, '#6d5526', '#a8873c', 2.1],
      [46, '#333d45', '#5d6b74', 3.6],
      [68, '#241d12', '#6b5526', 5.0],
      [82, '#151b20', '#39434b', 6.4],
    ]
    return (
      <>
        <Lin id={`${u}-rock`} s={[[0, '#66737c'], [1, '#4b5860']]} />
        <rect width="700" height="100" fill={`url(#${u}-rock)`} />
        {strata.map(([y, fill, lip, seed], i) => (
          <g key={i}>
            <path d={`M ${wave(y, 4.5, seed)} L 700 100 L 0 100 Z`} fill={fill} />
            <path d={`M ${wave(y, 4.5, seed)}`} fill="none" stroke={lip} strokeWidth="2.6" />
          </g>
        ))}
        {/* The fractures that cut the beds. */}
        <g fill="none" strokeLinecap="round" stroke="#0b0f12" strokeOpacity="0.55" strokeWidth="2.4">
          <path d="M88 0 L104 34 L96 68 L110 100" />
          <path d="M268 8 L256 40 L272 72 L262 100" />
          <path d="M452 0 L468 30 L458 66 L472 100" />
          <path d="M614 6 L602 38 L618 70 L608 100" />
        </g>
        {/* The seam. Four passes: a wide bloom, the vein, the bright core, and a
            dark line under it so the glow has an edge to come off. */}
        <g fill="none" strokeLinecap="round">
          <path d={`M ${wave(58, 6, 2.9)}`} stroke="#0a1a13" strokeOpacity="0.6" strokeWidth="13" />
          <path d={`M ${wave(57, 6, 2.9)}`} stroke="#55b98a" strokeOpacity="0.3" strokeWidth="20" />
          <path d={`M ${wave(57, 6, 2.9)}`} stroke="#55b98a" strokeOpacity="0.85" strokeWidth="7" />
          <path d={`M ${wave(57, 6, 2.9)}`} stroke="#e6fff2" strokeOpacity="0.9" strokeWidth="2.4" />
        </g>
        <rect width="700" height="4" fill="#000000" fillOpacity="0.45" />
        <rect y="96" width="700" height="4" fill="#000000" fillOpacity="0.5" />
      </>
    )
  },
  art: (u, label) => (
    <>
      <Lin id={`${u}-green`} s={[[0, '#8ff2c6'], [0.45, '#17a672'], [1, '#064a33']]} />
      <Lin id={`${u}-cyan`} s={[[0, '#f6feff'], [0.45, '#a5e0f7'], [1, '#3d8fc4']]} />
      <Lin id={`${u}-ochre`} s={[[0, '#fff0b8'], [0.4, '#f0b429'], [1, '#8a5b0c']]} />
      <Lin id={`${u}-slab`} s={[[0, '#8b99a1'], [0.24, '#4c5860'], [0.5, '#333d45'], [1, '#161c21']]} />
      <Rad id={`${u}-seam`} s={[[0, '#7eebb4', 0.55], [0.55, '#55b98a', 0.16], [1, '#55b98a', 0]]} />

      <ellipse cx="350" cy="52" rx="200" ry="44" fill={`url(#${u}-seam)`} />

      <g transform="translate(6 8)">{gemCluster(u)}</g>
      <g transform="translate(700 0) scale(-1 1)">
        <g transform="translate(6 8)">{gemCluster(u)}</g>
      </g>

      {/* The slab. Cut stone is never square, and it chips at the corners — a clean
          quadrilateral here read as a button rather than as rock. The tilt is small
          on purpose: any more and the horizontal lettering on it looks wrong. */}
      <path
        d="M196 22 L214 15 L500 12 L516 26 L512 74 L494 84 L212 86 L198 74 Z"
        fill={`url(#${u}-slab)`}
        stroke="#0c1013"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* A carved recess with a lit upper chamfer and a shaded lower one: that pair
          of wedges is the whole reason this reads as cut into stone. */}
      <path d="M196 22 L214 15 L500 12 L516 26 L505 30 L494 21 L216 24 L204 30 Z" fill="#ffffff" fillOpacity="0.3" />
      <path d="M198 74 L212 86 L494 84 L512 74 L502 68 L490 76 L216 78 L207 69 Z" fill="#000000" fillOpacity="0.4" />
      <path d="M210 30 L502 27 L498 70 L214 72 Z" fill="#000000" fillOpacity="0.26" />
      {/* Chisel pecking along the face. Sparse — it is texture, not a pattern. */}
      <g fill="#ffffff" fillOpacity="0.12">
        {[
          [232, 38],
          [268, 66],
          [318, 33],
          [396, 69],
          [442, 36],
          [478, 62],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} l6 -2 l3 4 l-7 2 Z`} />
        ))}
      </g>
      <path d="M196 22 L198 74" fill="none" stroke="#7eebb4" strokeOpacity="0.55" strokeWidth="2.6" />
      <path d="M516 26 L512 74" fill="none" stroke="#7eebb4" strokeOpacity="0.34" strokeWidth="2.2" />
      <DrawnName label={label} x={354} y={62} room={276} fill="#f4fafc" shadow="#080c0f" />
      {/* A live sliver of the seam, running out from under the slab. */}
      <path d="M202 78 L232 92 L248 87" fill="none" stroke="#7eebb4" strokeOpacity="0.8" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
}

/* --- lateshow: a lounge marquee ----------------------------------------- */
// A curtain in the stretching layer, a bulb-ringed sign and neon lettering in
// the layer that keeps its shape.

const LATE_TOP: TopArt = {
  band: (u) => (
    <>
      <Lin id={`${u}-plum`} s={[[0, '#6e1440'], [0.55, '#430b2a'], [1, '#1c0518']]} />
      <Ribs
        id={`${u}-fold`}
        period={39}
        s={[
          [0, '#000000', 0.58],
          [0.3, '#d2568c', 0.16],
          [0.56, '#000000', 0.12],
          [1, '#000000', 0.58],
        ]}
      />
      <Rad id={`${u}-stage`} s={[[0, '#ffdb94', 0.28], [0.6, '#ffb35c', 0.08], [1, '#ffb35c', 0]]} cy={0.78} r={0.7} />
      <Lin id={`${u}-valance`} s={[[0, '#ffe6a8'], [0.4, '#a9772f'], [1, '#4d2d0a']]} />
      <rect width="700" height="100" fill={`url(#${u}-plum)`} />
      <rect width="700" height="100" fill={`url(#${u}-fold)`} />
      <rect width="700" height="100" fill={`url(#${u}-stage)`} />
      <rect width="700" height="13" fill={`url(#${u}-valance)`} />
      <rect y="13" width="700" height="2" fill="#1c0518" fillOpacity="0.75" />
      <rect y="96" width="700" height="4" fill="#000000" fillOpacity="0.5" />
    </>
  ),
  art: (u, label) => {
    // Bulbs around the sign: along the head and the sill, down both jambs.
    const x0 = 26
    const x1 = 674
    const y0 = 12
    const y1 = 90
    const bulbs: Array<[number, number]> = []
    const across = 15
    for (let i = 0; i <= across; i++) {
      const x = x0 + ((x1 - x0) * i) / across
      bulbs.push([x, y0])
      bulbs.push([x, y1])
    }
    for (let i = 1; i <= 2; i++) {
      const y = y0 + ((y1 - y0) * i) / 3
      bulbs.push([x0, y])
      bulbs.push([x1, y])
    }
    return (
      <>
        {/* Kept part-transparent: the sign is glass in front of the drape, and if
            it goes opaque the curtain behind it stops existing. */}
        <Lin id={`${u}-sign`} s={[[0, '#2c0a2c', 0.5], [0.6, '#100312', 0.66], [1, '#1c0620', 0.6]]} />
        <Lin id={`${u}-brass`} s={[[0, '#ffe6a8'], [0.45, '#c8a04a'], [1, '#6b4310']]} />
        <Rad id={`${u}-bulb`} s={[[0, '#fff6d0', 0.95], [0.4, '#ffd873', 0.5], [1, '#ffd873', 0]]} />
        <Rad id={`${u}-neonglow`} s={[[0, '#ff4d9d', 0.4], [0.6, '#b06ad0', 0.14], [1, '#b06ad0', 0]]} />

        <rect
          x={x0}
          y={y0}
          width={x1 - x0}
          height={y1 - y0}
          rx="14"
          fill={`url(#${u}-sign)`}
          stroke={`url(#${u}-brass)`}
          strokeWidth="4.5"
        />
        <ellipse cx="350" cy="52" rx="230" ry="34" fill={`url(#${u}-neonglow)`} />

        {/* Two stars on the frame, the way a lounge sign always has them. */}
        <polygon points={star(70, 51, 17, 7)} fill="#fff4cd" stroke="#ffd873" strokeWidth="1.6" />
        <polygon points={star(630, 51, 17, 7)} fill="#fff4cd" stroke="#ffd873" strokeWidth="1.6" />

        {/* The name in neon: a bloom, a tube, a hot core. */}
        <DrawnName label={label} x={350} y={56} room={430} fill="#fff0fa" stroke="#ff4d9d" strokeWidth={9} />
        {/* The neon tube under the name, tapering out at both ends the way a bent
            tube does rather than stopping dead. */}
        <Lin id={`${u}-tube`} s={[[0, '#ff4d9d', 0], [0.16, '#ff4d9d', 1], [0.84, '#ff4d9d', 1], [1, '#ff4d9d', 0]]} x2={1} y2={0} />
        <rect x="210" y="71" width="280" height="6" rx="3" fill={`url(#${u}-tube)`} />
        <rect x="226" y="72.4" width="248" height="2" rx="1" fill="#ffd7ea" fillOpacity="0.8" />

        <g>
          {bulbs.map(([x, y], i) => (
            <circle
              key={`g${i}`}
              className="slc-bulb"
              style={{ animationDelay: `${((i * 7) % 6) * 0.15}s` } as CSSProperties}
              cx={x}
              cy={y}
              r="10"
              fill={`url(#${u}-bulb)`}
            />
          ))}
          {bulbs.map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r="3.6" fill="#fff8e0" />
          ))}
        </g>
      </>
    )
  },
}

const TOP: Record<string, TopArt> = {
  bars: BARS_TOP,
  bell: BELL_TOP,
  rockslide: ROCK_TOP,
  lateshow: LATE_TOP,
}

export interface TopBoxProps {
  machine: string
  /** The name on the sign. Defaults to the machine's own, so the part can be
   *  drawn on its own without a game object to hand. */
  label?: string
}

/** The lit panel above the reels: the game's name and its art. */
export function TopBox({ machine, label }: TopBoxProps): JSX.Element {
  const art = TOP[machine] ?? TOP[FALLBACK]
  const name = label ?? skinOf(machine).name
  const u = key(machine)
  return (
    <div className={`slc-topbox slc-m-${u}`}>
      <svg className="slc-tb-band" viewBox="0 0 700 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {art.band(`tbb-${u}`)}
      </svg>
      <svg
        className="slc-tb-art"
        viewBox="0 0 700 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${name} top box`}
      >
        {art.art(`tba-${u}`, name)}
      </svg>
    </div>
  )
}

/* ============================================================ cabinet chrome */

/** A side rail: a long moulded upright with a lit tube down its middle and a
 *  turned cap at each end. The shaft is all vertical bands, so it can stretch to
 *  any reel height; the caps are fixed and drawn to shape. */
export function SideRail({ side, machine }: { side: 'left' | 'right'; machine: string }): JSX.Element {
  const s = skinOf(machine)
  const u = `rail-${key(machine)}`
  const cap = (place: 'top' | 'bot') => (
    <svg
      className={`slc-rail-cap slc-rail-cap-${place}`}
      viewBox="0 0 40 40"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 40 V14 C4 7 12 2 20 2 C28 2 36 7 36 14 V40 Z" fill={`url(#${u}-cap)`} stroke={s.dark} strokeWidth="1.6" />
      <path d="M8 40 V15 C8 10 13 6 20 6 C24 6 27 7 29 9 C22 9 12 13 12 20 V40 Z" fill={s.light} fillOpacity="0.4" />
      <circle cx="20" cy="19" r="6" fill={`url(#${u}-cap)`} stroke={s.dark} strokeWidth="1.4" />
      <circle cx="20" cy="19" r="2.2" fill={s.dark} fillOpacity="0.6" />
      <defs>
        <linearGradient id={`${u}-cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={s.dark} />
          <stop offset="0.3" stopColor={s.mid} />
          <stop offset="0.46" stopColor={s.light} />
          <stop offset="0.72" stopColor={s.mid} />
          <stop offset="1" stopColor={s.dark} />
        </linearGradient>
      </defs>
    </svg>
  )
  return (
    <div className={`slc-rail slc-rail-${side} slc-m-${key(machine)}`} aria-hidden="true">
      {cap('top')}
      <svg className="slc-rail-shaft" viewBox="0 0 40 100" preserveAspectRatio="none" focusable="false">
        {/* Four mouldings across the width: outer bevel, groove, light, inner
            bevel. Reading left to right is reading the section of the extrusion. */}
        <Lin id={`${u}-outer`} s={[[0, s.dark], [0.35, s.mid], [0.6, s.light], [1, s.mid]]} x2={1} y2={0} />
        <Lin id={`${u}-groove`} s={[[0, '#000000', 0.7], [0.5, '#000000', 0.34], [1, '#000000', 0.66]]} x2={1} y2={0} />
        <Lin id={`${u}-tube`} s={[[0, s.accent, 0.25], [0.42, s.glow, 0.95], [0.6, s.accent, 0.7], [1, s.accent, 0.2]]} x2={1} y2={0} />
        <rect width="40" height="100" fill={`url(#${u}-outer)`} />
        <rect x="9" width="22" height="100" fill={`url(#${u}-groove)`} />
        <rect x="14" width="12" height="100" fill={`url(#${u}-tube)`} />
        <rect x="17" width="4" height="100" fill="#ffffff" fillOpacity="0.45" />
        <rect x="0" width="1.4" height="100" fill={s.line} fillOpacity="0.5" />
        <rect x="38.6" width="1.4" height="100" fill="#000000" fillOpacity="0.55" />
      </svg>
      {cap('bot')}
    </div>
  )
}

/* --- the belly ---------------------------------------------------------- */

interface BellyArt {
  band: (u: string, s: Skin) => JSX.Element
  motif: (u: string, s: Skin) => JSX.Element
}

/** Each cabinet's belly is the same object in four materials: a lit sheet of
 *  glass with the machine's metal beaded across the top and bottom, and one
 *  emblem repeated either side of centre. */
const BELLY: Record<string, BellyArt> = {
  bars: {
    band: (u, s) => (
      <>
        <Lin id={`${u}-f`} s={[[0, '#9aa6ae'], [0.3, '#5f6b73'], [1, '#1d2328']]} />
        {/* A lamp behind the glass, not a painted stripe: soft top and bottom. */}
        <Lin id={`${u}-lamp`} s={[[0, s.accent, 0], [0.42, s.accent, 0.8], [0.58, s.accent, 0.8], [1, s.accent, 0]]} />
        <rect width="700" height="64" fill={`url(#${u}-f)`} />
        <g stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1">
          {Array.from({ length: 50 }, (_, i) => (
            <path key={i} d={`M${4 + i * 14} 0 V64`} />
          ))}
        </g>
        <rect y="20" width="700" height="26" fill={`url(#${u}-lamp)`} />
        <rect y="31" width="700" height="2" fill="#ffffff" fillOpacity="0.34" />
      </>
    ),
    motif: (u) => (
      <>
        <Lin id={`${u}-bar`} s={BAR_METAL} />
        <g transform="translate(0 32)">
          <g transform="translate(94 0) scale(0.5)">{barStack(`url(#${u}-bar)`)}</g>
          <g transform="translate(606 0) scale(0.5)">{barStack(`url(#${u}-bar)`)}</g>
        </g>
      </>
    ),
  },
  bell: {
    band: (u) => (
      <>
        <Lin id={`${u}-f`} s={[[0, '#8a1524'], [0.4, '#560a14'], [1, '#1c0407']]} />
        <Rad id={`${u}-w`} s={[[0, '#ffcf5c', 0.34], [1, '#ff9b2f', 0]]} cy={0.5} r={0.6} />
        <rect width="700" height="64" fill={`url(#${u}-f)`} />
        <rect width="700" height="64" fill={`url(#${u}-w)`} />
      </>
    ),
    motif: (u) => (
      <>
        <Lin id={`${u}-brass`} s={[[0, '#ffeeb4'], [0.4, '#d9ae52'], [0.72, '#a97e28'], [1, '#6f4f12']]} />
        <Rad id={`${u}-knob`} s={[[0, '#fff4cd'], [1, '#c08f2a']]} />
        <g transform="translate(56 -2) scale(0.66)">{brassBell(u)}</g>
        <g transform="translate(578 -2) scale(0.66)">{brassBell(u)}</g>
      </>
    ),
  },
  rockslide: {
    band: (u) => (
      <>
        <Lin id={`${u}-f`} s={[[0, '#4a565e'], [0.5, '#2b343b'], [1, '#141a1e']]} />
        <rect width="700" height="64" fill={`url(#${u}-f)`} />
        {[
          [16, '#39434b', 0.9],
          [34, '#2b343b', 3.2],
          [50, '#1b2227', 5.1],
        ].map(([y, fill, seed], i) => (
          <path key={i} d={`M ${wave(y as number, 3.4, seed as number)} L 700 64 L 0 64 Z`} fill={fill as string} />
        ))}
        <g fill="none" strokeLinecap="round">
          <path d={`M ${wave(40, 4, 2.6)}`} stroke="#55b98a" strokeOpacity="0.2" strokeWidth="12" />
          <path d={`M ${wave(40, 4, 2.6)}`} stroke="#7eebb4" strokeOpacity="0.6" strokeWidth="3.4" />
        </g>
      </>
    ),
    motif: (u) => (
      <>
        <Lin id={`${u}-green`} s={[[0, '#8ff2c6'], [0.45, '#17a672'], [1, '#064a33']]} />
        <g transform="translate(58 -3) scale(0.66)">{facetGem(u, 'green')}</g>
        <g transform="translate(584 -3) scale(0.66)">{facetGem(u, 'green')}</g>
      </>
    ),
  },
  lateshow: {
    band: (u) => (
      <>
        <Lin id={`${u}-f`} s={[[0, '#5c1136'], [0.55, '#360922'], [1, '#160413']]} />
        <Ribs id={`${u}-fold`} period={39} s={[[0, '#000000', 0.55], [0.3, '#d2568c', 0.14], [1, '#000000', 0.55]]} />
        <Lin id={`${u}-neon`} s={[[0, '#ff4d9d', 0], [0.14, '#ff4d9d', 0.85], [0.86, '#ff4d9d', 0.85], [1, '#ff4d9d', 0]]} x2={1} y2={0} />
        <rect width="700" height="64" fill={`url(#${u}-f)`} />
        <rect width="700" height="64" fill={`url(#${u}-fold)`} />
        <rect y="29" width="700" height="5" rx="2.5" fill={`url(#${u}-neon)`} />
      </>
    ),
    motif: () => (
      <g>
        <polygon points={star(64, 32, 20, 8)} fill="#fff4cd" stroke="#ffd873" strokeWidth="1.8" />
        <polygon points={star(636, 32, 20, 8)} fill="#fff4cd" stroke="#ffd873" strokeWidth="1.8" />
      </g>
    ),
  },
}

export interface BellyGlassProps {
  machine: string
  /** Optional line on the centre plate — "play max credits", a jackpot figure.
   *  Left out, the panel is just lit glass and its emblems. */
  text?: string
}

/** The lit panel below the reels. Same two-layer construction as the top box. */
export function BellyGlass({ machine, text }: BellyGlassProps): JSX.Element {
  const s = skinOf(machine)
  const art = BELLY[machine] ?? BELLY[FALLBACK]
  const u = key(machine)
  return (
    <div className={`slc-belly slc-m-${u}`}>
      <svg className="slc-belly-band" viewBox="0 0 700 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {art.band(`byb-${u}`, s)}
        {/* Beading, drawn here so it runs the full width however far it stretches. */}
        <defs>
          <linearGradient id={`byb-${u}-bead`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.light} />
            <stop offset="0.5" stopColor={s.mid} />
            <stop offset="1" stopColor={s.dark} />
          </linearGradient>
        </defs>
        <rect width="700" height="7" fill={`url(#byb-${u}-bead)`} />
        <rect y="57" width="700" height="7" fill={`url(#byb-${u}-bead)`} transform="translate(0 64) scale(1 -1)" />
        <rect y="7" width="700" height="1.4" fill="#000000" fillOpacity="0.5" />
        <rect y="55.6" width="700" height="1.4" fill="#000000" fillOpacity="0.5" />
      </svg>
      <svg
        className="slc-belly-art"
        viewBox="0 0 700 64"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden={text ? undefined : true}
        role={text ? 'img' : undefined}
        aria-label={text}
        focusable="false"
      >
        {art.motif(`bya-${u}`, s)}
        {text && (
          <>
            <rect x="200" y="18" width="300" height="28" rx="7" fill="#000000" fillOpacity="0.42" stroke={s.mid} strokeWidth="1.6" />
            <text
              x="350"
              y="37"
              textAnchor="middle"
              fontFamily="sans-serif"
              fontWeight="700"
              fontSize="15"
              letterSpacing="2.4"
              fill={s.light}
            >
              {text.toUpperCase()}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

/** The lip at the bottom of the machine. All of it is horizontal, so one
 *  stretching layer does the whole job. */
export function CoinTray({ machine }: { machine: string }): JSX.Element {
  const s = skinOf(machine)
  const u = `tray-${key(machine)}`
  return (
    <svg
      className={`slc-tray slc-m-${key(machine)}`}
      viewBox="0 0 700 26"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Read top to bottom as a section through the moulding: the shelf the tray
          is cut into, the shadow at the back of the recess, the well itself with
          the machine's light spilling into it, and the nosing you knock the coins
          off. All of it horizontal, so one stretching layer does the whole job. */}
      <Lin id={`${u}-lip`} s={[[0, s.light], [0.4, s.mid], [1, s.dark]]} />
      <Lin id={`${u}-well`} s={[[0, '#000000'], [0.3, '#050708'], [0.55, '#0d1013'], [1, '#2a3036']]} />
      <Lin id={`${u}-shade`} s={[[0, '#000000', 0.85], [1, '#000000', 0]]} />
      <Lin id={`${u}-lit`} s={[[0, s.accent, 0], [0.7, s.accent, 0.16], [1, s.accent, 0.4]]} />
      <Lin id={`${u}-nose`} s={[[0, s.light], [0.32, s.mid], [0.62, s.dark], [1, s.mid]]} />
      <rect width="700" height="26" fill={`url(#${u}-lip)`} />
      <rect y="2" width="700" height="17" fill={`url(#${u}-well)`} />
      <rect y="2" width="700" height="7" fill={`url(#${u}-shade)`} />
      <rect y="2" width="700" height="17" fill={`url(#${u}-lit)`} />
      <rect y="1.4" width="700" height="1.6" fill="#000000" fillOpacity="0.8" />
      {/* The nosing. It has to be the brightest thing here or the recess above it
          reads as a shadow rather than as a hole you can put your hand in. */}
      <rect y="17.4" width="700" height="7.6" rx="3.4" fill={`url(#${u}-nose)`} />
      <rect y="18" width="700" height="2" rx="1" fill={s.light} fillOpacity="0.85" />
      <rect y="16.6" width="700" height="1.4" fill={s.accent} fillOpacity="0.4" />
      <rect y="24.6" width="700" height="1.4" fill="#000000" fillOpacity="0.65" />
    </svg>
  )
}

export interface CabinetFrameProps {
  machine: string
  children: ReactNode
  /** Set false to place the belly panel and tray yourself. */
  belly?: boolean
  /** Line on the belly plate, if any. */
  bellyText?: string
}

/** Rails either side of whatever is handed to it, then the belly and the tray.
 *  Put the reel window (and, if you like, the button deck) inside it. */
export function CabinetFrame({ machine, children, belly = true, bellyText }: CabinetFrameProps): JSX.Element {
  return (
    <div className={`slc-frame slc-m-${key(machine)}`}>
      <div className="slc-frame-row">
        <SideRail side="left" machine={machine} />
        <div className="slc-frame-mid">{children}</div>
        <SideRail side="right" machine={machine} />
      </div>
      {belly && (
        <>
          <BellyGlass machine={machine} text={bellyText} />
          <CoinTray machine={machine} />
        </>
      )}
    </div>
  )
}

/* ============================================================== the big win */

export type BigWinKind = 'win' | 'bonus' | 'free'

export interface BigWinProps {
  /** Credits paid. Counts up from zero to this. */
  amount: number
  kind?: BigWinKind
  /** Amount over total bet, if the caller knows it. It decides the intensity;
   *  without it the amount alone is used, which is cruder. */
  multiple?: number
  /** For the palette. Omitted, the overlay inherits whatever --sl-accent is in
   *  scope, which inside `.sl-bars` is the right thing anyway. */
  machine?: string
  /** Called once, about 2.5s in. Remount with a fresh `key` to play it again. */
  onDone?: () => void
}

/** How long the whole show lasts, and how long the meter takes to get there. */
const SHOW_MS = 2500
const ROLL_MS = 1500

type Tier = 1 | 2 | 3

/** Three intensities. A win worth a dozen bets is worth interrupting the game
 *  for; one worth fifty is worth a coin shower. Below that it is a flourish. */
function tierOf(amount: number, multiple?: number): Tier {
  if (multiple !== undefined) {
    if (multiple >= 50) return 3
    if (multiple >= 12) return 2
    return 1
  }
  if (amount >= 2000) return 3
  if (amount >= 400) return 2
  return 1
}

const HEAD: Record<BigWinKind, Record<Tier, string>> = {
  win: { 1: 'Nice win', 2: 'Big win', 3: 'Jackpot' },
  bonus: { 1: 'Bonus', 2: 'Big bonus', 3: 'Bonus jackpot' },
  free: { 1: 'Free game win', 2: 'Big free game', 3: 'Free game jackpot' },
}

function useStill(): boolean {
  const [still, setStill] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return still
}

/** The meter. Sprints then settles, the same easing the credit display uses. */
function useCountUp(target: number, still: boolean): number {
  const [n, setN] = useState(still ? target : 0)
  useEffect(() => {
    if (still) {
      setN(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ROLL_MS)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, still])
  return n
}

/** Where the jackpot's coins fall from, and how fast. Index-derived rather than
 *  random so a re-render doesn't reshuffle them mid-fall. */
const COINS = Array.from({ length: 20 }, (_, i) => ({
  x: 22 + (((i * 173) % 100) / 100) * 656,
  delay: (((i * 61) % 100) / 100) * 1.15,
  scale: 0.62 + (((i * 47) % 55) / 100),
}))

/**
 * What a cabinet does when it pays properly. Sits over the reel window — the
 * caller's element must be positioned — and never over the buttons: this is
 * `pointer-events: none` throughout, so Spin stays live underneath it.
 */
export function BigWin({ amount, kind = 'win', multiple, machine, onDone }: BigWinProps): JSX.Element {
  const tier = tierOf(amount, multiple)
  const still = useStill()
  const shown = useCountUp(amount, still)

  // Held in a ref so a caller that passes a fresh closure every render doesn't
  // restart the clock and stretch the show out indefinitely.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])
  useEffect(() => {
    const t = setTimeout(() => done.current?.(), SHOW_MS)
    return () => clearTimeout(t)
    // Deliberately once: the show is 2.5s from the moment it appears, and a
    // re-render must not push the end of it further away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two of these can share a document — a harness, or a bonus paying out over a
  // base win — so the gradient ids carry the tier and the kind.
  const u = `bw-${key(machine ?? 'x')}-${kind}-${tier}`

  const classes = [
    'slc-bw',
    `slc-bw-t${tier}`,
    `slc-bw-${kind}`,
    machine ? `slc-m-${key(machine)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const spoken = `${HEAD[kind][tier]}. ${amount.toLocaleString()} credits${
    multiple !== undefined && multiple >= 2 ? `, ${Math.round(multiple)} times your bet` : ''
  }.`

  return (
    <div className={classes}>
      {/* Said once, in full, at the final figure. The visible meter is counting up
          sixty times a second, so it must not be the live region. */}
      <span className="slc-bw-said" role="status">
        {spoken}
      </span>
      {/* The reels go down, not out. A cabinet that pays dims its own glass so the
          number is the only thing to look at; wash the accent over the top of that
          rather than over the symbols, or the screen turns into one colour. */}
      <span className="slc-bw-scrim" />

      {/* The burst. Thin wedges and a lot of them: this <svg> is sliced to cover a
          box three or four times wider than it is tall, so anything drawn fat here
          lands on the glass as a slab. Two sets counter-rotate on a jackpot. */}
      <svg className="slc-bw-burst" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${u}-wash`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#${u}-wash)`} />
        {/* Beams, not spokes: a wedge of flat colour running to the corner of the
            box reads as wire however thin it is, so the fill fades out with radius
            and each one dies before it gets there. */}
        <RadU
          id={`${u}-beam`}
          cx={100}
          cy={100}
          r={210}
          s={[[0, 'currentColor', 0.95], [0.4, 'currentColor', 0.62], [0.8, 'currentColor', 0.18], [1, 'currentColor', 0]]}
        />
        <g className="slc-bw-spin">
          <Rays
            n={tier === 1 ? 18 : 28}
            r0={10}
            r1={190}
            w={tier === 1 ? 1.7 : 2.3}
            color={`url(#${u}-beam)`}
            o={tier === 1 ? 0.55 : 0.8}
            cx={100}
            cy={100}
          />
        </g>
        {tier === 3 && (
          <>
            <RadU
              id={`${u}-beam2`}
              cx={100}
              cy={100}
              r={190}
              s={[[0, '#fff6d8', 0.8], [0.45, '#fff6d8', 0.34], [1, '#fff6d8', 0]]}
            />
            <g className="slc-bw-spin slc-bw-spin-back">
              <Rays n={28} r0={16} r1={190} w={1.4} color={`url(#${u}-beam2)`} o={0.75} cx={100} cy={100} phase={6.4} />
            </g>
          </>
        )}
      </svg>

      {/* Shockwave rings. A jackpot gets a second one, behind. */}
      <span className="slc-bw-ring" />
      {tier === 3 && <span className="slc-bw-ring slc-bw-ring-2" />}

      {/* The rim of light around the reel area. */}
      <span className="slc-bw-rim" />

      {tier === 3 && (
        <svg className="slc-bw-shower" viewBox="0 0 700 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${u}-coin`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff6d0" />
              <stop offset="0.45" stopColor="#e0b95c" />
              <stop offset="1" stopColor="#8a6216" />
            </linearGradient>
          </defs>
          {COINS.map((c, i) => (
            <g key={i} transform={`translate(${c.x.toFixed(1)} -20) scale(${c.scale.toFixed(2)})`}>
              <g className="slc-bw-coin" style={{ animationDelay: `${c.delay.toFixed(2)}s` } as CSSProperties}>
                <circle r="11" fill={`url(#${u}-coin)`} stroke="#6f4f12" strokeWidth="1.6" />
                <circle r="5.5" fill="none" stroke="#fff6d0" strokeOpacity="0.7" strokeWidth="1.6" />
              </g>
            </g>
          ))}
        </svg>
      )}

      <div className="slc-bw-core" aria-hidden="true">
        <span className="slc-bw-kicker">{HEAD[kind][tier]}</span>
        <span className="slc-bw-amount">{shown.toLocaleString()}</span>
        <span className="slc-bw-sub">
          {/* "1× your bet" is a worse thing to print than "credits", so the
              multiple only appears once it is worth boasting about. */}
          {multiple !== undefined && multiple >= 2 ? `${Math.round(multiple)}× your bet` : 'credits'}
        </span>
      </div>
    </div>
  )
}
