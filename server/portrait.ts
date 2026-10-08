import { deckOf, findCard, type Card } from '../shared/cards'

/**
 * Ritratto del mostro: un'immagine per coppia personaggio + arma, generata da
 * Cloudflare Workers AI (FLUX schnell, piano gratuito) e messa in cache per sempre.
 * Il telefono chiede GET /api/portrait/<personaggio>/<arma> e riceve un JPEG.
 */
export interface PortraitConfig {
  accountId?: string
  token?: string
  /** Modello Workers AI; schnell è veloce e gratuito. */
  model?: string
  /** Chiave Groq: se c'è, le carte vengono prima tradotte in inglese (FLUX non capisce "ciabatta della nonna"). */
  groqKey?: string
  groqModel?: string
  fetch?: typeof fetch
}

/** Dove restano le immagini già generate (Netlify Blobs online, disco in sviluppo). */
export interface PortraitStore {
  get(key: string): Promise<Uint8Array | null>
  set(key: string, data: Uint8Array): Promise<void>
}

export interface PortraitResult {
  status: number
  body: Uint8Array | { error: string }
  headers: Record<string, string>
}

export const DEFAULT_PORTRAIT_MODEL = '@cf/black-forest-labs/flux-1-schnell'
/** Modello piccolo e veloce: deve solo tradurre due righe. */
export const DEFAULT_TRANSLATE_MODEL = 'openai/gpt-oss-20b'
// Le funzioni Netlify gratuite si fermano a 10 s: pochi passi di diffusione e traduzione rapida.
const STEPS = 4
const IMAGE_TIMEOUT_MS = 8_000
const TRANSLATE_TIMEOUT_MS = 2_500

/** Stile fisso per tutte le carte, così i ritratti sembrano dello stesso disegnatore. */
const STYLE =
  'Japanese anime cel-shaded illustration in the style of the Pokemon anime: clean bold black outlines, flat bright colors, big expressive eyes, dynamic fighting pose, full body, centered, soft blurred forest background. No text, no letters, no watermark.'

/** Le due carte come le legge il modello immagine: in inglese se la traduzione è riuscita, altrimenti così come sono. */
export interface PortraitSubject {
  character: string
  weapon: string
}

export const rawSubject = (character: Card, weapon: Card): PortraitSubject => ({
  character: `"${character.name}" (${character.desc})`,
  weapon: `"${weapon.name}" (${weapon.desc})`,
})

export function portraitPrompt(subject: PortraitSubject): string {
  return `Character: ${subject.character}. The character is holding and fighting with this weapon: ${subject.weapon}. The weapon must look exactly like that object. ${STYLE}`
}

const TRANSLATE_SYSTEM =
  'You translate Italian trading-card text into short English visual descriptions for an image generator. Reply ONLY with JSON: {"character":"...","weapon":"..."}. Each value is one sentence, max 25 words, concrete and visual: what the thing looks like, its mood or expression, what it is doing. Keep the comedy. Translate idioms into the actual object (e.g. "ciabatta della nonna" is a grandma\'s slipper). No names of real brands. Never write the name of a real person: describe them as an anonymous caricature instead (haircut, moustache, uniform, expression, body shape) so the drawing is recognizable without the name. Crude or vulgar cards are fine: describe them as cartoon slapstick, no explicit nudity, no genitals.'

/** Traduce le due carte in inglese con Groq; null se non c'è la chiave o non risponde in tempo. */
export async function translateSubject(cfg: PortraitConfig, character: Card, weapon: Card): Promise<PortraitSubject | null> {
  if (!cfg.groqKey) return null
  const doFetch = cfg.fetch ?? fetch
  try {
    const res = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.groqKey}` },
      body: JSON.stringify({
        model: cfg.groqModel || DEFAULT_TRANSLATE_MODEL,
        reasoning_effort: 'low',
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM },
          { role: 'user', content: `Personaggio: ${character.name}. ${character.desc}\nArma: ${weapon.name}. ${weapon.desc}` },
        ],
      }),
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const out = JSON.parse(data.choices?.[0]?.message?.content ?? '') as Partial<PortraitSubject>
    const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 240) : '')
    const subject = { character: clean(out.character), weapon: clean(out.weapon) }
    return subject.character && subject.weapon ? subject : null
  } catch {
    return null
  }
}

export const portraitKey = (character: Card, weapon: Card) => `${character.id}__${weapon.id}.jpg`

/** Le due carte della richiesta, solo se esistono e sono del mazzo giusto. */
export function parsePortraitIds(characterId: unknown, weaponId: unknown): { character: Card; weapon: Card } | undefined {
  const character = findCard(characterId)
  const weapon = findCard(weaponId)
  if (!character || !weapon || deckOf(character.id) !== 'character' || deckOf(weapon.id) !== 'weapon') return undefined
  return { character, weapon }
}

/** Chiede l'immagine a Cloudflare; null se il servizio non risponde o rifiuta. */
export async function generatePortrait(cfg: PortraitConfig, prompt: string): Promise<Uint8Array | null> {
  if (!cfg.accountId || !cfg.token) return null
  const doFetch = cfg.fetch ?? fetch
  try {
    const res = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${cfg.model || DEFAULT_PORTRAIT_MODEL}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ prompt, steps: STEPS }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: { image?: unknown } }
    const b64 = json.result?.image
    if (typeof b64 !== 'string' || !b64) return null
    return new Uint8Array(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

const IMAGE_HEADERS = { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' }
const NO_CACHE = { 'cache-control': 'no-store' }

/**
 * GET /api/portrait/:character/:weapon → JPEG.
 * 404 id sconosciuti, 503 chiave mancante, 502 generazione fallita (il telefono mostra la scheda senza ritratto).
 */
export async function handlePortraitRequest(characterId: unknown, weaponId: unknown, cfg: PortraitConfig, store: PortraitStore): Promise<PortraitResult> {
  const ids = parsePortraitIds(characterId, weaponId)
  if (!ids) return { status: 404, body: { error: 'unknown_card' }, headers: NO_CACHE }
  const key = portraitKey(ids.character, ids.weapon)
  const cached = await store.get(key).catch(() => null)
  if (cached) return { status: 200, body: cached, headers: IMAGE_HEADERS }
  if (!cfg.accountId || !cfg.token) return { status: 503, body: { error: 'missing_key' }, headers: NO_CACHE }
  const subject = (await translateSubject(cfg, ids.character, ids.weapon)) ?? rawSubject(ids.character, ids.weapon)
  const image = await generatePortrait(cfg, portraitPrompt(subject))
  if (!image) return { status: 502, body: { error: 'generation_failed' }, headers: NO_CACHE }
  await store.set(key, image).catch(() => {
    // Senza cache si rigenera la prossima volta: costa una chiamata, non la partita.
  })
  return { status: 200, body: image, headers: IMAGE_HEADERS }
}

/** Cache in memoria, per i test e come riserva. */
export function memoryStore(): PortraitStore {
  const map = new Map<string, Uint8Array>()
  return {
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, data) {
      map.set(key, data)
    },
  }
}
