import { deckOf, findCard, type Card, type Slot } from '../shared/cards'
import { isTactic, type BattleRequest, type Fighter, type Monster, type Opening, type TacticId } from '../shared/battle'
import { generateEnding, generateOpening, type AiConfig } from './groq'
import { sign, verify } from './token'

export interface HandlerResult {
  status: number
  body: unknown
}

export interface HandlerConfig extends Partial<AiConfig> {
  /** Chiave per firmare la prima parte; se manca si usa la chiave Groq. */
  secret?: string
  rand?: () => number
}

/** Cosa viaggia firmato tra la prima e la seconda parte. */
interface OpeningToken {
  v: 1
  req: BattleRequest
  swap: boolean
  opening: Opening
}

const SLOT_KEYS: Slot[] = ['character', 'weapon', 'personality', 'power']

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

/**
 * POST /api/battle
 * - { stage: "opening", arena, fighters } → { opening, token }
 * - { stage: "ending", token, tactics: [t0, t1] } → { ending }
 */
export async function handleBattleRequest(raw: string, cfg: HandlerConfig): Promise<HandlerResult> {
  if (!cfg.apiKey) return { status: 503, body: { error: 'missing_key' } }
  const ai: AiConfig = { ...cfg, apiKey: cfg.apiKey }
  const secret = cfg.secret || cfg.apiKey
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'bad_request' } }
  }

  try {
    if (body?.stage === 'ending') {
      const payload = verify<OpeningToken>(body.token, secret)
      const parsed = payload?.v === 1 ? parseRequest(payload.req) : undefined
      const t = body.tactics
      if (!payload || !parsed || !Array.isArray(t) || t.length !== 2 || !isTactic(t[0]) || !isTactic(t[1]))
        return { status: 400, body: { error: 'bad_request' } }
      const ending = await generateEnding(parsed.fighters, parsed.arena, payload.swap, payload.opening, t as [TacticId, TacticId], ai)
      return { status: 200, body: { ending } }
    }

    const parsed = parseRequest(body)
    if (!parsed) return { status: 400, body: { error: 'bad_request' } }
    const swap = (cfg.rand ?? Math.random)() < 0.5
    const opening = await generateOpening(parsed.fighters, parsed.arena, swap, ai)
    const token = sign({ v: 1, req: parsed.req, swap, opening } satisfies OpeningToken, secret)
    return { status: 200, body: { opening, token } }
  } catch (e) {
    console.error('[battle]', e)
    return { status: 502, body: { error: 'ai_failed' } }
  }
}
