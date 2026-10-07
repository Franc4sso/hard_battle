import { deckOf, findCard, type Card, type Slot } from '../shared/cards'
import {
  START,
  cleanCustom,
  dedupeOffers,
  eventAt,
  fixFinishers,
  offlineOffers,
  playRound,
  scheduleEvents,
  type BattleRequest,
  type FightState,
  type Fighter,
  type Monster,
  type Opening,
  type Suggestion,
} from '../shared/battle'
import { generateOpening, generateRound, type AiConfig, type PlayedMove } from './groq'
import { sign, verify } from './token'

export interface HandlerResult {
  status: number
  body: unknown
}

export interface HandlerConfig extends Partial<AiConfig> {
  /** Chiave per firmare lo stato della rissa; se manca si usa la chiave Groq. */
  secret?: string
  rand?: () => number
}

/**
 * Netlify non ha un database: lo stato della rissa viaggia firmato tra server e
 * telefono a ogni round. La firma impedisce di modificarlo (niente testo
 * arbitrario nel prompt oltre alla mossa scritta, niente vita truccata).
 */
interface FightToken {
  v: 3
  req: BattleRequest
  opening: Pick<Opening, 'title' | 'events'>
  fs: FightState
  /** Le mosse suggerite per il round da giocare: si può scegliere solo tra queste (o scriverne una). */
  offers: [Suggestion[], Suggestion[]]
  /** Riassunti degli ultimi round, per dare memoria all'AI. */
  log: string[]
  /** Le mosse suggerite nei round precedenti, perché l'AI non le riproponga. */
  seen: string[]
  done: boolean
}

const SLOT_KEYS: Slot[] = ['character', 'weapon', 'personality', 'power']
const LOG_SIZE = 5
const SEEN_SIZE = 24

function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>{}"]/g, '').trim().slice(0, 20) : ''
  return s || fallback
}

function cardOf(id: unknown, slot: Slot | 'arena'): Card | undefined {
  const card = findCard(id)
  return card && deckOf(card.id) === slot ? card : undefined
}

/** Valida la richiesta: solo id di carte esistenti, nel mazzo giusto. */
export function parseRequest(body: unknown): { fighters: [Fighter, Fighter]; arena: Card; req: BattleRequest } | undefined {
  const b = body as { arena?: unknown; fighters?: unknown } | null
  const arena = cardOf(b?.arena, 'arena')
  if (!arena || !b || !Array.isArray(b.fighters) || b.fighters.length !== 2) return undefined
  const fighters: Fighter[] = []
  for (const [i, f] of (b.fighters as Record<string, unknown>[]).entries()) {
    const monster: Partial<Monster> = {}
    for (const slot of SLOT_KEYS) {
      const card = cardOf(f?.[slot], slot)
      if (!card) return undefined
      monster[slot] = card
    }
    fighters.push({ player: cleanName(f.player, `Giocatore ${i + 1}`), monster: monster as Monster })
  }
  const pair = fighters as [Fighter, Fighter]
  const ids = (f: Fighter) => ({
    player: f.player,
    character: f.monster.character.id,
    weapon: f.monster.weapon.id,
    personality: f.monster.personality.id,
    power: f.monster.power.id,
  })
  return { fighters: pair, arena, req: { arena: arena.id, fighters: [ids(pair[0]), ids(pair[1])] } }
}

/** Le mosse scelte: l'indice di una suggerita o una frase scritta dal giocatore (ripulita). */
function parseChoices(v: unknown, t: FightToken): [PlayedMove, PlayedMove] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const out: PlayedMove[] = []
  for (const [side, c] of (v as Record<string, unknown>[]).entries()) {
    if (Number.isInteger(c?.pick)) {
      const from = t.offers[side]?.[c.pick as number]
      if (!from) return undefined
      out.push({ text: from.text, from })
    } else {
      const text = cleanCustom(c?.custom)
      if (!text) return undefined
      out.push({ text })
    }
  }
  return out as [PlayedMove, PlayedMove]
}

/**
 * POST /api/battle
 * - { stage: "opening", arena, fighters } → { opening, token }
 * - { stage: "round", token, choices: [{pick: n} | {custom: "..."}, …] } → { round, next, offers, token }
 */
export async function handleBattleRequest(raw: string, cfg: HandlerConfig): Promise<HandlerResult> {
  if (!cfg.apiKey) return { status: 503, body: { error: 'missing_key' } }
  const ai: AiConfig = { ...cfg, apiKey: cfg.apiKey }
  const secret = cfg.secret || cfg.apiKey
  const rand = cfg.rand ?? Math.random
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'bad_request' } }
  }

  try {
    if (body?.stage === 'round') {
      const t = verify<FightToken>(body.token, secret)
      const parsed = t?.v === 3 && !t.done ? parseRequest(t.req) : undefined
      const moves = t && parsed ? parseChoices(body.choices, t) : undefined
      if (!t || !parsed || !moves) return { status: 400, body: { error: 'bad_request' } }
      const event = eventAt(t.opening.events, t.fs.round + 1)
      // L'ordine in cui l'AI vede i due combattenti si rimescola a ogni round: i modelli tendono a favorire uno dei due.
      const seen = [...(t.seen ?? []), ...t.offers.flat().map((o) => o.text)].slice(-SEEN_SIZE)
      const judgement = await generateRound(parsed.fighters, parsed.arena, rand() < 0.5, t.opening, t.fs, t.log, moves, event, ai, seen)
      const names: [string, string] = [parsed.fighters[0].monster.character.name, parsed.fighters[1].monster.character.name]
      const actions: [string, string] = [moves[0].text, moves[1].text]
      const custom: [boolean, boolean] = [!moves[0].from, !moves[1].from]
      const { round, next } = playRound(t.fs, actions, custom, judgement, names, rand, event)
      const log = [...t.log, round.summary].filter(Boolean).slice(-LOG_SIZE)
      // Le mosse quasi uguali a quelle già viste si sostituiscono con quelle di riserva.
      const backup: [Suggestion[], Suggestion[]] = [offlineOffers(parsed.fighters, 0, next), offlineOffers(parsed.fighters, 1, next)]
      const offers = fixFinishers(dedupeOffers(judgement.offers, seen, backup), next)
      const token = sign({ ...t, fs: next, offers, log, seen, done: !!round.end } satisfies FightToken, secret)
      return { status: 200, body: { round, next, offers, token } }
    }

    const parsed = parseRequest(body)
    if (!parsed) return { status: 400, body: { error: 'bad_request' } }
    const opening = await generateOpening(parsed.fighters, parsed.arena, rand() < 0.5, scheduleEvents(rand), ai)
    const state: FightToken = {
      v: 3,
      req: parsed.req,
      opening: { title: opening.title, events: opening.events },
      fs: START,
      offers: opening.offers,
      log: [],
      seen: [],
      done: false,
    }
    return { status: 200, body: { opening, token: sign(state, secret) } }
  } catch (e) {
    console.error('[battle]', e)
    return { status: 502, body: { error: 'ai_failed' } }
  }
}
