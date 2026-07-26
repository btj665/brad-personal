import type { JSX } from 'react'

// The reel art. Every symbol is a single self-contained <svg> on a 100x100 grid,
// drawn the way `Card.tsx` draws a deck: geometry and flat colour, no clip art.
//
// Two rules run through all of it, because these are read at ~50px while moving:
//   1. Silhouette before detail. Three bars must differ from two in *outline*.
//   2. Tier by ink. Premiums are metallic and saturated; card ranks are flat,
//      low-contrast plates; the blank is almost nothing at all.
//
// Each cabinet owns its palette, so four machines on one page don't look like
// one machine four times. Every gradient id is prefixed `machine-symbol`, which
// is what keeps four cabinets' <defs> from colliding in a shared document.

/* ------------------------------------------------------------------ helpers */

type Stop = [offset: number, color: string, opacity?: number]

function toStops(list: Stop[]) {
  return list.map(([o, c, op], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={op} />)
}

type LinP = { id: string; s: Stop[]; x1?: number; y1?: number; x2?: number; y2?: number }

function Lin({ id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1 }: LinP) {
  return (
    <defs>
      <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
        {toStops(s)}
      </linearGradient>
    </defs>
  )
}

function Rad({ id, s, cx = 0.5, cy = 0.5, r = 0.5 }: { id: string; s: Stop[]; cx?: number; cy?: number; r?: number }) {
  return (
    <defs>
      <radialGradient id={id} cx={cx} cy={cy} r={r}>
        {toStops(s)}
      </radialGradient>
    </defs>
  )
}

/** The soft backing light behind a wild or a scatter. This, more than any
 *  interior detail, is what makes those two symbols findable mid-spin. */
type HaloP = { id: string; color: string; cx?: number; cy?: number; r?: number; o?: number }

function Halo({ id, color, cx = 50, cy = 50, r = 50, o = 0.5 }: HaloP) {
  return (
    <>
      <Rad id={id} s={[[0, color, o], [0.45, color, o * 0.4], [1, color, 0]]} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  )
}

type RaysP = { n: number; r0: number; r1: number; w: number; color: string; o?: number; cx?: number; cy?: number; phase?: number }

/** Light thrown off a scatter. Tapered wedges, not lines — a line reads as wire
 *  at 50px, a wedge reads as a beam. */
function Rays({ n, r0, r1, w, color, o = 0.7, cx = 50, cy = 50, phase = 0 }: RaysP) {
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

const SUIT_PATH = {
  S: 'M0 -7 C4.4 -1.6 7.4 0.8 7.4 4.4 C7.4 7.4 3.6 8.4 1.2 5.8 C1.6 7.6 2.4 8.8 3.6 9.6 H-3.6 C-2.4 8.8 -1.6 7.6 -1.2 5.8 C-3.6 8.4 -7.4 7.4 -7.4 4.4 C-7.4 0.8 -4.4 -1.6 0 -7 Z',
  H: 'M0 9.4 C-7.4 3 -8.4 -1.4 -6.2 -4.6 C-4 -7.6 0 -6.4 0 -2.6 C0 -6.4 4 -7.6 6.2 -4.6 C8.4 -1.4 7.4 3 0 9.4 Z',
  D: 'M0 -9 L6.6 0 L0 9 L-6.6 0 Z',
} as const

type Suit = 'S' | 'H' | 'D' | 'C'

function Pip({ suit, x, y, s, fill }: { suit: Suit; x: number; y: number; s: number; fill: string }) {
  const t = `translate(${x} ${y}) scale(${s})`
  if (suit === 'C') {
    return (
      <g transform={t} fill={fill}>
        <circle cx="0" cy="-3.6" r="4" />
        <circle cx="-4.4" cy="2.6" r="4" />
        <circle cx="4.4" cy="2.6" r="4" />
        <path d="M-3 9.6 C-1.2 7 -1 4.6 -1 1.6 H1 C1 4.6 1.2 7 3 9.6 Z" />
      </g>
    )
  }
  return <path d={SUIT_PATH[suit]} transform={t} fill={fill} />
}

/** The low tier, shared by the two five-reel cabinets that use card indices.
 *  Deliberately dull: one flat plate, a hairline, no gradient on the letter. */
function CardRank({ rank, suit, plate, edge, ink, pip }: { rank: string; suit: Suit; plate: string; edge: string; ink: string; pip: string }) {
  return (
    <g>
      <rect x="16" y="12" width="68" height="76" rx="8" fill={plate} stroke={edge} strokeWidth="1.6" />
      <text x="50" y="57" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize={rank === '10' ? 34 : 44} fill={ink}>
        {rank}
      </text>
      <Pip suit={suit} x={50} y={72} s={0.95} fill={pip} />
    </g>
  )
}

/** A cabinet's whole low tier at once, in that cabinet's colours. Red suits take
 *  the red ink, exactly as a printed deck does — it is the one flourish this
 *  tier gets, and it is what stops five plates reading as five grey boxes. */
function ranks(plate: string, edge: string, ink: string, black: string, red: string): Record<string, (u: string) => JSX.Element> {
  const set: Array<[id: string, text: string, suit: Suit]> = [
    ['A', 'A', 'S'],
    ['K', 'K', 'H'],
    ['Q', 'Q', 'D'],
    ['J', 'J', 'C'],
    ['T', '10', 'S'],
  ]
  const out: Record<string, (u: string) => JSX.Element> = {}
  for (const [id, text, suit] of set) {
    const pip = suit === 'H' || suit === 'D' ? red : black
    out[id] = () => <CardRank rank={text} suit={suit} plate={plate} edge={edge} ink={ink} pip={pip} />
  }
  return out
}

/** The majority of every strip. It has to vanish or the screen reads as noise. */
/** A stop with nothing printed on it. It has to recede — blanks are a third to a
 *  half of every strip — but it still has to look like strip material, or a reel
 *  showing two of them reads as a fault rather than a losing screen. */
function Blank({ tint }: { tint: string }) {
  return (
    <rect
      x="16"
      y="16"
      width="68"
      height="68"
      rx="11"
      fill={tint}
      fillOpacity="0.1"
      stroke={tint}
      strokeOpacity="0.26"
      strokeWidth="1.5"
    />
  )
}

/** A seven, shared by two cabinets with different metal on the rim. */
function Seven({ u, s, rims }: { u: string; s: Stop[]; rims: Array<[number, string]> }) {
  const d = 'M25 18 H77 L50 86 H32 L57 32 H25 Z'
  return (
    <>
      <Lin id={`${u}-f`} s={s} />
      {rims.map(([w, c], i) => (
        <path key={i} d={d} fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" />
      ))}
      <path d={d} fill={`url(#${u}-f)`} />
      <path d="M29 21 H70 L67 28 H29 Z" fill="#ffffff" fillOpacity="0.32" />
    </>
  )
}

/* -------------------------------------------------------------------- bars */
// Chrome, cherry red and deep blue on a cream reel strip — a mechanical
// stepper, where the symbols really were printed on paper behind glass.

const CREAM = '#f6f1e6'
const STEEL = '#6c7880'
const BAR_RED: Stop[] = [[0, '#f4626c'], [0.5, '#d21f2c'], [1, '#8d0d18']]
const BAR_BLUE: Stop[] = [[0, '#4a83c8'], [0.5, '#1a4c8b'], [1, '#0a2547']]
// Graphite, not chrome: the triple bar is the top bar award, so on a cream
// strip it wants the *most* contrast, and light-on-light gave it the least.
const GRAPHITE: Stop[] = [[0, '#8b98a3'], [0.45, '#3c474f'], [0.6, '#5a666e'], [1, '#141a1f']]

/** The printed strip behind every paying symbol on this cabinet. */
function Strip({ u }: { u: string }) {
  return (
    <>
      <Lin id={`${u}-st`} s={[[0, '#fdfaf3'], [0.55, CREAM], [1, '#dcd3bf']]} />
      <rect x="7" y="7" width="86" height="86" rx="13" fill={`url(#${u}-st)`} stroke={STEEL} strokeWidth="2" />
      <rect x="11" y="11" width="78" height="78" rx="9" fill="none" stroke="#ffffff" strokeOpacity="0.8" />
    </>
  )
}

function Fit({ children, k = 0.92 }: { children: JSX.Element | JSX.Element[]; k?: number }) {
  return <g transform={`translate(50 50) scale(${k}) translate(-50 -50)`}>{children}</g>
}

/** One, two or three bars. The count is the *last* cue: each stack has its own
 *  width, its own overall height and its own metal, so the outline alone tells
 *  them apart at speed. */
function BarStack({ u, n }: { u: string; n: 1 | 2 | 3 }) {
  const spec = {
    1: { w: 76, h: 26, gap: 0, s: BAR_BLUE, edge: '#07203d' },
    2: { w: 64, h: 17, gap: 9, s: BAR_RED, edge: '#6d0812' },
    3: { w: 50, h: 12, gap: 8, s: GRAPHITE, edge: '#080c0f' },
  }[n]
  const total = n * spec.h + (n - 1) * spec.gap
  const x = 50 - spec.w / 2
  return (
    <>
      <Lin id={`${u}-b`} s={spec.s} />
      {Array.from({ length: n }, (_, i) => {
        const y = 50 - total / 2 + i * (spec.h + spec.gap)
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={spec.w}
              height={spec.h}
              rx={Math.min(4, spec.h / 3)}
              fill={`url(#${u}-b)`}
              stroke={spec.edge}
              strokeWidth="1.6"
            />
            <rect x={x + 3} y={y + 1.8} width={spec.w - 6} height={spec.h * 0.22} rx={spec.h * 0.11} fill="#ffffff" fillOpacity="0.42" />
          </g>
        )
      })}
    </>
  )
}

const SHIELD = 'M50 14 L84 25 C84 56 71 79 50 88 C29 79 16 56 16 25 Z'

const BARS: Record<string, (u: string) => JSX.Element> = {
  // The wild doubles what it completes, so the multiplier is part of the badge.
  W: (u) => (
    <>
      <Strip u={u} />
      <Fit>
        <>
          <Lin id={`${u}-sh`} s={BAR_BLUE} />
          <Lin id={`${u}-bd`} s={BAR_RED} />
          {/* Steel under chrome: two strokes on one outline make a bevelled rim. */}
          <path d={SHIELD} fill={`url(#${u}-sh)`} stroke={STEEL} strokeWidth="5" strokeLinejoin="round" />
          <path d={SHIELD} fill={`url(#${u}-sh)`} stroke="#eef3f6" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M50 19 L79 28 C79 41 74 51 68 58 C60 44 46 34 25 31 L23 26 Z" fill="#ffffff" fillOpacity="0.16" />
          <text x="48" y="63" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="42" fill="#f4f8fb">
            W
          </text>
          <circle cx="76" cy="76" r="17" fill={`url(#${u}-bd)`} stroke="#eef3f6" strokeWidth="3" />
          <text x="76" y="82" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="19" fill="#fff8f8">
            ×2
          </text>
        </>
      </Fit>
    </>
  ),
  '7': (u) => (
    <>
      <Strip u={u} />
      <Fit>
        <Seven u={u} s={BAR_RED} rims={[[10, STEEL], [6, '#eef3f6']]} />
      </Fit>
    </>
  ),
  BBB: (u) => (
    <>
      <Strip u={u} />
      <BarStack u={u} n={3} />
    </>
  ),
  BB: (u) => (
    <>
      <Strip u={u} />
      <BarStack u={u} n={2} />
    </>
  ),
  B: (u) => (
    <>
      <Strip u={u} />
      <BarStack u={u} n={1} />
    </>
  ),
  C: (u) => (
    <>
      <Strip u={u} />
      <Fit>
        <>
          <Rad id={`${u}-c`} s={[[0, '#ff8a92'], [0.45, '#d8202e'], [1, '#78060f']]} cx={0.35} cy={0.3} r={0.8} />
          <path d="M50 22 C44 34 34 42 30 54" fill="none" stroke="#6b4a1f" strokeWidth="4" strokeLinecap="round" />
          <path d="M52 22 C60 34 66 46 68 60" fill="none" stroke="#6b4a1f" strokeWidth="4" strokeLinecap="round" />
          <path d="M50 22 C58 12 74 10 80 16 C72 26 58 28 50 22 Z" fill="#2f7d3a" stroke="#1b4f24" strokeWidth="1.5" />
          <circle cx="30" cy="70" r="17" fill={`url(#${u}-c)`} stroke="#6b0a13" strokeWidth="1.5" />
          <circle cx="69" cy="74" r="14" fill={`url(#${u}-c)`} stroke="#6b0a13" strokeWidth="1.5" />
          <ellipse cx="24" cy="63" rx="5" ry="3.4" fill="#fff" fillOpacity="0.6" transform="rotate(-25 24 63)" />
          <ellipse cx="64" cy="69" rx="4" ry="2.6" fill="#fff" fillOpacity="0.55" transform="rotate(-25 64 69)" />
        </>
      </Fit>
    </>
  ),
  // A stepper's blank is not a hole in the reel — it is the printed strip with
  // nothing on it. Drawing it as bare plate keeps the reel reading as one
  // continuous band, which matters here because blanks are 15 of the 32 stops.
  '-': (u: string) => (
    <>
      <Strip u={u} />
      <rect x="26" y="46" width="48" height="8" rx="4" fill={STEEL} fillOpacity="0.12" />
    </>
  ),
}

/* -------------------------------------------------------------------- bell */
// Brass and deep red on the dark glass. The bell is the whole hook, so it gets
// the biggest halo on the floor.

const BRASS: Stop[] = [[0, '#ffeeb4'], [0.4, '#d9ae52'], [0.72, '#a97e28'], [1, '#6f4f12']]
const BRASS_LINE = '#f0d98a'
const BELL_RED: Stop[] = [[0, '#e8515c'], [0.5, '#b3121f'], [1, '#63060f']]

const BELL: Record<string, (u: string) => JSX.Element> = {
  W: (u) => (
    <>
      <Halo id={`${u}-h`} color="#ffd473" r={48} o={0.42} />
      <Lin id={`${u}-d`} s={BELL_RED} />
      <Lin id={`${u}-r`} s={BRASS} />
      <path d="M50 9 L91 50 L50 91 L9 50 Z" fill={`url(#${u}-r)`} />
      <path d="M50 17 L83 50 L50 83 L17 50 Z" fill={`url(#${u}-d)`} stroke="#4d040c" strokeWidth="1.2" />
      <path d="M50 17 L83 50 L74 50 C68 34 56 24 42 21 Z" fill="#ffffff" fillOpacity="0.18" />
      <text x="50" y="65" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="42" fill="#ffeec2">
        W
      </text>
    </>
  ),
  // The scatter. Brightest thing on the cabinet, by design.
  BL: (u) => (
    <>
      <Halo id={`${u}-h`} color="#ffcf5c" r={50} o={0.72} cy={52} />
      <Rays n={12} r0={30} r1={49} w={3.6} color="#ffe8a4" o={0.62} cy={52} phase={15} />
      <Lin id={`${u}-b`} s={BRASS} />
      <Rad id={`${u}-k`} s={[[0, '#fff4cd'], [1, '#c08f2a']]} />
      <circle cx="50" cy="17" r="6.5" fill={`url(#${u}-k)`} stroke="#6f4f12" strokeWidth="1.2" />
      <path d="M50 21 C36 21 32 38 28 60 C26 69 22 72 19 77 H81 C78 72 74 69 72 60 C68 38 64 21 50 21 Z" fill={`url(#${u}-b)`} stroke="#6f4f12" strokeWidth="1.6" />
      <path d="M45 25 C38 30 36 45 33 62 C31 70 29 73 27 77 H35 C36 70 37 60 39 48 C41 34 43 28 47 25 Z" fill="#fff3c8" fillOpacity="0.55" />
      <rect x="17" y="75" width="66" height="7" rx="3.5" fill={`url(#${u}-b)`} stroke="#6f4f12" strokeWidth="1.4" />
      <circle cx="50" cy="88" r="7" fill={`url(#${u}-k)`} stroke="#6f4f12" strokeWidth="1.4" />
    </>
  ),
  '7': (u) => (
    <>
      <Halo id={`${u}-h`} color="#c8a04a" r={44} o={0.18} />
      <Seven u={u} s={BELL_RED} rims={[[9, '#6f4f12'], [5.5, BRASS_LINE]]} />
    </>
  ),
  D: (u) => (
    <>
      <Lin id={`${u}-g`} s={[[0, '#f4fdff'], [0.45, '#a9d8ee'], [1, '#4a86ab']]} />
      <path d="M50 13 L84 41 L50 89 L16 41 Z" fill={`url(#${u}-g)`} stroke={BRASS_LINE} strokeWidth="2.4" strokeLinejoin="round" />
      <g stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.6" fill="none">
        <path d="M16 41 H84" />
        <path d="M33 27 L38 41 L50 89" />
        <path d="M67 27 L62 41 L50 89" />
      </g>
      <path d="M33 27 H67 L62 41 H38 Z" fill="#ffffff" fillOpacity="0.3" />
    </>
  ),
  BAR: (u) => (
    <>
      <Lin id={`${u}-b`} s={BRASS} />
      <rect x="11" y="35" width="78" height="30" rx="6" fill={`url(#${u}-b)`} stroke="#6f4f12" strokeWidth="2" />
      <rect x="15" y="38" width="70" height="5" rx="2.5" fill="#fff6d6" fillOpacity="0.5" />
      <text x="50" y="58" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="21" letterSpacing="2" fill="#5b1018">
        BAR
      </text>
    </>
  ),
  ...ranks('#191309', '#6b5628', '#cfc0a1', '#93826a', '#9a5b53'),
  '-': () => <Blank tint="#c8a04a" />,
}

/* --------------------------------------------------------------- rockslide */
// Slate, ochre and hard-edged gems. Everything is faceted and slightly
// asymmetric, because these are things that break.

// Kept dark and low-contrast on purpose: the slab is ground, the gem is figure,
// and a brighter rock would blur the gems' outlines into one another.
const SLATE: Stop[] = [[0, '#333c42'], [1, '#171d21']]

/** The chip of rock a gem is still embedded in. */
function Slab({ u }: { u: string }) {
  return (
    <>
      <Lin id={`${u}-sl`} s={SLATE} />
      <polygon points="21,13 63,8 91,29 87,71 61,93 25,88 8,58 12,29" fill={`url(#${u}-sl)`} stroke="#414c53" strokeWidth="1.5" />
      <polyline points="12,29 24,40 20,66 25,88" fill="none" stroke="#0d1114" strokeOpacity="0.5" strokeWidth="2" />
      <polyline points="91,29 79,38 84,66 87,71" fill="none" stroke="#0d1114" strokeOpacity="0.4" strokeWidth="2" />
    </>
  )
}

/** A gem: a faceted outline, a bright crown wedge, a dark pavilion wedge. */
type GemP = { u: string; d: string; s: Stop[]; edge: string; crown: string; pavilion: string; lines: string }

function Gem({ u, d, s, edge, crown, pavilion, lines }: GemP) {
  return (
    <>
      <Lin id={`${u}-g`} s={s} />
      <path d={d} fill={`url(#${u}-g)`} stroke={edge} strokeWidth="2.2" strokeLinejoin="round" />
      <path d={crown} fill="#ffffff" fillOpacity="0.4" />
      <path d={pavilion} fill="#000000" fillOpacity="0.28" />
      <path d={lines} fill="none" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="1.5" />
    </>
  )
}

const ROCK: Record<string, (u: string) => JSX.Element> = {
  // Struck crystal: the only thing on this cabinet that emits light.
  W: (u) => (
    <>
      <Halo id={`${u}-h`} color="#7de3ff" r={50} o={0.5} />
      <Rays n={4} r0={32} r1={48} w={2.2} color="#ffffff" o={0.55} phase={45} />
      <Lin id={`${u}-c`} s={[[0, '#f0fdff'], [0.35, '#7fd8f5'], [0.7, '#4a8fd6'], [1, '#2b3f9c']]} />
      <path d="M50 6 L68 30 L63 76 L50 94 L37 76 L32 30 Z" fill={`url(#${u}-c)`} stroke="#dff8ff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M50 6 L68 30 L58 33 L50 12 Z" fill="#ffffff" fillOpacity="0.6" />
      <path d="M50 94 L63 76 L56 74 L50 88 Z" fill="#000000" fillOpacity="0.3" />
      <g stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.6" fill="none">
        <path d="M32 30 L50 36 L68 30" />
        <path d="M50 36 V94" />
      </g>
      <circle cx="66" cy="20" r="3.6" fill="#ffffff" fillOpacity="0.85" />
    </>
  ),
  D: (u) => (
    <>
      <Slab u={u} />
      <Gem
        u={u}
        d="M31 26 H69 L86 45 L50 88 L14 45 Z"
        s={[[0, '#f6feff'], [0.45, '#a5e0f7'], [1, '#3d8fc4']]}
        edge="#dff4ff"
        crown="M31 26 H69 L60 39 H40 Z"
        pavilion="M50 88 L86 45 L69 45 Z"
        lines="M14 45 H86 M31 26 L40 39 L50 88 M69 26 L60 39 L50 88"
      />
    </>
  ),
  G: (u) => (
    <>
      <Slab u={u} />
      <Gem
        u={u}
        d="M26 40 L38 22 L62 18 L80 34 L84 58 L68 80 L40 82 L20 66 Z"
        s={[[0, '#fff0b8'], [0.4, '#f0b429'], [1, '#8a5b0c']]}
        edge="#5f3d05"
        crown="M38 22 L62 18 L58 34 L34 36 Z"
        pavilion="M68 80 L84 58 L62 60 L48 82 Z"
        lines="M34 36 L58 34 L68 56 L48 68 L26 58 Z M58 34 L80 34 M68 56 L84 58"
      />
      <circle cx="72" cy="28" r="3.2" fill="#fff8dc" fillOpacity="0.9" />
    </>
  ),
  R: (u) => (
    <>
      <Slab u={u} />
      <Gem
        u={u}
        d="M34 20 H66 L84 40 V62 L64 82 H36 L16 60 V38 Z"
        s={[[0, '#ff8fa1'], [0.45, '#d81e3f'], [1, '#6c0619']]}
        edge="#48030f"
        crown="M34 20 H66 L58 34 H42 Z"
        pavilion="M64 82 H36 L44 68 H58 Z"
        lines="M42 34 H58 L70 48 L58 68 H42 L30 50 Z M34 20 L42 34 M66 20 L58 34 M84 40 L70 48 M16 38 L30 50"
      />
    </>
  ),
  E: (u) => (
    <>
      <Slab u={u} />
      <Gem
        u={u}
        d="M30 22 H70 L82 34 V66 L70 78 H30 L18 66 V34 Z"
        s={[[0, '#8ff2c6'], [0.45, '#17a672'], [1, '#064a33']]}
        edge="#04301f"
        crown="M30 22 H70 L64 32 H36 Z"
        pavilion="M30 78 H70 L64 68 H36 Z"
        lines="M36 32 H64 V68 H36 Z M43 40 H57 V60 H43 Z M18 34 L30 22 M82 34 L70 22"
      />
    </>
  ),
  // The cheapest symbol on the strip: a chip of country rock. Angular like the
  // gems so it belongs, but matte and grey so it never competes with them.
  Q: () => (
    <>
      <path
        d="M23 45 L37 27 L59 23 L75 34 L79 57 L66 75 L41 79 L26 67 Z"
        fill="#6c757b"
        stroke="#262d31"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M37 27 L59 23 L75 34 L57 40 L39 37 Z" fill="#ffffff" fillOpacity="0.13" />
      <path d="M79 57 L66 75 L41 79 L52 60 L74 52 Z" fill="#000000" fillOpacity="0.2" />
      <path d="M23 45 L39 37 L36 58 L26 67 Z" fill="#000000" fillOpacity="0.1" />
    </>
  ),
  // Bare rock. A blank on this cabinet is the canyon face with nothing in it,
  // which is both what the theme wants and what stops the screen looking like it
  // has holes punched in it.
  '-': (u: string) => (
    <g opacity="0.5">
      <Slab u={u} />
    </g>
  ),
}

/* ---------------------------------------------------------------- lateshow */
// Brass and neon on near-black. Objects and places only — a room after the
// audience has gone home.

const NEON_PINK = '#ff4d9d'
const LOUNGE_BRASS: Stop[] = [[0, '#ffe6a8'], [0.4, '#c8a04a'], [1, '#7a5716']]

const LATE: Record<string, (u: string) => JSX.Element> = {
  // Expanding wild. Drawn as a beam rather than a lamp, because filling the
  // reel is the thing it actually does.
  spot: (u) => (
    <>
      <Halo id={`${u}-h`} color="#ffe9a8" r={40} o={0.4} cy={26} />
      <Lin id={`${u}-beam`} s={[[0, '#fff6d8', 0.92], [0.45, '#ffe08a', 0.4], [1, '#ffd166', 0.04]]} />
      <Lin id={`${u}-core`} s={[[0, '#ffffff', 0.85], [1, '#fff3c4', 0.05]]} />
      <Lin id={`${u}-can`} s={LOUNGE_BRASS} />
      <polygon points="37,30 63,30 92,96 8,96" fill={`url(#${u}-beam)`} />
      <polygon points="44,30 56,30 68,96 32,96" fill={`url(#${u}-core)`} />
      <path d="M34 8 H66 L63 31 H37 Z" fill={`url(#${u}-can)`} stroke="#5d3f0c" strokeWidth="1.8" />
      <rect x="36" y="27" width="28" height="5" rx="2.5" fill="#fff8e2" />
      <rect x="30" y="4" width="40" height="6" rx="3" fill={`url(#${u}-can)`} stroke="#5d3f0c" strokeWidth="1.4" />
    </>
  ),
  // The scatter: a lit sign. A boxy arch hung with bulbs, so it can't be taken
  // for the wild's beam even at a glance — the other bright thing on this reel.
  mrq: (u) => {
    // Bulbs ring the sign: over the arch, down both jambs, along the sill.
    const bulbs: Array<[number, number]> = []
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i * Math.PI) / 8
      bulbs.push([50 + 35 * Math.cos(a), 41 - 35 * Math.sin(a)])
    }
    for (let i = 1; i <= 3; i++) {
      bulbs.push([15, 41 + i * 12])
      bulbs.push([85, 41 + i * 12])
    }
    for (let i = 0; i <= 5; i++) bulbs.push([15 + i * 14, 89])
    return (
      <>
        <Halo id={`${u}-h`} color="#ffcf72" r={50} o={0.5} cy={46} />
        <Lin id={`${u}-f`} s={[[0, '#4a1140'], [1, '#20081d']]} />
        <Lin id={`${u}-b`} s={LOUNGE_BRASS} />
        <Rad id={`${u}-bg`} s={[[0, '#fff6d0', 0.95], [0.4, '#ffd873', 0.55], [1, '#ffd873', 0]]} />
        <path d="M20 41 A30 30 0 0 1 80 41 V83 H20 Z" fill={`url(#${u}-f)`} stroke={`url(#${u}-b)`} strokeWidth="4" strokeLinejoin="round" />
        <polygon points="50,27 54.1,38.3 66.2,38.8 56.7,46.2 60,57.8 50,51 40,57.8 43.3,46.2 33.8,38.8 45.9,38.3" fill="#fff4cd" stroke="#ffd873" strokeWidth="1.6" />
        <rect x="31" y="65" width="38" height="7" rx="3.5" fill={NEON_PINK} />
        <rect x="33" y="66.5" width="34" height="2" rx="1" fill="#ffd7ea" />
        <g>
          {bulbs.map(([x, y], i) => (
            <circle key={`g${i}`} cx={x} cy={y} r="7" fill={`url(#${u}-bg)`} />
          ))}
          {bulbs.map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r="3.1" fill="#fff8e0" />
          ))}
        </g>
      </>
    )
  },
  mic: (u) => (
    <>
      <Lin id={`${u}-c`} s={[[0, '#f7fafc'], [0.35, '#b9c4cb'], [0.6, '#eef3f6'], [1, '#79848c']]} />
      <Lin id={`${u}-b`} s={LOUNGE_BRASS} />
      <rect x="46" y="58" width="8" height="26" rx="3" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.2" />
      <ellipse cx="50" cy="87" rx="17" ry="5.5" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.4" />
      <rect x="33" y="10" width="34" height="50" rx="17" fill={`url(#${u}-c)`} stroke="#3d464c" strokeWidth="2" />
      <g stroke="#4b555c" strokeWidth="2" strokeOpacity="0.75">
        <path d="M35 22 H65" />
        <path d="M34 31 H66" />
        <path d="M34 40 H66" />
        <path d="M35 49 H65" />
      </g>
      <rect x="37" y="14" width="7" height="42" rx="3.5" fill="#ffffff" fillOpacity="0.4" />
      <rect x="30" y="55" width="40" height="8" rx="4" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.2" />
    </>
  ),
  mar: (u) => (
    <>
      <Lin id={`${u}-g`} s={[[0, '#dff6ff', 0.95], [1, '#6fb7d6', 0.75]]} />
      <Lin id={`${u}-b`} s={LOUNGE_BRASS} />
      <path d="M46 60 H54 V82 H46 Z" fill={`url(#${u}-b)`} />
      <path d="M28 84 H72 C72 89 66 91 50 91 C34 91 28 89 28 84 Z" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.2" />
      <path d="M16 24 H84 L52 62 H48 Z" fill={`url(#${u}-g)`} stroke="#e9f7ff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M22 28 H78 L50 60 Z" fill="#bfe8f8" fillOpacity="0.35" />
      <path d="M26 30 L46 54" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
      <path d="M63 12 L52 38" stroke="#e3d6b4" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="66" cy="10" r="7" fill="#7fae32" stroke="#4e6d18" strokeWidth="1.4" />
      <circle cx="66" cy="10" r="2.8" fill="#c8443c" />
    </>
  ),
  // The bell does the identifying work: a wide flared mouth up and to the left,
  // a body that bends under it. Without a big bell this reads as a horseshoe.
  sax: (u) => {
    const body = 'M64 15 C63 23 69 27 69 37 L69 58 C69 76 57 89 43 89 C30 89 21 80 23 67 L25 59'
    return (
      <>
        <Lin id={`${u}-b`} s={LOUNGE_BRASS} x2={1} y2={0.4} />
        <Lin id={`${u}-l`} s={[[0, '#ffeab0'], [0.5, '#d3a63c'], [1, '#8a6216']]} x2={1} y2={0} />
        <path d="M58 5 H70 L67 17 H59 Z" fill="#2b2418" stroke="#5d3f0c" strokeWidth="1.2" />
        <path d={body} fill="none" stroke={`url(#${u}-b)`} strokeWidth="13" strokeLinecap="round" />
        <path d={body} fill="none" stroke="#fff0c4" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
        <g fill="#33290f">
          <circle cx="69" cy="40" r="3.4" />
          <circle cx="70" cy="51" r="3.4" />
          <circle cx="67" cy="62" r="3.4" />
        </g>
        <path d="M19 62 H33 L39 31 H3 Z" fill={`url(#${u}-l)`} stroke="#5d3f0c" strokeWidth="1.5" />
        <ellipse cx="21" cy="31" rx="18" ry="6.5" fill="#ffe9ae" stroke="#5d3f0c" strokeWidth="1.5" />
        <ellipse cx="21" cy="31" rx="11" ry="3.6" fill="#6f4f12" fillOpacity="0.6" />
      </>
    )
  },
  crt: (u) => {
    // One panel, drawn twice: the right one is the left one mirrored about the
    // centre line, which is also how a real pair of drapes is cut.
    const half = (
      <>
        <path d="M11 20 H43 C41 44 45 66 41 84 Q34 92 27 84 Q19 92 11 84 Z" fill={`url(#${u}-c)`} stroke="#2c040f" strokeWidth="1.6" />
        <g stroke="#3d0715" strokeOpacity="0.6" strokeWidth="2" fill="none">
          <path d="M20 22 C19 46 22 66 19 84" />
          <path d="M30 22 C29 46 32 66 29 84" />
        </g>
      </>
    )
    return (
      <>
        <Lin id={`${u}-c`} s={[[0, '#a3223c'], [0.5, '#78122a'], [1, '#3d0715']]} x2={1} y2={0} />
        <Lin id={`${u}-b`} s={LOUNGE_BRASS} />
        <Rad id={`${u}-stage`} s={[[0, '#ffdb94', 0.5], [1, '#ffdb94', 0]]} cy={0.72} />
        <ellipse cx="50" cy="72" rx="22" ry="30" fill={`url(#${u}-stage)`} />
        {half}
        <g transform="translate(100 0) scale(-1 1)">{half}</g>
        <rect x="7" y="11" width="86" height="9" rx="4.5" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.4" />
        <ellipse cx="38" cy="52" rx="6" ry="9" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.2" />
        <ellipse cx="62" cy="52" rx="6" ry="9" fill={`url(#${u}-b)`} stroke="#5d3f0c" strokeWidth="1.2" />
      </>
    )
  },
  ...ranks('#181320', '#6a5734', '#c6b79c', '#8d7f6d', '#9c5f62'),
  '-': () => <Blank tint="#c9a6d8" />,
}

/* ------------------------------------------------------------- the machines */

interface Cabinet {
  art: Record<string, (u: string) => JSX.Element>
  names: Record<string, string>
}

/** Spoken names, because a screen reader gets `aria-label` and not the drawing.
 *  The ids collide across cabinets and mean different things, so these are keyed
 *  by machine too: `D` is a card-free gemstone on one cabinet and a diamond
 *  premium on another. */
const RANK_NAMES = { A: 'ace', K: 'king', Q: 'queen', J: 'jack', T: 'ten' }

const CABINETS: Record<string, Cabinet> = {
  bars: {
    art: BARS,
    names: {
      W: 'wild, doubles the win', '7': 'lucky seven', BBB: 'triple bar', BB: 'double bar',
      B: 'single bar', C: 'cherries', '-': 'blank',
    },
  },
  bell: {
    art: BELL,
    names: {
      W: 'wild', BL: 'bell scatter', '7': 'seven', D: 'diamond', BAR: 'bar',
      ...RANK_NAMES, '-': 'blank',
    },
  },
  rockslide: {
    art: ROCK,
    names: {
      W: 'wild crystal', D: 'diamond', G: 'gold nugget', R: 'ruby', E: 'emerald',
      Q: 'pebble', '-': 'blank',
    },
  },
  lateshow: {
    art: LATE,
    names: {
      spot: 'wild spotlight', mrq: 'marquee scatter', mic: 'microphone', mar: 'martini glass',
      sax: 'saxophone', crt: 'stage curtain', ...RANK_NAMES, '-': 'blank',
    },
  },
}

/** Gradient ids have to survive being concatenated into one document, and the
 *  symbol ids include characters that aren't legal in a fragment id. */
function slug(s: string): string {
  const clean = s.replace(/[^A-Za-z0-9]+/g, '_')
  return clean === '' || clean === '_' ? 'x' : clean
}

/** A symbol nobody has drawn yet: a plain tile with its id, so a new strip
 *  entry shows up as obviously undrawn instead of taking the screen down. */
function Unknown({ id }: { id: string }): JSX.Element {
  return (
    <g>
      <rect x="14" y="14" width="72" height="72" rx="10" fill="#1b1e21" stroke="#4a5157" strokeWidth="1.6" />
      <text x="50" y="59" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize={id.length > 2 ? 22 : 32} fill="#9aa4ac">
        {id.slice(0, 4)}
      </text>
    </g>
  )
}

export function SlotArt({ machine, id }: { machine: string; id: string }): JSX.Element {
  const cabinet = CABINETS[machine]
  const draw = cabinet?.art[id]
  const label = cabinet?.names[id] ?? `symbol ${id}`

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      {draw ? draw(`${slug(machine)}-${slug(id)}`) : <Unknown id={id} />}
    </svg>
  )
}
