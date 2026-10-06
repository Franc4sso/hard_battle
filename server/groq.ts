import type { Card } from '../shared/cards'
import {
  hpAfter,
  normalizeEnding,
  normalizeOpening,
  tacticOf,
  type Ending,
  type Fighter,
  type Opening,
  type Side,
  type TacticId,
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

export const SYSTEM_PROMPT = `Sei il narratore di RISSA ASSURDA, un party game in cui due giocatori costruiscono un mostro assurdo ciascuno e li fanno combattere. Tu simuli la battaglia come una telecronaca da cartone animato: esagerata, surreale, velocissima, piena di trovate. Scrivi in italiano.

REGOLE DELLA SIMULAZIONE
- Ogni carta deve contare davvero:
  - il PERSONAGGIO combatte con le sue caratteristiche reali o tipiche (un bradipo è lento, Einstein ragiona, una nonna siciliana minaccia col cibo);
  - l'ARMA va usata in modi creativi e imprevisti, non solo per colpire;
  - la PERSONALITÀ guida scelte, errori e battute;
  - il SUPERPOTERE si usa una volta sola, nel momento decisivo. Rispetta anche il suo limite comico.
- Le carte si combinano tra loro: l'arma di uno può interagire col potere dell'altro, una personalità può far fallire un piano. Cerca le combinazioni più divertenti. L'arena partecipa: oggetti, persone ed eventi del luogo entrano nella rissa.
- Il vincitore NON è il più forte sulla carta: vince chi sfrutta meglio la propria combinazione, in modo sorprendente ma logico. Un piccione può battere Zeus. Nessun pareggio.
- Ogni round: "attacker" (0 o 1) attacca e infligge "damage" all'altro. "action": la mossa dell'attaccante, 1-2 frasi concrete e visive, se possibile con una battuta tra virgolette. "reaction": la risposta dell'altro, 1 frase (battuta, contromossa o figuraccia). Vietate le frasi generiche come "si scontrano con forza" o "un colpo potente".
- Chiama sempre i combattenti con il nome del personaggio, non con il nome del giocatore.
- "sfx": un'onomatopea da fumetto in maiuscolo, massimo 12 caratteri, diversa a ogni round.
- Le battute devono far ridere davvero e avere senso nel contesto: meglio una frase in meno che una battuta senza logica. Giochi di parole sulle carte sono benvenuti.
- Comicità slapstick da cartone, adatta a tutti: niente sangue, niente sesso, niente parolacce, niente insulti a gruppi di persone.
- Rispondi SOLO con un oggetto JSON valido, nella forma richiesta.`

const ROUND_SHAPE = '{"attacker":0,"action":"...","reaction":"...","sfx":"SBAM!","damage":20,"power":false,"twist":false}'

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

PRIMA PARTE DELLA RISSA. Scrivi il titolo, la presentazione e i PRIMI 2 ROUND (uno a testa, nell'ordine che preferisci).
- Nessuno va KO e nessuno usa ancora il superpotere ("power": false). "damage" tra 5 e 30.
- Il round 2 deve chiudersi con una situazione di tensione o di stallo: subito dopo i giocatori sceglieranno di nascosto una tattica.
- "title": il titolo dell'incontro come un film, max 50 caratteri. "intro": il presentatore apre l'incontro descrivendo l'arena, 1-2 frasi.
Forma: {"title":"...","intro":"...","rounds":[${ROUND_SHAPE}]}`
}

export function endingPrompt(f: [Fighter, Fighter], arena: Card, opening: Opening, tactics: [TacticId, TacticId], count: number): string {
  const story = opening.rounds
    .map((r, i) => `Round ${i + 1}: attacca ${f[r.attacker].monster.character.name}. ${r.action} ${r.reaction}`)
    .join('\n')
  const hp = hpAfter(opening)
  const t = tactics.map(tacticOf)
  return `${setup(f, arena)}

FINORA (titolo: "${opening.title}"):
${story}
Punti vita attuali: ${f[0].monster.character.name} ${hp[0]}, ${f[1].monster.character.name} ${hp[1]}.

TATTICHE SEGRETE scelte dai giocatori:
- ${f[0].monster.character.name} (COMBATTENTE 0): ${t[0].name}. ${t[0].desc}
- ${f[1].monster.character.name} (COMBATTENTE 1): ${t[1].name}. ${t[1].desc}
Regole: Attacco totale batte Trucco sporco, Trucco sporco batte Difesa di ferro, Difesa di ferro batte Attacco totale; stessa tattica = scontro alla pari. Chi vince lo scontro di tattiche ottiene un grosso vantaggio nel round successivo, ma il vincitore finale dipende da tutta la storia e dalle carte.

SECONDA PARTE DELLA RISSA. Scrivi:
- "clash": 1-2 frasi spettacolari su come si scontrano le due tattiche.
- ESATTAMENTE ${count} ROUND FINALI: ognuno usa il proprio superpotere al massimo una volta ("power": true), almeno un colpo di scena con l'arena ("twist": true), l'ultimo round è il KO sferrato dal vincitore. "damage" tra 10 e 40.
- Suspense: il vincitore non deve essere prevedibile. Alterna i vantaggi e, spesso, fai rimontare chi vince: può essere in svantaggio di punti vita fino al penultimo round.
- "finale": il KO e cosa succede dopo, 2 frasi. "reason": perché ha vinto, 1 frase. "mvp": la mossa migliore DEL VINCITORE, max 8 parole.
- "nicknames": un soprannome epico e buffo per ciascun combattente, nell'ordine 0 e 1, max 4 parole (es. "Il Flagello di IKEA").
Forma: {"clash":"...","rounds":[${ROUND_SHAPE}],"finale":"...","winner":0,"reason":"...","mvp":"...","nicknames":["...","..."]}`
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

class RateLimitError extends Error {}

async function askModel(user: string, cfg: AiConfig, model: string): Promise<Record<string, unknown>> {
  const doFetch = cfg.fetch ?? fetch
  // I gpt-oss ragionano prima di rispondere: più ragionamento = battaglia più curata ma più lenta.
  const reasoning = model.startsWith('openai/gpt-oss') ? { reasoning_effort: cfg.reasoning || 'low' } : {}
  const res = await doFetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      ...reasoning,
      temperature: 1,
      max_tokens: 3000,
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
 * chi è scritto per primo): `swap` dice se l'AI li vede invertiti. Le risposte
 * vengono rimesse nell'ordine dell'app prima di normalizzarle.
 */
const flip = (s: unknown): unknown => (s === 0 || s === 1 || s === '0' || s === '1' ? 1 - Number(s) : s)
const ordered = <T>(pair: [T, T], swap: boolean): [T, T] => (swap ? [pair[1], pair[0]] : pair)

function unswapRounds(raw: Record<string, unknown>) {
  if (Array.isArray(raw.rounds))
    raw.rounds = raw.rounds.map((r) => (r && typeof r === 'object' ? { ...r, attacker: flip((r as Record<string, unknown>).attacker) } : r))
}

export function generateOpening(fighters: [Fighter, Fighter], arena: Card, swap: boolean, cfg: AiConfig): Promise<Opening> {
  return retry(async () => {
    const raw = await askGroq(openingPrompt(ordered(fighters, swap), arena), cfg)
    if (swap) unswapRounds(raw)
    return normalizeOpening(raw, 'ai')
  })
}

export function generateEnding(
  fighters: [Fighter, Fighter],
  arena: Card,
  swap: boolean,
  opening: Opening,
  tactics: [TacticId, TacticId],
  count: number,
  cfg: AiConfig,
): Promise<Ending> {
  // La prima parte è salvata nell'ordine dell'app: per il prompt va girata come la vede l'AI.
  const seen: Opening = swap ? { ...opening, rounds: opening.rounds.map((r) => ({ ...r, attacker: (1 - r.attacker) as Side, hp: [r.hp[1], r.hp[0]] })) } : opening
  return retry(async () => {
    const raw = await askGroq(endingPrompt(ordered(fighters, swap), arena, seen, ordered(tactics, swap), count), cfg)
    if (swap) {
      unswapRounds(raw)
      raw.winner = flip(raw.winner)
      if (Array.isArray(raw.nicknames)) raw.nicknames = [raw.nicknames[1], raw.nicknames[0]]
    }
    return normalizeEnding(raw, hpAfter(opening), 'ai')
  })
}
