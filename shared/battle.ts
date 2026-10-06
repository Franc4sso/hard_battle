import { HEALING_POWER_IDS, type Card } from './cards'

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

export type MoveType = 'attacco' | 'difesa' | 'cura' | 'super' | 'disperata'

/** I tipi delle 4 mosse fisse (la mossa disperata si aggiunge a parte). */
export const MOVE_ORDER: readonly MoveType[] = ['attacco', 'difesa', 'cura', 'super']

export const MOVE_INFO: Record<MoveType, { label: string; rule: string }> = {
  attacco: { label: 'Attacco', rule: 'Danni pieni. Contro una difesa fa poco e subisce il contrattacco.' },
  difesa: { label: 'Difesa', rule: 'Para quasi tutto e contrattacca forte. Se l’altro non attacca è sprecata. Non due volte di fila.' },
  cura: { label: 'Cura', rule: 'Recupera vita. Non due round di fila.' },
  super: { label: 'Superpotere', rule: 'Dal round 3. Colpo devastante che passa anche la difesa (o, se il potere cura, grande cura che para). Una volta sola.' },
  disperata: { label: 'Disperata', rule: 'Barra della rimonta piena e vita sotto l’avversario: colpo enorme che nessuna difesa ferma. Una volta sola.' },
}

/** Effetto secondario di una mossa: quello che la rende diversa dalle altre dello stesso tipo. */
export type MoveFx = 'stordisce' | 'brucia' | 'carica' | 'rubavita' | 'finta' | 'scudo'

export const FX_INFO: Record<MoveFx, { label: string; rule: string }> = {
  stordisce: { label: 'Stordisce', rule: 'Se va a segno, al prossimo round l’avversario non può difendersi.' },
  brucia: { label: 'Brucia', rule: 'Se va a segno, l’avversario perde 8 punti vita anche al round dopo.' },
  carica: { label: 'Carica', rule: 'Il tuo prossimo colpo fa il 50% in più.' },
  rubavita: { label: 'Ruba vita', rule: 'Recuperi metà del danno che fai.' },
  finta: { label: 'Finta', rule: 'Passa la difesa senza subire contrattacco, ma contro un attacco fa metà danni.' },
  scudo: { label: 'Scudo', rule: 'Al prossimo round subisci il 40% di danni in meno.' },
}

/** Quali effetti può avere ogni tipo di mossa. */
export const FX_BY_TYPE: Record<'attacco' | 'difesa' | 'cura', MoveFx[]> = {
  attacco: ['stordisce', 'brucia', 'rubavita', 'finta', 'carica'],
  difesa: ['scudo', 'stordisce', 'carica'],
  cura: ['scudo', 'carica'],
}

export type Force = 1 | 2 | 3

export interface Move {
  name: string
  desc: string
  type: MoveType
  /** 1 debole, 2 normale, 3 forte. Il superpotere è sempre 3. */
  force: Force
  /** Solo per il superpotere: colpo devastante o, se il potere è curativo, grande cura che para. */
  effect?: 'colpo' | 'cura'
  /** Superpotere arrivato da una carta trappola: vale meno. */
  weak?: true
  /** Effetto secondario (solo attacco, difesa e cura). */
  fx?: MoveFx
}

/** Quanto vale un superpotere trappola rispetto a uno normale. */
const WEAK_SUPER = 0.6

export const healsBig = (m: Move) => m.type === 'super' && m.effect === 'cura'
/** Il tipo "di fatto" di una mossa: un superpotere curativo si comporta come una cura. */
const actsAs = (m: Move): MoveType => (healsBig(m) ? 'cura' : m.type)

/**
 * Ogni mostro ha 4 mosse: il superpotere (sempre l'ultima) più 3 mosse di tipo
 * libero, scelte in base al personaggio, con almeno un attacco. La forza delle
 * 3 mosse somma sempre a FORCE_BUDGET: chi ha due attacchi ne ha uno debole.
 */
export const MOVES_PER_MONSTER = 4
export const FORCE_BUDGET = 6

// ---------- eventi dell'arena ----------

/** In alcuni round l'arena cambia una regola, solo per quel round. */
export type EventRule = 'difese_fragili' | 'cure_bloccate' | 'furia' | 'boomerang' | 'ristoro' | 'seconda_carica'

export const EVENT_RULES: Record<EventRule, { title: string; rule: string }> = {
  difese_fragili: { title: 'Difese a pezzi', rule: 'La difesa para la metà e non contrattacca.' },
  cure_bloccate: { title: 'Niente pause', rule: 'Le cure non funzionano.' },
  furia: { title: 'Furia', rule: 'Gli attacchi fanno una volta e mezzo i danni.' },
  boomerang: { title: 'Effetto boomerang', rule: 'Chi colpisce si prende un terzo del colpo.' },
  ristoro: { title: 'Ristoro', rule: 'Le cure valgono il doppio.' },
  seconda_carica: { title: 'Seconda carica', rule: 'Il superpotere torna utilizzabile, anche se già usato.' },
}

const EVENT_IDS = Object.keys(EVENT_RULES) as EventRule[]

export interface ArenaEvent {
  round: number
  rule: EventRule
  /** La scena, legata all'arena (dall'AI o dal narratore di riserva). */
  text: string
}

/** Calendario degli eventi: uno al round 2 o 3, uno tra il 4 e il 6, regole diverse. */
export function scheduleEvents(rand: () => number): { round: number; rule: EventRule }[] {
  const first = EVENT_IDS[Math.floor(rand() * EVENT_IDS.length)]
  const rest = EVENT_IDS.filter((r) => r !== first)
  return [
    { round: 2 + Math.floor(rand() * 2), rule: first },
    { round: 4 + Math.floor(rand() * 3), rule: rest[Math.floor(rand() * rest.length)] },
  ]
}

export const eventAt = (events: ArenaEvent[] | undefined, roundNo: number) => events?.find((e) => e.round === roundNo)

/** Presentazione della rissa: generata mentre si guarda il VS. */
export interface Opening {
  title: string
  intro: string
  nicknames: [string, string]
  moves: [Move[], Move[]]
  events: ArenaEvent[]
  source: 'ai' | 'offline'
}

// ---------- timbri del giudice ----------

/** Il timbro che merita una mossa, dal voto dell'AI. Nei casi normali niente timbro. */
export function stampOf(efficacy: number): { label: string; good: boolean } | null {
  if (efficacy >= 1.2) return { label: 'COLPO DA MAESTRO', good: true }
  if (efficacy >= 1.1) return { label: 'SUPER EFFICACE', good: true }
  if (efficacy <= 0.82) return { label: 'FIGURACCIA', good: false }
  if (efficacy <= 0.9) return { label: 'POCO EFFICACE', good: false }
  return null
}

// ---------- regole ----------

export const MAX_HP = 100
/** Se nessuno crolla entro questo round, decide la giuria. */
export const MAX_ROUNDS = 8
/** Danni da incassare per riempire la barra della rimonta. */
export const RAGE_MAX = 60
/** Primo round in cui si può usare il superpotere. */
export const SUPER_FROM_ROUND = 3

const ATTACK = 23
const SUPER = 36
const DESPERATE = 40
const HEAL = 14
/** Superpotere curativo: tanta vita, e intanto para come una difesa forte. */
const SUPER_HEAL = 30
const COUNTER = 18
const BURN = 8
const CHARGE = 1.5
const SHIELD = 0.6
const LIFESTEAL = 0.5
const FEINT_VS_ATTACK = 0.5
/** Moltiplicatore di danni, cure e contrattacchi per forza della mossa. */
const FORCE_MULT: Record<Force, number> = { 1: 0.75, 2: 1, 3: 1.3 }
/** Quota del colpo che passa una difesa, per forza della difesa. */
const BLOCK: Record<'attacco' | 'super', Record<Force, number>> = {
  attacco: { 1: 0.35, 2: 0.2, 3: 0.1 },
  super: { 1: 0.7, 2: 0.5, 3: 0.4 },
}

/** Più la rissa va avanti più si scalda: i colpi (non le cure) fanno sempre più male. */
export function heatOf(roundNo: number): number {
  return roundNo <= 2 ? 1 : roundNo <= 4 ? 1.25 : 1.6
}

/** Stato di un combattente che passa da un round all'altro. */
export interface Status {
  /** Danni da bruciatura che subirà al prossimo round. */
  burn: number
  /** Il prossimo attacco fa il 50% in più. */
  charged: boolean
  /** Al prossimo round subisce meno danni. */
  shield: boolean
  /** Al prossimo round non può difendersi. */
  stunned: boolean
}

const CALM: Status = { burn: 0, charged: false, shield: false, stunned: false }

export interface FightState {
  hp: [number, number]
  superUsed: [boolean, boolean]
  desperateUsed: [boolean, boolean]
  /** Barra della rimonta: danni incassati (fino a RAGE_MAX). */
  rage: [number, number]
  lastType: [MoveType | null, MoveType | null]
  status: [Status, Status]
  /** Round giocati. */
  round: number
}

export const START: FightState = {
  hp: [MAX_HP, MAX_HP],
  superUsed: [false, false],
  desperateUsed: [false, false],
  rage: [0, 0],
  lastType: [null, null],
  status: [CALM, CALM],
  round: 0,
}

/** Perché una mossa non si può usare adesso (undefined = si può). `rule`: evento del round. */
export function blockedReason(fs: FightState, side: Side, type: MoveType, rule?: EventRule): string | undefined {
  if (type === 'super' && fs.superUsed[side] && rule !== 'seconda_carica') return 'Già usato'
  // Il superpotere si carica nei primi round: niente risse decise al primo colpo.
  if (type === 'super' && fs.round + 1 < SUPER_FROM_ROUND && rule !== 'seconda_carica') return `Si carica: dal round ${SUPER_FROM_ROUND}`
  // Né cura né difesa due round di fila: dopo, si resta scoperti.
  if ((type === 'cura' || type === 'difesa') && fs.lastType[side] === type) return 'Non due volte di fila'
  if (type === 'difesa' && fs.status?.[side]?.stunned) return 'Stordito: niente difesa'
  if (type === 'disperata') {
    if (fs.desperateUsed?.[side]) return 'Già usata'
    if ((fs.rage?.[side] ?? 0) < RAGE_MAX) return `Rimonta ${fs.rage?.[side] ?? 0}/${RAGE_MAX}`
    // È l'arma di chi sta perdendo, non di chi sta vincendo.
    if (fs.hp[side] >= fs.hp[side === 0 ? 1 : 0]) return 'Solo se sei in svantaggio'
  }
  return undefined
}

const hitsHard = (m: Move) => m.type === 'attacco' || m.type === 'disperata' || (m.type === 'super' && !healsBig(m))

/**
 * Cure e danni di un round, dalle due mosse scelte insieme (tenuti separati:
 * chi si cura mentre viene colpito vede entrambe le cose).
 * `eff` è il giudizio dell'AI (0.8–1.25): quanto ogni mossa è azzeccata.
 * `dealt`: il colpo andato a segno da ciascuno (serve agli effetti).
 */
export function roundEffects(
  moves: [Move, Move],
  eff: [number, number],
  rand: () => number,
  heat = 1,
  rule?: EventRule,
  status: [Status, Status] = [CALM, CALM],
): { heal: [number, number]; damage: [number, number]; dealt: [number, number] } {
  const jitter = () => 0.9 + rand() * 0.2
  const heal: [number, number] = [0, 0]
  const hits: [number, number] = [0, 0]
  const counters: [number, number] = [0, 0]
  const healMult = rule === 'cure_bloccate' ? 0 : rule === 'ristoro' ? 2 : 1
  for (const me of [0, 1] as Side[]) {
    const foe: Side = me === 0 ? 1 : 0
    const m = moves[me]
    const fm = moves[foe]
    // colpo dell'avversario
    let incoming = 0
    if (hitsHard(fm)) {
      if (fm.type === 'disperata') {
        // Rimette in partita, non chiude la rissa da sola: niente escalation, niente carica.
        incoming = DESPERATE * eff[foe] * jitter()
      } else {
        const base = fm.type === 'attacco' ? ATTACK * FORCE_MULT[fm.force] * (rule === 'furia' ? 1.5 : 1) : SUPER
        incoming = base * (fm.weak ? WEAK_SUPER : 1) * (status[foe].charged ? CHARGE : 1) * eff[foe] * jitter() * heat
      }
      const feint = fm.type === 'attacco' && fm.fx === 'finta'
      const unstoppable = fm.type === 'disperata' || feint
      const hitKind = fm.type === 'attacco' ? 'attacco' : 'super'
      const fragile = rule === 'difese_fragili' ? 2 : 1
      if (!unstoppable && m.type === 'difesa') incoming *= Math.min(1, BLOCK[hitKind][m.force] * fragile)
      if (!unstoppable && healsBig(m)) incoming *= Math.min(1, BLOCK[hitKind][3] * fragile)
      // La finta inganna chi si difende, ma contro chi attacca a sua volta fa poco.
      if (feint && hitsHard(m)) incoming *= FEINT_VS_ATTACK
      if (status[me].shield) incoming *= SHIELD
    }
    hits[me] = incoming
    // contrattacco di chi si difende da un attacco normale (la finta lo evita)
    if (fm.type === 'difesa' && m.type === 'attacco' && m.fx !== 'finta' && rule !== 'difese_fragili')
      counters[me] = COUNTER * FORCE_MULT[fm.force] * eff[foe] * jitter() * heat
    const healBase = healsBig(m) ? SUPER_HEAL * (m.weak ? WEAK_SUPER : 1) : m.type === 'cura' ? HEAL * FORCE_MULT[m.force] : 0
    heal[me] = healBase * healMult * eff[me] * jitter()
  }
  // Effetto boomerang: chi colpisce si prende un terzo del colpo che ha dato.
  const recoil: [number, number] = rule === 'boomerang' ? [hits[1] / 3, hits[0] / 3] : [0, 0]
  const dealt: [number, number] = [Math.round(hits[1]), Math.round(hits[0])]
  for (const me of [0, 1] as Side[]) if (moves[me].fx === 'rubavita') heal[me] += dealt[me] * LIFESTEAL * healMult
  return {
    heal: [Math.round(heal[0]), Math.round(heal[1])],
    damage: [
      Math.round(hits[0] + counters[0] + recoil[0] + status[0].burn),
      Math.round(hits[1] + counters[1] + recoil[1] + status[1].burn),
    ],
    dealt,
  }
}

/** Come vanno le due mosse secondo le regole, in parole (per il prompt). */
export function baseOutcome(names: [string, string], moves: [Move, Move]): string {
  const [a, b] = names
  const types: [MoveType, MoveType] = [actsAs(moves[0]), actsAs(moves[1])]
  const extra = moves
    .map((m, i) => {
      if (healsBig(m)) return ` ${names[i]} usa il superpotere curativo: recupera tanta vita e intanto para i colpi.`
      if (m.type === 'disperata') return ` ${names[i]} usa la MOSSA DISPERATA: un colpo enorme che nessuna difesa può fermare.`
      if (m.fx === 'finta') return ` ${names[i]} attacca con una finta: inganna chi si difende.`
      return ''
    })
    .join('')
  return outcomeText(a, b, types) + extra
}

function outcomeText(a: string, b: string, types: [MoveType, MoveType]): string {
  const t = types.map((x) => (x === 'disperata' ? 'super' : x)) as [MoveType, MoveType]
  const key = `${t[0]}-${t[1]}`
  const flip = `${t[1]}-${t[0]}`
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
    'super-super': (x, y) => `${x} e ${y} scatenano insieme i loro colpi più forti: impatto devastante per entrambi.`,
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
  /** Il motivo del voto del giudice, in poche parole (per i timbri). */
  verdicts: [string, string]
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
  verdicts: [string, string]
  actions: [string, string]
  sfx: [string, string]
  /** L'evento dell'arena di questo round, se c'era. */
  event: EventRule | null
  /** Vita recuperata e persa da ciascuno; delta = heal − damage. */
  heal: [number, number]
  damage: [number, number]
  delta: [number, number]
  hp: [number, number]
  /** Effetti scattati per ciascuno (es. "BRUCIA", "CARICO"), da mostrare. */
  notes: [string[], string[]]
  summary: string
  end: RoundEnd | null
}

/** Applica un round: effetti, punti vita, stati, barra della rimonta, KO o giuria. */
export function playRound(
  fs: FightState,
  choices: [number, number],
  moves: [Move, Move],
  texts: RoundTexts,
  names: [string, string],
  rand: () => number,
  rule?: EventRule,
): { round: RoundResult; next: FightState } {
  const roundNo = fs.round + 1
  const types: [MoveType, MoveType] = [moves[0].type, moves[1].type]
  const status = fs.status ?? START.status
  const fx = roundEffects(moves, texts.efficacy, rand, heatOf(roundNo), rule, status)
  // Cura e danni si sommano; si mostra solo quello che è successo davvero:
  // niente cura oltre la vita piena, niente "−106" a chi ne aveva 38.
  // `raw` (senza tetto né pavimento) serve a decidere chi crolla peggio se crollano insieme.
  const raw: [number, number] = [fs.hp[0] + fx.heal[0] - fx.damage[0], fs.hp[1] + fx.heal[1] - fx.damage[1]]
  const heal: [number, number] = [fx.heal[0] - Math.max(0, raw[0] - MAX_HP), fx.heal[1] - Math.max(0, raw[1] - MAX_HP)]
  const damage: [number, number] = [fx.damage[0] - Math.max(0, -raw[0]), fx.damage[1] - Math.max(0, -raw[1])]
  const hp: [number, number] = [fs.hp[0] + heal[0] - damage[0], fs.hp[1] + heal[1] - damage[1]]

  // Effetti che passano al round dopo.
  const notes: [string[], string[]] = [[], []]
  const nextStatus: [Status, Status] = [{ ...CALM }, { ...CALM }]
  for (const me of [0, 1] as Side[]) {
    const foe: Side = me === 0 ? 1 : 0
    const m = moves[me]
    if (status[me].burn) notes[me].push(`IN FIAMME −${status[me].burn}`)
    const usesCharge = hitsHard(m) && m.type !== 'disperata'
    if (status[me].charged && usesCharge) notes[me].push('COLPO CARICO')
    // La carica non usata resta; un colpo la consuma (la disperata non la usa).
    nextStatus[me].charged = m.fx === 'carica' || (status[me].charged && !usesCharge)
    if (m.fx === 'carica') notes[me].push('SI CARICA')
    if (m.fx === 'scudo') {
      nextStatus[me].shield = true
      notes[me].push('SCUDO ALZATO')
    }
    if (m.fx === 'rubavita' && fx.dealt[me] > 0) notes[me].push('RUBA VITA')
    if (m.fx === 'finta' && moves[foe].type === 'difesa') notes[me].push('FINTA RIUSCITA')
    const landed = fx.dealt[me] > 0 || (m.type === 'difesa' && hitsHard(moves[foe]))
    if (m.fx === 'brucia' && fx.dealt[me] > 0) {
      nextStatus[foe].burn = BURN
      notes[me].push('DÀ FUOCO')
    }
    if (m.fx === 'stordisce' && landed) {
      nextStatus[foe].stunned = true
      notes[me].push('STORDISCE')
    }
    if (m.type === 'disperata') notes[me].push('MOSSA DISPERATA')
  }

  // Barra della rimonta: si riempie con i colpi presi, si svuota con la mossa disperata.
  const rage: [number, number] = [0, 0]
  for (const me of [0, 1] as Side[]) rage[me] = types[me] === 'disperata' ? 0 : Math.min(RAGE_MAX, (fs.rage?.[me] ?? 0) + damage[me])

  let end: RoundEnd | null = null
  const better = (): Side => (raw[0] === raw[1] ? (rand() < 0.5 ? 0 : 1) : raw[0] > raw[1] ? 0 : 1)
  if (hp[0] <= 0 || hp[1] <= 0) {
    // Se crollano entrambi resta in piedi chi è messo meno peggio.
    const winner = hp[0] > 0 ? 0 : hp[1] > 0 ? 1 : better()
    const loser: Side = winner === 0 ? 1 : 0
    if (hp[winner] <= 0) {
      // Crollati insieme: il vincitore resta in piedi per un soffio.
      hp[winner] = 1
      damage[winner] -= 1
    }
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
    round: {
      choices,
      types,
      efficacy: texts.efficacy,
      verdicts: texts.verdicts,
      actions: texts.actions,
      sfx: texts.sfx,
      event: rule ?? null,
      heal,
      damage,
      delta: [heal[0] - damage[0], heal[1] - damage[1]],
      hp,
      notes,
      summary: texts.summary,
      end,
    },
    next: {
      hp,
      superUsed: [fs.superUsed[0] || types[0] === 'super', fs.superUsed[1] || types[1] === 'super'],
      desperateUsed: [(fs.desperateUsed?.[0] ?? false) || types[0] === 'disperata', (fs.desperateUsed?.[1] ?? false) || types[1] === 'disperata'],
      rage,
      lastType: types,
      status: nextStatus,
      round: roundNo,
    },
  }
}

/** La mossa migliore del vincitore: quella che ha fatto più male. */
export function mvpOf(rounds: RoundResult[], winner: Side, opening: Opening): string {
  const loser: Side = winner === 0 ? 1 : 0
  let best: RoundResult | undefined
  for (const r of rounds) if (!best || r.damage[loser] > best.damage[loser]) best = r
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

type BasicType = 'attacco' | 'difesa' | 'cura'

/** Composizioni di riserva: tipo, forza ed effetto delle 3 mosse oltre al superpotere. */
const KITS: [BasicType, Force, MoveFx][][] = [
  [['attacco', 2, 'brucia'], ['difesa', 2, 'stordisce'], ['cura', 2, 'scudo']],
  [['attacco', 3, 'stordisce'], ['attacco', 1, 'finta'], ['difesa', 2, 'carica']],
  [['attacco', 2, 'rubavita'], ['attacco', 2, 'brucia'], ['cura', 2, 'carica']],
  [['attacco', 2, 'finta'], ['difesa', 3, 'scudo'], ['difesa', 1, 'stordisce']],
  [['attacco', 3, 'carica'], ['cura', 2, 'scudo'], ['difesa', 1, 'stordisce']],
  [['attacco', 2, 'stordisce'], ['difesa', 2, 'scudo'], ['cura', 2, 'carica']],
]

/** Indice della mossa disperata in opening.moves[side]. */
export const DESPERATE_INDEX = MOVES_PER_MONSTER

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Mosse di riserva costruite dalle carte, se l'AI non le dà (o non è raggiungibile). Variano da mostro a mostro. */
export function fallbackMoves(f: Fighter): Move[] {
  const m = f.monster
  const kit = KITS[hash(m.character.id + m.personality.id) % KITS.length]
  const names: Record<BasicType, [string, string][]> = {
    attacco: [
      [`Colpo di ${lower(m.weapon.name)}`, m.weapon.desc],
      [`${m.weapon.name} a tradimento`, 'Quando meno te lo aspetti.'],
    ],
    difesa: [
      ['Guardia alta', `Si ripara, ${lower(m.personality.name)} com’è.`],
      ['Finta di svenire', 'Nessuno colpisce chi è già a terra. O quasi.'],
    ],
    cura: [
      ['Pausa merenda', 'Un panino, un sorso d’acqua, si riparte.'],
      ['Respiro profondo', 'Inspira, espira, dimentica i lividi.'],
    ],
  }
  const used: Record<string, number> = {}
  const moves: Move[] = kit.map(([type, force, fx]) => {
    const k = (used[type] = (used[type] ?? -1) + 1)
    const [name, desc] = names[type][k % 2]
    return { type, force, fx, name, desc }
  })
  fitBudget(moves, forceBudget(f))
  return [
    ...moves,
    superMove(f, m.power.name, m.power.desc, HEALING_POWER_IDS.has(m.power.id) ? 'cura' : 'colpo'),
    desperateMove(`Tutto o niente: ${lower(m.weapon.name)}`, `${m.character.name} mette tutto in un ultimo colpo disperato.`),
  ]
}

const desperateMove = (name: string, desc: string): Move => ({ type: 'disperata', force: 3, name, desc })

const isFx = (v: unknown, type: BasicType): v is MoveFx => FX_BY_TYPE[type].includes(v as MoveFx)

/** Chi ha ricevuto una carta trappola ha meno forza da distribuire tra le mosse. */
export const forceBudget = (f: Fighter) => (Object.values(f.monster).some((c) => c.cursed) ? FORCE_BUDGET - 1 : FORCE_BUDGET)

/** Porta la somma delle forze al budget, togliendo o aggiungendo un punto alla volta. */
function fitBudget(moves: Move[], budget: number) {
  let sum = moves.reduce((s, m) => s + m.force, 0)
  for (let guard = 0; sum !== budget && guard < 10; guard++) {
    const down = sum > budget
    const pick = [...moves].sort((a, b) => (down ? b.force - a.force : a.force - b.force))[0]
    if ((down && pick.force === 1) || (!down && pick.force === 3)) break
    pick.force = (pick.force + (down ? -1 : 1)) as Force
    sum += down ? -1 : 1
  }
}

function superMove(f: Fighter, name: string, desc: string, effect: Move['effect']): Move {
  // Superpotere trappola: funziona, ma male.
  return { type: 'super', force: 3, effect, name, desc, ...(f.monster.power.cursed ? { weak: true } : {}) }
}

const isMoveType = (v: unknown): v is MoveType => MOVE_ORDER.includes(v as MoveType)

/**
 * Valida le mosse dell'AI: 3 mosse di base con effetto, un solo superpotere,
 * almeno un attacco, forze 1-3 che sommano al budget, e la mossa disperata
 * in fondo. Se qualcosa non torna si ripara con le mosse di riserva invece di
 * buttare via tutto.
 */
export function normalizeMoves(raw: unknown, f: Fighter, rawDesperate?: unknown): Move[] {
  const backup = fallbackMoves(f)
  const list = (Array.isArray(raw) ? raw : []).map((x) => (x ?? {}) as Record<string, unknown>)
  const superRaw = list.find((m) => m.type === 'super')
  const desperateRaw = (rawDesperate ?? list.find((m) => m.type === 'disperata')) as Record<string, unknown> | undefined
  const others = list.filter((m) => m !== superRaw && m.type !== 'disperata').slice(0, MOVES_PER_MONSTER - 1)
  const moves: Move[] = backup.slice(0, MOVES_PER_MONSTER - 1).map((b, k) => {
    const m = others[k]
    if (!m) return b
    const type = (isMoveType(m.type) && m.type !== 'super' ? m.type : b.type) as BasicType
    const force = [1, 2, 3].includes(Number(m.force)) ? (Number(m.force) as Force) : 2
    const fx = isFx(m.fx, type) ? m.fx : FX_BY_TYPE[type][k % FX_BY_TYPE[type].length]
    return { type, force, fx, name: text(m.name, 40) || b.name, desc: text(m.desc, 140) || b.desc }
  })
  if (!moves.some((m) => m.type === 'attacco')) moves[0] = { ...moves[0], type: 'attacco', fx: 'stordisce' }
  fitBudget(moves, forceBudget(f))
  const sup = backup[MOVES_PER_MONSTER - 1]
  const effect = superRaw?.effect === 'cura' || superRaw?.effect === 'colpo' ? superRaw.effect : sup.effect
  moves.push(superMove(f, text(superRaw?.name, 40) || sup.name, text(superRaw?.desc, 140) || sup.desc, effect))
  const des = backup[DESPERATE_INDEX]
  moves.push(desperateMove(text(desperateRaw?.name, 40) || des.name, text(desperateRaw?.desc, 140) || des.desc))
  return moves
}

/** Scena di riserva per un evento, se l'AI non la scrive. */
function eventText(rule: EventRule, arena: Card): string {
  const where = lower(arena.name)
  const scenes: Record<EventRule, string> = {
    difese_fragili: `Colpo di scena a ${where}: tutto trema e ogni scudo va in pezzi.`,
    cure_bloccate: `A ${where} qualcuno ha finito le scorte: niente pause, niente merende.`,
    furia: `Il pubblico di ${where} impazzisce e la furia contagia i combattenti.`,
    boomerang: `A ${where} ogni cosa rimbalza: chi colpisce rischia di farsi male da solo.`,
    ristoro: `A ${where} arriva un vassoio di ristoro gratuito per tutti.`,
    seconda_carica: `Un fulmine colpisce ${where}: i superpoteri si ricaricano!`,
  }
  return scenes[rule]
}

/** Gli eventi in calendario, con la scena scritta dall'AI (nell'ordine) o di riserva. */
export function buildEvents(schedule: { round: number; rule: EventRule }[], arena: Card, rawEvents?: unknown): ArenaEvent[] {
  const list = Array.isArray(rawEvents) ? rawEvents : []
  return schedule.map((e, i) => {
    const x = list[i] as Record<string, unknown> | string | undefined
    const t = typeof x === 'string' ? x : x?.text
    return { ...e, text: text(t, 220) || eventText(e.rule, arena) }
  })
}

export function normalizeOpening(
  raw: unknown,
  fighters: [Fighter, Fighter],
  source: Opening['source'],
  events: ArenaEvent[] = [],
): Opening | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = text(r.title, 80)
  if (!title) return null
  const rawMoves = pair(r.moves)
  const rawDesperate = pair(r.desperate)
  const moves: [Move[], Move[]] = [normalizeMoves(rawMoves[0], fighters[0], rawDesperate[0]), normalizeMoves(rawMoves[1], fighters[1], rawDesperate[1])]
  const nick = pair(r.nicknames)
  // Eventi: arrivano già decisi (dal server); si accettano solo regole conosciute.
  const okEvents = (Array.isArray(r.events) && !events.length ? (r.events as ArenaEvent[]) : events).filter(
    (e) => e && EVENT_IDS.includes(e.rule) && Number.isInteger(e.round),
  )
  return {
    title,
    intro: text(r.intro, 400),
    nicknames: [text(nick[0], 40) || fighters[0].monster.character.name, text(nick[1], 40) || fighters[1].monster.character.name],
    moves,
    events: okEvents.map((e) => ({ round: e.round, rule: e.rule, text: text(e.text, 220) })),
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
    return Number.isFinite(n) ? Math.round(Math.min(1.25, Math.max(0.8, n)) * 100) / 100 : 1
  }) as [number, number]
  const sfx = pair(r.sfx).map((s, i) => text(s, 14).toUpperCase() || ['SBAM!', 'KRAK!'][i]) as [string, string]
  return {
    efficacy: eff,
    actions,
    sfx,
    ko: pair(r.ko).map((k) => text(k, 400)) as [string, string],
    verdicts: pair(r.verdicts).map((v) => text(v, 90)) as [string, string],
    summary: text(r.summary, 200),
  }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const EPITHETS = ['il Terribile', 'l’Inarrestabile', 'il Leggendario', 'il Distruttore', 'il Magnifico', 'l’Implacabile']
const SFX: Record<MoveType, string[]> = {
  attacco: ['SBAM!', 'POW!', 'KRAK!', 'WHAM!', 'BONK!'],
  difesa: ['CLANG!', 'TUNK!', 'DONG!'],
  cura: ['GLU GLU', 'SLURP!', 'AAAH!'],
  super: ['KABOOM!', 'ZAAAP!', 'BRZZZT!'],
  disperata: ['KA-BLAMM!', 'MEGA-SBAM!', 'BOOOOM!'],
}

export function offlineOpening(fighters: [Fighter, Fighter], arena: Card, rand: () => number = Math.random): Opening {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const name = (f: Fighter) => f.monster.character.name
  return {
    title: `${name(fighters[0])} contro ${name(fighters[1])}`,
    intro: `Signore e signori, benvenuti: ${lower(arena.name)}. ${arena.desc} Che la rissa abbia inizio!`,
    nicknames: [`${name(fighters[0])} ${pick(EPITHETS)}`, `${name(fighters[1])} ${pick(EPITHETS)}`],
    moves: [fallbackMoves(fighters[0]), fallbackMoves(fighters[1])],
    events: buildEvents(scheduleEvents(rand), arena),
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
  const moves: [Move, Move] = [opening.moves[0][choices[0]], opening.moves[1][choices[1]]]
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
        return healsBig(m)
          ? `${names[i]} usa il superpotere: ${m.name}! Si rimette a nuovo mentre i colpi gli rimbalzano addosso.`
          : `${names[i]} scatena il superpotere: ${m.name}! ${m.desc}`
      case 'disperata':
        return `${names[i]}, con le spalle al muro, tenta il tutto per tutto: ${m.name}!`
    }
  }
  return {
    efficacy: [0.85 + rand() * 0.3, 0.85 + rand() * 0.3],
    actions: [act(0), act(1)],
    sfx: [pick(SFX[actsAs(moves[0])]), pick(SFX[actsAs(moves[1])])],
    ko: [
      `${names[0]} va al tappeto e non si rialza. ${names[1]} festeggia sulle macerie.`,
      `${names[1]} va al tappeto e non si rialza. ${names[0]} festeggia sulle macerie.`,
    ],
    verdicts: ['', ''],
    summary: baseOutcome([names[0], names[1]], moves),
  }
}
