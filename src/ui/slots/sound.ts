// A tiny WebAudio synth for the slot cabinets. No asset files: every cue is built
// from oscillators and noise shaped by gain envelopes, so it works with the app
// fully offline. Nothing here ever throws — if the browser has no AudioContext,
// or one can't be created (locked-down context, autoplay policy, a private
// window), every call quietly becomes a no-op.
//
// The cabinet is quiet by default. `enabled` starts false and is only flipped on
// by the top-bar toggle; the click that flips it — or the spin button — is the
// user gesture that lets the context start, which is why `setEnabled(true)` and
// `resume()` are the only places we call `ctx.resume()`.

const KEY = 'slots:sound'

// Safari exposes the constructor under a prefix. Typed rather than cast to `any`
// so the fallback still type-checks.
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let enabled = readEnabled()
/** The spin whir currently playing, so a fresh spin can cut the old one. */
let whir: { stop: () => void } | null = null

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

/** Reduced-motion means "show the result, don't perform it" — and that includes
 *  the audio, so a cue is silent under it even when the toggle is on. */
function prefersReduced(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Lazily build the context. Returns null (and stays null) if audio isn't
 *  available, so callers can bail without a try/catch of their own. */
function audio(): AudioContext | null {
  if (ctx) return ctx
  try {
    // `AudioContext` is a global, not a member of `Window`, so reach the standard
    // one directly and fall back to Safari's prefixed constructor on `window`.
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    const created = new Ctor()
    const gain = created.createGain()
    gain.gain.value = 0.5
    gain.connect(created.destination)
    ctx = created
    master = gain
    return ctx
  } catch {
    ctx = null
    master = null
    return null
  }
}

/** The context + master bus when a cue is actually allowed to sound. Everything
 *  audible goes through this one gate. */
function live(): { ctx: AudioContext; master: GainNode } | null {
  if (!enabled || prefersReduced()) return null
  const c = audio()
  if (!c || !master) return null
  if (c.state === 'suspended') {
    try {
      void c.resume()
    } catch {
      // A resume outside a gesture can reject; the cue just won't sound.
    }
  }
  return { ctx: c, master }
}

/** One second of white noise, reused for every click and whir. */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

interface ToneSpec {
  type?: OscillatorType
  /** Start frequency. */
  f0: number
  /** End frequency for a glide; omitted holds f0. */
  f1?: number
  dur: number
  gain: number
  attack?: number
  /** Seconds from now before it starts, for arpeggios and stacks. */
  delay?: number
}

/** One enveloped oscillator note. The workhorse behind the dings and fanfares. */
function tone(spec: ToneSpec): void {
  const l = live()
  if (!l) return
  try {
    const { ctx: c, master: bus } = l
    const now = c.currentTime + (spec.delay ?? 0)
    const osc = c.createOscillator()
    osc.type = spec.type ?? 'sine'
    osc.frequency.setValueAtTime(spec.f0, now)
    if (spec.f1 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.f1), now + spec.dur)
    }
    const g = c.createGain()
    // exponential ramps can't touch zero, so the floor is a hair above it.
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(spec.gain, now + (spec.attack ?? 0.005))
    g.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur)
    osc.connect(g)
    g.connect(bus)
    osc.start(now)
    osc.stop(now + spec.dur + 0.03)
  } catch {
    // A bad parameter or a closed context: swallow it, stay silent.
  }
}

// --------------------------------------------------------------- public cues

/** The reel whir: band-passed noise that fades in, holds for the roll, and fades
 *  out. Auto-stops after `durationMs`; a new spin cuts any leftover. */
export function startSpin(durationMs: number): void {
  stopSpin()
  const l = live()
  if (!l) return
  try {
    const { ctx: c, master: bus } = l
    const now = c.currentTime
    const dur = Math.max(0.3, durationMs / 1000)
    const src = c.createBufferSource()
    src.buffer = noise(c)
    src.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 620
    bp.Q.value = 0.7
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.085, now + 0.08)
    g.gain.setValueAtTime(0.085, now + dur - 0.16)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(bp)
    bp.connect(g)
    g.connect(bus)
    src.start(now)
    src.stop(now + dur + 0.05)
    whir = {
      stop: () => {
        try {
          const t = c.currentTime
          g.gain.cancelScheduledValues(t)
          g.gain.setTargetAtTime(0.0001, t, 0.03)
          src.stop(t + 0.12)
        } catch {
          // already stopped
        }
      },
    }
  } catch {
    whir = null
  }
}

export function stopSpin(): void {
  if (whir) {
    whir.stop()
    whir = null
  }
}

/** A reel landing: a high noise click plus a low sine thunk. The thunk drops a
 *  little in pitch per reel so a left-to-right stagger sounds like it settles. */
export function reelStop(reel: number): void {
  const l = live()
  if (!l) return
  try {
    const { ctx: c, master: bus } = l
    const now = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    const cg = c.createGain()
    cg.gain.setValueAtTime(0.13, now)
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    src.connect(hp)
    hp.connect(cg)
    cg.connect(bus)
    src.start(now)
    src.stop(now + 0.06)
  } catch {
    // ignore
  }
  tone({ type: 'sine', f0: 148 - reel * 8, f1: 66 - reel * 3, dur: 0.13, gain: 0.24, attack: 0.002 })
}

/** The held breath: a sawtooth sweeping up under a tremolo. Played when a reel
 *  lands one short of a trigger and the next reel is about to decide it. */
export function anticipation(): void {
  const l = live()
  if (!l) return
  try {
    const { ctx: c, master: bus } = l
    const now = c.currentTime
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, now)
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.82)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    // tremolo modulating the amplitude for tension
    const lfo = c.createOscillator()
    lfo.frequency.value = 15
    const lg = c.createGain()
    lg.gain.value = 0.035
    lfo.connect(lg)
    lg.connect(g.gain)
    osc.connect(lp)
    lp.connect(g)
    g.connect(bus)
    osc.start(now)
    osc.stop(now + 0.92)
    lfo.start(now)
    lfo.stop(now + 0.92)
  } catch {
    // ignore
  }
}

/** Coins on a win. `strength` is roughly the win as a multiple of the bet; it
 *  buys more, brighter, higher dings. */
export function win(strength: number): void {
  const dings = Math.max(1, Math.min(6, Math.round(strength)))
  const base = 660
  for (let i = 0; i < dings; i++) {
    const f = base * Math.pow(1.12, i)
    tone({ type: 'sine', f0: f, dur: 0.18, gain: 0.16, attack: 0.003, delay: i * 0.065 })
    // a fifth above, quiet, to make each ding read as a coin rather than a beep.
    tone({ type: 'sine', f0: f * 1.5, dur: 0.12, gain: 0.05, attack: 0.003, delay: i * 0.065 })
  }
}

/** The fanfare: an ascending major arpeggio with an octave shimmer and a held
 *  top chord. Reserved for the big-win screen. */
export function bigWin(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5] // C5 E5 G5 C6 E6
  notes.forEach((f, i) => {
    tone({ type: 'triangle', f0: f, dur: 0.5, gain: 0.16, attack: 0.004, delay: i * 0.11 })
    tone({ type: 'sine', f0: f * 2, dur: 0.4, gain: 0.045, attack: 0.004, delay: i * 0.11 })
  })
  ;[1046.5, 1318.5, 1568.0].forEach((f) =>
    tone({ type: 'sine', f0: f, dur: 0.95, gain: 0.075, attack: 0.01, delay: 0.66 }),
  )
}

/** The bonus sting: a square-wave sweep up into a bright triangle chord — the
 *  cabinet announcing you've bought the feature. */
export function bonus(): void {
  const l = live()
  if (l) {
    try {
      const { ctx: c, master: bus } = l
      const now = c.currentTime
      const osc = c.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.5)
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3000
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.1, now + 0.06)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
      osc.connect(lp)
      lp.connect(g)
      g.connect(bus)
      osc.start(now)
      osc.stop(now + 0.65)
    } catch {
      // ignore
    }
  }
  ;[880, 1108.7, 1320].forEach((f, i) =>
    tone({ type: 'triangle', f0: f, dur: 0.6, gain: 0.12, attack: 0.005, delay: 0.4 + i * 0.02 }),
  )
}

// ------------------------------------------------------------------ control

export function setEnabled(next: boolean): void {
  enabled = next
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    // storage blocked: the choice just won't persist across reloads.
  }
  if (!next) stopSpin()
  else resume()
}

export function isEnabled(): boolean {
  return enabled
}

/** Start (or wake) the context. Must be called from a user gesture the first
 *  time — the toggle click and the spin click both qualify. */
export function resume(): void {
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') {
    try {
      void c.resume()
    } catch {
      // ignore
    }
  }
}
