/**
 * Effetti sonori sintetizzati con Web Audio: nessun file audio, nessun copyright.
 * Ogni suono è una sequenza di note; per cambiarne uno basta modificare SOUNDS.
 */
export type SoundId = 'tap' | 'select' | 'pick' | 'reroll' | 'pass' | 'versus' | 'bell' | 'hit' | 'power' | 'twist' | 'ko' | 'win'

interface Note {
  f: number
  t: number
  d: number
  type?: OscillatorType
  v?: number
  slide?: number
}

const SOUNDS: Record<SoundId, Note[]> = {
  tap: [{ f: 520, t: 0, d: 0.05, type: 'triangle', v: 0.15 }],
  select: [{ f: 660, t: 0, d: 0.07, type: 'square', v: 0.07 }],
  pick: [
    { f: 420, t: 0, d: 0.08, type: 'sine', v: 0.25, slide: 760 },
    { f: 990, t: 0.08, d: 0.15, type: 'triangle', v: 0.15 },
  ],
  reroll: [
    { f: 300, t: 0, d: 0.06, type: 'square', v: 0.06 },
    { f: 450, t: 0.06, d: 0.06, type: 'square', v: 0.06 },
    { f: 600, t: 0.12, d: 0.06, type: 'square', v: 0.06 },
  ],
  pass: [{ f: 900, t: 0, d: 0.25, type: 'sawtooth', v: 0.05, slide: 200 }],
  versus: [
    { f: 110, t: 0, d: 0.4, type: 'sawtooth', v: 0.14, slide: 55 },
    { f: 880, t: 0.05, d: 0.3, type: 'square', v: 0.06, slide: 1760 },
  ],
  bell: [
    { f: 1318, t: 0, d: 0.5, type: 'sine', v: 0.2 },
    { f: 1318, t: 0.25, d: 0.6, type: 'sine', v: 0.2 },
  ],
  hit: [
    { f: 180, t: 0, d: 0.15, type: 'square', v: 0.18, slide: 50 },
    { f: 2000, t: 0, d: 0.05, type: 'sawtooth', v: 0.05, slide: 300 },
  ],
  power: [
    { f: 220, t: 0, d: 0.5, type: 'sawtooth', v: 0.1, slide: 1760 },
    { f: 1760, t: 0.45, d: 0.3, type: 'square', v: 0.07 },
  ],
  twist: [
    { f: 392, t: 0, d: 0.12, type: 'triangle', v: 0.15 },
    { f: 370, t: 0.12, d: 0.12, type: 'triangle', v: 0.15 },
    { f: 349, t: 0.24, d: 0.3, type: 'triangle', v: 0.15 },
  ],
  ko: [
    { f: 300, t: 0, d: 0.7, type: 'sawtooth', v: 0.15, slide: 40 },
    { f: 80, t: 0.05, d: 0.5, type: 'square', v: 0.15 },
  ],
  win: [
    { f: 523, t: 0, d: 0.12, type: 'triangle', v: 0.2 },
    { f: 659, t: 0.12, d: 0.12, type: 'triangle', v: 0.2 },
    { f: 784, t: 0.24, d: 0.12, type: 'triangle', v: 0.2 },
    { f: 1046, t: 0.36, d: 0.5, type: 'triangle', v: 0.22 },
    { f: 784, t: 0.36, d: 0.5, type: 'sine', v: 0.12 },
  ],
}

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
}

export function play(id: SoundId) {
  if (muted || typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    for (const n of SOUNDS[id]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.setValueAtTime(n.f, now + n.t)
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, now + n.t + n.d)
      gain.gain.setValueAtTime(0, now + n.t)
      gain.gain.linearRampToValueAtTime(n.v ?? 0.15, now + n.t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + n.t)
      osc.stop(now + n.t + n.d + 0.02)
    }
  } catch {
    // Audio non disponibile: il gioco funziona lo stesso.
  }
}

export function vibrate(pattern: number | number[]) {
  if (muted) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* non supportato */
  }
}
