import { STAGE_WINS, stageOf, type Monster, type Side, type Stage } from '../../shared/battle'
import type { MatchState } from './match'

/** Quello che serve al bestiario di una rissa finita. */
export interface BattleOutcome {
  winner: Side
  nicknames: [string, string]
  title: string
  /** La cicatrice di chi ha vinto e il suo soprannome da evoluto, se con questa vittoria evolve. */
  scar?: string
  evoName?: string | null
}

/**
 * Il bestiario vive sul telefono (localStorage): niente database, niente account.
 * Un mostro è identificato da chi l'ha creato e dalle sue quattro carte.
 * Vince: una cicatrice, e ogni tanto un'evoluzione. Perde: lo sfigato incombe.
 */
const KEY = 'rissa:bestiary:v1'
const MAX_ENTRIES = 150
export const MAX_SCARS = 5
/** Sconfitte di fila per il titolo di Sfigato. */
export const LOSS_STREAK = 3

export interface BestiaryEntry {
  key: string
  owner: string
  monster: Monster
  nickname: string
  wins: number
  losses: number
  lastTitle: string
  updatedAt: number
  /** Le cicatrici delle vittorie, le più recenti prima. */
  scars?: string[]
  /** Sconfitte di fila (si azzera alla prima vittoria). */
  lossStreak?: number
  /** Il soprannome da evoluto, scelto dall'AI al momento dell'evoluzione. */
  evoName?: string
}

export const monsterKey = (owner: string, m: Monster) =>
  [owner.trim().toLowerCase(), m.character.id, m.weapon.id, m.personality.id, m.power.id].join('|')

export const entryStage = (e: Pick<BestiaryEntry, 'wins'>): Stage => stageOf(e.wins)
export const isSfigato = (e: Pick<BestiaryEntry, 'lossStreak'>) => (e.lossStreak ?? 0) >= LOSS_STREAK
/** Il nome con cui si presenta: da evoluto se ha evoluto, da sfigato se lo è, se no il soprannome dell'ultima rissa. */
export function displayName(e: BestiaryEntry): string {
  if (isSfigato(e)) return `${e.nickname || e.monster.character.name} lo Sfigato`
  return (entryStage(e) > 0 && e.evoName) || e.nickname || e.monster.character.name
}
/** Vittorie che mancano alla prossima evoluzione (0 = non ce ne sono più). */
export function winsToNextStage(wins: number): number {
  const next = STAGE_WINS.find((w) => w > wins)
  return next === undefined ? 0 : next - wins
}
export const STAGE_LABEL: Record<Stage, string> = { 0: 'Esordiente', 1: 'Campione', 2: 'Leggenda' }

export function loadBestiary(): BestiaryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as BestiaryEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list: BestiaryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage pieno o bloccato: il bestiario non si aggiorna, il gioco va avanti.
  }
}

/** Il mostro come torna in campo: con lo stadio raggiunto nel bestiario. */
export function championMonster(e: BestiaryEntry): Monster {
  const stage = entryStage(e)
  return stage ? { ...e.monster, stage } : e.monster
}

/** Il bestiario aggiornato con l'esito di una rissa (funzione pura, per i test). */
export function withBattle(list: BestiaryEntry[], s: MatchState, battle: BattleOutcome, now = Date.now()): BestiaryEntry[] {
  const next = [...list]
  for (const side of [0, 1] as Side[]) {
    const monster = s.monsters[side]
    if (!monster) continue
    const owner = s.players[side].name
    const key = monsterKey(owner, monster)
    const won = battle.winner === side
    const i = next.findIndex((e) => e.key === key)
    const base: BestiaryEntry = i >= 0 ? next[i] : { key, owner, monster, nickname: '', wins: 0, losses: 0, lastTitle: '', updatedAt: now }
    const wins = base.wins + (won ? 1 : 0)
    const lossStreak = won ? 0 : (base.lossStreak ?? 0) + 1
    const scars = [...(base.scars ?? [])]
    if (won && battle.scar) scars.unshift(battle.scar)
    // Tre sconfitte di fila: una cicatrice umiliante, in più.
    if (!won && lossStreak === LOSS_STREAK) scars.unshift(`Perso ${LOSS_STREAK} risse di fila. L’ultima contro ${battle.nicknames[other(side)] || 'un tizio qualunque'}.`)
    // Evolve adesso: il soprannome nuovo resta per sempre.
    const evolves = won && stageOf(wins) > stageOf(base.wins)
    const entry: BestiaryEntry = {
      ...base,
      // Il mostro salvato è quello delle carte: lo stadio si ricava dalle vittorie.
      monster: { ...monster, stage: undefined },
      owner,
      nickname: battle.nicknames[side] || base.nickname || monster.character.name,
      wins,
      losses: base.losses + (won ? 0 : 1),
      lastTitle: battle.title,
      updatedAt: now,
      scars: scars.slice(0, MAX_SCARS),
      lossStreak,
      ...(evolves && battle.evoName ? { evoName: battle.evoName } : {}),
    }
    if (i >= 0) next[i] = entry
    else next.push(entry)
  }
  // Se è pieno se ne vanno i meno vincenti e più vecchi.
  return next.sort((a, b) => b.wins - a.wins || b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES)
}

const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function recordBattle(s: MatchState, battle: BattleOutcome) {
  save(withBattle(loadBestiary(), s, battle))
}

export function removeEntry(key: string) {
  save(loadBestiary().filter((e) => e.key !== key))
}

/** I campioni di un giocatore (per nome, senza badare alle maiuscole), i più vincenti prima. */
export function championsOf(list: BestiaryEntry[], owner: string): BestiaryEntry[] {
  const o = owner.trim().toLowerCase()
  return list.filter((e) => e.owner.trim().toLowerCase() === o)
}

/** Nel bestiario, il mostro di un giocatore in questa partita (per sapere se con la prossima vittoria evolve). */
export function entryFor(list: BestiaryEntry[], s: MatchState, side: Side): BestiaryEntry | undefined {
  const m = s.monsters[side]
  return m ? list.find((e) => e.key === monsterKey(s.players[side].name, m)) : undefined
}

/** Chi, vincendo questa rissa, evolve. */
export function evolvingSides(list: BestiaryEntry[], s: MatchState): [boolean, boolean] {
  return [0, 1].map((side) => {
    const e = entryFor(list, s, side as Side)
    const wins = e?.wins ?? 0
    return stageOf(wins + 1) > stageOf(wins)
  }) as [boolean, boolean]
}
