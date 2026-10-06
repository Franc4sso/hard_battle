import { ARENAS, DECKS, SABOTAGE_DECKS, SLOTS, type Card, type Slot } from '../../shared/cards'
import { START, blockedReason, eventAt, mvpOf, type BattleRequest, type FightState, type Monster, type Opening, type RoundEnd, type RoundResult, type Side } from '../../shared/battle'
import { Rng } from './rng'

export const REROLLS_PER_ROUND = 1
export const OFFER_SIZE = 3
/** Le carte che l'avversario può imporre col sabotaggio (il personaggio resta tuo). */
export const SABOTAGE_SLOTS: readonly Slot[] = ['weapon', 'personality', 'power']

export type Phase = 'pass' | 'sabotage' | 'pick' | 'ready' | 'versus' | 'battle' | 'verdict' | 'final'

/** Ogni round: A sabota B, B sabota A e crea il suo mostro, A crea il suo. */
export type Task = 'sabotage' | 'draft'
export interface Turn {
  who: Side
  task: Task
}

export interface MatchPlayer {
  name: string
  wins: number
}

/** La carta imposta a un giocatore dall'avversario. */
export interface Gift {
  slot: Slot
  card: Card | null
}

export interface Fight {
  /** Presentazione e mosse: arriva mentre si guarda il VS. */
  opening: Opening | null
  /** Stato firmato dal server per il prossimo round (null = si continua col narratore di riserva). */
  token: string | null
  fs: FightState
  rounds: RoundResult[]
  /** Mosse scelte in segreto per il round in corso (indici in opening.moves). */
  choices: [number | null, number | null]
  end: RoundEnd | null
}

const freshFight = (): Fight => ({ opening: null, token: null, fs: START, rounds: [], choices: [null, null], end: null })

export interface RoundRecord {
  round: number
  arena: Card
  monsters: [Monster, Monster]
  nicknames: [string, string]
  winner: Side
  title: string
  mvp: string
}

export interface MatchState {
  version: 4
  seed: number
  bestOf: number
  players: [MatchPlayer, MatchPlayer]
  round: number
  /** Chi apre il round (si alterna). */
  first: Side
  /** Indice in turnsFor(first). */
  turn: number
  /** Chi ha il telefono adesso. */
  picker: Side
  /** Indice in draftSlots(picker) della carta da scegliere. */
  step: number
  offer: Card[]
  rerolls: [number, number]
  /** gifts[i] = la carta imposta al giocatore i. */
  gifts: [Gift, Gift]
  draft: Partial<Monster>
  /** Il mostro arriva dal bestiario. */
  champion: boolean
  monsters: [Monster | null, Monster | null]
  arena: Card
  fight: Fight
  /** Id già usciti nella partita, per non rivedere sempre le stesse carte. */
  drawn: string[]
  history: RoundRecord[]
  phase: Phase
}

export type Action =
  | { type: 'beginTurn' }
  | { type: 'sabotage'; index: number }
  | { type: 'pick'; index: number }
  | { type: 'reroll' }
  | { type: 'useChampion'; monster: Monster }
  | { type: 'confirm' }
  | { type: 'fight' }
  | { type: 'openingReady'; opening: Opening; token: string | null }
  | { type: 'choose'; side: Side; move: number }
  | { type: 'roundReady'; round: RoundResult; next: FightState; token: string | null }
  | { type: 'verdict' }
  | { type: 'nextRound' }

export const other = (s: Side): Side => (s === 0 ? 1 : 0)
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

export function turnsFor(first: Side): Turn[] {
  const second = other(first)
  return [
    { who: first, task: 'sabotage' },
    { who: second, task: 'sabotage' },
    { who: second, task: 'draft' },
    { who: first, task: 'draft' },
  ]
}

export const currentTurn = (s: MatchState): Turn => turnsFor(s.first)[s.turn]

/** Le carte che il giocatore sceglie da solo (tutte tranne quella imposta). */
export const draftSlots = (s: MatchState, who: Side): Slot[] => SLOTS.filter((x) => x !== s.gifts[who].slot)

/** La carta su cui si sta decidendo adesso. */
export function currentSlot(s: MatchState): Slot {
  if (s.phase === 'sabotage') return s.gifts[other(s.picker)].slot
  const slots = draftSlots(s, s.picker)
  return slots[Math.min(s.step, slots.length - 1)]
}

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

/** Carte da scegliere: dal mazzo normale, o dal mazzo trappola quando si sabota. */
function withOffer(state: MatchState, slot: Slot, sabotage = false): MatchState {
  const rng = new Rng(state.seed)
  const source = sabotage && slot !== 'character' ? SABOTAGE_DECKS[slot] : DECKS[slot]
  const { cards, drawn } = draw(rng, source, state.drawn, OFFER_SIZE)
  return { ...state, offer: cards, drawn, seed: rng.seed }
}

/** Prepara il turno `turn`: chi ha il telefono, cosa deve fare, quali carte vede. */
function enterTurn(state: MatchState, turn: number, phase: Phase): MatchState {
  const t = turnsFor(state.first)[turn]
  const gift = state.gifts[t.who]
  const next: MatchState = {
    ...state,
    turn,
    picker: t.who,
    step: 0,
    champion: false,
    draft: t.task === 'draft' && gift.card ? { [gift.slot]: gift.card } : {},
    phase,
  }
  return t.task === 'sabotage' ? withOffer(next, state.gifts[other(t.who)].slot, true) : withOffer(next, draftSlots(next, t.who)[0])
}

function startRound(state: MatchState, round: number, first: Side): MatchState {
  const rng = new Rng(state.seed)
  const arena = draw(rng, ARENAS, state.drawn, 1)
  const base: MatchState = {
    ...state,
    seed: rng.seed,
    round,
    first,
    rerolls: [REROLLS_PER_ROUND, REROLLS_PER_ROUND],
    gifts: [
      { slot: rng.pick(SABOTAGE_SLOTS), card: null },
      { slot: rng.pick(SABOTAGE_SLOTS), card: null },
    ],
    monsters: [null, null],
    arena: arena.cards[0],
    drawn: arena.drawn,
    fight: freshFight(),
  }
  return enterTurn(base, 0, 'pass')
}

export function createMatch(names: [string, string], bestOf: number, seed: number): MatchState {
  const blank: MatchState = {
    version: 4,
    seed,
    bestOf,
    players: [
      { name: names[0], wins: 0 },
      { name: names[1], wins: 0 },
    ],
    round: 1,
    first: 0,
    turn: 0,
    picker: 0,
    step: 0,
    offer: [],
    rerolls: [REROLLS_PER_ROUND, REROLLS_PER_ROUND],
    gifts: [
      { slot: 'personality', card: null },
      { slot: 'personality', card: null },
    ],
    draft: {},
    champion: false,
    monsters: [null, null],
    arena: ARENAS[0],
    fight: freshFight(),
    drawn: [],
    history: [],
    phase: 'pass',
  }
  return startRound(blank, 1, 0)
}

export function matchWinner(s: MatchState): Side | undefined {
  const need = winsNeeded(s.bestOf)
  if (s.players[0].wins >= need) return 0
  if (s.players[1].wins >= need) return 1
  return undefined
}

/** L'evento dell'arena del round da giocare, se c'è. */
export const currentEvent = (s: MatchState) => eventAt(s.fight.opening?.events, s.fight.fs.round + 1)

/** Chi sceglie per primo la mossa in questo round: si alterna a ogni round. */
export function roundOpener(s: MatchState): Side {
  return s.fight.rounds.length % 2 === 0 ? s.first : other(s.first)
}

/** Il prossimo giocatore che deve scegliere la mossa, undefined se l'hanno scelta entrambi. */
export function nextChooser(s: MatchState): Side | undefined {
  const o = roundOpener(s)
  return [o, other(o)].find((p) => s.fight.choices[p] === null)
}

export function reduce(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case 'beginTurn':
      return state.phase === 'pass' ? { ...state, phase: currentTurn(state).task === 'sabotage' ? 'sabotage' : 'pick' } : state

    case 'sabotage': {
      const card = state.offer[action.index]
      if (state.phase !== 'sabotage' || !card) return state
      const target = other(state.picker)
      const gifts: [Gift, Gift] = [{ ...state.gifts[0] }, { ...state.gifts[1] }]
      gifts[target].card = card
      const next = { ...state, gifts }
      // Chi ha appena sabotato e ora deve creare il suo mostro non passa il telefono.
      const sameHands = turnsFor(state.first)[state.turn + 1].who === state.picker
      return enterTurn(next, state.turn + 1, sameHands ? 'pick' : 'pass')
    }

    case 'pick': {
      const card = state.offer[action.index]
      if (state.phase !== 'pick' || !card) return state
      const draft = { ...state.draft, [currentSlot(state)]: card }
      const step = state.step + 1
      const slots = draftSlots(state, state.picker)
      if (step >= slots.length) return { ...state, draft, step, offer: [], phase: 'ready' }
      return withOffer({ ...state, draft, step }, slots[step])
    }

    case 'reroll': {
      if (state.phase !== 'pick' || state.rerolls[state.picker] <= 0) return state
      const rerolls: [number, number] = [...state.rerolls]
      rerolls[state.picker] -= 1
      return withOffer({ ...state, rerolls }, currentSlot(state))
    }

    case 'useChampion': {
      if (state.phase !== 'pick') return state
      // Anche un campione si tiene il regalo dell'avversario.
      const gift = state.gifts[state.picker]
      const draft = { ...action.monster, ...(gift.card ? { [gift.slot]: gift.card } : {}) }
      return { ...state, draft, champion: true, offer: [], phase: 'ready' }
    }

    case 'confirm': {
      if (state.phase !== 'ready') return state
      const monsters: [Monster | null, Monster | null] = [...state.monsters]
      monsters[state.picker] = state.draft as Monster
      const next = { ...state, monsters, draft: {} }
      if (state.turn + 1 >= turnsFor(state.first).length) return { ...next, offer: [], phase: 'versus' }
      return enterTurn(next, state.turn + 1, 'pass')
    }

    case 'fight':
      return state.phase === 'versus' ? { ...state, phase: 'battle' } : state

    case 'openingReady':
      if ((state.phase !== 'versus' && state.phase !== 'battle') || state.fight.opening) return state
      return { ...state, fight: { ...state.fight, opening: action.opening, token: action.token } }

    case 'choose': {
      const f = state.fight
      const move = f.opening?.moves[action.side][action.move]
      if (state.phase !== 'battle' || !move || f.end || nextChooser(state) !== action.side) return state
      if (blockedReason(f.fs, action.side, move.type, currentEvent(state)?.rule)) return state
      const choices: [number | null, number | null] = [...f.choices]
      choices[action.side] = action.move
      return { ...state, fight: { ...f, choices } }
    }

    case 'roundReady': {
      const f = state.fight
      if (state.phase !== 'battle' || f.end || nextChooser(state) !== undefined) return state
      const fight: Fight = { ...f, token: action.token, fs: action.next, rounds: [...f.rounds, action.round], choices: [null, null], end: action.round.end }
      const end = action.round.end
      if (!end) return { ...state, fight }
      const players: [MatchPlayer, MatchPlayer] = [{ ...state.players[0] }, { ...state.players[1] }]
      players[end.winner].wins += 1
      const opening = f.opening as Opening
      const record: RoundRecord = {
        round: state.round,
        arena: state.arena,
        monsters: state.monsters as [Monster, Monster],
        nicknames: opening.nicknames,
        winner: end.winner,
        title: opening.title,
        mvp: mvpOf(fight.rounds, end.winner, opening),
      }
      return { ...state, fight, players, history: [...state.history, record] }
    }

    case 'verdict':
      return state.phase === 'battle' && state.fight.end ? { ...state, phase: 'verdict' } : state

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
