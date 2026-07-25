// Simulates flat bettors and reports the house edge per bet resolved. The pass
// line is the reference at 1.41%; the don't-pass at 1.36%; place-6 at 1.52%; and
// the field (2:1 on the 2, 3:1 on the 12) at 2.78%.
//
//   npm run craps:edge
//   npm run craps:edge -- 3000000

import { makeRng } from '../src/engine/rng'

const ROUNDS = Number(process.argv[2] ?? 1_000_000)

const rng = makeRng(0xc7a)
const die = () => rng.int(6) + 1

// --- pass line (no odds): the canonical 1.41% -------------------------------

function passLine(): number {
  let staked = 0
  let net = 0
  for (let i = 0; i < ROUNDS; i++) {
    staked += 1
    const come = die() + die()
    if (come === 7 || come === 11) net += 1
    else if (come === 2 || come === 3 || come === 12) net -= 1
    else {
      const point = come
      for (;;) {
        const t = die() + die()
        if (t === point) {
          net += 1
          break
        }
        if (t === 7) {
          net -= 1
          break
        }
      }
    }
  }
  return -net / staked
}

function dontPass(): number {
  let staked = 0
  let net = 0
  for (let i = 0; i < ROUNDS; i++) {
    staked += 1
    const come = die() + die()
    if (come === 7 || come === 11) net -= 1
    else if (come === 2 || come === 3) net += 1
    else if (come === 12) {
      /* push */
    } else {
      const point = come
      for (;;) {
        const t = die() + die()
        if (t === point) {
          net -= 1
          break
        }
        if (t === 7) {
          net += 1
          break
        }
      }
    }
  }
  return -net / staked
}

/** A place bet resolves each time a decision (the number or a 7) is rolled. */
function place(number: number, mult: number): number {
  let staked = 0
  let net = 0
  for (let i = 0; i < ROUNDS; i++) {
    staked += 1
    for (;;) {
      const t = die() + die()
      if (t === number) {
        net += mult
        break
      }
      if (t === 7) {
        net -= 1
        break
      }
    }
  }
  return -net / staked
}

function field(): number {
  let staked = 0
  let net = 0
  for (let i = 0; i < ROUNDS; i++) {
    staked += 1
    const t = die() + die()
    if (t === 2) net += 2
    else if (t === 12) net += 3
    else if ([3, 4, 9, 10, 11].includes(t)) net += 1
    else net -= 1
  }
  return -net / staked
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

console.log(`\nCraps house edge — ${ROUNDS.toLocaleString()} bets each\n`)
console.log(`${'bet'.padEnd(22)} ${'simulated'.padStart(10)} ${'expected'.padStart(9)}`)
console.log('-'.repeat(44))
console.log(`${'Pass line'.padEnd(22)} ${pct(passLine()).padStart(10)} ${'1.41%'.padStart(9)}`)
console.log(`${"Don't pass".padEnd(22)} ${pct(dontPass()).padStart(10)} ${'1.36%'.padStart(9)}`)
console.log(`${'Place 6 (7:6)'.padEnd(22)} ${pct(place(6, 7 / 6)).padStart(10)} ${'1.52%'.padStart(9)}`)
console.log(`${'Place 5 (7:5)'.padEnd(22)} ${pct(place(5, 7 / 5)).padStart(10)} ${'4.00%'.padStart(9)}`)
console.log(`${'Field (2/3x)'.padEnd(22)} ${pct(field()).padStart(10)} ${'2.78%'.padStart(9)}`)
console.log()
