import type { Card } from '../shared/cards'
import {
  MOVE_INFO,
  baseOutcome,
  heatOf,
  normalizeOpening,
  normalizeRoundTexts,
  type FightState,
  type Fighter,
  type Move,
  type Opening,
  type RoundTexts,
} from '../shared/battle'

export interface AiConfig {
  apiKey: string
  model?: string
  /** low | medium | high, solo per i modelli che ragionano. */
  reasoning?: string
  /** Modello di riserva se il principale ha finito i token al minuto ('' = nessuno). */
  fallbackModel?: string
  fetch?: typeof fetch
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const DEFAULT_MODEL = 'openai/gpt-oss-120b'
export const FALLBACK_MODEL = 'openai/gpt-oss-20b'

export const SYSTEM_PROMPT = `Sei il narratore e il giudice di RISSA ASSURDA, un party game in cui due giocatori costruiscono un mostro assurdo ciascuno e lo fanno combattere a turni. Racconti come una telecronaca da cartone animato: esagerata, surreale, velocissima, piena di trovate. Scrivi in italiano.

STILE
- Ogni carta conta: il PERSONAGGIO agisce secondo le sue caratteristiche reali o tipiche, l'ARMA si usa in modi creativi e imprevisti, la PERSONALITÀ guida scelte, errori e battute, il SUPERPOTERE ha anche il suo limite comico. L'arena partecipa: oggetti, persone ed eventi del luogo entrano nella rissa.
- Frasi concrete e visive, se possibile con una battuta tra virgolette. Vietate le frasi generiche come "si scontrano con forza" o "un colpo potente".
- Chiama i combattenti con il nome del personaggio, non con il nome del giocatore.
- Le battute devono far ridere davvero e avere senso nel contesto. Giochi di parole sulle carte sono benvenuti.
- Comicità slapstick da cartone, adatta a tutti: niente sangue, niente sesso, niente parolacce, niente insulti a gruppi di persone.
- Rispondi SOLO con un oggetto JSON valido, nella forma richiesta.`

function describe(f: Fighter, i: number): string {
  const m = f.monster
  return [
    `COMBATTENTE ${i} (giocatore: ${f.player})`,
    `- Personaggio: ${m.character.name}. ${m.character.desc}`,
    `- Arma: ${m.weapon.name}. ${m.weapon.desc}`,
    `- Personalità: ${m.personality.name}. ${m.personality.desc}`,
    `- Superpotere: ${m.power.name}. ${m.power.desc}`,
  ].join('\n')
}

const setup = (f: [Fighter, Fighter], arena: Card) =>
  `ARENA: ${arena.name}. ${arena.desc}\n\n${describe(f[0], 0)}\n\n${describe(f[1], 1)}`

export function openingPrompt(f: [Fighter, Fighter], arena: Card): string {
  return `${setup(f, arena)}

PRESENTAZIONE DELLA RISSA. Scrivi:
- "title": il titolo dell'incontro come un film, max 50 caratteri.
- "intro": il presentatore apre l'incontro descrivendo l'arena, 1-2 frasi.
- "nicknames": un soprannome epico e buffo per ciascun combattente, nell'ordine 0 e 1, max 4 parole (es. "Il Flagello di IKEA").
- "moves": per ciascun combattente ESATTAMENTE 4 mosse.
  - Le prime 3 hanno "type" a scelta tra "attacco", "difesa", "cura", DECISI DAL PERSONAGGIO E DALLE SUE CARTE: un bruto o un'arma pesante può dare 2-3 attacchi e nessuna cura, un tipo zen o ipocondriaco difese e cure, un furbo un attacco e due difese. Almeno un attacco. Non dare a tutti la stessa combinazione.
  - Le prime 3 hanno "force" 1 (debole), 2 (normale) o 3 (forte), e la somma delle tre force deve essere ESATTAMENTE 6: chi ha più mosse dello stesso tipo le ha di forza diversa.
  - La quarta ha "type": "super" ed è il suo superpotere, con "effect": "colpo" (danno devastante) oppure "cura" (se il superpotere è curativo o rigenerante: grande recupero di vita mentre para i colpi).
  - Gli attacchi nascono dall'arma, difese e cure dalla personalità e dal personaggio.
  - "name": max 4 parole, buffo e specifico per le sue carte (mai generico come "Pugno" o "Scudo"). "desc": cosa fa, max 12 parole.
Forma: {"title":"...","intro":"...","nicknames":["...","..."],"moves":[[{"type":"attacco","force":3,"name":"...","desc":"..."},{"type":"attacco","force":1,"name":"...","desc":"..."},{"type":"difesa","force":2,"name":"...","desc":"..."},{"type":"super","effect":"colpo","name":"...","desc":"..."}],[...]]}`
}

const FORCE_WORD = { 1: 'debole', 2: 'normale', 3: 'forte' } as const
const label = (m: Move) =>
  m.type === 'super' ? `${MOVE_INFO.super.label}${m.effect === 'cura' ? ' curativo' : ''}` : `${MOVE_INFO[m.type].label}, ${FORCE_WORD[m.force]}`

export function roundPrompt(
  f: [Fighter, Fighter],
  arena: Card,
  opening: Opening,
  fs: FightState,
  log: string[],
  choices: [number, number],
): string {
  const names: [string, string] = [f[0].monster.character.name, f[1].monster.character.name]
  const moves: [Move, Move] = [opening.moves[0][choices[0]], opening.moves[1][choices[1]]]
  const story = log.length ? log.map((s) => `- ${s}`).join('\n') : '- (è il primo round)'
  return `${setup(f, arena)}

TITOLO: "${opening.title}". FINORA:
${story}

ROUND ${fs.round + 1}. Punti vita: ${names[0]} ${fs.hp[0]}, ${names[1]} ${fs.hp[1]} (su 100).${
    heatOf(fs.round + 1) > 1 ? ' LA RISSA SI STA SCALDANDO: i colpi fanno molto più male, racconta un crescendo di furia.' : ''
  }
MOSSE SCELTE IN SEGRETO, NELLO STESSO MOMENTO:
- ${names[0]} (COMBATTENTE 0): "${moves[0].name}" [${label(moves[0])}] ${moves[0].desc}
- ${names[1]} (COMBATTENTE 1): "${moves[1].name}" [${label(moves[1])}] ${moves[1].desc}
ESITO DI BASE SECONDO LE REGOLE: ${baseOutcome(names, moves)}

Il tuo compito, da giudice e da narratore:
- "efficacy": per ciascuno un numero da 0.6 a 1.5: quanto la sua mossa funziona davvero contro quella dell'altro, considerando carte, personalità, arena e momento. 1 = normale. Premia le mosse azzeccate e le combinazioni furbe, punisci quelle che si ritorcono contro. Sii imprevedibile ma logico.
- "actions": per ciascuno 1-2 frasi su cosa fa con la sua mossa e come va a finire, coerenti con l'esito di base e con l'efficacia che hai dato (alta = effetto spettacolare, bassa = figuraccia).
  - Racconta SOLO la mossa scelta: chi non ha scelto il superpotere non lo usa, chi si difende non attacca.
  - Niente numeri di punti vita o di danni: quelli li mostra il gioco.
- "sfx": un'onomatopea da fumetto in maiuscolo per ciascuno, max 12 caratteri.
- "ko": OBBLIGATORIO, una lista di due frasi finali (2 frasi ciascuna): la prima da usare SE crolla il combattente 0, la seconda SE crolla il combattente 1. Il KO, spettacolare e legato alle mosse di questo round, e cosa succede dopo.
- "summary": 1 frase che riassume il round, per ricordarlo nei round successivi.
Forma: {"efficacy":[1,1],"actions":["...","..."],"sfx":["...","..."],"ko":["...","..."],"summary":"..."}`
}

class RateLimitError extends Error {}

async function askModel(user: string, cfg: AiConfig, model: string): Promise<Record<string, unknown>> {
  const doFetch = cfg.fetch ?? fetch
  // I gpt-oss ragionano prima di rispondere: più ragionamento = più curato ma più lento.
  const reasoning = model.startsWith('openai/gpt-oss') ? { reasoning_effort: cfg.reasoning || 'low' } : {}
  const res = await doFetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      ...reasoning,
      temperature: 1,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const msg = `Groq ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`
    throw res.status === 429 ? new RateLimitError(msg) : new Error(msg)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return JSON.parse(data.choices?.[0]?.message?.content ?? '') as Record<string, unknown>
}

async function askGroq(user: string, cfg: AiConfig): Promise<Record<string, unknown>> {
  try {
    return await askModel(user, cfg, cfg.model || DEFAULT_MODEL)
  } catch (e) {
    // Piano gratuito: superato il limite di token al minuto del modello grande,
    // si riprova subito con quello piccolo, che ha un limite separato.
    const fallback = cfg.fallbackModel ?? FALLBACK_MODEL
    if (e instanceof RateLimitError && fallback && fallback !== (cfg.model || DEFAULT_MODEL)) return askModel(user, cfg, fallback)
    throw e
  }
}

/** Due tentativi: il secondo se la risposta non è valida o la rete fa i capricci. */
async function retry<T>(fn: () => Promise<T | null>): Promise<T> {
  let lastError: unknown = new Error('Risposta AI non valida')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await fn()
      if (out) return out
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/*
 * L'ordine dei combattenti viene mescolato a caso (i modelli tendono a favorire
 * chi è scritto per primo): `swap` dice se l'AI li vede invertiti. Le coppie di
 * valori nelle risposte vengono rimesse nell'ordine dell'app.
 */
const ordered = <T>(pair: [T, T], swap: boolean): [T, T] => (swap ? [pair[1], pair[0]] : pair)
const flipPairs = (raw: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (Array.isArray(raw[k])) raw[k] = [(raw[k] as unknown[])[1], (raw[k] as unknown[])[0]]
}

export function generateOpening(fighters: [Fighter, Fighter], arena: Card, swap: boolean, cfg: AiConfig): Promise<Opening> {
  return retry(async () => {
    const raw = await askGroq(openingPrompt(ordered(fighters, swap), arena), cfg)
    if (swap) flipPairs(raw, ['nicknames', 'moves'])
    return normalizeOpening(raw, fighters, 'ai')
  })
}

export function generateRound(
  fighters: [Fighter, Fighter],
  arena: Card,
  swap: boolean,
  opening: Opening,
  fs: FightState,
  log: string[],
  choices: [number, number],
  cfg: AiConfig,
): Promise<RoundTexts> {
  // Tutto ciò che è a coppie va girato come lo vede l'AI.
  const seen: Opening = swap ? { ...opening, nicknames: ordered(opening.nicknames, true), moves: ordered(opening.moves, true) } : opening
  const seenFs: FightState = swap
    ? { ...fs, hp: ordered(fs.hp, true), superUsed: ordered(fs.superUsed, true), lastType: ordered(fs.lastType, true) }
    : fs
  return retry(async () => {
    const raw = await askGroq(roundPrompt(ordered(fighters, swap), arena, seen, seenFs, log, ordered(choices, swap)), cfg)
    if (swap) flipPairs(raw, ['efficacy', 'actions', 'sfx', 'ko'])
    return normalizeRoundTexts(raw)
  })
}
