import type { Machine } from '../types'
import { BARS } from './bars'

/** Every machine on the floor, in the order they're offered. */
export const MACHINES: Machine[] = [BARS]

export function machineById(id: string): Machine {
  return MACHINES.find((m) => m.id === id) ?? MACHINES[0]
}

export { BARS }
