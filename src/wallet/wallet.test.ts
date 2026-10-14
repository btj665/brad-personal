import { describe, expect, it } from 'vitest'

import { BASE_STAKE, ensureFunds, getBalance, recordDelta, refill } from './wallet'

// These run in guest mode (no Supabase configured in the test env), which is the
// same top-up path a signed-out player uses.
describe('wallet top-up', () => {
  it('refill rescues a short-but-nonzero balance that ensureFunds leaves stuck', async () => {
    // Bleed down to a few chips — below any table minimum, but not yet zero. This
    // is the state a player gets stranded in: too little to bet, not broke enough
    // to auto-replenish.
    recordDelta('test', -(getBalance() - 4))
    expect(getBalance()).toBe(4)

    // ensureFunds only fires at zero, so the stuck player stays stuck — the bug.
    await ensureFunds()
    expect(getBalance()).toBe(4)

    // refill (the "add chips" button) tops back up to the base stake — the fix.
    await refill()
    expect(getBalance()).toBe(BASE_STAKE)
  })

  it('refill never pays above the base stake', async () => {
    recordDelta('test', 5000 - getBalance()) // go well above the base
    expect(getBalance()).toBe(5000)
    await refill()
    expect(getBalance()).toBe(5000)
  })
})
