/**
 * Banco di prova del bilanciamento: bot con stili diversi si sfidano migliaia
 * di volte con le regole vere. Stampa una tabella e controlla che:
 * - giocare bene conti (il bot furbo batte il caso), ma senza strategie imbattibili;
 * - le risse durino il giusto e finiscano quasi sempre al tappeto;
 * - le rimonte succedano davvero.
 */
import { describe, expect, it } from 'vitest'
import { DECKS } from '../../shared/cards'
import {
  DESPERATE_INDEX,
  START,
  blockedReason,
  fallbackMoves,
  heatOf,
  playRound,
  roundEffects,
  type FightState,
  type Fighter,
  type Move,
  type RoundTexts,
  type Side,
} from '../../shared/battle'

type Bot = (me: Side, fs: FightState, moves: [Move[], Move[]], last: [number | null, number | null], r: () => number) => number

const allowed = (fs: FightState, side: Side, moves: Move[]) => moves.map((m, i) => [m, i] as const).filter(([m]) => !blockedReason(fs, side, m.type))

const pickRandom = <T>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length)]

const random: Bot = (me, fs, moves, _l, r) => pickRandom(allowed(fs, me, moves[me]), r)[1]

/** Picchia sempre: disperata, superpotere, poi l'attacco più forte. */
const aggro: Bot = (me, fs, moves) => {
  const ok = allowed(fs, me, moves[me])
  const rank = (m: Move) => (m.type === 'disperata' ? 10 : m.type === 'super' && m.effect !== 'cura' ? 9 : m.type === 'attacco' ? m.force : -1)
  return [...ok].sort((a, b) => rank(b[0]) - rank(a[0]))[0][1]
}

/** Si chiude: difesa e cura, il colpo grosso solo quando serve. */
const turtle: Bot = (me, fs, moves, _l, r) => {
  const ok = allowed(fs, me, moves[me])
  const des = ok.find(([m]) => m.type === 'disperata')
  if (des) return des[1]
  const safe = ok.filter(([m]) => m.type === 'difesa' || m.type === 'cura')
  if (fs.hp[me] < 45) {
    const sup = ok.find(([m]) => m.type === 'super')
    if (sup) return sup[1]
  }
  return pickRandom(safe.length ? safe : ok, r)[1]
}

/** Valore di una coppia di mosse per `me`, con le regole vere (efficacia neutra). */
function value(me: Side, fs: FightState, mine: Move, theirs: Move): number {
  const foe: Side = me === 0 ? 1 : 0
  const pair: [Move, Move] = me === 0 ? [mine, theirs] : [theirs, mine]
  const fx = roundEffects(pair, [1, 1], () => 0.5, heatOf(fs.round + 1), undefined, fs.status)
  let v = fx.heal[me] - fx.damage[me] - (fx.heal[foe] - fx.damage[foe])
  // Gli effetti valgono qualcosa anche per il round dopo.
  if (mine.fx === 'carica') v += 8
  if (mine.fx === 'scudo') v += 6
  if (mine.fx === 'brucia' && fx.dealt[me] > 0) v += 8
  if (mine.fx === 'stordisce' && (fx.dealt[me] > 0 || mine.type === 'difesa')) v += 6
  return v
}

/** Pensa un passo avanti: la mossa migliore contro un avversario che sceglie a caso tra le sue. */
const smart: Bot = (me, fs, moves) => {
  const foe: Side = me === 0 ? 1 : 0
  const theirs = allowed(fs, foe, moves[foe])
  let best = -Infinity
  let bestI = 0
  for (const [m, i] of allowed(fs, me, moves[me])) {
    const ev = theirs.reduce((s, [t]) => s + value(me, fs, m, t), 0) / theirs.length
    if (ev > best) [best, bestI] = [ev, i]
  }
  return bestI
}

/** Legge l'avversario: pensa che ripeta il tipo di mossa di prima e risponde al meglio. */
const reader: Bot = (me, fs, moves, last, r) => {
  const foe: Side = me === 0 ? 1 : 0
  const prev = last[foe]
  if (prev === null || blockedReason(fs, foe, moves[foe][prev].type)) return smart(me, fs, moves, last, r)
  const guess = moves[foe][prev]
  let best = -Infinity
  let bestI = 0
  for (const [m, i] of allowed(fs, me, moves[me])) {
    const v = value(me, fs, m, guess)
    if (v > best) [best, bestI] = [v, i]
  }
  return bestI
}

const BOTS: Record<string, Bot> = { caso: random, aggro, tartaruga: turtle, furbo: smart, lettore: reader }

function lcg(seed: number) {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

const texts = (eff: [number, number]): RoundTexts => ({ efficacy: eff, actions: ['', ''], sfx: ['', ''], ko: ['', ''], verdicts: ['', ''], summary: '' })

interface Stats {
  wins: number
  rounds: number
  ko: number
  comebacks: number
  desperate: number
  n: number
}

/** Una serie di risse tra due bot, metà con i lati scambiati. */
function series(a: Bot, b: Bot, n: number, seed = 7): Stats {
  const r = lcg(seed)
  const s: Stats = { wins: 0, rounds: 0, ko: 0, comebacks: 0, desperate: 0, n }
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1
    const bots: [Bot, Bot] = swap ? [b, a] : [a, b]
    const kits = [0, 1].map(() => fallbackMoves({ player: 'x', monster: randomMonster(r) } as Fighter)) as [Move[], Move[]]
    let fs = START
    const last: [number | null, number | null] = [null, null]
    let maxDeficit: [number, number] = [0, 0]
    for (;;) {
      const choices: [number, number] = [bots[0](0, fs, kits, last, r), bots[1](1, fs, kits, last, r)]
      const eff: [number, number] = [0.8 + r() * 0.45, 0.8 + r() * 0.45]
      const out = playRound(fs, choices, [kits[0][choices[0]], kits[1][choices[1]]], texts(eff), ['A', 'B'], r)
      if (out.round.types.includes('disperata')) s.desperate++
      fs = out.next
      last[0] = choices[0]
      last[1] = choices[1]
      maxDeficit = [Math.max(maxDeficit[0], fs.hp[1] - fs.hp[0]), Math.max(maxDeficit[1], fs.hp[0] - fs.hp[1])]
      if (out.round.end) {
        const w = out.round.end.winner
        const aSide: Side = swap ? 1 : 0
        if (w === aSide) s.wins++
        if (!out.round.end.byJury) s.ko++
        if (maxDeficit[w] >= 25) s.comebacks++
        s.rounds += fs.round
        break
      }
    }
  }
  return s
}

function randomMonster(r: () => number) {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  return { character: pick(DECKS.character), weapon: pick(DECKS.weapon), personality: pick(DECKS.personality), power: pick(DECKS.power) }
}

const pct = (x: number, n: number) => `${Math.round((100 * x) / n)}%`

describe('bilanciamento (bot contro bot)', () => {
  const N = 1500
  const names = Object.keys(BOTS)
  const table: Record<string, Stats> = {}
  for (const a of names) for (const b of names) if (a < b || a === b) table[`${a}-${b}`] = series(BOTS[a], BOTS[b], N)

  it('stampa la tabella', () => {
    const rows = Object.entries(table).map(([k, s]) => {
      const [a, b] = k.split('-')
      return `${a.padEnd(10)} vs ${b.padEnd(10)} vince ${a}: ${pct(s.wins, s.n).padStart(4)} | round ${(s.rounds / s.n).toFixed(1)} | KO ${pct(s.ko, s.n).padStart(4)} | rimonte ${pct(s.comebacks, s.n).padStart(4)} | disperate ${(s.desperate / s.n).toFixed(2)}`
    })
    console.log(`\n${rows.join('\n')}\n`)
    expect(rows.length).toBeGreaterThan(0)
  })

  const rate = (a: string, b: string) => {
    const s = table[`${a}-${b}`] ?? table[`${b}-${a}`]
    const w = s.wins / s.n
    return table[`${a}-${b}`] ? w : 1 - w
  }

  it('giocare bene conta: il furbo batte il caso, ma non sempre', () => {
    expect(rate('furbo', 'caso')).toBeGreaterThan(0.6)
    expect(rate('furbo', 'caso')).toBeLessThan(0.92)
  })

  it('nessuna strategia "a testa bassa" è imbattibile', () => {
    // Chi ragiona (il migliore dei due bot pensanti) batte chi picchia sempre e chi si chiude sempre.
    expect(Math.max(rate('furbo', 'aggro'), rate('lettore', 'aggro'))).toBeGreaterThan(0.58)
    expect(Math.max(rate('furbo', 'tartaruga'), rate('lettore', 'tartaruga'))).toBeGreaterThan(0.58)
    // Picchiare sempre o chiudersi sempre: nessuno dei due stravince sull'altro.
    expect(rate('aggro', 'tartaruga')).toBeGreaterThan(0.3)
    expect(rate('aggro', 'tartaruga')).toBeLessThan(0.7)
  })

  it('chi legge l’avversario ha un vantaggio sui prevedibili', () => {
    expect(rate('lettore', 'aggro')).toBeGreaterThan(0.55)
  })

  it('risse né troppo corte né troppo lunghe, quasi sempre al tappeto, con rimonte', () => {
    const all = Object.values(table)
    const total = all.reduce((s, x) => s + x.n, 0)
    const avgRounds = all.reduce((s, x) => s + x.rounds, 0) / total
    const ko = all.reduce((s, x) => s + x.ko, 0) / total
    const comebacks = all.reduce((s, x) => s + x.comebacks, 0) / total
    console.log(`media round ${avgRounds.toFixed(2)}, KO ${Math.round(ko * 100)}%, rimonte ${Math.round(comebacks * 100)}%`)
    expect(avgRounds).toBeGreaterThan(3.5)
    expect(avgRounds).toBeLessThan(6.5)
    expect(ko).toBeGreaterThan(0.85)
    expect(comebacks).toBeGreaterThan(0.1)
  })

  it('la mossa disperata si vede, ma non in ogni rissa', () => {
    const s = table['caso-caso']
    expect(s.desperate / s.n).toBeGreaterThan(0.2)
    expect(s.desperate / s.n).toBeLessThan(1.6)
    expect(DESPERATE_INDEX).toBe(4)
  })
})
