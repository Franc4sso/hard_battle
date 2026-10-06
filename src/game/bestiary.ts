import type { Battle, Monster, Side } from '../../shared/battle'
import type { MatchState } from './match'

/**
 * Il bestiario vive sul telefono (localStorage): niente database, niente account.
 * Un mostro è identificato da chi l'ha creato e dalle sue quattro carte.
 */
const KEY = 'rissa:bestiary:v1'
const MAX_ENTRIES = 150

export interface BestiaryEntry {
  key: string
  owner: string
  monster: Monster
  nickname: string
  wins: number
  losses: number
  lastTitle: string
  updatedAt: number
}

export const monsterKey = (owner: string, m: Monster) =>
  [owner.trim().toLowerCase(), m.character.id, m.weapon.id, m.personality.id, m.power.id].join('|')

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

/** Il bestiario aggiornato con l'esito di una rissa (funzione pura, per i test). */
export function withBattle(list: BestiaryEntry[], s: MatchState, battle: Battle, now = Date.now()): BestiaryEntry[] {
  const next = [...list]
  for (const side of [0, 1] as Side[]) {
    const monster = s.monsters[side]
    if (!monster) continue
    const owner = s.players[side].name
    const key = monsterKey(owner, monster)
    const won = battle.winner === side
    const i = next.findIndex((e) => e.key === key)
    const base: BestiaryEntry = i >= 0 ? next[i] : { key, owner, monster, nickname: '', wins: 0, losses: 0, lastTitle: '', updatedAt: now }
    const entry: BestiaryEntry = {
      ...base,
      owner,
      nickname: battle.nicknames[side] || base.nickname || monster.character.name,
      wins: base.wins + (won ? 1 : 0),
      losses: base.losses + (won ? 0 : 1),
      lastTitle: battle.title,
      updatedAt: now,
    }
    if (i >= 0) next[i] = entry
    else next.push(entry)
  }
  // Se è pieno se ne vanno i meno vincenti e più vecchi.
  return next.sort((a, b) => b.wins - a.wins || b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES)
}

export function recordBattle(s: MatchState, battle: Battle) {
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
