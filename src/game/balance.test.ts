/**
 * Banco di prova del ritmo: bot che scelgono le mosse in modi diversi si
 * sfidano migliaia di volte con le regole vere e il giudice di riserva.
 * Controlla che le risse durino il giusto, finiscano quasi sempre al tappeto,
 * abbiano rimonte, e che leggere l'avversario conti senza essere imbattibile.
 */
import { describe, expect, it } from 'vitest'
import { DECKS } from '../../shared/cards'
import { START, TONES, offlineJudgement, playRound, type FightState, type Fighter, type Move, type MoveSource, type Side, type Tone } from '../../shared/battle'

const SOURCE_OF: Record<Tone, MoveSource> = { aggressiva: 'weapon', furba: 'personality', pazza: 'power' }
const atk = (tone: Tone): Move => ({ name: tone, text: `fa ${tone}`, source: SOURCE_OF[tone] })
const MOVES = { names: ['x', 'y'] as [string, string], actions: ['x', 'y'] as [string, string] }

type Bot = (me: Side, fs: FightState, last: [Tone | null, Tone | null], r: () => number) => Tone

const random: Bot = (_me, _fs, _last, r) => TONES[Math.floor(r() * 3)]
const aggro: Bot = () => 'aggressiva'
/** Pensa che l'avversario rifaccia la mossa di prima e sceglie quella che la batte. */
const COUNTER: Record<Tone, Tone> = { aggressiva: 'furba', pazza: 'aggressiva', furba: 'pazza' }
const reader: Bot = (me, fs, last, r) => {
  const prev = last[me === 0 ? 1 : 0]
  return prev ? COUNTER[prev] : random(me, fs, last, r)
}

const BOTS: Record<string, Bot> = { caso: random, aggro, lettore: reader }

function lcg(seed: number) {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

function randomFighter(r: () => number): Fighter {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  return { player: 'x', monster: { character: pick(DECKS.character), weapon: pick(DECKS.weapon), personality: pick(DECKS.personality), power: pick(DECKS.power) } }
}

interface Stats {
  wins: number
  rounds: number
  ko: number
  comebacks: number
  n: number
}

/** Una serie di risse tra due bot, metà con i lati scambiati. */
function series(a: Bot, b: Bot, n: number, seed = 7): Stats {
  const r = lcg(seed)
  const s: Stats = { wins: 0, rounds: 0, ko: 0, comebacks: 0, n }
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1
    const bots: [Bot, Bot] = swap ? [b, a] : [a, b]
    const fighters: [Fighter, Fighter] = [randomFighter(r), randomFighter(r)]
    let fs = START
    const last: [Tone | null, Tone | null] = [null, null]
    const deficit: [number, number] = [0, 0]
    for (;;) {
      const tones: [Tone, Tone] = [bots[0](0, fs, last, r), bots[1](1, fs, last, r)]
      const j = offlineJudgement(fighters, [atk(tones[0]), atk(tones[1])], r)
      const out = playRound(fs, MOVES, j, ['A', 'B'], r)
      fs = out.next
      last[0] = tones[0]
      last[1] = tones[1]
      deficit[0] = Math.max(deficit[0], fs.hp[1] - fs.hp[0])
      deficit[1] = Math.max(deficit[1], fs.hp[0] - fs.hp[1])
      if (out.round.end) {
        const w = out.round.end.winner
        if (w === (swap ? 1 : 0)) s.wins++
        if (!out.round.end.byJury) s.ko++
        if (deficit[w] >= 25) s.comebacks++
        s.rounds += fs.round
        break
      }
    }
  }
  return s
}

const pct = (x: number, n: number) => `${Math.round((100 * x) / n)}%`

describe('ritmo della rissa (bot contro bot)', () => {
  const N = 1500
  const names = Object.keys(BOTS)
  const table: Record<string, Stats> = {}
  for (const a of names) for (const b of names) if (a <= b) table[`${a}-${b}`] = series(BOTS[a], BOTS[b], N)

  const rate = (a: string, b: string) => {
    const s = table[`${a}-${b}`] ?? table[`${b}-${a}`]
    return table[`${a}-${b}`] ? s.wins / s.n : 1 - s.wins / s.n
  }

  it('stampa la tabella', () => {
    const rows = Object.entries(table).map(([k, s]) => {
      const [a, b] = k.split('-')
      return `${a.padEnd(8)} vs ${b.padEnd(8)} vince ${a}: ${pct(s.wins, s.n).padStart(4)} | round ${(s.rounds / s.n).toFixed(1)} | KO ${pct(s.ko, s.n).padStart(4)} | rimonte ${pct(s.comebacks, s.n).padStart(4)}`
    })
    console.log(`\n${rows.join('\n')}\n`)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('risse né troppo corte né troppo lunghe, quasi sempre al tappeto, con rimonte', () => {
    const all = Object.values(table)
    const total = all.reduce((s, x) => s + x.n, 0)
    const avg = all.reduce((s, x) => s + x.rounds, 0) / total
    const ko = all.reduce((s, x) => s + x.ko, 0) / total
    const comebacks = all.reduce((s, x) => s + x.comebacks, 0) / total
    console.log(`media round ${avg.toFixed(2)}, KO ${Math.round(ko * 100)}%, rimonte ${Math.round(comebacks * 100)}%`)
    expect(avg).toBeGreaterThan(3.5)
    expect(avg).toBeLessThan(7)
    expect(ko).toBeGreaterThan(0.9)
    expect(comebacks).toBeGreaterThan(0.08)
  })

  it('chi legge l’avversario batte chi fa sempre la stessa cosa, ma il caso resta imprevedibile', () => {
    expect(rate('lettore', 'aggro')).toBeGreaterThan(0.75)
    expect(rate('caso', 'aggro')).toBeGreaterThan(0.35)
    expect(rate('lettore', 'caso')).toBeLessThan(0.65)
  })
})
