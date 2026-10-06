import {
  normalizeOpening,
  offlineOpening,
  offlineTexts,
  playRound,
  type FightState,
  type Fighter,
  type Monster,
  type MoveType,
  type Opening,
  type RoundResult,
} from '../../shared/battle'
import { battleRequest, type MatchState } from './match'

const TIMEOUT_MS = 20_000
// Una sola richiesta per passo, anche se la chiedono più schermate (VS e rissa) o StrictMode.
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
 * Presentazione e mosse. Parte appena si apre il VS, così quando si preme
 * COMBATTETE è già pronta. Senza AI le prepara il narratore di riserva.
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
  return !!r && Array.isArray(r.hp) && Array.isArray(r.delta) && Array.isArray(r.actions) && Array.isArray(r.types)
}

/**
 * Un round: lo calcola il server (che giudica le mosse con l'AI) e rimanda lo
 * stato firmato. Se l'AI non risponde, il round lo gioca il narratore di
 * riserva con le stesse regole, e la rissa prosegue offline.
 */
export function requestRound(s: MatchState): Promise<{ round: RoundResult; next: FightState; token: string | null }> {
  const f = s.fight
  const choices = f.choices as [number, number]
  return once(`${s.seed}-${s.round}-r${f.rounds.length}`, async () => {
    const opening = f.opening as Opening
    const body = f.token ? await post({ stage: 'round', token: f.token, choices }) : null
    if (body && isRound(body.round) && typeof body.token === 'string') {
      const round = body.round
      const next: FightState = {
        hp: round.hp,
        superUsed: [f.fs.superUsed[0] || round.types[0] === 'super', f.fs.superUsed[1] || round.types[1] === 'super'],
        lastType: round.types,
        round: f.fs.round + 1,
      }
      return { round, next, token: body.token }
    }
    const fighters = fightersOf(s)
    const types: [MoveType, MoveType] = [opening.moves[0][choices[0]].type, opening.moves[1][choices[1]].type]
    const names: [string, string] = [fighters[0].monster.character.name, fighters[1].monster.character.name]
    const { round, next } = playRound(f.fs, choices, types, offlineTexts(fighters, opening, choices), names, Math.random)
    return { round, next, token: null }
  })
}
