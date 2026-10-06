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

/** Quello che il telefono manda al server: solo nomi e id delle carte. */
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

export interface Battle {
  title: string
  intro: string
  rounds: BattleRound[]
  finale: string
  winner: Side
  reason: string
  mvp: string
  source: 'ai' | 'offline'
}

export const MAX_HP = 100
const FALLBACK_SFX = ['SBAM!', 'KRAK!', 'POW!', 'ZOT!', 'SDENG!', 'WHAM!', 'BONK!', 'SPLAT!']

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function side(v: unknown): Side | undefined {
  if (v === 0 || v === '0') return 0
  if (v === 1 || v === '1') return 1
  return undefined
}

/**
 * Valida e ripulisce una battaglia arrivata dall'AI (o da ovunque) e ricalcola
 * i punti vita in modo coerente: il vincitore resta in piedi, il perdente
 * va a zero sull'ultimo colpo del vincitore.
 */
export function normalizeBattle(raw: unknown, source: Battle['source']): Battle | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const winner = side(r.winner)
  if (winner === undefined || !Array.isArray(r.rounds)) return null

  const rounds = r.rounds
    .slice(0, 8)
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      const attacker = side(o.attacker) ?? ((i % 2) as Side)
      const dmg = Number(o.damage)
      return {
        attacker,
        action: text(o.action ?? o.text, 400),
        reaction: text(o.reaction, 400),
        sfx: text(o.sfx, 14).toUpperCase() || FALLBACK_SFX[i % FALLBACK_SFX.length],
        damage: Number.isFinite(dmg) ? Math.round(Math.min(45, Math.max(3, dmg))) : 15,
        power: o.power === true,
        twist: o.twist === true,
        hp: [MAX_HP, MAX_HP] as [number, number],
      }
    })
    .filter((x) => x.action)
  if (rounds.length < 3) return null

  const loser: Side = winner === 0 ? 1 : 0
  let ko = -1
  rounds.forEach((x, i) => {
    if (x.attacker === winner) ko = i
  })
  const hp: [number, number] = [MAX_HP, MAX_HP]
  rounds.forEach((x, i) => {
    const target: Side = x.attacker === 0 ? 1 : 0
    let dmg = x.damage
    if (target === winner) dmg = Math.max(0, Math.min(dmg, hp[winner] - 5))
    else if (i === ko) dmg = hp[loser]
    else dmg = Math.max(0, Math.min(dmg, hp[loser] - 5))
    x.damage = dmg
    hp[target] -= dmg
    x.hp = [hp[0], hp[1]]
  })
  // Il vincitore non attacca mai (risposta strana dell'AI): il KO arriva comunque alla fine.
  if (ko === -1) rounds[rounds.length - 1].hp[loser] = 0

  return {
    title: text(r.title, 80) || 'Rissa senza nome',
    intro: text(r.intro, 400),
    rounds,
    finale: text(r.finale, 500),
    winner,
    reason: text(r.reason, 300),
    mvp: text(r.mvp, 100),
    source,
  }
}

// ---------- narratore di riserva (senza rete o senza AI) ----------

const ATTACKS = [
  (a: Fighter, b: Fighter) =>
    `${a.monster.character.name} afferra ${lower(a.monster.weapon.name)} e carica ${b.monster.character.name} a testa bassa.`,
  (a: Fighter, b: Fighter) =>
    `Con un ghigno, ${a.monster.character.name} fa roteare ${lower(a.monster.weapon.name)} e lo scaglia contro ${b.monster.character.name}.`,
  (a: Fighter) =>
    `${a.monster.character.name}, ${lower(a.monster.personality.name)}, annuncia la sua mossa segreta e colpisce con ${lower(a.monster.weapon.name)}.`,
  (a: Fighter, b: Fighter) =>
    `${a.monster.character.name} finge di arrendersi, poi sbuca alle spalle di ${b.monster.character.name} con ${lower(a.monster.weapon.name)}.`,
  (a: Fighter) =>
    `“Adesso basta!” urla ${a.monster.character.name}, e ${lower(a.monster.weapon.name)} parte come un missile.`,
]
const REACTIONS = [
  (b: Fighter) => `${b.monster.character.name} barcolla, ma da vero ${lower(b.monster.personality.name)} rifiuta di cadere.`,
  (b: Fighter) => `${b.monster.character.name} incassa il colpo e guarda il pubblico con aria offesa.`,
  (b: Fighter) => `${b.monster.character.name} prova a schivare, ma inciampa nella propria dignità.`,
  (b: Fighter) => `${b.monster.character.name} si rialza e promette vendetta.`,
]

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function offlineBattle(fighters: [Fighter, Fighter], arena: Card, rand: () => number = Math.random): Battle {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const winner: Side = rand() < 0.5 ? 0 : 1
  const loser: Side = winner === 0 ? 1 : 0
  const order: Side[] = [winner, loser, loser, winner, winner]
  const raw = {
    winner,
    title: `${fighters[0].monster.character.name} contro ${fighters[1].monster.character.name}`,
    intro: `Signore e signori, benvenuti: ${lower(arena.name)}. ${arena.desc} Che la rissa abbia inizio!`,
    rounds: order.map((att, i) => {
      const a = fighters[att]
      const b = fighters[att === 0 ? 1 : 0]
      if (i === 2)
        return {
          attacker: att,
          action: `${a.monster.character.name} usa il superpotere: ${lower(a.monster.power.name)}! ${a.monster.power.desc}`,
          reaction: `${b.monster.character.name} non ci capisce più niente.`,
          damage: 25,
          power: true,
        }
      if (i === 3)
        return {
          attacker: att,
          action: `Colpo di scena: ${lower(arena.desc)} ${a.monster.character.name} ne approfitta all'istante.`,
          reaction: pick(REACTIONS)(b),
          damage: 20,
          twist: true,
        }
      return { attacker: att, action: pick(ATTACKS)(a, b), reaction: pick(REACTIONS)(b), damage: 10 + Math.floor(rand() * 20) }
    }),
    finale: `${fighters[loser].monster.character.name} va al tappeto. ${fighters[winner].monster.character.name} esulta sopra le macerie: ${lower(arena.name)} non sarà mai più lo stesso.`,
    reason: `Ha sfruttato meglio ${lower(fighters[winner].monster.weapon.name)} e il suo superpotere.`,
    mvp: lower(fighters[winner].monster.power.name),
  }
  return normalizeBattle(raw, 'offline')!
}
