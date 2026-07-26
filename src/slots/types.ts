// Slots. The one family of games in this building whose house edge is not
// published anywhere, because it isn't a consequence of the rules — it is
// *designed*, by choosing how often each symbol appears on each reel strip.
//
// That makes slots easier to verify than any table game, not harder: the strips
// and the pay table are the whole specification, so the return can be computed
// exactly by enumeration rather than measured. `rtp.ts` does that, and every
// machine's test asserts the computed figure against the number it was built to
// hit. A strip edited by one symbol moves the return, and the test says so.

export type SymbolId = string

export interface SlotSymbol {
  id: SymbolId
  /** Two or three characters — the reels are drawn, not photographed. */
  label: string
  /** Substitutes for any paying symbol. Never substitutes for a scatter. */
  wild?: boolean
  /** Pays on how many landed anywhere on screen, not along a line. */
  scatter?: boolean
  /** A wild that fills its entire reel when any part of it lands. */
  expanding?: boolean
  /** Multiplies any line win this symbol helped complete. */
  multiplier?: number
}

/** Coins won per coin staked on a line, indexed by run length: `pays[3]` is a
 *  three-of-a-kind. Entries 0–2 are always zero and exist so the array can be
 *  indexed by length without arithmetic. */
export type LinePays = Record<SymbolId, number[]>

/** Scatter pays are multiples of the TOTAL stake, keyed by how many landed —
 *  which is why they don't care about lines and why they can't be folded into
 *  the line maths. */
export type ScatterPays = Record<SymbolId, Record<number, number>>

/** What a machine does beyond paying its lines. Each is a real mechanic from a
 *  real cabinet, reduced to the part that changes the arithmetic. */
export type Feature =
  | { kind: 'none' }
  /** Winners vanish, everything above falls into the gap, fresh symbols drop in
   *  from the top, and the chain pays again at a rising multiplier. */
  | {
      kind: 'cascade'
      /** Multiplier for the 1st, 2nd, 3rd… cascade in a chain. The last entry
       *  holds for every cascade beyond it. */
      multipliers: number[]
      /** A chain this long triggers the free games. */
      freeSpinsAt: number
      freeSpins: number
    }
  /** N of a trigger symbol anywhere buys a fixed number of free games, played
   *  at a multiplier. */
  | {
      kind: 'freeSpins'
      trigger: SymbolId
      triggerCount: number
      spins: number
      multiplier: number
      /** During the free games this symbol expands over its whole reel. */
      expandingWild?: SymbolId
    }

export interface Machine {
  id: string
  label: string
  /** One line, shown on the machine select. */
  blurb: string
  /** The mechanic, in the words a player would use. */
  note: string
  symbols: SlotSymbol[]
  /** One strip per reel. Length is the number of stops on that reel. */
  strips: SymbolId[][]
  /** How many symbols of each strip are visible. */
  rows: number
  /** Each payline as a row index per reel. */
  lines: number[][]
  linePays: LinePays
  scatterPays?: ScatterPays
  feature: Feature
  /** What the strips were cut to return, as a fraction. The test asserts the
   *  computed return lands on this. */
  targetRtp: number
}

// ---------------------------------------------------------------- results

export interface Win {
  kind: 'line' | 'scatter'
  /** Which payline, or -1 for a scatter win. */
  line: number
  symbol: SymbolId
  count: number
  /** Coins paid, already multiplied. */
  paid: number
  /** Window cells this win covers, as [reel, row]. Drives both the on-screen
   *  highlight and which symbols a cascade removes. */
  cells: Array<[number, number]>
}

/** One resolved screen: a spin, or one step of a cascade chain. */
export interface Step {
  /** reel-major: `window[reel][row]`. */
  window: SymbolId[][]
  wins: Win[]
  /** Multiplier in force for this step (cascade chains raise it). */
  multiplier: number
  paid: number
  /** True when this step is one of the free games. */
  free: boolean
  /** True when this screen came off a fresh set of reels rather than from the
   *  screen above it collapsing. The arithmetic doesn't care, but the cabinet
   *  does: one spins the reels, the other drops symbols into the gaps. */
  spun: boolean
}

export interface SpinResult {
  steps: Step[]
  /** Free games this spin bought, if any. */
  freeSpinsAwarded: number
  staked: number
  paid: number
}
