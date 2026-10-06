import type { Card } from './cards'

export type Side = 0 | 1

export interface Monster {
  character: Card
  weapon: Card
  personality: Card
  power: Card
}

export interface Fighter {
  player: string
  monster: Monster
}

/** Quello che il telefono manda al server all'inizio: solo nomi e id delle carte. */
export interface BattleRequest {
  arena: string
  fighters: [FighterIds, FighterIds]
}

export interface FighterIds {
  player: string
  character: string
  weapon: string
  personality: string
  power: string
}

// ---------- mosse ----------

export type MoveType = 'attacco' | 'difesa' | 'cura' | 'super'

/** Ogni mostro ha una mossa per tipo, in quest'ordine. */
export const MOVE_ORDER: readonly MoveType[] = ['attacco', 'difesa', 'cura', 'super']

export const MOVE_INFO: Record<MoveType, { label: string; rule: string }> = {
  attacco: { label: 'Attacco', rule: 'Danni pieni. Contro una difesa fa poco e subisce il contrattacco.' },
  difesa: { label: 'Difesa', rule: 'Para quasi tutto e contrattacca. Se l’altro non attacca è sprecata.' },
  cura: { label: 'Cura', rule: 'Recupera vita. Non due round di fila.' },
  super: { label: 'Superpotere', rule: 'Colpo devastante, passa anche la difesa. Una volta sola.' },
}

export interface Move {
  name: string
  desc: string
  type: MoveType
}

/** Presentazione della rissa: generata mentre si guarda il VS. */
export interface Opening {
  title: string
  intro: string
  nicknames: [string, string]
  moves: [Move[], Move[]]
  source: 'ai' | 'offline'
}

// ---------- regole ----------

export const MAX_HP = 100
/** Se nessuno crolla entro questo round, decide la giuria. */
export const MAX_ROUNDS = 8

const ATTACK = 26
const SUPER = 44
const HEAL = 12
const COUNTER = 10
/** Quota del colpo che passa una difesa. */
const BLOCK = { attacco: 0.25, super: 0.5 } as const

/** Più la rissa va avanti più si scalda: i colpi (non le cure) fanno sempre più male. */
export function heatOf(roundNo: number): number {
  return roundNo <= 3 ? 1 : roundNo <= 5 ? 1.5 : 2
}

export interface FightState {
  hp: [number, number]
  superUsed: [boolean, boolean]
  lastType: [MoveType | null, MoveType | null]
  /** Round giocati. */
  round: number
}

export const START: FightState = { hp: [MAX_HP, MAX_HP], superUsed: [false, false], lastType: [null, null], round: 0 }

/** Perché una mossa non si può usare adesso (undefined = si può). */
export function blockedReason(fs: FightState, side: Side, type: MoveType): string | undefined {
  if (type === 'super' && fs.superUsed[side]) return 'Già usato'
  if (type === 'cura' && fs.lastType[side] === 'cura') return 'Non due volte di fila'
  return undefined
}

/**
 * Variazione dei punti vita di un round, dalle due mosse scelte insieme.
 * `eff` è il giudizio dell'AI (0.6–1.5): quanto ogni mossa è azzeccata.
 */
export function roundDelta(types: [MoveType, MoveType], eff: [number, number], rand: () => number, heat = 1): [number, number] {
  const jitter = () => 0.85 + rand() * 0.3
  const delta: [number, number] = [0, 0]
  for (const me of [0, 1] as Side[]) {
    const foe: Side = me === 0 ? 1 : 0
    const t = types[me]
    const ft = types[foe]
    // colpo dell'avversario
    let incoming = ft === 'attacco' ? ATTACK : ft === 'super' ? SUPER : 0
    incoming *= eff[foe] * jitter() * heat
    if (t === 'difesa' && (ft === 'attacco' || ft === 'super')) incoming *= BLOCK[ft]
    // contrattacco di chi si difende da un attacco normale
    const counter = ft === 'difesa' && t === 'attacco' ? COUNTER * eff[foe] * jitter() * heat : 0
    const heal = t === 'cura' ? HEAL * eff[me] * jitter() : 0
    delta[me] = Math.round(heal - incoming - counter)
  }
  return delta
}

/** Come vanno le due mosse secondo le regole, in parole (per il prompt). */
export function baseOutcome(names: [string, string], types: [MoveType, MoveType]): string {
  const [a, b] = names
  const key = `${types[0]}-${types[1]}`
  const flip = `${types[1]}-${types[0]}`
  const pairs: Record<string, (x: string, y: string) => string> = {
    'attacco-attacco': (x, y) => `${x} e ${y} si colpiscono a vicenda: danni per entrambi.`,
    'attacco-difesa': (x, y) => `${y} para quasi tutto il colpo di ${x} e lo contrattacca.`,
    'attacco-cura': (x, y) => `${y} si cura ma intanto incassa in pieno il colpo di ${x}.`,
    'attacco-super': (x, y) => `${x} attacca, ma ${y} scatena il superpotere: colpo devastante per ${x}.`,
    'difesa-difesa': (x, y) => `${x} e ${y} si mettono entrambi in guardia: stallo, nessun danno.`,
    'difesa-cura': (x, y) => `${x} si difende dal nulla mentre ${y} si cura indisturbato.`,
    'difesa-super': (x, y) => `${x} si difende, ma il superpotere di ${y} sfonda parte della difesa.`,
    'cura-cura': (x, y) => `${x} e ${y} si prendono una pausa per curarsi entrambi.`,
    'cura-super': (x, y) => `${x} prova a curarsi mentre ${y} lo travolge con il superpotere.`,
    'super-super': (x, y) => `${x} e ${y} scatenano insieme i superpoteri: impatto devastante per entrambi.`,
  }
  if (pairs[key]) return pairs[key](a, b)
  return pairs[flip](b, a)
}

/** Testi di un round: dall'AI o dal narratore di riserva. */
export interface RoundTexts {
  efficacy: [number, number]
  actions: [string, string]
  sfx: [string, string]
  /** Frase finale da usare se quel combattente crolla in questo round. */
  ko: [string, string]
  summary: string
}

export interface RoundEnd {
  winner: Side
  byJury: boolean
  finale: string
}

export interface RoundResult {
  choices: [number, number]
  types: [MoveType, MoveType]
  efficacy: [number, number]
  actions: [string, string]
  sfx: [string, string]
  delta: [number, number]
  hp: [number, number]
  summary: string
  end: RoundEnd | null
}

/** Applica un round: punti vita, mosse usate, KO o verdetto della giuria. */
export function playRound(
  fs: FightState,
  choices: [number, number],
  types: [MoveType, MoveType],
  texts: RoundTexts,
  names: [string, string],
  rand: () => number,
): { round: RoundResult; next: FightState } {
  const roundNo = fs.round + 1
  const delta = roundDelta(types, texts.efficacy, rand, heatOf(roundNo))
  const raw: [number, number] = [fs.hp[0] + delta[0], fs.hp[1] + delta[1]]
  const hp: [number, number] = [Math.min(MAX_HP, Math.max(0, raw[0])), Math.min(MAX_HP, Math.max(0, raw[1]))]
  let end: RoundEnd | null = null
  const better = (): Side => (raw[0] === raw[1] ? (rand() < 0.5 ? 0 : 1) : raw[0] > raw[1] ? 0 : 1)

  if (hp[0] <= 0 || hp[1] <= 0) {
    // Se crollano entrambi resta in piedi chi è messo meno peggio.
    const winner = hp[0] > 0 ? 0 : hp[1] > 0 ? 1 : better()
    const loser: Side = winner === 0 ? 1 : 0
    hp[loser] = 0
    hp[winner] = Math.max(1, hp[winner])
    end = { winner, byJury: false, finale: texts.ko[loser] || `${names[loser]} crolla al tappeto. ${names[winner]} esulta!` }
  } else if (roundNo >= MAX_ROUNDS) {
    const winner = better()
    end = {
      winner,
      byJury: true,
      finale: `Dopo ${MAX_ROUNDS} round nessuno crolla. La giuria, sfinita, assegna la vittoria a ${names[winner]} ai punti.`,
    }
  }

  return {
    round: { choices, types, efficacy: texts.efficacy, actions: texts.actions, sfx: texts.sfx, delta, hp, summary: texts.summary, end },
    next: {
      hp,
      superUsed: [fs.superUsed[0] || types[0] === 'super', fs.superUsed[1] || types[1] === 'super'],
      lastType: types,
      round: roundNo,
    },
  }
}

/** La mossa migliore del vincitore: quella che ha fatto più male. */
export function mvpOf(rounds: RoundResult[], winner: Side, opening: Opening): string {
  const loser: Side = winner === 0 ? 1 : 0
  let best: RoundResult | undefined
  for (const r of rounds) if (!best || r.delta[loser] < best.delta[loser]) best = r
  return best ? opening.moves[winner][best.choices[winner]].name : ''
}

// ---------- validazione delle risposte dell'AI ----------

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** Una coppia di valori: lista [a, b] o, se l'AI fa di testa sua, oggetto {"0": a, "1": b}. */
function pair(v: unknown): [unknown, unknown] {
  if (Array.isArray(v)) return [v[0], v[1]]
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return [o['0'] ?? o.a, o['1'] ?? o.b]
  }
  return [undefined, undefined]
}

/** Mosse di riserva costruite dalle carte, se l'AI non le dà (o non è raggiungibile). */
export function fallbackMoves(f: Fighter): Move[] {
  const m = f.monster
  return [
    { type: 'attacco', name: `Colpo di ${lower(m.weapon.name)}`, desc: m.weapon.desc },
    { type: 'difesa', name: 'Guardia alta', desc: `Si ripara, ${lower(m.personality.name)} com’è.` },
    { type: 'cura', name: 'Pausa merenda', desc: 'Un panino, un sorso d’acqua, si riparte.' },
    { type: 'super', name: m.power.name, desc: m.power.desc },
  ]
}

export function normalizeOpening(raw: unknown, fighters: [Fighter, Fighter], source: Opening['source']): Opening | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = text(r.title, 80)
  if (!title) return null
  const rawMoves = pair(r.moves)
  const moves = fighters.map((f, i) => {
    const list = Array.isArray(rawMoves[i]) ? (rawMoves[i] as unknown[]) : []
    const backup = fallbackMoves(f)
    // Il tipo lo decide la posizione: una mossa per tipo, sempre.
    return MOVE_ORDER.map((type, k) => {
      const m = (list[k] ?? {}) as Record<string, unknown>
      return { type, name: text(m.name, 40) || backup[k].name, desc: text(m.desc, 140) || backup[k].desc }
    })
  }) as [Move[], Move[]]
  const nick = pair(r.nicknames)
  return {
    title,
    intro: text(r.intro, 400),
    nicknames: [text(nick[0], 40) || fighters[0].monster.character.name, text(nick[1], 40) || fighters[1].monster.character.name],
    moves,
    source,
  }
}

export function normalizeRoundTexts(raw: unknown): RoundTexts | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const actions = pair(r.actions).map((a) => text(a, 400)) as [string, string]
  if (!actions[0] || !actions[1]) return null
  const eff = pair(r.efficacy).map((e) => {
    const n = Number(e)
    return Number.isFinite(n) ? Math.round(Math.min(1.5, Math.max(0.6, n)) * 100) / 100 : 1
  }) as [number, number]
  const sfx = pair(r.sfx).map((s, i) => text(s, 14).toUpperCase() || ['SBAM!', 'KRAK!'][i]) as [string, string]
  return { efficacy: eff, actions, sfx, ko: pair(r.ko).map((k) => text(k, 400)) as [string, string], summary: text(r.summary, 200) }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const EPITHETS = ['il Terribile', 'l’Inarrestabile', 'il Leggendario', 'il Distruttore', 'il Magnifico', 'l’Implacabile']
const SFX: Record<MoveType, string[]> = {
  attacco: ['SBAM!', 'POW!', 'KRAK!', 'WHAM!', 'BONK!'],
  difesa: ['CLANG!', 'TUNK!', 'DONG!'],
  cura: ['GLU GLU', 'SLURP!', 'AAAH!'],
  super: ['KABOOM!', 'ZAAAP!', 'BRZZZT!'],
}

export function offlineOpening(fighters: [Fighter, Fighter], arena: Card, rand: () => number = Math.random): Opening {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const name = (f: Fighter) => f.monster.character.name
  return {
    title: `${name(fighters[0])} contro ${name(fighters[1])}`,
    intro: `Signore e signori, benvenuti: ${lower(arena.name)}. ${arena.desc} Che la rissa abbia inizio!`,
    nicknames: [`${name(fighters[0])} ${pick(EPITHETS)}`, `${name(fighters[1])} ${pick(EPITHETS)}`],
    moves: [fallbackMoves(fighters[0]), fallbackMoves(fighters[1])],
    source: 'offline',
  }
}

export function offlineTexts(
  fighters: [Fighter, Fighter],
  opening: Opening,
  choices: [number, number],
  rand: () => number = Math.random,
): RoundTexts {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const moves = [opening.moves[0][choices[0]], opening.moves[1][choices[1]]]
  const names = fighters.map((f) => f.monster.character.name)
  const act = (i: 0 | 1) => {
    const m = moves[i]
    const other = names[i === 0 ? 1 : 0]
    switch (m.type) {
      case 'attacco':
        return `${names[i]} usa ${m.name} e si lancia su ${other}.`
      case 'difesa':
        return `${names[i]} si mette in guardia con ${m.name}.`
      case 'cura':
        return `${names[i]} si concede ${lower(m.name)} per rimettersi in sesto.`
      case 'super':
        return `${names[i]} scatena il superpotere: ${m.name}! ${m.desc}`
    }
  }
  return {
    efficacy: [0.8 + rand() * 0.4, 0.8 + rand() * 0.4],
    actions: [act(0), act(1)],
    sfx: [pick(SFX[moves[0].type]), pick(SFX[moves[1].type])],
    ko: [
      `${names[0]} va al tappeto e non si rialza. ${names[1]} festeggia sulle macerie.`,
      `${names[1]} va al tappeto e non si rialza. ${names[0]} festeggia sulle macerie.`,
    ],
    summary: baseOutcome([names[0], names[1]], [moves[0].type, moves[1].type]),
  }
}
