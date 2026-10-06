import {
  normalizeOpening,
  offlineOpening,
  offlineTexts,
  playRound,
  type FightState,
  type Fighter,
  type Monster,
  type Move,
  type Opening,
  type RoundResult,
} from '../../shared/battle'
import { battleRequest, currentEvent, type MatchState } from './match'

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
  return !!r && Array.isArray(r.hp) && Array.isArray(r.heal) && Array.isArray(r.verdicts) && Array.isArray(r.damage) && Array.isArray(r.actions) && Array.isArray(r.types)
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
    // Lo stato del round dopo (vita, stati, rimonta) lo calcola il server: il telefono lo prende così com'è.
    const serverNext = body?.next as FightState | undefined
    if (body && isRound(body.round) && serverNext && Array.isArray(serverNext.hp) && Array.isArray(serverNext.status) && typeof body.token === 'string')
      return { round: body.round, next: serverNext, token: body.token }
    const fighters = fightersOf(s)
    const moves: [Move, Move] = [opening.moves[0][choices[0]], opening.moves[1][choices[1]]]
    const names: [string, string] = [fighters[0].monster.character.name, fighters[1].monster.character.name]
    const rule = currentEvent(s)?.rule
    const { round, next } = playRound(f.fs, choices, moves, offlineTexts(fighters, opening, choices), names, Math.random, rule)
    return { round, next, token: null }
  })
}
