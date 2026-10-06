import {
  combine,
  hpAfter,
  normalizeEnding,
  normalizeOpening,
  offlineEnding,
  offlineOpening,
  type Battle,
  type Fighter,
  type Monster,
  type Opening,
  type TacticId,
} from '../../shared/battle'
import { battleRequest, type MatchState } from './match'

const TIMEOUT_MS = 25_000
// Una sola richiesta per parte e per round, anche se la chiedono più schermate (VS e rissa).
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

const fightersOf = (s: MatchState): [Fighter, Fighter] => {
  const [m0, m1] = s.monsters as [Monster, Monster]
  return [
    { player: s.players[0].name, monster: m0 },
    { player: s.players[1].name, monster: m1 },
  ]
}

/**
 * Prima parte della rissa. Parte appena si apre il VS, così quando si preme
 * COMBATTETE è già pronta. Senza AI la racconta il narratore di riserva.
 */
export function requestOpening(s: MatchState): Promise<{ opening: Opening; token: string | null }> {
  return once(`${s.seed}-${s.round}-open`, async () => {
    const body = await post({ stage: 'opening', ...battleRequest(s) })
    const opening = normalizeOpening(body?.opening, 'ai')
    if (opening && typeof body?.token === 'string') return { opening, token: body.token }
    return { opening: offlineOpening(fightersOf(s), s.arena), token: null }
  })
}

/** Seconda parte, dopo le tattiche. Si chiede mentre si svela lo scontro di tattiche. */
export function requestBattle(s: MatchState, tactics: [TacticId, TacticId]): Promise<Battle> {
  const opening = s.fight.opening as Opening
  return once(`${s.seed}-${s.round}-end`, async () => {
    const fighters = fightersOf(s)
    const body = s.fight.token ? await post({ stage: 'ending', token: s.fight.token, tactics }) : null
    const ending = normalizeEnding(body?.ending, hpAfter(opening), 'ai') ?? offlineEnding(fighters, s.arena, opening, tactics)
    return combine(opening, ending, tactics, fighters)
  })
}
