import { normalizeBattle, offlineBattle, type Battle, type Monster } from '../../shared/battle'
import { battleRequest, type MatchState } from './match'

const TIMEOUT_MS = 30_000
// Evita doppie richieste per lo stesso round (StrictMode, ricariche veloci).
const inflight = new Map<string, Promise<Battle>>()

async function fetchAi(state: MatchState): Promise<Battle | null> {
  try {
    const res = await fetch('/api/battle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(battleRequest(state)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { battle?: unknown }
    return normalizeBattle(body.battle, 'ai')
  } catch {
    return null
  }
}

/** Battaglia dall'AI; se non risponde (offline, chiave mancante, errore) la racconta il narratore di riserva. */
export function requestBattle(state: MatchState): Promise<Battle> {
  const key = `${state.seed}-${state.round}`
  let p = inflight.get(key)
  if (!p) {
    p = fetchAi(state).then((b) => {
      if (b) return b
      const [m0, m1] = state.monsters as [Monster, Monster]
      return offlineBattle(
        [
          { player: state.players[0].name, monster: m0 },
          { player: state.players[1].name, monster: m1 },
        ],
        state.arena,
      )
    })
    inflight.set(key, p)
    p.finally(() => setTimeout(() => inflight.delete(key), 5000))
  }
  return p
}
