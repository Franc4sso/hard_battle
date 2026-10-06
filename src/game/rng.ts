/** mulberry32: restituisce un numero in [0,1) e il seed successivo. */
export function nextRandom(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

/** Piccolo wrapper mutabile da usare dentro una singola transizione del reducer. */
export class Rng {
  constructor(public seed: number) {}

  next(): number {
    const [v, s] = nextRandom(this.seed)
    this.seed = s
    return v
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]
  }

  pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0)
    let r = this.next() * total
    for (const item of items) {
      r -= item.weight
      if (r < 0) return item
    }
    return items[items.length - 1]
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}
