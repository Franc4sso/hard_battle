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

export const other = (s: Side): Side => (s === 0 ? 1 : 0)

// ---------- mosse suggerite ----------

/**
 * Ogni turno il gioco suggerisce 3 mosse, una per tipo. Il tipo non si mostra
 * ai giocatori: si capisce dal tono della frase. Serve all'AI per tenere le tre
 * frasi diverse tra loro e come traccia per giudicare.
 * - aggressiva: attacco diretto;
 * - furba: trucco, finta, trappola, difesa;
 * - pazza: idea assurda e rischiosa, spesso col superpotere o con l'arena.
 */
export type Tone = 'aggressiva' | 'furba' | 'pazza'
export const TONES: readonly Tone[] = ['aggressiva', 'furba', 'pazza']

export interface Suggestion {
  text: string
  tone: Tone
  /** Colpo finale: l'avversario è all'ultimo respiro. */
  finisher?: true
}

/** La mossa scelta: una delle 3 suggerite oppure scritta dal giocatore. */
export type Choice = { pick: number } | { custom: string }

/** Lunghezza massima di una mossa scritta dal giocatore. */
export const CUSTOM_MAX = 120

/** Ripulisce una mossa scritta dal giocatore: niente a capo, niente caratteri che sembrano codice. */
export function cleanCustom(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/[\u0000-\u001f<>{}[\]"`\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CUSTOM_MAX)
}

/** Il testo della mossa scelta (vuoto se la scelta non è valida). */
export function choiceText(offers: Suggestion[], c: Choice): string {
  return 'pick' in c ? (offers[c.pick]?.text ?? '') : cleanCustom(c.custom)
}

export const choiceSuggestion = (offers: Suggestion[], c: Choice): Suggestion | undefined => ('pick' in c ? offers[c.pick] : undefined)

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
  /** Le mosse suggerite per il primo round. */
  offers: [Suggestion[], Suggestion[]]
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
  /** Nome epico di ciascuna mossa. */
  moveNames: [string, string]
  stamps: [Stamp, Stamp]
  /** Quanto forte viene colpito ciascuno. */
  hits: [Hit, Hit]
  recover: [Recover, Recover]
  /** Chi ha la meglio nel round (null = pari). */
  winner: Side | null
  /** La scena: cosa fanno, come si incrociano le mosse, come va a finire. */
  scene: string
  /** Il giudice: chi ha la meglio e perché. */
  why: string
  sfx: string
  /** Frase finale da usare se quel combattente crolla in questo round. */
  ko: [string, string]
  /** Una frase per ricordare il round nei successivi. */
  summary: string
  /** Le mosse suggerite per il round dopo. */
  offers: [Suggestion[], Suggestion[]]
}

// ---------- regole ----------

export const MAX_HP = 100
/** Se nessuno crolla entro questo round, decide la giuria. */
export const MAX_ROUNDS = 10
/** Sotto questa vita si è all'ultimo respiro: arrivano le mosse disperate e i colpi finali. */
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

export interface RoundResult {
  /** Le mosse scelte, come testo. */
  actions: [string, string]
  /** Mossa scritta dal giocatore invece che suggerita. */
  custom: [boolean, boolean]
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

/** Applica un round: vita, KO o giuria. I numeri restano nascosti, il racconto è dell'AI. */
export function playRound(
  fs: FightState,
  actions: [string, string],
  custom: [boolean, boolean],
  j: Judgement,
  names: [string, string],
  rand: () => number,
  event?: ArenaEvent,
): { round: RoundResult; next: FightState } {
  const roundNo = fs.round + 1
  const { hits, recover, winner } = consistent(j)
  // Colpo di reni: chi è all'ultimo respiro e ha la meglio colpisce ancora più forte. Così le rimonte succedono.
  if (winner !== null && fs.hp[winner] <= LAST_BREATH) hits[other(winner)] = Math.min(3, hits[other(winner)] + 1) as Hit
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
      actions,
      custom,
      moveNames: j.moveNames,
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
 * Le 3 mosse suggerite: una per tipo, nell'ordine aggressiva, furba, pazza.
 * Quello che manca o non va si prende dalle mosse di riserva.
 */
export function normalizeOffers(raw: unknown, backup: Suggestion[]): Suggestion[] {
  const list = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? { text: x } : ((x ?? {}) as Record<string, unknown>)))
  const used = new Set<number>()
  return TONES.map((tone, k) => {
    // Prima quella col tipo giusto, poi una qualsiasi non ancora usata.
    let i = list.findIndex((x, n) => !used.has(n) && x.tone === tone && text(x.text, 160))
    if (i < 0) i = list.findIndex((x, n) => !used.has(n) && !isTone(x.tone) && text(x.text, 160))
    const b = backup[k]
    if (i < 0) return b
    used.add(i)
    // A volte l'AI scrive i campi dentro la frase ("…, finisher: true"): via.
    const t = text(String(list[i].text).replace(/[,;(\s]*(finisher|tone)\s*[:=].*$/i, ''), 160)
    return { text: t, tone, ...(list[i].finisher === true || (b.finisher && tone === 'pazza') ? { finisher: true as const } : {}) }
  })
}

/**
 * Il colpo finale lo decide la vita vera, non l'AI: c'è solo se l'avversario è
 * all'ultimo respiro, e in quel caso c'è sempre (sulla mossa pazza).
 */
export function fixFinishers(offers: [Suggestion[], Suggestion[]], fs: FightState): [Suggestion[], Suggestion[]] {
  return offers.map((list, side) => {
    const on = fs.hp[other(side as Side)] <= LAST_BREATH
    return list.map(({ finisher: _, ...o }) => (on && o.tone === 'pazza' ? { ...o, finisher: true as const } : o))
  }) as [Suggestion[], Suggestion[]]
}

const words = (t: string) => new Set(t.toLowerCase().split(/[^a-zà-ù]+/).filter((w) => w.length > 3))

/** Due mosse dicono quasi la stessa cosa (stesse parole importanti). */
export function similar(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)
  // Frasi troppo corte: non si può dire.
  if (Math.min(x.size, y.size) < 3) return false
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / Math.min(x.size, y.size) >= 0.85
}

/** Una mossa già vista (o quasi) non si ripropone: al suo posto quella di riserva dello stesso tipo. */
export function dedupeOffers(offers: [Suggestion[], Suggestion[]], seen: string[], backup: [Suggestion[], Suggestion[]]): [Suggestion[], Suggestion[]] {
  return offers.map((list, side) => list.map((o, k) => (seen.some((t) => similar(o.text, t)) ? { ...backup[side][k], ...(o.finisher ? { finisher: true as const } : {}) } : o))) as [
    Suggestion[],
    Suggestion[],
  ]
}

export function normalizeOpening(
  raw: unknown,
  fighters: [Fighter, Fighter],
  source: Opening['source'],
  events: ArenaEvent[] = [],
  backupOffers: [Suggestion[], Suggestion[]] = [offlineOffers(fighters, 0, START), offlineOffers(fighters, 1, START)],
): Opening | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = text(r.title, 80)
  if (!title) return null
  const nick = pair(r.nicknames)
  const offers = pair(r.offers)
  // Eventi: il calendario arriva dal server; dal telefono si accetta solo un formato pulito.
  const rawEvents = !events.length && Array.isArray(r.events) ? (r.events as ArenaEvent[]) : events
  return {
    title,
    intro: text(r.intro, 400),
    nicknames: [text(nick[0], 40) || fighters[0].monster.character.name, text(nick[1], 40) || fighters[1].monster.character.name],
    events: rawEvents.filter((e) => e && Number.isInteger(e.round) && text(e.text, 220)).map((e) => ({ round: e.round, text: text(e.text, 220) })),
    offers: [normalizeOffers(offers[0], backupOffers[0]), normalizeOffers(offers[1], backupOffers[1])],
    source,
  }
}

/** 0 o 1 (anche scritto come testo); qualsiasi altra cosa, null compreso, è "pari". */
export const sideOf = (v: unknown): Side | null => (v === 0 || v === '0' ? 0 : v === 1 || v === '1' ? 1 : null)

const isStamp = (v: unknown): v is Stamp => STAMPS.includes(String(v).toUpperCase() as Stamp)

export function normalizeJudgement(raw: unknown, backupOffers: [Suggestion[], Suggestion[]]): Judgement | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const scene = text(r.scene, 900)
  if (!scene) return null
  const names = pair(r.moveNames).map((n) => text(n, 40))
  const stamps = pair(r.stamps).map((s) => (isStamp(s) ? (String(s).toUpperCase() as Stamp) : 'CLASSICA')) as [Stamp, Stamp]
  const offers = pair(r.offers)
  return {
    moveNames: [names[0] || 'Mossa a sorpresa', names[1] || 'Mossa a sorpresa'],
    stamps,
    hits: pair(r.hits).map((h) => clampInt<Hit>(h, 3, 1)) as [Hit, Hit],
    recover: pair(r.recover).map((h) => clampInt<Recover>(h, 2, 0)) as [Recover, Recover],
    winner: sideOf(r.winner),
    scene,
    why: text(r.why, 400),
    sfx: text(r.sfx, 16).toUpperCase() || 'SBAM!',
    ko: pair(r.ko).map((k) => text(k, 400)) as [string, string],
    summary: text(r.summary, 200),
    offers: [normalizeOffers(offers[0], backupOffers[0]), normalizeOffers(offers[1], backupOffers[1])],
  }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const EPITHETS = ['il Terribile', 'l’Inarrestabile', 'il Leggendario', 'il Distruttore', 'il Magnifico', 'l’Implacabile']

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Mosse di riserva costruite dalle carte, diverse a ogni round. */
export function offlineOffers(fighters: [Fighter, Fighter], side: Side, fs: FightState): Suggestion[] {
  const me = fighters[side].monster
  const foe = fighters[other(side)].monster.character.name
  const weapon = lower(me.weapon.name)
  const k = hash(me.character.id + me.weapon.id) + fs.round
  const pick = (xs: string[]) => xs[k % xs.length]
  const desperate = fs.hp[side] <= LAST_BREATH
  const finisher = fs.round > 0 && fs.hp[other(side)] <= LAST_BREATH
  // Senza articoli: i nomi delle carte non dicono se sono maschili o femminili.
  const aggressive = desperate
    ? `Con l’ultimo fiato si butta su ${foe}, armato di ${weapon}`
    : pick([
        `Si lancia su ${foe} e lo tempesta a colpi di ${weapon}`,
        `Gira intorno a ${foe} e lo prende alle spalle a colpi di ${weapon}`,
        `Prende la rincorsa e travolge ${foe}, armato di ${weapon}`,
      ])
  const sly = pick([
    `Fa finta di inciampare, poi colpisce ${foe} alle spalle`,
    `Si nasconde e aspetta che ${foe} si scopra per contrattaccare`,
    `Indica qualcosa dietro ${foe} e, appena si gira, gli fa lo sgambetto`,
  ])
  const crazy = finisher
    ? `Colpo finale: scatena «${me.power.name}» su ${foe} con tutto quello che ha`
    : pick([`Scatena «${me.power.name}» contro ${foe}, senza pensarci due volte`, `Prova una cosa mai vista: «${me.power.name}» armato di ${weapon}`])
  return [
    { text: aggressive, tone: 'aggressiva' },
    { text: sly, tone: 'furba' },
    { text: crazy, tone: 'pazza', ...(finisher ? { finisher: true as const } : {}) },
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
    offers: [offlineOffers(fighters, 0, START), offlineOffers(fighters, 1, START)],
    source: 'offline',
  }
}

/** Chi batte chi, nel narratore di riserva: la furbata punisce chi carica, la carica travolge la pazzia, la pazzia spiazza la furbata. */
const BEATS: Record<Tone, Tone> = { furba: 'aggressiva', aggressiva: 'pazza', pazza: 'furba' }

/** Verdetto di riserva, senza AI. `tones`: il tipo di mossa scelto (null = scritta dal giocatore). */
export function offlineJudgement(
  fighters: [Fighter, Fighter],
  fs: FightState,
  actions: [string, string],
  tones: [Tone | null, Tone | null],
  rand: () => number = Math.random,
): Judgement {
  const names = fighters.map((f) => f.monster.character.name) as [string, string]
  const t = tones.map((x) => x ?? TONES[Math.floor(rand() * 3)]) as [Tone, Tone]
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
  const scene = `${names[0]} ${lower(actions[0])}. Nello stesso istante ${names[1]} ${lower(actions[1])}.`
  const why =
    winner === null
      ? 'Nessuno dei due riesce a prevalere: se le danno di santa ragione e restano entrambi in piedi.'
      : `Ha la meglio ${names[winner]}: la sua mossa arriva proprio nel momento giusto e ${names[other(winner)]} resta scoperto.`
  const next: FightState = { hp: fs.hp, round: fs.round + 1 }
  return {
    moveNames: actions.map((a) => a.split(' ').slice(0, 3).join(' ')) as [string, string],
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
    offers: [offlineOffers(fighters, 0, next), offlineOffers(fighters, 1, next)],
  }
}
