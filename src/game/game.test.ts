import { describe, expect, it } from 'vitest'
import { ARENAS, DECKS, DIRTY_DECKS, HEALING_POWER_IDS, SABOTAGE_DECKS, SLOTS, decksFor, findCard } from '../../shared/cards'
import type { Rarity } from '../../shared/rarity'
import {
  ATTACKS_PER_FIGHTER,
  ATTACK_TONES,
  LAST_BREATH,
  MAX_ROUNDS,
  START,
  attackPower,
  cleanPicks,
  consistent,
  hpState,
  normalizeAttacks,
  normalizeJudgement,
  normalizeOpening,
  offlineAttacks,
  offlineJudgement,
  offlineOpening,
  playRound,
  scheduleEvents,
  type Attack,
  type FightState,
  type Fighter,
  type Judgement,
  type Monster,
  type Moves,
} from '../../shared/battle'
import { generateOpening, generateRound, roundPrompt } from '../../server/groq'
import { handleBattleRequest, hasDirtyCard, parseRequest } from '../../server/handler'
import { handlePortraitRequest, memoryStore, portraitPrompt, rawSubject } from '../../server/portrait'
import { sign, verify } from '../../server/token'
import { withBattle } from './bestiary'
import { battleRequest, createMatch, currentSlot, draftSlots, nextChooser, reduce, type MatchState } from './match'

function monster(i = 0): Monster {
  return { character: DECKS.character[i], weapon: DECKS.weapon[i], personality: DECKS.personality[i], power: DECKS.power[i] }
}
function fighters(): [Fighter, Fighter] {
  return [
    { player: 'Giulia', monster: monster(0) },
    { player: 'Marco', monster: monster(1) },
  ]
}
const NAMES: [string, string] = ['A', 'B']
const half = () => 0.5
const ATTACKS: Attack[] = [
  { name: 'Carica', text: 'Attacca forte', tone: 'aggressiva' },
  { name: 'Legnata', text: 'Colpisce con l’arma', tone: 'aggressiva' },
  { name: 'Finta', text: 'Fa una finta', tone: 'furba' },
  { name: 'Potere', text: 'Usa il superpotere', tone: 'pazza' },
  { name: 'Pazzia', text: 'Fa una pazzia', tone: 'pazza' },
]
const judge = (over: Partial<Judgement> = {}): Judgement => ({
  stamps: ['CLASSICA', 'FURBA'],
  hits: [1, 2],
  recover: [0, 0],
  winner: 0,
  scene: 'Scena',
  why: 'Perché sì',
  sfx: 'SBAM!',
  ko: ['A crolla', 'B crolla'],
  summary: 's',
  twist: null,
  ...over,
})
const MOVES: Moves = { names: ['Mossa A', 'Mossa B'], actions: ['a', 'b'] }
const play = (fs: FightState, j: Judgement) => playRound(fs, MOVES, j, NAMES, half)

/** Gioca i 4 turni di un round: sabotaggi e creazione dei mostri. */
function draftRound(s: MatchState): MatchState {
  while (s.phase !== 'versus') {
    if (s.phase === 'pass') s = reduce(s, { type: 'beginTurn' })
    else if (s.phase === 'sabotage') s = reduce(s, { type: 'sabotage', index: 0 })
    else if (s.phase === 'pick') s = reduce(s, { type: 'pick', index: 1 })
    else if (s.phase === 'ready') s = reduce(s, { type: 'confirm' })
    else throw new Error(`fase inattesa ${s.phase}`)
  }
  return s
}

/** Dal VS alla scelta degli attacchi, con presentazione e attacchi già arrivati. */
const startFight = (s: MatchState, token: string | null = null) =>
  reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: { ...offlineOpening(fighters(), ARENAS[0]), attacks: [ATTACKS, ATTACKS] }, token })

/** Entrambi scelgono i 2 attacchi: da qui la rissa va da sola. */
function pickAll(s: MatchState): MatchState {
  for (let k = 0; k < 2; k++) {
    const who = nextChooser(s)!
    s = reduce(s, { type: 'pickAttacks', side: who, picks: who === 0 ? [0, 2] : [3, 4] })
  }
  if (nextChooser(s) !== undefined) throw new Error('scelta rifiutata')
  return s
}

/** Rissa giocata fino alla fine: il giocatore 0 colpisce sempre devastante. */
function fightToEnd(s: MatchState): MatchState {
  s = pickAll(startFight(s))
  for (let guard = 0; !s.fight.end; guard++) {
    if (guard > MAX_ROUNDS) throw new Error('la rissa non finisce')
    const { round, next } = play(s.fight.fs, judge({ hits: [0, 3], winner: 0 }))
    s = reduce(s, { type: 'roundReady', round, next, token: null })
  }
  return reduce(s, { type: 'verdict' })
}

describe('carte', () => {
  it('hanno id unici e mazzi grandi: combinazioni praticamente infinite', () => {
    const traps = Object.values(SABOTAGE_DECKS).flat()
    const all = [...SLOTS.flatMap((s) => DECKS[s]), ...ARENAS, ...traps]
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length)
    expect(DECKS.character.length).toBeGreaterThanOrEqual(150)
    expect(DECKS.weapon.length).toBeGreaterThanOrEqual(115)
    expect(DECKS.personality.length).toBeGreaterThanOrEqual(85)
    expect(DECKS.power.length).toBeGreaterThanOrEqual(90)
    expect(ARENAS.length).toBeGreaterThanOrEqual(60)
    for (const d of Object.values(SABOTAGE_DECKS)) expect(d.length).toBeGreaterThanOrEqual(30)
    // Le carte trappola stanno solo nei mazzi trappola.
    expect(traps.every((c) => c.cursed)).toBe(true)
    expect(SLOTS.flatMap((s) => DECKS[s]).some((c) => c.cursed)).toBe(false)
    for (const id of HEALING_POWER_IDS) expect(findCard(id)).toBeDefined()
  })

  it('ogni mazzo ha tutte le rarità, poche leggendarie, e la pesca le fa uscire nelle proporzioni giuste', () => {
    for (const s of SLOTS) {
      const count = (r: Rarity) => DECKS[s].filter((c) => c.rarity === r).length / DECKS[s].length
      expect(count('leggendaria')).toBeGreaterThan(0)
      expect(count('leggendaria')).toBeLessThan(0.05)
      expect(count('epica')).toBeGreaterThan(0.05)
      expect(count('epica')).toBeLessThan(0.2)
      expect(count('rara')).toBeGreaterThan(0.2)
      expect(count('rara')).toBeLessThan(0.4)
    }
    // Trappole e arene sono sempre comuni.
    expect(Object.values(SABOTAGE_DECKS).flat().every((c) => c.rarity === 'comune')).toBe(true)
    expect(ARENAS.every((c) => c.rarity === 'comune')).toBe(true)
    // Pesca: su tante partite, le carte offerte seguono circa 60/28/10/2.
    const seen: Record<Rarity, number> = { comune: 0, rara: 0, epica: 0, leggendaria: 0 }
    let total = 0
    for (let seed = 0; seed < 400; seed++) {
      let s = reduce(reduce(reduce(createMatch(['A', 'B'], 1, seed), { type: 'beginTurn' }), { type: 'sabotage', index: 0 }), { type: 'beginTurn' })
      s = reduce(s, { type: 'sabotage', index: 0 })
      for (const c of s.offer) {
        seen[c.rarity]++
        total++
      }
    }
    expect(seen.comune / total).toBeGreaterThan(0.5)
    expect(seen.rara / total).toBeGreaterThan(0.18)
    expect(seen.epica / total).toBeGreaterThan(0.05)
    expect(seen.epica / total).toBeLessThan(0.16)
    expect(seen.leggendaria / total).toBeGreaterThan(0.005)
    expect(seen.leggendaria / total).toBeLessThan(0.05)
  })

  it('il mazzo sporco sta nel classico e da solo in "solo sporca"', () => {
    for (const s of SLOTS) {
      expect(DIRTY_DECKS[s].length).toBeGreaterThanOrEqual(10)
      expect(DIRTY_DECKS[s].every((c) => c.dirty)).toBe(true)
      expect(decksFor('classico')[s]).toEqual(expect.arrayContaining(DIRTY_DECKS[s]))
      expect(decksFor('sporca')[s]).toBe(DIRTY_DECKS[s])
    }
    // In "solo sporca" si pescano solo carte sporche, per tutto il draft.
    let s = createMatch(['A', 'B'], 1, 7, 'sporca')
    for (let i = 0; i < 40 && s.phase !== 'versus'; i++) {
      if (s.phase === 'pass') s = reduce(s, { type: 'beginTurn' })
      else if (s.phase === 'sabotage') s = reduce(s, { type: 'sabotage', index: 0 })
      else if (s.phase === 'pick') {
        expect(s.offer.every((c) => c.dirty)).toBe(true)
        s = reduce(s, { type: 'pick', index: 0 })
      } else if (s.phase === 'ready') s = reduce(s, { type: 'confirm' })
    }
    expect(s.phase).toBe('versus')
    // Una partita salvata senza modalità pesca dal classico.
    expect(reduce({ ...createMatch(['A', 'B'], 1, 7), mode: undefined }, { type: 'beginTurn' }).offer.length).toBe(3)
  })
})

describe('carte trappola', () => {
  it('nel sabotaggio escono solo carte trappola, nella creazione mai', () => {
    for (let seed = 0; seed < 25; seed++) {
      let s = createMatch(['A', 'B'], 1, seed)
      s = reduce(s, { type: 'beginTurn' })
      expect(s.offer.every((c) => c.cursed)).toBe(true)
      s = reduce(reduce(reduce(s, { type: 'sabotage', index: 0 }), { type: 'beginTurn' }), { type: 'sabotage', index: 1 })
      expect(s.phase).toBe('pick')
      expect(s.offer.some((c) => c.cursed)).toBe(false)
      expect(s.draft[s.gifts[1].slot]?.cursed).toBe(true)
    }
  })

  it('l’AI sa quali carte sono trappole', () => {
    const f = fighters()
    const trapped: [Fighter, Fighter] = [{ ...f[0], monster: { ...f[0].monster, weapon: SABOTAGE_DECKS.weapon[0] } }, f[1]]
    const p = roundPrompt(trapped, ARENAS[0], { title: 'T' }, START, [], [[ATTACKS[0], ATTACKS[1]], [ATTACKS[2], ATTACKS[3]]])
    expect(p).toContain('CARTA TRAPPOLA')
  })
})

describe('sabotaggio e creazione', () => {
  it('A sabota B, B sabota A e crea, poi crea A', () => {
    let s = createMatch(['Giulia', 'Marco'], 3, 42)
    expect(s.phase).toBe('pass')
    s = reduce(s, { type: 'beginTurn' })
    expect(s.phase).toBe('sabotage')
    const giftForMarco = s.offer[2]
    expect(giftForMarco.cursed).toBe(true)
    s = reduce(s, { type: 'sabotage', index: 2 })
    expect(s.phase).toBe('pass')
    expect(s.picker).toBe(1)
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    // Marco ha già il telefono: crea subito il suo mostro, con il regalo di Giulia dentro.
    expect(s.phase).toBe('pick')
    expect(s.draft[s.gifts[1].slot]).toBe(giftForMarco)
    expect(draftSlots(s, 1)).not.toContain(s.gifts[1].slot)
    for (let i = 0; i < 3; i++) {
      expect(currentSlot(s)).not.toBe(s.gifts[1].slot)
      s = reduce(s, { type: 'pick', index: 0 })
    }
    s = reduce(s, { type: 'confirm' })
    expect(s.monsters[1]?.[s.gifts[1].slot]).toBe(giftForMarco)
    s = draftRound(s)
    expect(s.monsters[0]?.[s.gifts[0].slot]).toBe(s.gifts[0].card)
  })

  it('il personaggio non si sabota mai', () => {
    for (let seed = 0; seed < 30; seed++) expect(createMatch(['A', 'B'], 1, seed).gifts.map((g) => g.slot)).not.toContain('character')
  })

  it('un campione dal bestiario si tiene comunque il regalo', () => {
    let s = createMatch(['A', 'B'], 1, 5)
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    const champ = monster(10)
    s = reduce(s, { type: 'useChampion', monster: champ })
    expect(s.phase).toBe('ready')
    expect(s.draft.character).toBe(champ.character)
    expect(s.draft[s.gifts[1].slot]).toBe(s.gifts[1].card)
  })
})

describe('regole del round', () => {
  it('più forte il colpo, più vita persa; la vita non si vede in numeri ma a parole', () => {
    const r = play(START, judge({ hits: [0, 3], winner: 0 })).round
    expect(r.damage[0]).toBe(0)
    expect(r.damage[1]).toBeGreaterThan(play(START, judge({ hits: [0, 2], winner: 0 })).round.damage[1])
    expect(play(START, judge({ hits: [0, 1], winner: 0 })).round.damage[1]).toBeGreaterThan(0)
    expect(hpState(100).label).toBe('IN FORMA')
    expect(hpState(60).label).toBe('AMMACCATO')
    expect(hpState(40).label).toBe('BARCOLLA')
    expect(hpState(LAST_BREATH).label).toBe('ALL’ULTIMO RESPIRO')
    expect(hpState(0).label).toBe('K.O.')
  })

  it('chi ha la meglio non può essere quello colpito più forte', () => {
    expect(consistent({ hits: [3, 1], recover: [0, 0], winner: 0 }).hits).toEqual([0, 1])
    expect(consistent({ hits: [2, 2], recover: [0, 0], winner: 1 }).hits).toEqual([2, 1])
    expect(consistent({ hits: [0, 0], recover: [0, 0], winner: 0 }).hits).toEqual([0, 1])
    // Pari: si lascia com'è.
    expect(consistent({ hits: [2, 2], recover: [0, 0], winner: null }).hits).toEqual([2, 2])
    const r = play(START, judge({ hits: [3, 0], winner: 0 })).round
    expect(r.damage[0]).toBeLessThanOrEqual(r.damage[1])
  })

  it('colpo di reni: chi è all’ultimo respiro e ha la meglio colpisce più forte', () => {
    const calm = play({ ...START, hp: [80, 80] }, judge({ hits: [0, 2], winner: 0 })).round
    const back = play({ ...START, hp: [20, 80] }, judge({ hits: [0, 2], winner: 0 })).round
    expect(back.hits[1]).toBe(3)
    expect(back.damage[1]).toBeGreaterThan(calm.damage[1])
  })

  it('ci si rimette in sesto, ma mai oltre il pieno', () => {
    const r = play({ ...START, hp: [50, 100] }, judge({ hits: [0, 0], recover: [2, 0], winner: null })).round
    expect(r.heal[0]).toBeGreaterThan(0)
    expect(r.hp[0]).toBe(50 + r.heal[0])
    const full = play(START, judge({ hits: [0, 0], recover: [2, 0], winner: null })).round
    expect(full.heal[0]).toBe(0)
    expect(full.hp[0]).toBe(100)
  })

  it('KO: il perdente va a zero e si usa la sua frase finale', () => {
    const { round } = play({ ...START, hp: [60, 10] }, judge({ hits: [0, 2], winner: 0 }))
    expect(round.end?.winner).toBe(0)
    expect(round.hp[1]).toBe(0)
    expect(round.damage[1]).toBe(10)
    expect(round.end?.finale).toBe('B crolla')
  })

  it('se crollano entrambi resta in piedi, per un soffio, chi è messo meno peggio', () => {
    const { round } = play({ ...START, hp: [5, 20] }, judge({ hits: [3, 3], winner: null }))
    expect(round.end?.winner).toBe(1)
    expect(round.hp).toEqual([0, 1])
  })

  it('la rissa si scalda: più avanti i colpi fanno più male', () => {
    const early = play(START, judge()).round.damage[1]
    const late = play({ ...START, round: 6 }, judge()).round.damage[1]
    expect(late).toBeGreaterThan(early)
  })

  it('dopo l’ultimo round decide la giuria', () => {
    const { round } = play({ ...START, hp: [70, 40], round: MAX_ROUNDS - 1 }, judge({ hits: [0, 0], winner: null }))
    expect(round.end).toMatchObject({ winner: 0, byJury: true })
  })

  it('due eventi dell’arena a rissa, nei round giusti, e il round li ricorda', () => {
    for (let i = 0; i < 50; i++) {
      const [a, b] = scheduleEvents(Math.random)
      expect([2, 3]).toContain(a)
      expect([4, 5, 6]).toContain(b)
    }
    const r = playRound(START, MOVES, judge(), NAMES, half, { round: 1, text: 'Piove dal soffitto' })
    expect(r.round.event).toBe('Piove dal soffitto')
  })

  it('il round porta i nomi degli attacchi usati e il colpo di scena', () => {
    const r = play(START, judge({ twist: 'Il koala crolla dal sonno' })).round
    expect(r.moveNames).toEqual(['Mossa A', 'Mossa B'])
    expect(r.actions).toEqual(['a', 'b'])
    expect(r.twist).toBe('Il koala crolla dal sonno')
  })
})

describe('attacchi', () => {
  it('sempre 5, nell’ordine delle carte; quello che manca o è doppio arriva dalla riserva', () => {
    const backup = offlineAttacks(fighters(), 0)
    expect(backup).toHaveLength(ATTACKS_PER_FIGHTER)
    expect(backup.map((a) => a.tone)).toEqual(ATTACK_TONES)
    const a = normalizeAttacks(
      [
        { name: 'Carica', text: 'Un colpo', tone: 'aggressiva' },
        { name: 'Senza testo' },
        { name: 'carica', text: 'Doppione col nome uguale', tone: 'furba' },
        { name: 'Tipo strano', text: 'x', tone: 'boh' },
      ],
      backup,
    )
    expect(a[0]).toEqual({ name: 'Carica', text: 'Un colpo', tone: 'aggressiva' })
    expect(a[1]).toBe(backup[1])
    expect(a[2]).toBe(backup[2])
    expect(a[3]).toEqual({ name: 'Tipo strano', text: 'x', tone: backup[3].tone })
    expect(a[4]).toBe(backup[4])
    expect(normalizeAttacks(undefined, backup)).toEqual(backup)
  })

  it('la rarità pesa sui danni di nascosto: una leggendaria colpisce sempre un po’ più forte', () => {
    const calm = playRound(START, MOVES, judge({ hits: [1, 1], winner: null }), NAMES, half).round
    const strong = playRound(START, MOVES, judge({ hits: [1, 1], winner: null }), NAMES, half, undefined, [3, 0]).round
    expect(strong.hits[1]).toBe(2)
    expect(strong.hits[0]).toBe(1)
    expect(strong.damage[1]).toBeGreaterThan(calm.damage[1])
    // Una comune non aggiunge mai niente, nemmeno con la fortuna dalla sua.
    expect(playRound(START, MOVES, judge({ hits: [1, 1], winner: null }), NAMES, () => 0, undefined, [0, 0]).round.hits).toEqual([1, 1])
    // L'attacco k nasce dalla carta k; l'idea folle dal personaggio.
    const m: Monster = { ...monster(0), weapon: { ...monster(0).weapon, rarity: 'leggendaria' }, character: { ...monster(0).character, rarity: 'epica' } }
    expect(attackPower(m, 1)).toBe(3)
    expect(attackPower(m, 0)).toBe(2)
    expect(attackPower(m, 4)).toBe(2)
  })

  it('si scelgono 2 indici distinti tra 0 e 4', () => {
    expect(cleanPicks([0, 4])).toEqual([0, 4])
    expect(cleanPicks(['1', '3'])).toEqual([1, 3])
    expect(cleanPicks([2, 2])).toBeUndefined()
    expect(cleanPicks([0, 5])).toBeUndefined()
    expect(cleanPicks([0])).toBeUndefined()
    expect(cleanPicks('ab')).toBeUndefined()
  })
})

describe('rissa e partita', () => {
  it('gli attacchi si scelgono a turno, prima chi ha aperto il round, poi la rissa parte da sola', () => {
    let s = startFight(draftRound(createMatch(['A', 'B'], 1, 9)), 't')
    expect(s.phase).toBe('attacks')
    expect(s.fight.opening?.attacks[0]).toEqual(ATTACKS)
    expect(nextChooser(s)).toBe(0)
    // Fuori turno non si può scegliere, e nemmeno due volte lo stesso attacco.
    expect(reduce(s, { type: 'pickAttacks', side: 1, picks: [0, 1] }).fight.picks).toEqual([null, null])
    expect(reduce(s, { type: 'pickAttacks', side: 0, picks: [1, 1] }).fight.picks).toEqual([null, null])
    s = reduce(s, { type: 'pickAttacks', side: 0, picks: [0, 2] })
    expect(s.phase).toBe('attacks')
    expect(nextChooser(s)).toBe(1)
    s = reduce(s, { type: 'pickAttacks', side: 1, picks: [4, 3] })
    expect(s.fight.picks).toEqual([[0, 2], [4, 3]])
    expect(s.phase).toBe('battle')
    expect(nextChooser(s)).toBeUndefined()
    const { round, next } = play(s.fight.fs, judge())
    s = reduce(s, { type: 'roundReady', round, next, token: 't2' })
    expect(s.fight.token).toBe('t2')
    expect(s.fight.rounds).toHaveLength(1)
    // Le scelte restano per tutta la rissa.
    expect(s.fight.picks).toEqual([[0, 2], [4, 3]])
  })

  it('il secondo round apre l’altro giocatore', () => {
    let s = fightToEnd(draftRound(createMatch(['A', 'B'], 3, 9)))
    s = startFight(draftRound(reduce(s, { type: 'nextRound' })))
    expect(nextChooser(s)).toBe(1)
  })

  it('qualcuno crolla, la vittoria si conta e la partita va avanti', () => {
    let s = fightToEnd(draftRound(createMatch(['A', 'B'], 3, 9)))
    expect(s.phase).toBe('verdict')
    expect(s.history).toHaveLength(1)
    expect(s.history[0].winner).toBe(0)
    expect(s.history[0].mvp).toBe('Mossa A')
    s = reduce(s, { type: 'nextRound' })
    expect(s.phase).toBe('pass')
    expect(s.first).toBe(1)
    expect(s.fight.rounds).toHaveLength(0)
  })

  it('manda al server solo id', () => {
    expect(parseRequest(battleRequest(draftRound(createMatch(['Giulia', 'Marco'], 1, 1))))?.fighters[0].player).toBe('Giulia')
  })
})

describe('risposte dell’AI', () => {
  it('ripara un verdetto sbagliato: colpi fuori scala, timbri inventati, pari scritto come null, attacco usato strano', () => {
    const j = normalizeJudgement({ scene: 'Succede di tutto', hits: [9, -2], recover: [5, 0], stamps: ['WOW', 'geniale'], winner: null, used: ['1', 7], twist: 'null' })!
    expect(j.hits).toEqual([3, 0])
    expect(j.recover).toEqual([2, 0])
    expect(j.stamps).toEqual(['CLASSICA', 'GENIALE'])
    // null non deve diventare "vince il combattente 0".
    expect(j.winner).toBeNull()
    expect(j.used).toEqual([1, 0])
    expect(j.twist).toBeNull()
    expect(normalizeJudgement({ scene: 'x', winner: '1', twist: 'Il koala crolla' })!).toMatchObject({ winner: 1, used: [0, 0], twist: 'Il koala crolla' })
    // Senza scena il verdetto non vale.
    expect(normalizeJudgement({ hits: [1, 1] })).toBeNull()
  })

  it('il narratore di riserva: la furbata punisce chi carica, la carica travolge la pazzia, la pazzia spiazza la furbata', () => {
    const f = fighters()
    const atk = (tone: 'aggressiva' | 'furba' | 'pazza'): Attack => ({ name: tone, text: `fa ${tone}`, tone })
    const w = (a: 'aggressiva' | 'furba' | 'pazza', b: 'aggressiva' | 'furba' | 'pazza') => offlineJudgement(f, [atk(a), atk(b)], half).winner
    expect(w('furba', 'aggressiva')).toBe(0)
    expect(w('aggressiva', 'pazza')).toBe(0)
    expect(w('pazza', 'furba')).toBe(0)
    expect(w('aggressiva', 'furba')).toBe(1)
    const j = offlineJudgement(f, [atk('furba'), atk('furba')], half)
    expect(j.scene).toContain(f[0].monster.character.name)
    expect(j.twist).toBeNull()
  })

  it('il narratore di riserva prepara presentazione, eventi e i 5 attacchi', () => {
    const o = offlineOpening(fighters(), ARENAS[4])
    expect(o.events).toHaveLength(2)
    expect(o.events.every((e) => e.text.length > 10)).toBe(true)
    expect(o.attacks.every((x) => x.length === ATTACKS_PER_FIGHTER)).toBe(true)
    expect(normalizeOpening({ title: 'T', attacks: [[{ name: 'Uno', text: 'Fa uno', tone: 'aggressiva' }], []] }, fighters(), 'ai')!.attacks[0][0].name).toBe('Uno')
  })
})

describe('server', () => {
  let lastSent: { model: string; messages: { content: string }[] } = { model: '', messages: [] }
  const groqAnswer = (answer: object) =>
    (async (_url: string, init: RequestInit) => {
      lastSent = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    }) as unknown as typeof fetch
  const attacksOf = (p: string) => ATTACKS.map((a) => ({ ...a, name: `${a.name} ${p}` }))
  const openingAnswer = { title: 'Titolo', nicknames: ['Primo', 'Secondo'], events: ['Il trenino travolge tutti'], attacks: [attacksOf('0'), attacksOf('1')] }
  const roundAnswer = (over: object = {}) => ({
    used: [1, 0],
    twist: null,
    scene: 'Il primo inciampa, il secondo ne approfitta.',
    hits: [2, 0],
    recover: [0, 0],
    winner: 1,
    why: 'Ha la meglio il secondo',
    stamps: ['MAH', 'GENIALE'],
    sfx: 'SBAM',
    ko: ['crolla 0', 'crolla 1'],
    summary: 'Primo round epico',
    ...over,
  })
  const chosen = (): [[Attack, Attack], [Attack, Attack]] => [
    [attacksOf('G')[0], attacksOf('G')[2]],
    [attacksOf('M')[3], attacksOf('M')[4]],
  ]

  it('rimette a posto tutte le coppie se ha invertito l’ordine', async () => {
    const f = fighters()
    const o = await generateOpening(f, ARENAS[0], true, [2, 5], { apiKey: 'k', fetch: groqAnswer(openingAnswer) })
    // L'AI vede Marco come combattente 0.
    const sent = lastSent.messages[1].content
    expect(sent.indexOf(f[1].monster.character.desc)).toBeLessThan(sent.indexOf(f[0].monster.character.desc))
    expect(sent).toContain('ai round 2 e 5')
    expect(sent).toContain('ESATTAMENTE 5 attacchi')
    expect(o.nicknames).toEqual(['Secondo', 'Primo'])
    expect(o.attacks[0][0].name).toBe('Carica 1')
    expect(o.events).toEqual([
      { round: 2, text: 'Il trenino travolge tutti' },
      { round: 5, text: expect.any(String) },
    ])

    const j = await generateRound(f, ARENAS[0], true, o, START, [], chosen(), o.events[0], { apiKey: 'k', fetch: groqAnswer(roundAnswer()) })
    // Per l'AI Marco è lo 0: "hits 2", "winner 1" e "used" vanno girati.
    expect(j.hits).toEqual([0, 2])
    expect(j.winner).toBe(0)
    expect(j.used).toEqual([0, 1])
    expect(j.stamps).toEqual(['GENIALE', 'MAH'])
    const prompt = lastSent.messages[1].content
    expect(prompt).toMatch(/\(COMBATTENTE 0\) ha scelto:\n\s+0\. «Potere M»/)
    expect(prompt).toMatch(/\(COMBATTENTE 1\) ha scelto:\n\s+0\. «Carica G»/)
    expect(prompt).toContain('Il trenino travolge tutti')
  })

  it('un pari resta pari anche con l’ordine invertito, e dopo un colpo di scena non se ne chiede un altro', async () => {
    const j = await generateRound(fighters(), ARENAS[0], true, { title: 'T' }, START, [], chosen(), undefined, { apiKey: 'k', fetch: groqAnswer(roundAnswer({ winner: null, hits: [1, 1] })) }, true)
    expect(j.winner).toBeNull()
    expect(lastSent.messages[1].content).toContain('NIENTE colpo di scena')
  })

  it('se il modello grande ha finito i token al minuto ripiega su quello piccolo', async () => {
    const models: string[] = []
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string }
      models.push(body.model)
      if (body.model === 'openai/gpt-oss-120b') return new Response('rate limit', { status: 429 })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(openingAnswer) } }] }))
    }) as unknown as typeof fetch
    const o = await generateOpening(fighters(), ARENAS[0], false, [2, 4], { apiKey: 'k', fetch: fakeFetch })
    expect(o.source).toBe('ai')
    expect(models).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b'])
  })

  it('la firma protegge lo stato', () => {
    const t = sign({ a: 1 }, 'segreto')
    expect(verify<{ a: number }>(t, 'segreto')?.a).toBe(1)
    expect(verify(t, 'altro')).toBeUndefined()
    const [data, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ a: 2, iat: Date.now() })).toString('base64url')
    expect(verify(`${forged}.${sig}`, 'segreto')).toBeUndefined()
    expect(verify(`${data}.${sig}`, 'segreto', Date.now() + 7 * 3600_000)).toBeUndefined()
  })

  it('endpoint: senza chiave 503, carte inventate o token falso 400', async () => {
    expect((await handleBattleRequest('{}', {})).status).toBe(503)
    const bad = { stage: 'opening', arena: ARENAS[0].id, fighters: [{ character: 'c-inventato' }, {}] }
    expect((await handleBattleRequest(JSON.stringify(bad), { apiKey: 'k' })).status).toBe(400)
    expect((await handleBattleRequest(JSON.stringify({ stage: 'round', token: 'abc.def', picks: [[0, 1], [0, 1]] }), { apiKey: 'k' })).status).toBe(400)
  })

  it('endpoint: gli attacchi scelti entrano nel token al primo round e l’AI decide quale si usa', async () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 1, 3))
    const cfg = { apiKey: 'k', rand: () => 0.9, fetch: groqAnswer(openingAnswer) }
    const open = (await handleBattleRequest(JSON.stringify({ stage: 'opening', ...battleRequest(s) }), cfg)).body as { token: string }
    const roundCfg = { ...cfg, fetch: groqAnswer(roundAnswer({ twist: 'Il koala crolla dal sonno' })) }
    const round = async (token: string, picks?: unknown) => {
      const r = await handleBattleRequest(JSON.stringify({ stage: 'round', token, picks }), roundCfg)
      return { status: r.status, body: r.body as { token: string; round: { hp: number[]; moveNames: string[]; actions: string[]; twist: string | null } } }
    }
    // Scelte sbagliate o mancanti al primo round: rifiutate.
    expect((await round(open.token, [[0, 7], [0, 1]])).status).toBe(400)
    expect((await round(open.token)).status).toBe(400)
    const r1 = await round(open.token, [[1, 2], [3, 4]])
    expect(r1.status).toBe(200)
    // L'AI ha scelto l'attacco 1 di Giulia (il secondo dei suoi) e lo 0 di Marco; rand 0.9 = ordine non invertito.
    expect(r1.body.round.moveNames).toEqual(['Finta 0', 'Potere 1'])
    expect(r1.body.round.actions[0]).toBe('Fa una finta')
    expect(r1.body.round.twist).toBe('Il koala crolla dal sonno')
    expect(r1.body.round.hp.some((h) => h < 100)).toBe(true)
    // Dal secondo round le scelte vengono dal token: quelle mandate si ignorano.
    const r2 = await round(r1.body.token, [[0, 0], [0, 0]])
    expect(r2.status).toBe(200)
    expect(r2.body.round.moveNames).toEqual(['Finta 0', 'Potere 1'])
    // Niente due colpi di scena di fila, anche se l'AI insiste.
    expect(r2.body.round.twist).toBeNull()
    // L'AI ricorda il round precedente e vede i 2 attacchi di ciascuno.
    const prompt = lastSent.messages[1].content
    expect(prompt).toContain('Primo round epico')
    expect(prompt).toContain('«Legnata 0»')
    expect(prompt).toContain('«Pazzia 1»')
    expect(prompt).not.toContain('«Carica 0»')
    expect(prompt).toContain('NIENTE colpo di scena')
  })
})

describe('narratore sporco', () => {
  it('il prompt di sistema diventa sboccato solo con una carta sporca sul ring', async () => {
    let system = ''
    const fetch = (async (_url: string, init: RequestInit) => {
      system = JSON.parse(String(init.body)).messages[0].content
      const answer = { title: 'T', nicknames: ['a', 'b'], events: ['x', 'y'], offers: [[], []] }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    }) as unknown as typeof globalThis.fetch
    const req = (m1: Monster) => ({
      stage: 'opening',
      arena: ARENAS[0].id,
      fighters: [
        { player: 'A', character: m1.character.id, weapon: m1.weapon.id, personality: m1.personality.id, power: m1.power.id },
        { player: 'B', character: DECKS.character[1].id, weapon: DECKS.weapon[1].id, personality: DECKS.personality[1].id, power: DECKS.power[1].id },
      ],
    })
    expect(hasDirtyCard(fighters())).toBe(false)
    await handleBattleRequest(JSON.stringify(req(monster(0))), { apiKey: 'k', fetch })
    expect(system).toContain('slapstick per tutti')
    expect(system).not.toContain('SPORCA')
    const dirtyMonster: Monster = { ...monster(0), weapon: DIRTY_DECKS.weapon[0] }
    expect(hasDirtyCard([{ player: 'A', monster: dirtyMonster }, fighters()[1]])).toBe(true)
    await handleBattleRequest(JSON.stringify(req(dirtyMonster)), { apiKey: 'k', fetch })
    expect(system).toContain('SPORCA')
    expect(system).not.toContain('niente parolacce')
  })
})

describe('ritratti', () => {
  const cfg = { accountId: 'acc', token: 'tok' }
  const png = Buffer.from('fake-image').toString('base64')
  function fakeFetch() {
    const calls: string[] = []
    const fetch = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string).prompt)
      return new Response(JSON.stringify({ result: { image: png } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof globalThis.fetch
    return { fetch, calls }
  }

  it('il prompt descrive personaggio e arma nello stile fisso, con scena e inquadratura che cambiano da coppia a coppia', () => {
    const p = portraitPrompt(rawSubject(DECKS.character[0], DECKS.weapon[0]), 'a')
    expect(p).toContain(DECKS.character[0].name)
    expect(p).toContain(DECKS.weapon[0].desc)
    expect(p).toContain('No text')
    expect(p).not.toContain('forest')
    const q = portraitPrompt(rawSubject(DECKS.character[0], DECKS.weapon[0]), 'b')
    expect(q).not.toBe(p)
    expect(portraitPrompt(rawSubject(DECKS.character[0], DECKS.weapon[0]), 'a')).toBe(p)
    // La scena suggerita dalla traduzione vince su quella di riserva.
    const rich = portraitPrompt({ character: 'a pigeon', weapon: 'a baguette', setting: 'a Venice canal', pose: 'pecking furiously', palette: 'teal and grey' }, 'a')
    expect(rich).toContain('Setting: a Venice canal')
    expect(rich).toContain('pecking furiously')
    expect(rich).toContain('Dominant colors: teal and grey')
  })

  it('con la chiave Groq traduce le carte prima di disegnare', async () => {
    const prompts: string[] = []
    const fetch = (async (url: string, init: RequestInit) => {
      if (url.includes('groq')) {
        const content = JSON.stringify({ character: 'a furious koala with red eyes', weapon: "a grandma's slipper", setting: 'a eucalyptus tree at 3am' })
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      }
      prompts.push(JSON.parse(init.body as string).prompt)
      return new Response(JSON.stringify({ result: { image: png } }), { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const r = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, groqKey: 'g', fetch }, memoryStore())
    expect(r.status).toBe(200)
    expect(prompts[0]).toContain("a grandma's slipper")
    expect(prompts[0]).toContain('Setting: a eucalyptus tree at 3am')
    expect(prompts[0]).not.toContain(DECKS.weapon[0].desc)
  })

  it('se la traduzione fallisce disegna lo stesso con il testo italiano', async () => {
    const prompts: string[] = []
    const fetch = (async (url: string, init: RequestInit) => {
      if (url.includes('groq')) return new Response('{}', { status: 500 })
      prompts.push(JSON.parse(init.body as string).prompt)
      return new Response(JSON.stringify({ result: { image: png } }), { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const r = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, groqKey: 'g', fetch }, memoryStore())
    expect(r.status).toBe(200)
    expect(prompts[0]).toContain(DECKS.weapon[0].name)
  })

  it('accetta solo id esistenti e del mazzo giusto', async () => {
    const store = memoryStore()
    expect((await handlePortraitRequest('c-nope', DECKS.weapon[0].id, cfg, store)).status).toBe(404)
    // Un'arma al posto del personaggio: no.
    expect((await handlePortraitRequest(DECKS.weapon[0].id, DECKS.weapon[0].id, cfg, store)).status).toBe(404)
    // Senza chiave: 503, non si tenta nemmeno.
    expect((await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, {}, store)).status).toBe(503)
  })

  it('genera una volta sola e poi serve dalla cache', async () => {
    const store = memoryStore()
    const { fetch, calls } = fakeFetch()
    const a = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, fetch }, store)
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('image/jpeg')
    expect(Buffer.from(a.body as Uint8Array).toString()).toBe('fake-image')
    const b = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, fetch }, store)
    expect(b.status).toBe(200)
    expect(calls).toHaveLength(1)
    // Altra arma, altro ritratto.
    await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[1].id, { ...cfg, fetch }, store)
    expect(calls).toHaveLength(2)
  })

  it('se Cloudflare non risponde la scheda resta senza ritratto', async () => {
    const fetch = (async () => new Response('{}', { status: 429 })) as unknown as typeof globalThis.fetch
    const r = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, fetch }, memoryStore())
    expect(r.status).toBe(502)
    expect(r.headers['cache-control']).toBe('no-store')
  })
})

describe('bestiario', () => {
  it('registra entrambi i mostri e accumula vittorie', () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 3, 11))
    const outcome = { winner: 0 as const, nicknames: ['La Furia', 'Il Mite'] as [string, string], title: 'T' }
    let list = withBattle([], s, outcome, 1)
    expect(list).toHaveLength(2)
    list = withBattle(list, s, outcome, 2)
    expect(list.find((e) => e.owner === 'Giulia')!.wins).toBe(2)
    expect(list.find((e) => e.owner === 'Marco')!.losses).toBe(2)
    expect(list[0].nickname).toBe('La Furia')
  })
})
