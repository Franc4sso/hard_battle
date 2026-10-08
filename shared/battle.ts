import type { Card } from './cards'
import { RARITY_LEVEL } from './rarity'

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

export const other = (s: Side): Side => (s === 0 ? 1 : 0)

// ---------- attacchi ----------

/**
 * Prima della rissa l'AI prepara 5 attacchi per mostro, uno per carta più
 * un'idea folle; ognuno ne sceglie 2 in segreto. Poi la rissa va da sola: a
 * ogni round l'AI decide quale dei due usa ciascuno, racconta e giudica.
 * Il tipo non si mostra ai giocatori: serve al narratore di riserva.
 * - aggressiva: attacco diretto;
 * - furba: trucco, finta, trappola, difesa;
 * - pazza: idea assurda e rischiosa.
 */
export type Tone = 'aggressiva' | 'furba' | 'pazza'
export const TONES: readonly Tone[] = ['aggressiva', 'furba', 'pazza']

export const ATTACKS_PER_FIGHTER = 5
export const ATTACKS_TO_PICK = 2
/** Da cosa nasce ciascuno dei 5 attacchi, nell'ordine. */
export const ATTACK_SOURCES = ['il personaggio', 'l’arma', 'la personalità', 'il superpotere', 'un’idea folle e rischiosa'] as const
/** Il tipo di ciascuno dei 5 attacchi, nell'ordine. */
export const ATTACK_TONES: readonly Tone[] = ['aggressiva', 'aggressiva', 'furba', 'pazza', 'pazza']

export interface Attack {
  /** Nome da urlare, max 4 parole. */
  name: string
  /** Cosa fa, una frase. */
  text: string
  tone: Tone
}

/** La carta da cui nasce l'attacco k dei 5 (l'idea folle nasce dal personaggio). */
export const attackSlot = (k: number): keyof Monster => (['character', 'weapon', 'personality', 'power'] as const)[k] ?? 'character'

/** Livello di rarità nascosto dell'attacco k di un mostro: comune 0 … leggendaria 3. */
export const attackPower = (m: Monster, k: number): 0 | 1 | 2 | 3 => RARITY_LEVEL[m[attackSlot(k)].rarity]

/** Gli indici dei 2 attacchi scelti tra i 5. */
export type Picks = [number, number]

/** Due indici distinti tra 0 e 4, in qualsiasi forma arrivino; altrimenti niente. */
export function cleanPicks(v: unknown): Picks | undefined {
  if (!Array.isArray(v) || v.length !== ATTACKS_TO_PICK) return undefined
  const p = v.map((x) => Number(x))
  if (!p.every((x) => Number.isInteger(x) && x >= 0 && x < ATTACKS_PER_FIGHTER) || p[0] === p[1]) return undefined
  return [p[0], p[1]]
}

// ---------- eventi dell'arena ----------

/** In alcuni round l'arena interviene con un colpo di scena che entra nel racconto. */
export interface ArenaEvent {
  round: number
  text: string
}

/** Calendario degli eventi: uno al round 2 o 3, uno tra il 4 e il 6. */
export function scheduleEvents(rand: () => number): number[] {
  return [2 + Math.floor(rand() * 2), 4 + Math.floor(rand() * 3)]
}

export const eventAt = (events: ArenaEvent[] | undefined, roundNo: number) => events?.find((e) => e.round === roundNo)

/** Presentazione della rissa: generata mentre si guarda il VS. */
export interface Opening {
  title: string
  intro: string
  nicknames: [string, string]
  events: ArenaEvent[]
  /** I 5 attacchi di ciascun mostro. */
  attacks: [Attack[], Attack[]]
  source: 'ai' | 'offline'
}

// ---------- giudizio ----------

/** Il timbro del giudice su ogni mossa. */
export const STAMPS = ['GENIALE', 'SPETTACOLARE', 'FURBA', 'CLASSICA', 'MAH', 'DISASTRO'] as const
export type Stamp = (typeof STAMPS)[number]
export const GOOD_STAMPS: ReadonlySet<Stamp> = new Set(['GENIALE', 'SPETTACOLARE', 'FURBA'])

/** Quanto forte viene colpito un combattente: 0 niente, 1 di striscio, 2 colpo pieno, 3 devastante. */
export type Hit = 0 | 1 | 2 | 3
/** Quanto si rimette in sesto: 0 niente, 1 un po', 2 tanto. */
export type Recover = 0 | 1 | 2

export const HIT_LABEL: Record<Hit, string> = { 0: 'ILLESO', 1: 'COLPITO', 2: 'COLPO FORTE!', 3: 'DEVASTANTE!' }

/** Il verdetto di un round: lo dà l'AI, il codice lo traduce in vita (che i giocatori non vedono in numeri). */
export interface Judgement {
  stamps: [Stamp, Stamp]
  /** Quanto forte viene colpito ciascuno. */
  hits: [Hit, Hit]
  recover: [Recover, Recover]
  /** Chi ha la meglio nel round (null = pari). */
  winner: Side | null
  /** La scena: cosa fanno, come si incrociano gli attacchi, come va a finire. */
  scene: string
  /** Il giudice: chi ha la meglio e perché. */
  why: string
  sfx: string
  /** Frase finale da usare se quel combattente crolla in questo round. */
  ko: [string, string]
  /** Una frase per ricordare il round nei successivi. */
  summary: string
  /** Colpo di scena legato ai personaggi, ogni tanto. */
  twist: string | null
}

/** Il verdetto dell'AI con in più quale dei 2 attacchi scelti usa ciascuno (0 o 1). */
export interface AiRound extends Judgement {
  used: [0 | 1, 0 | 1]
}

// ---------- regole ----------

export const MAX_HP = 100
/** Se nessuno crolla entro questo round, decide la giuria. */
export const MAX_ROUNDS = 10
/** Sotto questa vita si è all'ultimo respiro: colpi di reni e colpi finali. */
export const LAST_BREATH = 25

const HIT_DAMAGE: Record<Hit, number> = { 0: 0, 1: 12, 2: 22, 3: 34 }
const RECOVER_HP: Record<Recover, number> = { 0: 0, 1: 10, 2: 20 }

/** Più la rissa va avanti più si scalda: i colpi (non le cure) fanno un po' più male. */
export function heatOf(roundNo: number): number {
  return roundNo <= 3 ? 1 : roundNo <= 5 ? 1.15 : 1.3
}

export interface FightState {
  hp: [number, number]
  /** Round giocati. */
  round: number
}

export const START: FightState = { hp: [MAX_HP, MAX_HP], round: 0 }

/** Come sta un combattente, a parole: i giocatori non vedono numeri. */
export function hpState(hp: number): { label: string; level: 0 | 1 | 2 | 3 | 4 } {
  if (hp <= 0) return { label: 'K.O.', level: 4 }
  if (hp <= LAST_BREATH) return { label: 'ALL’ULTIMO RESPIRO', level: 3 }
  if (hp <= 50) return { label: 'BARCOLLA', level: 2 }
  if (hp <= 75) return { label: 'AMMACCATO', level: 1 }
  return { label: 'IN FORMA', level: 0 }
}

export interface RoundEnd {
  winner: Side
  byJury: boolean
  finale: string
}

/** Gli attacchi usati in un round: nome e frase di ciascuno. */
export interface Moves {
  names: [string, string]
  actions: [string, string]
}

export interface RoundResult {
  /** Gli attacchi usati, come testo. */
  actions: [string, string]
  moveNames: [string, string]
  stamps: [Stamp, Stamp]
  hits: [Hit, Hit]
  /** Vita persa e recuperata davvero (non si mostra in numeri). */
  damage: [number, number]
  heal: [number, number]
  hp: [number, number]
  winner: Side | null
  scene: string
  why: string
  sfx: string
  /** L'evento dell'arena di questo round, se c'era. */
  event: string | null
  /** Colpo di scena dei personaggi, se c'è stato. */
  twist: string | null
  summary: string
  end: RoundEnd | null
}

/**
 * Rende il verdetto coerente con sé stesso: chi "ha la meglio" non può essere
 * quello colpito più forte. Se l'AI si contraddice, vince il suo racconto
 * (winner) e si sistemano i colpi.
 */
export function consistent(j: Pick<Judgement, 'hits' | 'recover' | 'winner'>): Pick<Judgement, 'hits' | 'recover' | 'winner'> {
  const hits: [Hit, Hit] = [...j.hits]
  const w = j.winner
  if (w === null) return { ...j, hits }
  const l = other(w)
  if (hits[w] > hits[l]) hits[w] = hits[l]
  if (hits[w] === hits[l] && j.recover[w] <= j.recover[l]) {
    // Pari nei colpi: chi ha la meglio ne prende uno in meno (o l'altro uno in più).
    if (hits[w] > 0) hits[w] = (hits[w] - 1) as Hit
    else hits[l] = 1
  }
  return { ...j, hits }
}

/** Quanto spesso una carta rara, epica o leggendaria aggiunge un colpo in più, di nascosto. */
const POWER_BONUS = [0, 0.25, 0.55, 1] as const

/**
 * Applica un round: vita, KO o giuria. I numeri restano nascosti, il racconto è dell'AI.
 * `power`: la rarità nascosta dell'attacco usato da ciascuno (0-3).
 */
export function playRound(
  fs: FightState,
  moves: Moves,
  j: Judgement,
  names: [string, string],
  rand: () => number,
  event?: ArenaEvent,
  power: [number, number] = [0, 0],
): { round: RoundResult; next: FightState } {
  const roundNo = fs.round + 1
  const { hits, recover, winner } = consistent(j)
  // Colpo di reni: chi è all'ultimo respiro e ha la meglio colpisce ancora più forte. Così le rimonte succedono.
  if (winner !== null && fs.hp[winner] <= LAST_BREATH) hits[other(winner)] = Math.min(3, hits[other(winner)] + 1) as Hit
  // La rarità lavora in silenzio: una carta forte ogni tanto picchia un po' più forte.
  for (const s of [0, 1] as Side[]) {
    const bonus = POWER_BONUS[Math.min(3, Math.max(0, Math.round(power[s])))] ?? 0
    if (bonus > 0 && rand() < bonus) hits[other(s)] = Math.min(3, hits[other(s)] + 1) as Hit
  }
  const jitter = () => 0.9 + rand() * 0.2
  const raw: [number, number] = [0, 0]
  const heal: [number, number] = [0, 0]
  const damage: [number, number] = [0, 0]
  for (const s of [0, 1] as Side[]) {
    const dmg = Math.round(HIT_DAMAGE[hits[s]] * heatOf(roundNo) * jitter())
    const rec = Math.round(RECOVER_HP[recover[s]] * jitter())
    raw[s] = fs.hp[s] + rec - dmg
    // Niente cure oltre il pieno, niente danni sotto zero.
    heal[s] = rec - Math.max(0, raw[s] - MAX_HP)
    damage[s] = dmg - Math.max(0, -raw[s])
  }
  const hp: [number, number] = [fs.hp[0] + heal[0] - damage[0], fs.hp[1] + heal[1] - damage[1]]

  let end: RoundEnd | null = null
  const better = (): Side => (raw[0] === raw[1] ? (winner ?? (rand() < 0.5 ? 0 : 1)) : raw[0] > raw[1] ? 0 : 1)
  if (hp[0] <= 0 || hp[1] <= 0) {
    // Se crollano entrambi resta in piedi, per un soffio, chi è messo meno peggio.
    const w = hp[0] > 0 ? 0 : hp[1] > 0 ? 1 : better()
    const l = other(w)
    if (hp[w] <= 0) {
      hp[w] = 1
      damage[w] = fs.hp[w] + heal[w] - 1
    }
    end = { winner: w, byJury: false, finale: j.ko[l] || `${names[l]} crolla al tappeto. ${names[w]} esulta!` }
  } else if (roundNo >= MAX_ROUNDS) {
    const w = better()
    end = { winner: w, byJury: true, finale: `Dopo ${MAX_ROUNDS} round nessuno crolla. La giuria, sfinita, assegna la vittoria a ${names[w]}.` }
  }

  return {
    round: {
      actions: moves.actions,
      moveNames: moves.names,
      stamps: j.stamps,
      hits,
      damage,
      heal,
      hp,
      winner,
      scene: j.scene,
      why: j.why,
      sfx: j.sfx,
      event: event?.text ?? null,
      twist: j.twist,
      summary: j.summary,
      end,
    },
    next: { hp, round: roundNo },
  }
}

/** La mossa migliore del vincitore: quella che ha colpito più forte. */
export function mvpOf(rounds: RoundResult[], winner: Side): string {
  const loser = other(winner)
  let best: RoundResult | undefined
  for (const r of rounds) if (!best || r.damage[loser] > best.damage[loser]) best = r
  return best?.moveNames[winner] ?? ''
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

const clampInt = <T extends number>(v: unknown, max: number, fallback: T): T => {
  const n = Math.round(Number(v))
  return (Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback) as T
}

const isTone = (v: unknown): v is Tone => TONES.includes(v as Tone)

/**
 * I 5 attacchi di un mostro, nell'ordine delle carte. Quello che manca o non
 * va si prende dagli attacchi di riserva, stesso posto.
 */
export function normalizeAttacks(raw: unknown, backup: Attack[]): Attack[] {
  const list = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? { text: x } : ((x ?? {}) as Record<string, unknown>)))
  const seen = new Set<string>()
  return backup.map((b, i) => {
    const x = list[i]
    const t = text(x?.text, 160)
    const name = text(x?.name, 40)
    if (!t || !name || seen.has(name.toLowerCase())) return b
    seen.add(name.toLowerCase())
    return { name, text: t, tone: isTone(x?.tone) ? x.tone : b.tone }
  })
}

export function normalizeOpening(
  raw: unknown,
  fighters: [Fighter, Fighter],
  source: Opening['source'],
  events: ArenaEvent[] = [],
  backup: [Attack[], Attack[]] = [offlineAttacks(fighters, 0), offlineAttacks(fighters, 1)],
): Opening | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = text(r.title, 80)
  if (!title) return null
  const nick = pair(r.nicknames)
  const attacks = pair(r.attacks)
  // Eventi: il calendario arriva dal server; dal telefono si accetta solo un formato pulito.
  const rawEvents = !events.length && Array.isArray(r.events) ? (r.events as ArenaEvent[]) : events
  return {
    title,
    intro: text(r.intro, 400),
    nicknames: [text(nick[0], 40) || fighters[0].monster.character.name, text(nick[1], 40) || fighters[1].monster.character.name],
    events: rawEvents.filter((e) => e && Number.isInteger(e.round) && text(e.text, 220)).map((e) => ({ round: e.round, text: text(e.text, 220) })),
    attacks: [normalizeAttacks(attacks[0], backup[0]), normalizeAttacks(attacks[1], backup[1])],
    source,
  }
}

/** 0 o 1 (anche scritto come testo); qualsiasi altra cosa, null compreso, è "pari". */
export const sideOf = (v: unknown): Side | null => (v === 0 || v === '0' ? 0 : v === 1 || v === '1' ? 1 : null)

const isStamp = (v: unknown): v is Stamp => STAMPS.includes(String(v).toUpperCase() as Stamp)

export function normalizeJudgement(raw: unknown): AiRound | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const scene = text(r.scene, 900)
  if (!scene) return null
  const stamps = pair(r.stamps).map((s) => (isStamp(s) ? (String(s).toUpperCase() as Stamp) : 'CLASSICA')) as [Stamp, Stamp]
  const twist = text(r.twist, 260)
  return {
    used: pair(r.used).map((u) => (sideOf(u) === 1 ? 1 : 0)) as [0 | 1, 0 | 1],
    stamps,
    hits: pair(r.hits).map((h) => clampInt<Hit>(h, 3, 1)) as [Hit, Hit],
    recover: pair(r.recover).map((h) => clampInt<Recover>(h, 2, 0)) as [Recover, Recover],
    winner: sideOf(r.winner),
    scene,
    why: text(r.why, 400),
    sfx: text(r.sfx, 16).toUpperCase() || 'SBAM!',
    ko: pair(r.ko).map((k) => text(k, 400)) as [string, string],
    summary: text(r.summary, 200),
    twist: twist && twist.toLowerCase() !== 'null' ? twist : null,
  }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const EPITHETS = ['il Terribile', 'l’Inarrestabile', 'il Leggendario', 'il Distruttore', 'il Magnifico', 'l’Implacabile']

/** Max 4 parole, come i nomi che chiediamo all'AI. */
const shortName = (s: string) => s.split(' ').slice(0, 4).join(' ')

/** I 5 attacchi di riserva, costruiti dalle carte: uno per carta più la pazzia. */
export function offlineAttacks(fighters: [Fighter, Fighter], side: Side): Attack[] {
  const me = fighters[side].monster
  const foe = fighters[other(side)].monster.character.name
  const weapon = lower(me.weapon.name)
  // Senza articoli: i nomi delle carte non dicono se sono maschili o femminili.
  return [
    { name: `Carica di ${shortName(me.character.name)}`, text: `Prende la rincorsa e travolge ${foe} con tutto il peso che ha`, tone: 'aggressiva' },
    { name: `Colpo di ${shortName(weapon)}`, text: `Si lancia su ${foe} e lo tempesta a colpi di ${weapon}`, tone: 'aggressiva' },
    { name: `Trucco ${shortName(lower(me.personality.name))}`, text: `Fa finta di inciampare, poi colpisce ${foe} alle spalle`, tone: 'furba' },
    { name: shortName(me.power.name), text: `Scatena «${me.power.name}» contro ${foe}, senza pensarci due volte`, tone: 'pazza' },
    { name: 'Pazzia totale', text: `Prova una cosa mai vista: «${me.power.name}» armato di ${weapon}, urlando`, tone: 'pazza' },
  ]
}

export function offlineOpening(fighters: [Fighter, Fighter], arena: Card, rand: () => number = Math.random): Opening {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const name = (f: Fighter) => f.monster.character.name
  const where = lower(arena.name)
  const scenes = [
    `Colpo di scena a ${where}: tutto inizia a tremare e i due perdono l’equilibrio.`,
    `Il pubblico di ${where} impazzisce e comincia a lanciare oggetti sul ring.`,
    `A ${where} salta la luce per qualche secondo: si combatte al buio.`,
  ]
  return {
    title: `${name(fighters[0])} contro ${name(fighters[1])}`,
    intro: `Signore e signori, benvenuti: ${where}. ${arena.desc} Che la rissa abbia inizio!`,
    nicknames: [`${name(fighters[0])} ${pick(EPITHETS)}`, `${name(fighters[1])} ${pick(EPITHETS)}`],
    events: scheduleEvents(rand).map((round, i) => ({ round, text: scenes[(i + Math.floor(rand() * 3)) % 3] })),
    attacks: [offlineAttacks(fighters, 0), offlineAttacks(fighters, 1)],
    source: 'offline',
  }
}

/** Chi batte chi, nel narratore di riserva: la furbata punisce chi carica, la carica travolge la pazzia, la pazzia spiazza la furbata. */
const BEATS: Record<Tone, Tone> = { furba: 'aggressiva', aggressiva: 'pazza', pazza: 'furba' }

/** Verdetto di riserva, senza AI, sui due attacchi usati in questo round. */
export function offlineJudgement(fighters: [Fighter, Fighter], used: [Attack, Attack], rand: () => number = Math.random): Judgement {
  const names = fighters.map((f) => f.monster.character.name) as [string, string]
  const t: [Tone, Tone] = [used[0].tone, used[1].tone]
  let winner: Side | null = null
  if (BEATS[t[0]] === t[1]) winner = 0
  else if (BEATS[t[1]] === t[0]) winner = 1
  const hits: [Hit, Hit] = [1, 1]
  if (winner === null) {
    hits[0] = (1 + Math.floor(rand() * 2)) as Hit
    hits[1] = (1 + Math.floor(rand() * 2)) as Hit
    winner = hits[0] < hits[1] ? 0 : hits[1] < hits[0] ? 1 : null
  } else {
    hits[winner] = rand() < 0.5 ? 0 : 1
    hits[other(winner)] = rand() < 0.3 ? 3 : 2
  }
  const scene = `${names[0]} ${lower(used[0].text)}. Nello stesso istante ${names[1]} ${lower(used[1].text)}.`
  const why =
    winner === null
      ? 'Nessuno dei due riesce a prevalere: se le danno di santa ragione e restano entrambi in piedi.'
      : `Ha la meglio ${names[winner]}: la sua mossa arriva proprio nel momento giusto e ${names[other(winner)]} resta scoperto.`
  return {
    stamps: ['CLASSICA', 'CLASSICA'],
    hits,
    recover: [0, 0],
    winner,
    scene,
    why,
    sfx: ['SBAM!', 'KRAK!', 'POW!', 'BONK!'][Math.floor(rand() * 4)],
    ko: [
      `${names[0]} va al tappeto e non si rialza. ${names[1]} festeggia sulle macerie.`,
      `${names[1]} va al tappeto e non si rialza. ${names[0]} festeggia sulle macerie.`,
    ],
    summary: why,
    twist: null,
  }
}
