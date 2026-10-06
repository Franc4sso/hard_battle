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

/** Quello che il telefono manda al server per la prima parte: solo nomi e id delle carte. */
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

// ---------- tattiche (scelte di nascosto a metà rissa) ----------

export type TacticId = 'attacco' | 'difesa' | 'trucco'

export interface Tactic {
  id: TacticId
  name: string
  desc: string
  /** La tattica che questa batte. */
  beats: TacticId
}

export const TACTICS: readonly Tactic[] = [
  { id: 'attacco', name: 'Attacco totale', desc: 'Tutto in avanti, niente freni.', beats: 'trucco' },
  { id: 'difesa', name: 'Difesa di ferro', desc: 'Para, aspetta, contrattacca.', beats: 'attacco' },
  { id: 'trucco', name: 'Trucco sporco', desc: 'Inganni, distrazioni, colpi bassi.', beats: 'difesa' },
]

export const tacticOf = (id: TacticId): Tactic => TACTICS.find((t) => t.id === id)!
export const isTactic = (v: unknown): v is TacticId => TACTICS.some((t) => t.id === v)

/** Chi vince lo scontro di tattiche, undefined se pari. */
export function clashWinner(t: [TacticId, TacticId]): Side | undefined {
  if (t[0] === t[1]) return undefined
  return tacticOf(t[0]).beats === t[1] ? 0 : 1
}

// ---------- battaglia ----------

export interface BattleRound {
  attacker: Side
  /** La mossa di chi attacca. */
  action: string
  /** Come reagisce l'altro (può essere vuoto). */
  reaction: string
  sfx: string
  damage: number
  /** In questo round l'attaccante usa il superpotere. */
  power: boolean
  /** Colpo di scena (spesso legato all'arena). */
  twist: boolean
  /** Punti vita dopo il round. */
  hp: [number, number]
}

/** Prima parte: presentazione e primi round, nessun KO. Generata mentre si guarda il VS. */
export interface Opening {
  title: string
  intro: string
  rounds: BattleRound[]
  source: 'ai' | 'offline'
}

/** Seconda parte: dopo le tattiche, fino al KO. */
export interface Ending {
  clash: string
  rounds: BattleRound[]
  finale: string
  winner: Side
  reason: string
  mvp: string
  nicknames: [string, string]
  source: 'ai' | 'offline'
}

/** La rissa completa, come la vede l'app. */
export interface Battle {
  title: string
  intro: string
  rounds: BattleRound[]
  /** Indice del primo round dopo le tattiche. */
  tacticAt: number
  tactics: [TacticId, TacticId]
  clash: string
  finale: string
  winner: Side
  reason: string
  mvp: string
  nicknames: [string, string]
  source: 'ai' | 'offline'
}

export const MAX_HP = 100
/** Nella prima parte nessuno scende sotto questa soglia: la rissa è ancora aperta. */
export const OPENING_FLOOR = 35
const FALLBACK_SFX = ['SBAM!', 'KRAK!', 'POW!', 'ZOT!', 'SDENG!', 'WHAM!', 'BONK!', 'SPLAT!']

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function side(v: unknown): Side | undefined {
  if (v === 0 || v === '0') return 0
  if (v === 1 || v === '1') return 1
  return undefined
}

function parseRounds(raw: unknown, max: number, offset = 0): BattleRound[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, max)
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      const dmg = Number(o.damage)
      return {
        attacker: side(o.attacker) ?? (((i + offset) % 2) as Side),
        action: text(o.action ?? o.text, 400),
        reaction: text(o.reaction, 400),
        sfx: text(o.sfx, 14).toUpperCase() || FALLBACK_SFX[(i + offset) % FALLBACK_SFX.length],
        damage: Number.isFinite(dmg) ? Math.round(Math.min(45, Math.max(3, dmg))) : 15,
        power: o.power === true,
        twist: o.twist === true,
        hp: [MAX_HP, MAX_HP] as [number, number],
      }
    })
    .filter((r) => r.action)
}

/**
 * Ricalcola i punti vita in modo coerente con la storia. Senza vincitore (prima parte)
 * nessuno scende sotto OPENING_FLOOR; con un vincitore lui resta in piedi e il perdente
 * va a zero sull'ultimo colpo del vincitore.
 */
function applyHp(rounds: BattleRound[], start: [number, number], winner?: Side) {
  const hp: [number, number] = [start[0], start[1]]
  const loser = winner === undefined ? undefined : winner === 0 ? 1 : 0
  let ko = -1
  if (winner !== undefined) rounds.forEach((r, i) => r.attacker === winner && (ko = i))
  rounds.forEach((r, i) => {
    const target: Side = r.attacker === 0 ? 1 : 0
    let dmg = r.damage
    if (winner === undefined) dmg = Math.min(dmg, hp[target] - OPENING_FLOOR)
    else if (target === winner) dmg = Math.min(dmg, hp[winner] - 5)
    else if (i === ko) dmg = hp[target]
    else dmg = Math.min(dmg, hp[target] - 5)
    r.damage = Math.max(0, dmg)
    hp[target] -= r.damage
    r.hp = [hp[0], hp[1]]
  })
  // Il vincitore non attacca mai (risposta strana dell'AI): il KO arriva comunque alla fine.
  if (loser !== undefined && ko === -1 && rounds.length) rounds[rounds.length - 1].hp[loser] = 0
}

export function normalizeOpening(raw: unknown, source: Opening['source']): Opening | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const rounds = parseRounds(r.rounds, 3).map((x) => ({ ...x, power: false }))
  if (rounds.length < 1) return null
  applyHp(rounds, [MAX_HP, MAX_HP])
  return { title: text(r.title, 80) || 'Rissa senza nome', intro: text(r.intro, 400), rounds, source }
}

export function normalizeEnding(raw: unknown, start: [number, number], source: Ending['source']): Ending | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const winner = side(r.winner)
  if (winner === undefined) return null
  const rounds = parseRounds(r.rounds, 5, 1)
  if (rounds.length < 1) return null
  applyHp(rounds, start, winner)
  const nick = Array.isArray(r.nicknames) ? r.nicknames : []
  return {
    clash: text(r.clash, 400),
    rounds,
    finale: text(r.finale, 500),
    winner,
    reason: text(r.reason, 300),
    mvp: text(r.mvp, 100),
    nicknames: [text(nick[0], 40), text(nick[1], 40)],
    source,
  }
}

/** Punti vita alla fine della prima parte. */
export const hpAfter = (o: Opening): [number, number] => o.rounds[o.rounds.length - 1]?.hp ?? [MAX_HP, MAX_HP]

export function combine(opening: Opening, ending: Ending, tactics: [TacticId, TacticId], fighters: [Fighter, Fighter]): Battle {
  return {
    title: opening.title,
    intro: opening.intro,
    rounds: [...opening.rounds, ...ending.rounds],
    tacticAt: opening.rounds.length,
    tactics,
    clash: ending.clash,
    finale: ending.finale,
    winner: ending.winner,
    reason: ending.reason,
    mvp: ending.mvp,
    nicknames: [ending.nicknames[0] || fighters[0].monster.character.name, ending.nicknames[1] || fighters[1].monster.character.name],
    source: opening.source === 'ai' && ending.source === 'ai' ? 'ai' : 'offline',
  }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const name = (f: Fighter) => f.monster.character.name

const ATTACKS = [
  (a: Fighter, b: Fighter) => `${name(a)} afferra ${lower(a.monster.weapon.name)} e carica ${name(b)} a testa bassa.`,
  (a: Fighter, b: Fighter) => `Con un ghigno, ${name(a)} fa roteare ${lower(a.monster.weapon.name)} e lo scaglia contro ${name(b)}.`,
  (a: Fighter) => `${name(a)}, ${lower(a.monster.personality.name)}, annuncia la sua mossa segreta e colpisce con ${lower(a.monster.weapon.name)}.`,
  (a: Fighter, b: Fighter) => `${name(a)} finge di arrendersi, poi sbuca alle spalle di ${name(b)} con ${lower(a.monster.weapon.name)}.`,
  (a: Fighter) => `“Adesso basta!” urla ${name(a)}, e ${lower(a.monster.weapon.name)} parte come un missile.`,
]
const REACTIONS = [
  (b: Fighter) => `${name(b)} barcolla, ma da vero ${lower(b.monster.personality.name)} rifiuta di cadere.`,
  (b: Fighter) => `${name(b)} incassa il colpo e guarda il pubblico con aria offesa.`,
  (b: Fighter) => `${name(b)} prova a schivare, ma inciampa nella propria dignità.`,
  (b: Fighter) => `${name(b)} si rialza e promette vendetta.`,
]
const EPITHETS = ['il Terribile', 'l’Inarrestabile', 'il Leggendario', 'il Distruttore', 'il Magnifico', 'l’Implacabile']

export function offlineOpening(fighters: [Fighter, Fighter], arena: Card, rand: () => number = Math.random): Opening {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const first: Side = rand() < 0.5 ? 0 : 1
  const raw = {
    title: `${name(fighters[0])} contro ${name(fighters[1])}`,
    intro: `Signore e signori, benvenuti: ${lower(arena.name)}. ${arena.desc} Che la rissa abbia inizio!`,
    rounds: [first, first === 0 ? 1 : 0].map((att) => {
      const a = fighters[att]
      const b = fighters[att === 0 ? 1 : 0]
      return { attacker: att, action: pick(ATTACKS)(a, b), reaction: pick(REACTIONS)(b), damage: 10 + Math.floor(rand() * 18) }
    }),
  }
  return normalizeOpening(raw, 'offline')!
}

export function offlineEnding(fighters: [Fighter, Fighter], arena: Card, opening: Opening, tactics: [TacticId, TacticId], rand: () => number = Math.random): Ending {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const tw = clashWinner(tactics)
  // Chi vince lo scontro di tattiche ha buone probabilità di vincere la rissa, non la certezza.
  const winner: Side = tw !== undefined && rand() < 0.7 ? tw : rand() < 0.5 ? 0 : 1
  const loser: Side = winner === 0 ? 1 : 0
  const [w, l] = [fighters[winner], fighters[loser]]
  const t = [tacticOf(tactics[0]), tacticOf(tactics[1])]
  const raw = {
    winner,
    clash:
      tw === undefined
        ? `Entrambi scelgono ${lower(t[0].name)}: lo scontro è alla pari, l’arena trema.`
        : `${t[tw].name} contro ${lower(t[tw === 0 ? 1 : 0].name)}: ${name(fighters[tw])} legge la mossa in anticipo.`,
    rounds: [
      {
        attacker: loser,
        action: `${name(l)} usa il superpotere: ${lower(l.monster.power.name)}! ${l.monster.power.desc}`,
        reaction: `${name(w)} vacilla, ma resta in piedi.`,
        damage: 20,
        power: true,
      },
      {
        attacker: winner,
        action: `Colpo di scena: ${lower(arena.desc)} ${name(w)} ne approfitta e scatena ${lower(w.monster.power.name)}.`,
        reaction: pick(REACTIONS)(l),
        damage: 30,
        power: true,
        twist: true,
      },
      { attacker: winner, action: pick(ATTACKS)(w, l), reaction: `${name(l)} va al tappeto.`, damage: 40 },
    ],
    finale: `${name(l)} non si rialza. ${name(w)} esulta sopra le macerie: ${lower(arena.name)} non sarà mai più lo stesso.`,
    reason: `Ha sfruttato meglio ${lower(w.monster.weapon.name)} e il suo superpotere.`,
    mvp: lower(w.monster.power.name),
    nicknames: fighters.map((f) => `${name(f)} ${pick(EPITHETS)}`),
  }
  return normalizeEnding(raw, hpAfter(opening), 'offline')!
}
