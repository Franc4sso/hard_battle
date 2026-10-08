import type { Card } from '../shared/cards'
import {
  ATTACKS_PER_FIGHTER,
  ATTACK_SOURCES,
  ATTACK_TONES,
  LAST_BREATH,
  MAX_HP,
  STAMPS,
  hpState,
  normalizeJudgement,
  normalizeOpening,
  offlineAttacks,
  sideOf,
  type AiRound,
  type ArenaEvent,
  type Attack,
  type FightState,
  type Fighter,
  type Opening,
} from '../shared/battle'

export interface AiConfig {
  apiKey: string
  /** C'è una carta del mazzo sporco sul ring: il narratore può essere volgare. */
  dirty?: boolean
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

export const SYSTEM_PROMPT = `Sei il narratore e il GIUDICE di RISSA ASSURDA, un party game: due giocatori costruiscono un mostro assurdo ciascuno e lo fanno combattere. Prima della rissa ognuno ha scelto IN SEGRETO 2 attacchi del suo mostro. Poi la rissa va da sola, round dopo round: a ogni round decidi tu quale dei suoi 2 attacchi usa ciascuno, le due azioni avvengono NELLO STESSO ISTANTE, tu racconti cosa succede e decidi chi ha la meglio. Scrivi in italiano.

COME GIUDICI, in quest'ordine di importanza
1. Come si incrociano i due attacchi. Ragiona con la fisica da cartone animato: chi arriva prima, chi resta scoperto, cosa blocca cosa, cosa si ritorce contro chi. Un trucco, una finta o un'attesa puniscono chi carica a testa bassa. Un attacco diretto travolge chi perde tempo (preparativi, pause, chiacchiere, idee lente). Un'idea pazza spiazza chi sta aspettando la mossa prevedibile. L'acqua spegne il fuoco, l'elettricità nell'acqua fa male a chi è bagnato, il grosso schiaccia il piccolo ma il piccolo è più veloce, e così via.
2. Coerenza col mostro: un attacco che sfrutta bene personaggio, arma, personalità o superpotere funziona meglio. Una CARTA TRAPPOLA è un difetto vero: gli attacchi che la usano rischiano di fallire.
3. La situazione: chi è all'ultimo respiro e tenta il tutto per tutto può ribaltare la rissa, un colpo su chi barcolla è pericolosissimo. L'arena e i suoi eventi partecipano.
4. Creatività: un'idea geniale e divertente vale più di una banale.
Sei imparziale: l'ordine in cui ti presento i combattenti non conta. Non far vincere sempre lo stesso: la rissa deve avere alti e bassi, rimonte e sorprese.

STILE
- Telecronaca da cartone animato: esagerata, surreale, visiva, con battute che fanno ridere davvero e hanno senso nel contesto.
- Chiama i combattenti con il nome del personaggio, mai con il nome del giocatore.
- Niente numeri di vita o di danni: il gioco non li mostra.
- {TONO}
- Rispondi SOLO con un oggetto JSON valido, nella forma richiesta.`

const CLEAN_TONE = 'Comicità slapstick per tutti: niente sangue, niente sesso, niente parolacce, niente insulti a gruppi di persone.'
const DIRTY_TONE =
  'Comicità SPORCA da bar tra adulti: parolacce, volgarità, doppi sensi, sesso, scoregge, vomito e fluidi corporei sono benvenuti e fanno ridere. I potenti e i dittatori sul ring si prendono in giro e perdono in modo ridicolo e umiliante. Resta fuori solo una cosa: insulti o battute contro gruppi di persone (etnia, religione, disabilità, orientamento). Niente sangue vero: è un cartone animato, anche se sboccato.'

/** Il prompt di sistema: pulito di default, sboccato se sul ring c'è una carta del mazzo sporco. */
export const systemPrompt = (dirty = false) => SYSTEM_PROMPT.replace('{TONO}', dirty ? DIRTY_TONE : CLEAN_TONE)

const TRAP = ' [CARTA TRAPPOLA imposta dall’avversario: è uno svantaggio vero]'

function describe(f: Fighter, i: number): string {
  const m = f.monster
  const t = (c: { cursed?: true }) => (c.cursed ? TRAP : '')
  return [
    `COMBATTENTE ${i}: ${m.character.name}`,
    `- Personaggio: ${m.character.name}. ${m.character.desc}`,
    `- Arma: ${m.weapon.name}. ${m.weapon.desc}${t(m.weapon)}`,
    `- Personalità: ${m.personality.name}. ${m.personality.desc}${t(m.personality)}`,
    `- Superpotere: ${m.power.name}. ${m.power.desc}${t(m.power)}`,
  ].join('\n')
}

const setup = (f: [Fighter, Fighter], arena: Card) => `ARENA: ${arena.name}. ${arena.desc}\n\n${describe(f[0], 0)}\n\n${describe(f[1], 1)}`

export function openingPrompt(f: [Fighter, Fighter], arena: Card, eventRounds: number[]): string {
  const sources = ATTACK_SOURCES.map((s, i) => `${i + 1}. da ${s} (tipo "${ATTACK_TONES[i]}")`).join('; ')
  return `${setup(f, arena)}

PRESENTAZIONE DELLA RISSA. Scrivi:
- "title": il titolo dell'incontro come un film, max 50 caratteri.
- "intro": il presentatore apre l'incontro descrivendo l'arena, 1-2 frasi.
- "nicknames": un soprannome epico e buffo per ciascun combattente, nell'ordine 0 e 1, max 4 parole (es. "Il Flagello di IKEA").
- "events": l'arena interverrà con un colpo di scena ai round ${eventRounds.join(' e ')}. Per ciascuno, nell'ordine, 1 frase (max 25 parole) che racconta cosa succede, usando oggetti, persone o fenomeni tipici di quest'arena. Deve cambiare la situazione per entrambi (es. il pavimento diventa scivoloso, piove dal soffitto, entra un animale).
- "attacks": per ciascun combattente, nell'ordine 0 e 1, ESATTAMENTE ${ATTACKS_PER_FIGHTER} attacchi, in quest'ordine: ${sources}.
  Ogni attacco ha "name" (un nome da urlare, max 4 parole, divertente, es. "Ciabattata Transoceanica") e "text" (cosa fa: una frase di max 16 parole, al presente, senza soggetto, azione concreta e visiva contro l'avversario). I 5 attacchi devono essere davvero diversi tra loro e nessuno deve sembrare il più forte: i giocatori li scelgono a sentimento. "tone" è il tipo indicato.
  Forma di ogni attacco: {"name":"...","text":"...","tone":"aggressiva"}.
Forma: {"title":"...","intro":"...","nicknames":["...","..."],"events":["...","..."],"attacks":[[{"name":"...","text":"...","tone":"aggressiva"},…5…],[…5…]]}`
}

const attackLine = (a: Attack, k: number) => `  ${k}. «${a.name}»: ${a.text}`

export function roundPrompt(
  f: [Fighter, Fighter],
  arena: Card,
  opening: Pick<Opening, 'title'>,
  fs: FightState,
  log: string[],
  /** I 2 attacchi scelti da ciascuno. */
  attacks: [[Attack, Attack], [Attack, Attack]],
  event?: ArenaEvent,
  /** Il round prima c'è stato un colpo di scena: questo no. */
  lastTwist = false,
): string {
  const names: [string, string] = [f[0].monster.character.name, f[1].monster.character.name]
  const story = log.length ? log.map((s) => `- ${s}`).join('\n') : '- (è il primo round)'
  const life = ([0, 1] as const).map((i) => `${names[i]} ${fs.hp[i]}/${MAX_HP} (${hpState(fs.hp[i]).label.toLowerCase()})`).join(', ')
  const lastBreath = ([0, 1] as const).filter((i) => fs.hp[i] <= LAST_BREATH).map((i) => names[i])
  const picks = ([0, 1] as const).map((i) => `${names[i]} (COMBATTENTE ${i}) ha scelto:\n${attacks[i].map(attackLine).join('\n')}`).join('\n')
  return `${setup(f, arena)}

TITOLO: "${opening.title}". FINORA:
${story}

ROUND ${fs.round + 1}. Vita all'inizio del round (segreta, non citare numeri): ${life}. Sotto ${LAST_BREATH} si è all'ultimo respiro.${
    lastBreath.length ? ` ${lastBreath.join(' e ')} è all'ultimo respiro: se l'avversario ha la meglio è il colpo finale, se invece ha la meglio chi è a terra è una rimonta da raccontare in grande.` : ''
  }${event ? `\nL'ARENA INTERVIENE IN QUESTO ROUND: ${event.text} Fallo pesare nella scena, per entrambi.` : ''}

GLI ATTACCHI A DISPOSIZIONE (ognuno ne ha 2, scelti prima della rissa):
${picks}

Il tuo compito, da regista, giudice e narratore. Prima decidi quale dei suoi 2 attacchi usa ciascuno in questo round: alterna, non ripetere sempre lo stesso, e scegli quello che ha più senso in questa situazione (vita, arena, quello che è appena successo). Poi immagina la scena istante per istante: cosa fa ciascuno, dove si incrociano gli attacchi, chi arriva prima, cosa va storto. Poi scrivi:
- "used": per ciascun combattente, nell'ordine 0 e 1, l'indice dell'attacco usato: 0 o 1.
- "twist": ${lastTwist ? 'in questo round NIENTE colpo di scena: scrivi null.' : 'ogni tanto (non a ogni round) un COLPO DI SCENA legato alle carte dei personaggi, non all\'arena: un difetto, una mania o un dettaglio delle loro descrizioni che irrompe nella rissa (es. il koala insonne crolla dal sonno a metà rincorsa, il permaloso si offende per uno sguardo). 1 frase, max 30 parole, e deve entrare nella scena. Altrimenti null.'}
- "scene": la scena, 3-5 frasi. Prima cosa fa ciascuno, poi come si scontrano i due attacchi, poi l'esito concreto (chi vola dove, chi resta in piedi, in che stato). Chi legge deve capire esattamente cosa è successo e perché. Racconta solo gli attacchi usati.
- "hits": quanto forte viene colpito ciascuno, nell'ordine 0 e 1: 0 niente, 1 di striscio, 2 colpo pieno, 3 devastante (solo se colto del tutto scoperto, o per un'idea eccellente). Possono essere colpiti entrambi.
- "recover": quanto si rimette in sesto ciascuno, da 0 a 2: più di 0 solo se il suo attacco serviva a riprendersi e nessuno l'ha interrotto.
- "winner": 0 o 1, chi ha la meglio nel round, oppure null se è davvero pari. Deve combaciare con "hits": chi ha la meglio è colpito meno.
- "why": IL GIUDICE spiega in 1-2 frasi chi ha la meglio e PERCHÉ, nominando il dettaglio decisivo (es. "Ha la meglio lo Squalo: il Nonno ha caricato a testa bassa proprio dentro la trappola di candeggina").
- "stamps": il timbro per ciascun attacco usato, uno tra ${STAMPS.join(', ')}.
- "sfx": l'onomatopea più forte del round, in maiuscolo, max 14 caratteri.
- "ko": due frasi finali spettacolari legate a questo round: la prima da usare SE crolla il combattente 0, la seconda SE crolla l'1.
- "summary": 1 frase che ricordi il round nei prossimi, con il nome degli attacchi usati.
Forma: {"used":[0,1],"twist":null,"scene":"...","hits":[1,2],"recover":[0,0],"winner":0,"why":"...","stamps":["FURBA","MAH"],"sfx":"...","ko":["...","..."],"summary":"..."}`
}

class RateLimitError extends Error {
  /** Secondi suggeriti da Groq prima di riprovare. */
  retryAfter = Infinity
}

/** Se Groq chiede di aspettare poco, conviene aspettare invece di arrendersi. */
// Le funzioni Netlify gratuite si fermano a 10 s: attesa + chiamata devono starci dentro.
const MAX_WAIT_S = 4

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
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(cfg.dirty) },
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

export function generateOpening(fighters: [Fighter, Fighter], arena: Card, swap: boolean, eventRounds: number[], cfg: AiConfig): Promise<Opening> {
  return retry(async () => {
    const raw = await askGroq(openingPrompt(ordered(fighters, swap), arena, eventRounds), cfg)
    if (swap) flipPairs(raw, ['nicknames', 'attacks'])
    const texts = Array.isArray(raw.events) ? raw.events : []
    const events = eventRounds.map((round, i) => {
      const x = texts[i] as Record<string, unknown> | string | undefined
      return { round, text: (typeof x === 'string' ? x : typeof x?.text === 'string' ? x.text : '').trim() }
    })
    const fallback = offlineEventText(arena)
    return normalizeOpening(
      raw,
      fighters,
      'ai',
      events.map((e, i) => ({ ...e, text: e.text || fallback[i % fallback.length] })),
      [offlineAttacks(fighters, 0), offlineAttacks(fighters, 1)],
    )
  })
}

function offlineEventText(arena: Card): string[] {
  const where = arena.name.charAt(0).toLowerCase() + arena.name.slice(1)
  return [
    `Colpo di scena a ${where}: tutto inizia a tremare e i due perdono l’equilibrio.`,
    `Il pubblico di ${where} impazzisce e comincia a lanciare oggetti nella mischia.`,
  ]
}

export function generateRound(
  fighters: [Fighter, Fighter],
  arena: Card,
  swap: boolean,
  opening: Pick<Opening, 'title'>,
  fs: FightState,
  log: string[],
  attacks: [[Attack, Attack], [Attack, Attack]],
  event: ArenaEvent | undefined,
  cfg: AiConfig,
  lastTwist = false,
): Promise<AiRound> {
  // Tutto ciò che è a coppie va girato come lo vede l'AI.
  const seenFs: FightState = { ...fs, hp: ordered(fs.hp, swap) }
  return retry(async () => {
    const raw = await askGroq(roundPrompt(ordered(fighters, swap), arena, opening, seenFs, log, ordered(attacks, swap), event, lastTwist), cfg)
    if (swap) {
      flipPairs(raw, ['used', 'hits', 'recover', 'stamps', 'ko'])
      const w = sideOf(raw.winner)
      raw.winner = w === null ? null : 1 - w
    }
    return normalizeJudgement(raw)
  })
}
