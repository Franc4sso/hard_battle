import { deckOf, findCard, type Card, type Slot } from '../shared/cards'
import type { Fighter, Monster } from '../shared/battle'
import { generateBattle, type AiConfig } from './groq'

export interface HandlerResult {
  status: number
  body: unknown
}

const SLOT_KEYS: Slot[] = ['character', 'weapon', 'personality', 'power']

function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>{}]/g, '').trim().slice(0, 20) : ''
  return s || fallback
}

function cardOf(id: unknown, slot: Slot | 'arena'): Card | undefined {
  const card = findCard(id)
  return card && deckOf(card.id) === slot ? card : undefined
}

/** Valida la richiesta: solo id di carte esistenti, nel mazzo giusto. */
export function parseRequest(raw: string): { fighters: [Fighter, Fighter]; arena: Card } | undefined {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return undefined
  }
  const b = body as { arena?: unknown; fighters?: unknown }
  const arena = cardOf(b?.arena, 'arena')
  if (!arena || !Array.isArray(b.fighters) || b.fighters.length !== 2) return undefined
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
  return { fighters: fighters as [Fighter, Fighter], arena }
}

export async function handleBattleRequest(raw: string, cfg: Partial<AiConfig>): Promise<HandlerResult> {
  if (!cfg.apiKey) return { status: 503, body: { error: 'missing_key' } }
  const req = parseRequest(raw)
  if (!req) return { status: 400, body: { error: 'bad_request' } }
  try {
    const battle = await generateBattle(req.fighters, req.arena, { ...cfg, apiKey: cfg.apiKey })
    return { status: 200, body: { battle } }
  } catch (e) {
    console.error('[battle]', e)
    return { status: 502, body: { error: 'ai_failed' } }
  }
}
