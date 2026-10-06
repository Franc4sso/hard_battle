import { ARENAS, DECKS, SLOTS, type Card, type Slot } from '../../shared/cards'
import type { Battle, BattleRequest, Monster, Side } from '../../shared/battle'
import { Rng } from './rng'

export const REROLLS_PER_ROUND = 1
export const OFFER_SIZE = 3

export type Phase = 'pass' | 'pick' | 'ready' | 'versus' | 'battle' | 'verdict' | 'final'

export interface MatchPlayer {
  name: string
  wins: number
}

export interface RoundRecord {
  round: number
  arena: Card
  monsters: [Monster, Monster]
  winner: Side
  title: string
  mvp: string
}

export interface MatchState {
  version: 1
  seed: number
  bestOf: number
  players: [MatchPlayer, MatchPlayer]
  round: number
  /** Chi crea il mostro per primo in questo round (si alterna). */
  first: Side
  /** Chi sta creando il mostro adesso. */
  picker: Side
  /** Indice in SLOTS della carta da scegliere. */
  step: number
  offer: Card[]
  rerolls: [number, number]
  draft: Partial<Monster>
  monsters: [Monster | null, Monster | null]
  arena: Card
  battle: Battle | null
  /** Id già usciti nella partita, per non rivedere sempre le stesse carte. */
  drawn: string[]
  history: RoundRecord[]
  phase: Phase
}

export type Action =
  | { type: 'beginPick' }
  | { type: 'pick'; index: number }
  | { type: 'reroll' }
  | { type: 'confirm' }
  | { type: 'fight' }
  | { type: 'battleReady'; battle: Battle }
  | { type: 'verdict' }
  | { type: 'nextRound' }

export const other = (s: Side): Side => (s === 0 ? 1 : 0)
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

/** Pesca n carte distinte non ancora uscite; se il mazzo è finito lo rimescola. */
function draw(rng: Rng, deck: Card[], drawn: string[], n: number): { cards: Card[]; drawn: string[] } {
  let pool = deck.filter((c) => !drawn.includes(c.id))
  let used = drawn
  if (pool.length < n) {
    const ids = new Set(deck.map((c) => c.id))
    used = drawn.filter((id) => !ids.has(id))
    pool = [...deck]
  }
  const cards: Card[] = []
  for (let i = 0; i < n; i++) cards.push(pool.splice(rng.int(pool.length), 1)[0])
  return { cards, drawn: [...used, ...cards.map((c) => c.id)] }
}

function withOffer(state: MatchState, rng: Rng, slot: Slot): MatchState {
  const { cards, drawn } = draw(rng, DECKS[slot], state.drawn, OFFER_SIZE)
  return { ...state, offer: cards, drawn, seed: rng.seed }
}

function startRound(state: MatchState, round: number, first: Side): MatchState {
  const rng = new Rng(state.seed)
  const arena = draw(rng, ARENAS, state.drawn, 1)
  const base: MatchState = {
    ...state,
    round,
    first,
    picker: first,
    step: 0,
    rerolls: [REROLLS_PER_ROUND, REROLLS_PER_ROUND],
    draft: {},
    monsters: [null, null],
    arena: arena.cards[0],
    drawn: arena.drawn,
    battle: null,
    phase: 'pass',
  }
  return withOffer(base, rng, 'character')
}

export function createMatch(names: [string, string], bestOf: number, seed: number): MatchState {
  const blank: MatchState = {
    version: 1,
    seed,
    bestOf,
    players: [
      { name: names[0], wins: 0 },
      { name: names[1], wins: 0 },
    ],
    round: 1,
    first: 0,
    picker: 0,
    step: 0,
    offer: [],
    rerolls: [REROLLS_PER_ROUND, REROLLS_PER_ROUND],
    draft: {},
    monsters: [null, null],
    arena: ARENAS[0],
    battle: null,
    drawn: [],
    history: [],
    phase: 'pass',
  }
  return startRound(blank, 1, 0)
}

export const currentSlot = (s: MatchState): Slot => SLOTS[Math.min(s.step, SLOTS.length - 1)]

export function matchWinner(s: MatchState): Side | undefined {
  const need = winsNeeded(s.bestOf)
  if (s.players[0].wins >= need) return 0
  if (s.players[1].wins >= need) return 1
  return undefined
}

export function reduce(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case 'beginPick':
      return state.phase === 'pass' ? { ...state, phase: 'pick' } : state

    case 'pick': {
      const card = state.offer[action.index]
      if (state.phase !== 'pick' || !card) return state
      const draft = { ...state.draft, [currentSlot(state)]: card }
      const step = state.step + 1
      if (step >= SLOTS.length) return { ...state, draft, step, offer: [], phase: 'ready' }
      return withOffer({ ...state, draft, step }, new Rng(state.seed), SLOTS[step])
    }

    case 'reroll': {
      if (state.phase !== 'pick' || state.rerolls[state.picker] <= 0) return state
      const rerolls: [number, number] = [...state.rerolls]
      rerolls[state.picker] -= 1
      return withOffer({ ...state, rerolls }, new Rng(state.seed), currentSlot(state))
    }

    case 'confirm': {
      if (state.phase !== 'ready') return state
      const monsters: [Monster | null, Monster | null] = [...state.monsters]
      monsters[state.picker] = state.draft as Monster
      const next = other(state.picker)
      if (monsters[next]) return { ...state, monsters, draft: {}, phase: 'versus' }
      return withOffer({ ...state, monsters, picker: next, step: 0, draft: {}, phase: 'pass' }, new Rng(state.seed), 'character')
    }

    case 'fight':
      return state.phase === 'versus' ? { ...state, battle: null, phase: 'battle' } : state

    case 'battleReady': {
      if (state.phase !== 'battle' || state.battle) return state
      const b = action.battle
      const players: [MatchPlayer, MatchPlayer] = [{ ...state.players[0] }, { ...state.players[1] }]
      players[b.winner].wins += 1
      const record: RoundRecord = {
        round: state.round,
        arena: state.arena,
        monsters: state.monsters as [Monster, Monster],
        winner: b.winner,
        title: b.title,
        mvp: b.mvp,
      }
      return { ...state, battle: b, players, history: [...state.history, record] }
    }

    case 'verdict':
      return state.phase === 'battle' && state.battle ? { ...state, phase: 'verdict' } : state

    case 'nextRound':
      if (state.phase !== 'verdict') return state
      if (matchWinner(state) !== undefined) return { ...state, phase: 'final' }
      return startRound(state, state.round + 1, other(state.first))

    default:
      return state
  }
}

/** La richiesta per il server: solo id. */
export function battleRequest(s: MatchState): BattleRequest {
  const [a, b] = s.monsters as [Monster, Monster]
  const ids = (m: Monster, player: string) => ({
    player,
    character: m.character.id,
    weapon: m.weapon.id,
    personality: m.personality.id,
    power: m.power.id,
  })
  return { arena: s.arena.id, fighters: [ids(a, s.players[0].name), ids(b, s.players[1].name)] }
}
