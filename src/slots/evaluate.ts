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

/** All-ways pays. A symbol pays when it lands on consecutive reels starting from
 *  reel one, regardless of row, and the win scales by the "ways": the product of
 *  how many of that symbol sit on each matched reel. A wild counts toward the
 *  matched-count on its reel, so wilds multiply the ways rather than sitting in a
 *  line position — there are no line positions here.
 *
 *  Every paying symbol is scored independently and the wins are SUMMED, not
 *  maxed. A reel of pure wilds matches every symbol at once; summing is the
 *  standard all-ways rule, and it is also what keeps the return linear in the
 *  strips and so exactly enumerable — each symbol's contribution factorizes
 *  across the (independent) reels, which `exactWaysReturn` in rtp.ts relies on. */
export function wayWins(window: SymbolId[][], machine: Machine, coinsPerLine: number): Win[] {
  const byId = symbolMap(machine.symbols)
  const reels = window.length
  const wins: Win[] = []

  for (const base of payingSymbols(machine.linePays, byId)) {
    const pays = machine.linePays[base]
    // Matched cells reel by reel — a cell counts if it is the base symbol or a
    // wild (never a scatter, even a wild one). The run is the longest unbroken
    // stretch of matched reels starting at reel one; a reel with no match ends it.
    const matched: Array<Array<[number, number]>> = []
    for (let reel = 0; reel < reels; reel++) {
      const cells: Array<[number, number]> = []
      for (let row = 0; row < window[reel].length; row++) {
        const id = window[reel][row]
        const sym = byId.get(id)
        if (sym?.scatter) continue
        if (id === base || sym?.wild) cells.push([reel, row])
      }
      if (cells.length === 0) break
      matched.push(cells)
    }

    const run = matched.length
    const per = pays[run] ?? 0
    if (run === 0 || per === 0) continue
    // The ways: multiply the matched-counts across the run. Wilds are already in
    // those counts, so a wild on a reel multiplies that reel's contribution.
    let ways = 1
    for (const cells of matched) ways *= cells.length
    wins.push({
      kind: 'line',
      line: -1,
      symbol: base,
      count: run,
      paid: per * coinsPerLine * ways,
      cells: matched.flat(),
    })
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
  // A ways cabinet pays by adjacency rather than along fixed lines; scatters
  // still pay on a whole-screen count, exactly as they do on a line machine.
  const symbolWins = machine.ways
    ? wayWins(window, machine, coinsPerLine)
    : lineWins(window, machine, coinsPerLine)
  return [...symbolWins, ...scatterWins(window, machine, totalStake)]
}
