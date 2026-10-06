import type { Card } from '../shared/cards'
import { normalizeBattle, type Battle, type Fighter } from '../shared/battle'

export interface AiConfig {
  apiKey: string
  model?: string
  /** low | medium | high, solo per i modelli che ragionano. */
  reasoning?: string
  fetch?: typeof fetch
  /** Per i test: decide se invertire l'ordine dei combattenti. */
  rand?: () => number
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const DEFAULT_MODEL = 'openai/gpt-oss-120b'

export const SYSTEM_PROMPT = `Sei il narratore di RISSA ASSURDA, un party game in cui due giocatori costruiscono un mostro assurdo ciascuno e li fanno combattere. Tu simuli la battaglia come una telecronaca da cartone animato: esagerata, surreale, velocissima, piena di trovate. Scrivi in italiano.

REGOLE DELLA SIMULAZIONE
- Da 4 a 6 round. In ogni round attacca un combattente ("attacker": 0 o 1) e infligge "damage" (da 5 a 40) all'altro. Entrambi partono da 100 punti vita. L'ultimo round è il KO: lo sferra il vincitore.
- Ogni carta deve contare davvero:
  - il PERSONAGGIO combatte con le sue caratteristiche reali o tipiche (un bradipo è lento, Einstein ragiona, una nonna siciliana minaccia col cibo);
  - l'ARMA va usata in modi creativi e imprevisti, non solo per colpire;
  - la PERSONALITÀ guida scelte, errori e battute;
  - il SUPERPOTERE si usa una volta sola, nel momento decisivo, con un round che ha "power": true. Rispetta anche il suo limite comico.
- Almeno un colpo di scena con "twist": true, che sfrutta l'arena: oggetti, persone o eventi del luogo entrano nella rissa.
- Le carte si combinano tra loro: l'arma di uno può interagire col potere dell'altro, una personalità può far fallire un piano. Cerca le combinazioni più divertenti.
- Il vincitore NON è il più forte sulla carta. Vince chi sfrutta meglio la propria combinazione, in modo sorprendente ma logico. Un piccione può battere Zeus se la sua combinazione è più furba. Nessun pareggio.
- "action": la mossa dell'attaccante, 1-2 frasi concrete e visive, se possibile con una battuta tra virgolette. "reaction": la risposta dell'altro, 1 frase (battuta, contromossa o figuraccia). Vietate le frasi generiche come "si scontrano con forza" o "un colpo potente".
- Chiama sempre i combattenti con il nome del personaggio, non con il nome del giocatore.
- "sfx": un'onomatopea da fumetto in maiuscolo, massimo 12 caratteri, diversa a ogni round.
- Le battute devono far ridere davvero e avere senso nel contesto: meglio una frase in meno che una battuta senza logica. Giochi di parole sulle carte sono benvenuti.
- Comicità slapstick da cartone, adatta a tutti: niente sangue, niente sesso, niente parolacce, niente insulti a gruppi di persone.
- "title": il titolo dell'incontro come un film, max 50 caratteri. "intro": il presentatore apre l'incontro descrivendo l'arena, 1-2 frasi. "finale": il KO e cosa succede dopo, 2 frasi. "reason": perché ha vinto, 1 frase. "mvp": la mossa migliore, max 8 parole.

Rispondi SOLO con un oggetto JSON valido, con questa forma esatta:
{"title":"...","intro":"...","rounds":[{"attacker":0,"action":"...","reaction":"...","sfx":"SBAM!","damage":20,"power":false,"twist":false}],"finale":"...","winner":0,"reason":"...","mvp":"..."}`

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

export function userPrompt(fighters: [Fighter, Fighter], arena: Card): string {
  return `ARENA: ${arena.name}. ${arena.desc}\n\n${describe(fighters[0], 0)}\n\n${describe(fighters[1], 1)}\n\nSimula la rissa.`
}

/**
 * Chiede la battaglia a Groq. L'ordine dei combattenti viene mescolato a caso
 * (i modelli tendono a favorire chi è scritto per primo) e poi rimesso a posto.
 */
export async function generateBattle(fighters: [Fighter, Fighter], arena: Card, cfg: AiConfig): Promise<Battle> {
  const doFetch = cfg.fetch ?? fetch
  const model = cfg.model || DEFAULT_MODEL
  // I gpt-oss ragionano prima di rispondere: più ragionamento = battaglia più curata ma più lenta
  // (medium ≈ 15 s, oltre il limite di 10 s delle funzioni Netlify gratuite; low ≈ 4 s).
  const reasoning = model.startsWith('openai/gpt-oss') ? { reasoning_effort: cfg.reasoning || 'low' } : {}
  const swap = (cfg.rand ?? Math.random)() < 0.5
  const ordered: [Fighter, Fighter] = swap ? [fighters[1], fighters[0]] : fighters
  const unswap = (s: unknown): unknown => (swap && (s === 0 || s === 1 || s === '0' || s === '1') ? 1 - Number(s) : s)

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model,
          ...reasoning,
          temperature: 1,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt(ordered, arena) },
          ],
        }),
      })
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const raw = JSON.parse(data.choices?.[0]?.message?.content ?? '') as Record<string, unknown>
      raw.winner = unswap(raw.winner)
      if (Array.isArray(raw.rounds))
        raw.rounds = raw.rounds.map((r) => (r && typeof r === 'object' ? { ...r, attacker: unswap((r as Record<string, unknown>).attacker) } : r))
      const battle = normalizeBattle(raw, 'ai')
      if (battle) return battle
      lastError = new Error('Risposta AI non valida')
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}
