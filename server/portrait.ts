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
  body: Uint8Array | { error: string; reason?: string }
  headers: Record<string, string>
}

export const DEFAULT_PORTRAIT_MODEL = '@cf/black-forest-labs/flux-1-schnell'
/** Modello piccolo e veloce: deve solo tradurre due righe. */
export const DEFAULT_TRANSLATE_MODEL = 'openai/gpt-oss-20b'
// Le funzioni Netlify gratuite si fermano a 10 s: pochi passi di diffusione e traduzione rapida.
// 4 passi: schnell è distillato per 4, oltre la qualità quasi non cambia ma ogni passo costa
// 9,6 neurons (su ~58 a immagine): con 4 ne escono ~170 al giorno gratis, con 5 solo ~148.
const STEPS = 4
const IMAGE_TIMEOUT_MS = 8_000
const TRANSLATE_TIMEOUT_MS = 3_000

/**
 * Lo stile è fisso (stesso disegnatore per tutte le carte); tutto il resto,
 * ambientazione, posa, inquadratura e colori, cambia da carta a carta, se no
 * i ritratti sembrano tutti uguali.
 */
const STYLE =
  'Japanese anime cel-shaded illustration, 90s anime TV series look: clean bold black outlines, flat vivid colors with simple cel shading, expressive face, strong silhouette, full body visible. No text, no letters, no logo, no watermark, no frame.'

/** Inquadrature: una per coppia, scelta in modo fisso dagli id, così lo stesso mostro ha sempre la stessa. */
const ANGLES = [
  'low camera angle looking up at the character, who towers over the viewer',
  'three-quarter view, mid-action, motion lines behind the character',
  'dramatic close shot from the waist up, the weapon thrust toward the camera',
  'wide shot, the whole body in a wind-up stance, lots of background visible',
  'slight dutch angle, the character leaping toward the viewer',
  'side profile, charging from left to right at full speed',
]

/** Ambientazioni di riserva quando la traduzione non ne propone una: varie, mai la stessa foresta. */
const SETTINGS = [
  'a sunlit Italian piazza with a fountain',
  'a neon-lit city street at night in the rain',
  'a volcanic arena with lava cracks',
  'a beach at sunset with striped umbrellas',
  'a rooftop above a sprawling city at dusk',
  'a snowy mountain pass under a blizzard',
  'a chaotic restaurant kitchen with flames',
  'a packed stadium under floodlights',
  'a dusty western saloon',
  'a cluttered grandma’s living room with doilies',
]

function hash(s: string): number {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

/** Le due carte come le legge il modello immagine, più i dettagli di scena che la traduzione può suggerire. */
export interface PortraitSubject {
  character: string
  weapon: string
  /** Dove si trova: il mondo del personaggio (Venezia per il piccione, un sottomarino per il kraken). */
  setting?: string
  /** Cosa sta facendo con l'arma, una posa precisa. */
  pose?: string
  /** Due colori dominanti. */
  palette?: string
}

export const rawSubject = (character: Card, weapon: Card): PortraitSubject => ({
  character: `"${character.name}" (${character.desc})`,
  weapon: `"${weapon.name}" (${weapon.desc})`,
})

/** `key` decide inquadratura e ambientazione di riserva: stessa coppia, stesso ritratto. */
export function portraitPrompt(subject: PortraitSubject, key = ''): string {
  const h = hash(key)
  const angle = ANGLES[h % ANGLES.length]
  const setting = subject.setting || SETTINGS[Math.floor(h / 7) % SETTINGS.length]
  const pose = subject.pose || 'in a dynamic fighting pose, swinging the weapon'
  const palette = subject.palette ? ` Dominant colors: ${subject.palette}.` : ''
  return `${subject.character}, ${pose}, holding this weapon: ${subject.weapon}. The weapon must look exactly like that object. Setting: ${setting}. Camera: ${angle}.${palette} ${STYLE}`
}

const TRANSLATE_SYSTEM =
  'You turn Italian trading-card text into a vivid English scene for an image generator. Reply ONLY with JSON: {"character":"...","weapon":"...","setting":"...","pose":"...","palette":"..."}. ' +
  '"character": one sentence, max 25 words: species or type, body shape, clothes, face and mood, distinctive details from the card. ' +
  '"weapon": one sentence, max 20 words: what the object looks like. Translate idioms into the real object ("ciabatta della nonna" is a grandma\'s slipper). ' +
  '"setting": max 12 words, a specific place from the character\'s own world (a Venice canal for a Venetian pigeon, a submarine for a kraken, a 1980s office for a bureaucrat). Never a generic forest. ' +
  '"pose": max 15 words, one specific action with the weapon, with the mood of the character (lazy, furious, sneaky, proud…). ' +
  '"palette": two or three dominant colors that fit the character. ' +
  'Keep the comedy. No real brand names. Never write the name of a real person: describe them as an anonymous caricature (haircut, moustache, uniform, expression, body shape) so the drawing is recognizable without the name. Crude or vulgar cards are fine as cartoon slapstick, no explicit nudity, no genitals.'

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
    const clean = (v: unknown, max = 240) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
    const subject: PortraitSubject = { character: clean(out.character), weapon: clean(out.weapon) }
    if (!subject.character || !subject.weapon) return null
    const setting = clean(out.setting, 100)
    const pose = clean(out.pose, 120)
    const palette = clean(out.palette, 60)
    return { ...subject, ...(setting ? { setting } : {}), ...(pose ? { pose } : {}), ...(palette ? { palette } : {}) }
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

export type GenerateResult = { image: Uint8Array } | { reason: string }

/**
 * Chiede l'immagine a Cloudflare. Se rifiuta restituisce il motivo (status e
 * codice d'errore di Cloudflare) e lo scrive nei log della funzione: senza,
 * un 502 non dice se è finita la quota del giorno, il token è scaduto o altro.
 */
export async function generatePortrait(cfg: PortraitConfig, prompt: string): Promise<GenerateResult> {
  if (!cfg.accountId || !cfg.token) return { reason: 'missing_key' }
  const doFetch = cfg.fetch ?? fetch
  try {
    const res = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${cfg.model || DEFAULT_PORTRAIT_MODEL}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ prompt, steps: STEPS }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    const text = await res.text()
    let json: { result?: { image?: unknown }; errors?: { code?: number; message?: string }[] } = {}
    try {
      json = JSON.parse(text)
    } catch {
      // Risposta non JSON: il testo finisce nel log qui sotto.
    }
    const b64 = json.result?.image
    if (res.ok && typeof b64 === 'string' && b64) return { image: new Uint8Array(Buffer.from(b64, 'base64')) }
    const err = json.errors?.[0]
    const reason = `cloudflare_${res.status}${err?.code ? `_${err.code}` : ''}`
    console.error(`[portrait] ${reason}: ${err?.message ?? text.slice(0, 300)}`)
    return { reason }
  } catch (e) {
    const reason = e instanceof Error && e.name === 'TimeoutError' ? 'cloudflare_timeout' : 'cloudflare_unreachable'
    console.error(`[portrait] ${reason}: ${e instanceof Error ? e.message : String(e)}`)
    return { reason }
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
  const out = await generatePortrait(cfg, portraitPrompt(subject, key))
  if (!('image' in out)) return { status: 502, body: { error: 'generation_failed', reason: out.reason }, headers: NO_CACHE }
  const { image } = out
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
