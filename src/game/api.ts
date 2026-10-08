import {
  normalizeOpening,
  offlineJudgement,
  offlineOpening,
  playRound,
  type Attack,
  type FightState,
  type Fighter,
  type Monster,
  type Moves,
  type Opening,
  type Picks,
  type RoundResult,
} from '../../shared/battle'
import { battleRequest, currentEvent, type MatchState } from './match'

const TIMEOUT_MS = 20_000
// Una sola richiesta per passo, anche se la chiedono più schermate o StrictMode.
const inflight = new Map<string, Promise<unknown>>()

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined
  if (!p) {
    p = run()
    inflight.set(key, p)
    p.finally(() => setTimeout(() => inflight.delete(key), 60_000))
  }
  return p
}

async function post(body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/battle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const fightersOf = (s: MatchState): [Fighter, Fighter] => {
  const [m0, m1] = s.monsters as [Monster, Monster]
  return [
    { player: s.players[0].name, monster: m0 },
    { player: s.players[1].name, monster: m1 },
  ]
}

/**
 * Presentazione e i 5 attacchi di ciascuno. Parte appena si apre il VS, così
 * quando si passa alla scelta è già pronta. Senza AI li prepara il narratore di riserva.
 */
export function requestOpening(s: MatchState): Promise<{ opening: Opening; token: string | null }> {
  return once(`${s.seed}-${s.round}-open`, async () => {
    const body = await post({ stage: 'opening', ...battleRequest(s) })
    const opening = normalizeOpening(body?.opening, fightersOf(s), 'ai')
    if (opening && typeof body?.token === 'string') return { opening, token: body.token }
    return { opening: offlineOpening(fightersOf(s), s.arena), token: null }
  })
}

function isRound(v: unknown): v is RoundResult {
  const r = v as RoundResult | null
  return !!r && Array.isArray(r.hp) && Array.isArray(r.hits) && Array.isArray(r.actions) && Array.isArray(r.moveNames) && typeof r.scene === 'string'
}

type RoundOut = { round: RoundResult; next: FightState; token: string | null }

/**
 * Un round: lo gioca il server con l'AI, che sceglie quale dei 2 attacchi usa
 * ciascuno, e rimanda lo stato firmato. Se l'AI non risponde, il round lo gioca
 * il narratore di riserva e la rissa prosegue offline.
 */
export function requestRound(s: MatchState): Promise<RoundOut> {
  const f = s.fight
  const picks = f.picks as [Picks, Picks]
  return once(`${s.seed}-${s.round}-r${f.rounds.length}`, async () => {
    const body = f.token ? await post({ stage: 'round', token: f.token, picks }) : null
    const next = body?.next as FightState | undefined
    if (body && isRound(body.round) && next && Array.isArray(next.hp) && typeof body.token === 'string') return { round: body.round, next, token: body.token }
    const fighters = fightersOf(s)
    const opening = f.opening as Opening
    // Senza AI si alternano i due attacchi, partendo da uno a caso.
    const used = [0, 1].map((side) => opening.attacks[side][picks[side][(f.rounds.length + side + (s.seed % 2)) % 2]]) as [Attack, Attack]
    const moves: Moves = { names: [used[0].name, used[1].name], actions: [used[0].text, used[1].text] }
    const judgement = offlineJudgement(fighters, used, Math.random)
    const names: [string, string] = [fighters[0].monster.character.name, fighters[1].monster.character.name]
    const out = playRound(f.fs, moves, judgement, names, Math.random, currentEvent(s))
    return { ...out, token: null }
  })
}
