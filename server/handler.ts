import { deckOf, findCard, type Card, type Slot } from '../shared/cards'
import {
  START,
  blockedReason,
  eventAt,
  playRound,
  scheduleEvents,
  type BattleRequest,
  type FightState,
  type Fighter,
  type Monster,
  type Move,
  type Opening,
  type Side,
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
 * telefono a ogni round. La firma impedisce di modificarlo (niente testo
 * arbitrario nel prompt, niente punti vita truccati).
 */
interface FightToken {
  v: 2
  req: BattleRequest
  swap: boolean
  opening: Opening
  fs: FightState
  /** Riassunti degli ultimi round, per dare memoria all'AI. */
  log: string[]
  done: boolean
}

const SLOT_KEYS: Slot[] = ['character', 'weapon', 'personality', 'power']
const LOG_SIZE = 4

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

function parseChoices(v: unknown, t: FightToken): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const rule = eventAt(t.opening.events, t.fs.round + 1)?.rule
  for (const [side, c] of v.entries()) {
    const move = Number.isInteger(c) ? t.opening.moves[side][c as number] : undefined
    if (!move || blockedReason(t.fs, side as Side, move.type, rule)) return undefined
  }
  return v as [number, number]
}

/**
 * POST /api/battle
 * - { stage: "opening", arena, fighters } → { opening, token }
 * - { stage: "round", token, choices: [mossa0, mossa1] } → { round, token }
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
      const parsed = t?.v === 2 && !t.done ? parseRequest(t.req) : undefined
      const choices = t && parsed ? parseChoices(body.choices, t) : undefined
      if (!t || !parsed || !choices) return { status: 400, body: { error: 'bad_request' } }
      const event = eventAt(t.opening.events, t.fs.round + 1)
      const texts = await generateRound(parsed.fighters, parsed.arena, t.swap, t.opening, t.fs, t.log, choices, event, ai)
      const moves: [Move, Move] = [t.opening.moves[0][choices[0]], t.opening.moves[1][choices[1]]]
      const names: [string, string] = [parsed.fighters[0].monster.character.name, parsed.fighters[1].monster.character.name]
      const { round, next } = playRound(t.fs, choices, moves, texts, names, rand, event?.rule)
      const token = sign({ ...t, fs: next, log: [...t.log, round.summary].filter(Boolean).slice(-LOG_SIZE), done: !!round.end }, secret)
      return { status: 200, body: { round, token } }
    }

    const parsed = parseRequest(body)
    if (!parsed) return { status: 400, body: { error: 'bad_request' } }
    const swap = rand() < 0.5
    const opening = await generateOpening(parsed.fighters, parsed.arena, swap, scheduleEvents(rand), ai)
    const token = sign({ v: 2, req: parsed.req, swap, opening, fs: START, log: [], done: false } satisfies FightToken, secret)
    return { status: 200, body: { opening, token } }
  } catch (e) {
    console.error('[battle]', e)
    return { status: 502, body: { error: 'ai_failed' } }
  }
}
