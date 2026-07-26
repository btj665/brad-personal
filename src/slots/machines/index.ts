import type { Machine } from '../types'
import { BARS } from './bars'
import { BELL } from './bell'
import { LATESHOW } from './lateshow'
import { ROCKSLIDE } from './rockslide'

/** Every machine on the floor, plainest first. Each is a different *mechanic*
 *  rather than a different theme — a stepper, a scatter ladder, a tumbling
 *  screen, a free-games round — because the theme is the only part of a slot
 *  that doesn't change the arithmetic. */
export const MACHINES: Machine[] = [BARS, BELL, ROCKSLIDE, LATESHOW]

export function machineById(id: string): Machine {
  return MACHINES.find((m) => m.id === id) ?? MACHINES[0]
}

export { BARS, BELL, ROCKSLIDE, LATESHOW }
