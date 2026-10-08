import { deckOf, findCard, type Card, type Slot } from '../shared/cards'
import {
  START,
  cleanStage,
  eventAt,
  movePower,
  playRound,
  scheduleEvents,
  type BattleRequest,
  type FightState,
  type Fighter,
  type Monster,
  type MoveSource,
  type Moves,
  type Opening,
} from '../shared/battle'
import { generateOpening, generateRound, type AiConfig } from './groq'
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
 * telefono a ogni round. La firma impedisce di modificarlo (niente vita truccata,
 * niente round saltati).
 */
interface FightToken {
  v: 5
  req: BattleRequest
  opening: Pick<Opening, 'title' | 'events'>
  fs: FightState
  /** Riassunti degli ultimi round, per dare memoria all'AI. */
  log: string[]
  /** I nomi delle mosse già fatte, perché l'AI non le ripeta. */
  used: string[]
  /** Le carte usate nel round prima: stavolta altre. */
  lastSources: [MoveSource, MoveSource] | null
  /** Nel round prima c'è stato un colpo di scena: non due di fila. */
  lastTwist: boolean
  done: boolean
}

const SLOT_KEYS: Slot[] = ['character', 'weapon', 'personality', 'power']
const LOG_SIZE = 5
const USED_SIZE = 24

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
    const stage = cleanStage(f?.stage)
    fighters.push({ player: cleanName(f.player, `Giocatore ${i + 1}`), monster: { ...(monster as Monster), ...(stage ? { stage } : {}) } })
  }
  const pair = fighters as [Fighter, Fighter]
  const ids = (f: Fighter) => ({
    player: f.player,
    character: f.monster.character.id,
    weapon: f.monster.weapon.id,
    personality: f.monster.personality.id,
    power: f.monster.power.id,
    ...(f.monster.stage ? { stage: f.monster.stage } : {}),
  })
  return { fighters: pair, arena, req: { arena: arena.id, fighters: [ids(pair[0]), ids(pair[1])] } }
}

/** Basta una carta sporca sul ring e il narratore può andarci pesante. */
export const hasDirtyCard = (fighters: [Fighter, Fighter]) => fighters.some((f) => SLOT_KEYS.some((s) => f.monster[s].dirty))

/**
 * POST /api/battle
 * - { stage: "opening", arena, fighters } → { opening, token }
 * - { stage: "round", token, evolving?: [bool, bool] } → { round, next, token }
 *   (evolving: chi, vincendo questa rissa, evolve nel bestiario: l'AI gli inventa il soprannome).
 */
export async function handleBattleRequest(raw: string, cfg: HandlerConfig): Promise<HandlerResult> {
  if (!cfg.apiKey) return { status: 503, body: { error: 'missing_key' } }
  const base: AiConfig = { ...cfg, apiKey: cfg.apiKey }
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
      const parsed = t?.v === 5 && !t.done ? parseRequest(t.req) : undefined
      if (!t || !parsed) return { status: 400, body: { error: 'bad_request' } }
      const event = eventAt(t.opening.events, t.fs.round + 1)
      const ai = { ...base, dirty: hasDirtyCard(parsed.fighters) }
      // L'ordine in cui l'AI vede i due combattenti si rimescola a ogni round: i modelli tendono a favorire uno dei due.
      const ev = Array.isArray(body.evolving) ? body.evolving : []
      const evolving: [boolean, boolean] = [ev[0] === true, ev[1] === true]
      const judgement = await generateRound(parsed.fighters, parsed.arena, rand() < 0.5, t.opening, t.fs, t.log, event, ai, t.lastTwist, t.used, t.lastSources ?? undefined, evolving)
      const [m0, m1] = judgement.moves
      const moves: Moves = { names: [m0.name, m1.name], actions: [m0.text, m1.text] }
      const names: [string, string] = [parsed.fighters[0].monster.character.name, parsed.fighters[1].monster.character.name]
      const twist = t.lastTwist ? null : judgement.twist
      // La rarità della carta da cui nasce la mossa pesa sui danni, di nascosto.
      const power: [number, number] = [movePower(parsed.fighters[0].monster, m0.source), movePower(parsed.fighters[1].monster, m1.source)]
      const { round, next } = playRound(t.fs, moves, { ...judgement, twist }, names, rand, event, power)
      const log = [...t.log, round.summary].filter(Boolean).slice(-LOG_SIZE)
      const used = [...t.used, m0.name, m1.name].slice(-USED_SIZE)
      const token = sign({ ...t, fs: next, log, used, lastSources: [m0.source, m1.source], lastTwist: !!twist, done: !!round.end } satisfies FightToken, secret)
      return { status: 200, body: { round, next, token } }
    }

    const parsed = parseRequest(body)
    if (!parsed) return { status: 400, body: { error: 'bad_request' } }
    const ai = { ...base, dirty: hasDirtyCard(parsed.fighters) }
    const opening = await generateOpening(parsed.fighters, parsed.arena, rand() < 0.5, scheduleEvents(rand), ai)
    const state: FightToken = {
      v: 5,
      req: parsed.req,
      opening: { title: opening.title, events: opening.events },
      fs: START,
      log: [],
      used: [],
      lastSources: null,
      lastTwist: false,
      done: false,
    }
    return { status: 200, body: { opening, token: sign(state, secret) } }
  } catch (e) {
    console.error('[battle]', e)
    return { status: 502, body: { error: 'ai_failed' } }
  }
}
