// Reading a stopped screen.
//
// Line wins are leftmost-aligned: a run has to start on reel one and be
// unbroken. That rule is why a slot's return is dominated by what sits on its
// first reel, and why every strip in `machines/` is cut with reel one thinnest.

import type { LinePays, Machine, SlotSymbol, SymbolId, Win } from './types'

/** The visible symbols, `window[reel][row]`, for a set of stop positions. */
export function windowOf(strips: SymbolId[][], stops: number[], rows: number): SymbolId[][] {
  return strips.map((strip, reel) => {
    const stop = ((stops[reel] % strip.length) + strip.length) % strip.length
    const col: SymbolId[] = []
    for (let r = 0; r < rows; r++) col.push(strip[(stop + r) % strip.length])
    return col
  })
}

export function symbolMap(symbols: SlotSymbol[]): Map<SymbolId, SlotSymbol> {
  return new Map(symbols.map((s) => [s.id, s]))
}

/** Symbols a run can be *of*: everything with a pay schedule that isn't a
 *  scatter. A wild with its own schedule is included — a screen of five wilds
 *  pays as wilds, which on most cabinets is the top award. */
function payingSymbols(linePays: LinePays, byId: Map<SymbolId, SlotSymbol>): SymbolId[] {
  return Object.keys(linePays).filter((id) => !byId.get(id)?.scatter)
}

/** The best win on one payline, or null.
 *
 *  Every candidate base symbol is tried rather than "read the first reel and go",
 *  because with wilds those differ: on `W W 7 7 K` the wilds could be sevens
 *  (four of a kind) or kings (a run of two), and the machine owes the player
 *  whichever is worth more. */
function bestLineWin(
  window: SymbolId[][],
  line: number[],
  lineIndex: number,
  machine: Machine,
  byId: Map<SymbolId, SlotSymbol>,
  coinsPerLine: number,
): Win | null {
  const onLine = line.map((row, reel) => window[reel][row])
  let best: Win | null = null

  for (const base of payingSymbols(machine.linePays, byId)) {
    const pays = machine.linePays[base]
    let count = 0
    let multiplier = 1
    for (let reel = 0; reel < onLine.length; reel++) {
      const id = onLine[reel]
      const sym = byId.get(id)
      const isWild = Boolean(sym?.wild)
      if (id !== base && !isWild) break
      // A scatter never stands in for anything, even when it is also wild.
      if (sym?.scatter) break
      if (isWild && id !== base && sym?.multiplier) multiplier *= sym.multiplier
      count++
    }

    // Most symbols only pay from three along. Cherries pay from one, which is
    // the oldest rule on a stepper and most of what makes it feel alive — so the
    // pay schedule decides the minimum run, not this function.
    const per = pays[count] ?? 0
    if (count === 0 || per === 0) continue
    const paid = per * coinsPerLine * multiplier
    if (!best || paid > best.paid) {
      best = {
        kind: 'line',
        line: lineIndex,
        symbol: base,
        count,
        paid,
        cells: line.slice(0, count).map((row, reel) => [reel, row] as [number, number]),
      }
    }
  }

  return best
}

export function lineWins(window: SymbolId[][], machine: Machine, coinsPerLine: number): Win[] {
  const byId = symbolMap(machine.symbols)
  const wins: Win[] = []
  for (let i = 0; i < machine.lines.length; i++) {
    const win = bestLineWin(window, machine.lines[i], i, machine, byId, coinsPerLine)
    if (win) wins.push(win)
  }
  return wins
}

/** Where a symbol sits on screen. Scatters pay on count wherever they land, so
 *  this is a scan of the whole window rather than of a line. */
export function findSymbol(window: SymbolId[][], id: SymbolId): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let reel = 0; reel < window.length; reel++) {
    for (let row = 0; row < window[reel].length; row++) {
      if (window[reel][row] === id) cells.push([reel, row])
    }
  }
  return cells
}

export function scatterWins(window: SymbolId[][], machine: Machine, totalStake: number): Win[] {
  const table = machine.scatterPays
  if (!table) return []
  const wins: Win[] = []
  for (const [id, schedule] of Object.entries(table)) {
    const cells = findSymbol(window, id)
    const per = schedule[cells.length]
    if (!per) continue
    wins.push({
      kind: 'scatter',
      line: -1,
      symbol: id,
      count: cells.length,
      paid: per * totalStake,
      cells,
    })
  }
  return wins
}

/** Everything a stopped screen owes. */
export function evaluate(
  window: SymbolId[][],
  machine: Machine,
  coinsPerLine: number,
  totalStake: number,
): Win[] {
  return [...lineWins(window, machine, coinsPerLine), ...scatterWins(window, machine, totalStake)]
}
