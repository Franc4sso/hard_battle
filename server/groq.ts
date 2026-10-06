import type { Card } from '../shared/cards'
import {
  EVENT_RULES,
  FX_BY_TYPE,
  FX_INFO,
  MOVE_INFO,
  RAGE_MAX,
  type Status,
  baseOutcome,
  buildEvents,
  type ArenaEvent,
  type EventRule,
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

const TRAP = ' [CARTA TRAPPOLA imposta dall’avversario: è uno svantaggio vero, deve pesare in ogni scena]'

function describe(f: Fighter, i: number): string {
  const m = f.monster
  const t = (c: { cursed?: true }) => (c.cursed ? TRAP : '')
  return [
    `COMBATTENTE ${i} (giocatore: ${f.player})`,
    `- Personaggio: ${m.character.name}. ${m.character.desc}`,
    `- Arma: ${m.weapon.name}. ${m.weapon.desc}${t(m.weapon)}`,
    `- Personalità: ${m.personality.name}. ${m.personality.desc}${t(m.personality)}`,
    `- Superpotere: ${m.power.name}. ${m.power.desc}${t(m.power)}`,
  ].join('\n')
}

const setup = (f: [Fighter, Fighter], arena: Card) =>
  `ARENA: ${arena.name}. ${arena.desc}\n\n${describe(f[0], 0)}\n\n${describe(f[1], 1)}`

export function openingPrompt(f: [Fighter, Fighter], arena: Card, schedule: { round: number; rule: EventRule }[]): string {
  const events = schedule.map((e) => `  - round ${e.round}: ${EVENT_RULES[e.rule].title} (${EVENT_RULES[e.rule].rule})`).join('\n')
  return `${setup(f, arena)}

PRESENTAZIONE DELLA RISSA. Scrivi:
- "title": il titolo dell'incontro come un film, max 50 caratteri.
- "intro": il presentatore apre l'incontro descrivendo l'arena, 1-2 frasi.
- "nicknames": un soprannome epico e buffo per ciascun combattente, nell'ordine 0 e 1, max 4 parole (es. "Il Flagello di IKEA").
- "moves": per ciascun combattente ESATTAMENTE 4 mosse.
  - Le prime 3 hanno "type" a scelta tra "attacco", "difesa", "cura", DECISI DAL PERSONAGGIO E DALLE SUE CARTE: un bruto o un'arma pesante può dare 2-3 attacchi e nessuna cura, un tipo zen o ipocondriaco difese e cure, un furbo un attacco e due difese. Almeno un attacco. Non dare a tutti la stessa combinazione.
  - Le prime 3 hanno "force" 1 (debole), 2 (normale) o 3 (forte), e la somma delle tre force deve essere ESATTAMENTE 6 (ESATTAMENTE 5 per chi ha una CARTA TRAPPOLA): chi ha più mosse dello stesso tipo le ha di forza diversa.
  - Le mosse che nascono da una CARTA TRAPPOLA sono goffe e deboli, e il nome lo fa capire.
  - Le prime 3 hanno anche "fx", un effetto secondario coerente con la mossa:
${FX_PROMPT}
  - La quarta ha "type": "super" ed è il suo superpotere, con "effect": "colpo" (danno devastante) oppure "cura" (se il superpotere è curativo o rigenerante: grande recupero di vita mentre para i colpi).
- "desperate": per ciascun combattente la MOSSA DISPERATA, il colpo della disperazione che si sblocca solo quando sta perdendo: {"name": max 4 parole, epico e ridicolo, "desc": max 12 parole}.
  - Gli attacchi nascono dall'arma, difese e cure dalla personalità e dal personaggio.
  - "name": max 4 parole, buffo e specifico per le sue carte (mai generico come "Pugno" o "Scudo"). "desc": cosa si vede succedere, max 12 parole, scenico e divertente. NON ripetere la regola o i numeri dell'effetto: quelli li mostra il gioco.
- "events": durante la rissa l'arena interverrà così:
${events}
  Per ciascuno, nell'ordine, scrivi la scena (1 frase, max 25 parole) che spiega PERCHÉ succede, usando oggetti, persone o eventi tipici di quest'arena.
Forma: {"title":"...","intro":"...","nicknames":["...","..."],"events":["...","..."],"moves":[[{"type":"attacco","force":3,"fx":"brucia","name":"...","desc":"..."},{"type":"attacco","force":1,"fx":"finta","name":"...","desc":"..."},{"type":"difesa","force":2,"fx":"stordisce","name":"...","desc":"..."},{"type":"super","effect":"colpo","name":"...","desc":"..."}],[...]],"desperate":[{"name":"...","desc":"..."},{"name":"...","desc":"..."}]}`
}

const FX_PROMPT = (Object.keys(FX_BY_TYPE) as (keyof typeof FX_BY_TYPE)[])
  .map((t) => `    - ${t}: ${FX_BY_TYPE[t].map((fx) => `"${fx}" (${FX_INFO[fx].rule})`).join('; ')}`)
  .join('\n')

/** Stato di un combattente all'inizio del round, in parole. */
function statusText(name: string, st: Status | undefined, rage: number, desperateUsed: boolean): string {
  const bits = [
    st?.burn ? 'in fiamme (perde vita)' : '',
    st?.charged ? 'carico (il prossimo colpo fa più male)' : '',
    st?.shield ? 'protetto da uno scudo' : '',
    st?.stunned ? 'stordito (non può difendersi)' : '',
    rage >= RAGE_MAX && !desperateUsed ? 'furioso: ha la mossa disperata pronta' : '',
  ].filter(Boolean)
  return bits.length ? `${name}: ${bits.join(', ')}.` : ''
}

const FORCE_WORD = { 1: 'debole', 2: 'normale', 3: 'forte' } as const
const label = (m: Move) =>
  m.type === 'super'
    ? `${MOVE_INFO.super.label}${m.effect === 'cura' ? ' curativo' : ''}${m.weak ? ', da carta trappola: funziona male' : ''}`
    : m.type === 'disperata'
      ? 'MOSSA DISPERATA: colpo enorme, nessuna difesa la ferma'
      : `${MOVE_INFO[m.type].label}, ${FORCE_WORD[m.force]}${m.fx ? `, effetto ${FX_INFO[m.fx].label.toLowerCase()}` : ''}`

export function roundPrompt(
  f: [Fighter, Fighter],
  arena: Card,
  opening: Opening,
  fs: FightState,
  log: string[],
  choices: [number, number],
  event?: ArenaEvent,
): string {
  const names: [string, string] = [f[0].monster.character.name, f[1].monster.character.name]
  const moves: [Move, Move] = [opening.moves[0][choices[0]], opening.moves[1][choices[1]]]
  const story = log.length ? log.map((s) => `- ${s}`).join('\n') : '- (è il primo round)'
  const states = ([0, 1] as const)
    .map((i) => statusText(names[i], fs.status?.[i], fs.rage?.[i] ?? 0, fs.desperateUsed?.[i] ?? false))
    .filter(Boolean)
    .join(' ')
  return `${setup(f, arena)}

TITOLO: "${opening.title}". FINORA:
${story}

ROUND ${fs.round + 1}. Punti vita: ${names[0]} ${fs.hp[0]}, ${names[1]} ${fs.hp[1]} (su 100).${
    heatOf(fs.round + 1) > 1 ? ' LA RISSA SI STA SCALDANDO: i colpi fanno molto più male, racconta un crescendo di furia.' : ''
  }${states ? `\nSTATO ATTUALE: ${states} Racconta anche questi effetti.` : ''}
MOSSE SCELTE IN SEGRETO, NELLO STESSO MOMENTO:
- ${names[0]} (COMBATTENTE 0): "${moves[0].name}" [${label(moves[0])}] ${moves[0].desc}
- ${names[1]} (COMBATTENTE 1): "${moves[1].name}" [${label(moves[1])}] ${moves[1].desc}
ESITO DI BASE SECONDO LE REGOLE: ${baseOutcome(names, moves)}${
    event ? `\nEVENTO DELL'ARENA IN QUESTO ROUND: ${EVENT_RULES[event.rule].title}. ${event.text} Regola: ${EVENT_RULES[event.rule].rule} Fallo pesare nel racconto.` : ''
  }

Il tuo compito, da giudice e da narratore:
- "efficacy": per ciascuno un numero da 0.8 a 1.25: quanto la sua mossa funziona davvero contro quella dell'altro, considerando carte, personalità, arena e momento. 1 = normale. Premia le mosse azzeccate e le combinazioni furbe, punisci quelle che si ritorcono contro. Non dare sempre 1, ma ricorda che le scelte dei giocatori contano più del tuo voto.
- "verdicts": per ciascuno il motivo del tuo voto, max 10 parole, secco e divertente (es. "la difesa di ragù non regge l'anguria", "colpire un tardigrado è inutile").
- "actions": per ciascuno 1-2 frasi su cosa fa con la sua mossa e come va a finire, coerenti con l'esito di base e con l'efficacia che hai dato (alta = effetto spettacolare, bassa = figuraccia).
  - Racconta SOLO la mossa scelta: chi non ha scelto il superpotere non lo usa, chi si difende non attacca.
  - Niente numeri di punti vita o di danni: quelli li mostra il gioco.
- "sfx": un'onomatopea da fumetto in maiuscolo per ciascuno, max 12 caratteri.
- "ko": OBBLIGATORIO, una lista di due frasi finali (2 frasi ciascuna): la prima da usare SE crolla il combattente 0, la seconda SE crolla il combattente 1. Il KO, spettacolare e legato alle mosse di questo round, e cosa succede dopo.
- "summary": 1 frase che riassume il round, per ricordarlo nei round successivi.
Forma: {"efficacy":[1.3,0.8],"verdicts":["...","..."],"actions":["...","..."],"sfx":["...","..."],"ko":["...","..."],"summary":"..."}`
}

class RateLimitError extends Error {
  /** Secondi suggeriti da Groq prima di riprovare. */
  retryAfter = Infinity
}

/** Se Groq chiede di aspettare poco, conviene aspettare invece di arrendersi. */
const MAX_WAIT_S = 6

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
    const body = await res.text()
    const msg = `Groq ${res.status} (${model}): ${body.slice(0, 300)}`
    if (res.status !== 429) throw new Error(msg)
    const err = new RateLimitError(msg)
    const hinted = Number(res.headers.get('retry-after') ?? body.match(/try again in ([\d.]+)s/)?.[1])
    if (Number.isFinite(hinted)) err.retryAfter = hinted
    throw err
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return JSON.parse(data.choices?.[0]?.message?.content ?? '') as Record<string, unknown>
}

async function askGroq(user: string, cfg: AiConfig): Promise<Record<string, unknown>> {
  const main = cfg.model || DEFAULT_MODEL
  try {
    try {
      return await askModel(user, cfg, main)
    } catch (e) {
      // Limite al minuto quasi libero: un attimo di pazienza e si riprova con lo stesso modello.
      if (e instanceof RateLimitError && e.retryAfter <= MAX_WAIT_S) {
        await new Promise((r) => setTimeout(r, e.retryAfter * 1000 + 250))
        return await askModel(user, cfg, main)
      }
      throw e
    }
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

export function generateOpening(
  fighters: [Fighter, Fighter],
  arena: Card,
  swap: boolean,
  schedule: { round: number; rule: EventRule }[],
  cfg: AiConfig,
): Promise<Opening> {
  return retry(async () => {
    const raw = await askGroq(openingPrompt(ordered(fighters, swap), arena, schedule), cfg)
    if (swap) flipPairs(raw, ['nicknames', 'moves', 'desperate'])
    return normalizeOpening(raw, fighters, 'ai', buildEvents(schedule, arena, raw.events))
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
  event: ArenaEvent | undefined,
  cfg: AiConfig,
): Promise<RoundTexts> {
  // Tutto ciò che è a coppie va girato come lo vede l'AI.
  const seen: Opening = swap ? { ...opening, nicknames: ordered(opening.nicknames, true), moves: ordered(opening.moves, true) } : opening
  const seenFs: FightState = swap
    ? { ...fs, hp: ordered(fs.hp, true), superUsed: ordered(fs.superUsed, true), lastType: ordered(fs.lastType, true) }
    : fs
  return retry(async () => {
    const raw = await askGroq(roundPrompt(ordered(fighters, swap), arena, seen, seenFs, log, ordered(choices, swap), event), cfg)
    if (swap) flipPairs(raw, ['efficacy', 'verdicts', 'actions', 'sfx', 'ko'])
    return normalizeRoundTexts(raw)
  })
}
