import {
  choiceSuggestion,
  choiceText,
  normalizeOffers,
  normalizeOpening,
  offlineJudgement,
  offlineOffers,
  offlineOpening,
  playRound,
  type Choice,
  type FightState,
  type Fighter,
  type Monster,
  type Opening,
  type RoundResult,
  type Suggestion,
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
 * Presentazione e prime mosse. Parte appena si apre il VS, così quando si preme
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
  return !!r && Array.isArray(r.hp) && Array.isArray(r.hits) && Array.isArray(r.actions) && Array.isArray(r.moveNames) && typeof r.scene === 'string'
}

type RoundOut = { round: RoundResult; next: FightState; offers: [Suggestion[], Suggestion[]]; token: string | null }

/**
 * Un round: lo giudica il server con l'AI e rimanda lo stato firmato e le mosse
 * per il round dopo. Se l'AI non risponde, il round lo gioca il narratore di
 * riserva e la rissa prosegue offline.
 */
export function requestRound(s: MatchState): Promise<RoundOut> {
  const f = s.fight
  const choices = f.choices as [Choice, Choice]
  return once(`${s.seed}-${s.round}-r${f.rounds.length}`, async () => {
    const fighters = fightersOf(s)
    const body = f.token ? await post({ stage: 'round', token: f.token, choices }) : null
    const next = body?.next as FightState | undefined
    const rawOffers = body?.offers as unknown[] | undefined
    if (body && isRound(body.round) && next && Array.isArray(next.hp) && Array.isArray(rawOffers) && typeof body.token === 'string') {
      const offers: [Suggestion[], Suggestion[]] = [
        normalizeOffers(rawOffers[0], offlineOffers(fighters, 0, next)),
        normalizeOffers(rawOffers[1], offlineOffers(fighters, 1, next)),
      ]
      return { round: body.round, next, offers, token: body.token }
    }
    const actions: [string, string] = [choiceText(f.offers[0], choices[0]), choiceText(f.offers[1], choices[1])]
    const tones = [choiceSuggestion(f.offers[0], choices[0])?.tone ?? null, choiceSuggestion(f.offers[1], choices[1])?.tone ?? null] as const
    const judgement = offlineJudgement(fighters, f.fs, actions, [tones[0], tones[1]])
    const names: [string, string] = [fighters[0].monster.character.name, fighters[1].monster.character.name]
    const custom: [boolean, boolean] = ['custom' in choices[0], 'custom' in choices[1]]
    const out = playRound(f.fs, actions, custom, judgement, names, Math.random, currentEvent(s))
    // Le mosse del round dopo seguono la vita di adesso.
    const offers: [Suggestion[], Suggestion[]] = [offlineOffers(fighters, 0, out.next), offlineOffers(fighters, 1, out.next)]
    return { ...out, offers, token: null }
  })
}
