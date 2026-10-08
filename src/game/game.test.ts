import { describe, expect, it } from 'vitest'
import { ARENAS, DECKS, DIRTY_DECKS, HEALING_POWER_IDS, SABOTAGE_DECKS, SLOTS, decksFor, findCard } from '../../shared/cards'
import {
  CUSTOM_MAX,
  LAST_BREATH,
  MAX_ROUNDS,
  START,
  cleanCustom,
  consistent,
  dedupeOffers,
  fixFinishers,
  hpState,
  normalizeJudgement,
  normalizeOffers,
  normalizeOpening,
  offlineJudgement,
  offlineOffers,
  offlineOpening,
  playRound,
  scheduleEvents,
  similar,
  type FightState,
  type Fighter,
  type Judgement,
  type Monster,
  type Suggestion,
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
const OFFERS: Suggestion[] = [
  { text: 'Attacca forte', tone: 'aggressiva' },
  { text: 'Fa una finta', tone: 'furba' },
  { text: 'Fa una pazzia', tone: 'pazza' },
]
const judge = (over: Partial<Judgement> = {}): Judgement => ({
  moveNames: ['Mossa A', 'Mossa B'],
  stamps: ['CLASSICA', 'FURBA'],
  hits: [1, 2],
  recover: [0, 0],
  winner: 0,
  scene: 'Scena',
  why: 'Perché sì',
  sfx: 'SBAM!',
  ko: ['A crolla', 'B crolla'],
  summary: 's',
  offers: [OFFERS, OFFERS],
  ...over,
})
const play = (fs: FightState, j: Judgement) => playRound(fs, ['a', 'b'], [false, false], j, NAMES, half)

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

const startFight = (s: MatchState, token: string | null = null) =>
  reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: { ...offlineOpening(fighters(), ARENAS[0]), offers: [OFFERS, OFFERS] }, token })

/** Rissa offline giocata fino alla fine: il giocatore 0 attacca sempre, l'1 fa sempre pazzie. */
function fightToEnd(s: MatchState): MatchState {
  s = startFight(s)
  for (let guard = 0; !s.fight.end; guard++) {
    if (guard > MAX_ROUNDS) throw new Error('la rissa non finisce')
    for (let k = 0; k < 2; k++) {
      const who = nextChooser(s)!
      s = reduce(s, { type: 'choose', side: who, choice: { pick: who === 0 ? 0 : 2 } })
    }
    if (nextChooser(s) !== undefined) throw new Error('mossa rifiutata')
    const { round, next } = play(s.fight.fs, judge({ hits: [0, 3], winner: 0 }))
    s = reduce(s, { type: 'roundReady', round, next, offers: [OFFERS, OFFERS], token: null })
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
    const p = roundPrompt(trapped, ARENAS[0], { title: 'T' }, START, [], [{ text: 'x' }, { text: 'y' }])
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
    const r = playRound(START, ['a', 'b'], [false, false], judge(), NAMES, half, { round: 1, text: 'Piove dal soffitto' })
    expect(r.round.event).toBe('Piove dal soffitto')
  })
})

describe('mosse suggerite', () => {
  it('sempre 3, una per tipo, nell’ordine; quello che manca arriva dalla riserva', () => {
    const backup = offlineOffers(fighters(), 0, START)
    const o = normalizeOffers(
      [
        { text: 'Una pazzia', tone: 'pazza' },
        { text: 'Un colpo', tone: 'aggressiva' },
      ],
      backup,
    )
    expect(o.map((x) => x.tone)).toEqual(['aggressiva', 'furba', 'pazza'])
    expect(o[0].text).toBe('Un colpo')
    expect(o[1]).toBe(backup[1])
    expect(o[2].text).toBe('Una pazzia')
    // Anche solo frasi, senza tipo.
    expect(normalizeOffers(['uno', 'due', 'tre'], backup).map((x) => x.text)).toEqual(['uno', 'due', 'tre'])
    expect(normalizeOffers(undefined, backup)).toEqual(backup)
    // Campi scritti per sbaglio dentro la frase.
    expect(normalizeOffers([{ text: 'Uno', tone: 'aggressiva' }, { text: 'Due', tone: 'furba' }, { text: 'Gli tira una torta, finisher:true', tone: 'pazza' }], backup)[2].text).toBe('Gli tira una torta')
  })

  it('le mosse di riserva seguono la situazione: disperate all’ultimo respiro, colpo finale sull’avversario a terra', () => {
    const f = fighters()
    const calm = offlineOffers(f, 0, START)
    expect(calm.some((o) => o.finisher)).toBe(false)
    const low = offlineOffers(f, 0, { hp: [10, 90], round: 4 })
    expect(low[0].text).toMatch(/ultimo fiato/)
    const finish = offlineOffers(f, 0, { hp: [90, 10], round: 4 })
    expect(finish[2].finisher).toBe(true)
    // Cambiano da un round all'altro.
    const r1 = offlineOffers(f, 0, { hp: [80, 80], round: 1 })
    const r2 = offlineOffers(f, 0, { hp: [80, 80], round: 2 })
    expect(r1.map((o) => o.text)).not.toEqual(r2.map((o) => o.text))
  })

  it('il colpo finale lo decide la vita vera, non l’AI', () => {
    const flagged: Suggestion[] = OFFERS.map((o) => ({ ...o, finisher: true as const }))
    const calm = fixFinishers([flagged, flagged], { hp: [80, 60], round: 2 })
    expect(calm.flat().some((o) => o.finisher)).toBe(false)
    const end = fixFinishers([OFFERS, OFFERS], { hp: [80, 20], round: 4 })
    expect(end[0].map((o) => !!o.finisher)).toEqual([false, false, true])
    expect(end[1].some((o) => o.finisher)).toBe(false)
  })

  it('una mossa già vista, anche riscritta un po’, non si ripropone', () => {
    expect(similar('Crea una bolla elettrica che rimbalza sul cuscino', 'Crea una bolla elettrica che rimbalza sul cuscino, scaricando Colombo')).toBe(true)
    expect(similar('Lancia il cuscino gigante contro la valigia', 'Trasforma il pianeta in pasta al dente')).toBe(false)
    const backup: [Suggestion[], Suggestion[]] = [OFFERS, OFFERS]
    const fresh: Suggestion[] = [
      { text: 'Crea una bolla elettrica che rimbalza sul cuscino', tone: 'aggressiva' },
      { text: 'Nasconde una buccia di banana sotto il tappeto', tone: 'furba' },
      { text: 'Chiama in aiuto un piccione gigante', tone: 'pazza' },
    ]
    const out = dedupeOffers([fresh, fresh], ['Crea una bolla elettrica che rimbalza sul cuscino, scaricando Colombo'], backup)
    expect(out[0][0]).toEqual(OFFERS[0])
    expect(out[0][1].text).toBe('Nasconde una buccia di banana sotto il tappeto')
  })

  it('la mossa scritta dal giocatore viene ripulita', () => {
    expect(cleanCustom('  Gli tira\n una "torta" {in faccia}  ')).toBe('Gli tira una torta in faccia')
    expect(cleanCustom('x'.repeat(500))).toHaveLength(CUSTOM_MAX)
    expect(cleanCustom(42)).toBe('')
  })
})

describe('rissa e partita', () => {
  it('le mosse si scelgono a turno, chi apre si alterna, le mosse nuove arrivano col round', () => {
    let s = startFight(draftRound(createMatch(['A', 'B'], 1, 9)), 't')
    expect(s.fight.offers[0]).toEqual(OFFERS)
    expect(nextChooser(s)).toBe(0)
    // Fuori turno non si può scegliere.
    expect(reduce(s, { type: 'choose', side: 1, choice: { pick: 0 } }).fight.choices).toEqual([null, null])
    s = reduce(s, { type: 'choose', side: 0, choice: { pick: 0 } })
    s = reduce(s, { type: 'choose', side: 1, choice: { custom: '  Gli ruba il cappello\n' } })
    expect(s.fight.choices).toEqual([{ pick: 0 }, { custom: 'Gli ruba il cappello' }])
    expect(nextChooser(s)).toBeUndefined()
    const fresh: Suggestion[] = OFFERS.map((o) => ({ ...o, text: o.text + '!' }))
    const { round, next } = play(s.fight.fs, judge())
    s = reduce(s, { type: 'roundReady', round, next, offers: [fresh, fresh], token: 't2' })
    expect(s.fight.token).toBe('t2')
    expect(s.fight.offers[1]).toEqual(fresh)
    expect(s.fight.choices).toEqual([null, null])
    expect(nextChooser(s)).toBe(1)
  })

  it('non si sceglie una mossa che non c’è, né una mossa inventata vuota', () => {
    const s = startFight(draftRound(createMatch(['A', 'B'], 1, 9)))
    expect(reduce(s, { type: 'choose', side: 0, choice: { pick: 5 } }).fight.choices[0]).toBeNull()
    expect(reduce(s, { type: 'choose', side: 0, choice: { custom: '   ' } }).fight.choices[0]).toBeNull()
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
  it('ripara un verdetto sbagliato: colpi fuori scala, timbri inventati, pari scritto come null', () => {
    const backup: [Suggestion[], Suggestion[]] = [OFFERS, OFFERS]
    const j = normalizeJudgement({ scene: 'Succede di tutto', hits: [9, -2], recover: [5, 0], stamps: ['WOW', 'geniale'], winner: null }, backup)!
    expect(j.hits).toEqual([3, 0])
    expect(j.recover).toEqual([2, 0])
    expect(j.stamps).toEqual(['CLASSICA', 'GENIALE'])
    // null non deve diventare "vince il combattente 0".
    expect(j.winner).toBeNull()
    expect(normalizeJudgement({ scene: 'x', winner: '1' }, backup)!.winner).toBe(1)
    expect(j.offers).toEqual(backup)
    // Senza scena il verdetto non vale.
    expect(normalizeJudgement({ hits: [1, 1] }, backup)).toBeNull()
  })

  it('il narratore di riserva: la furbata punisce chi carica, la carica travolge la pazzia, la pazzia spiazza la furbata', () => {
    const f = fighters()
    const w = (a: 'aggressiva' | 'furba' | 'pazza', b: 'aggressiva' | 'furba' | 'pazza') => offlineJudgement(f, START, ['x', 'y'], [a, b], half).winner
    expect(w('furba', 'aggressiva')).toBe(0)
    expect(w('aggressiva', 'pazza')).toBe(0)
    expect(w('pazza', 'furba')).toBe(0)
    expect(w('aggressiva', 'furba')).toBe(1)
    const j = offlineJudgement(f, START, ['Attacca', 'Scappa'], [null, null], half)
    expect(j.scene).toContain(f[0].monster.character.name)
    expect(j.offers[0]).toHaveLength(3)
  })

  it('il narratore di riserva prepara presentazione, eventi e prime mosse', () => {
    const o = offlineOpening(fighters(), ARENAS[4])
    expect(o.events).toHaveLength(2)
    expect(o.events.every((e) => e.text.length > 10)).toBe(true)
    expect(o.offers.every((x) => x.length === 3)).toBe(true)
    expect(normalizeOpening({ title: 'T', offers: [[{ text: 'Uno', tone: 'aggressiva' }], []] }, fighters(), 'ai')!.offers[0][0].text).toBe('Uno')
  })
})

describe('server', () => {
  let lastSent: { model: string; messages: { content: string }[] } = { model: '', messages: [] }
  const groqAnswer = (answer: object) =>
    (async (_url: string, init: RequestInit) => {
      lastSent = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    }) as unknown as typeof fetch
  const offersOf = (p: string) => [
    { text: `colpo ${p}`, tone: 'aggressiva' },
    { text: `finta ${p}`, tone: 'furba' },
    { text: `pazzia ${p}`, tone: 'pazza' },
  ]
  const openingAnswer = { title: 'Titolo', nicknames: ['Primo', 'Secondo'], events: ['Il trenino travolge tutti'], offers: [offersOf('0'), offersOf('1')] }
  const roundAnswer = (over: object = {}) => ({
    scene: 'Il primo inciampa, il secondo ne approfitta.',
    hits: [2, 0],
    recover: [0, 0],
    winner: 1,
    why: 'Ha la meglio il secondo',
    moveNames: ['Nome0', 'Nome1'],
    stamps: ['MAH', 'GENIALE'],
    sfx: 'SBAM',
    ko: ['crolla 0', 'crolla 1'],
    summary: 'Primo round epico',
    offers: [offersOf('0'), offersOf('1')],
    ...over,
  })

  it('rimette a posto tutte le coppie se ha invertito l’ordine', async () => {
    const f = fighters()
    const o = await generateOpening(f, ARENAS[0], true, [2, 5], { apiKey: 'k', fetch: groqAnswer(openingAnswer) })
    // L'AI vede Marco come combattente 0.
    const sent = lastSent.messages[1].content
    expect(sent.indexOf(f[1].monster.character.desc)).toBeLessThan(sent.indexOf(f[0].monster.character.desc))
    expect(sent).toContain('ai round 2 e 5')
    expect(o.nicknames).toEqual(['Secondo', 'Primo'])
    expect(o.offers[0][0].text).toBe('colpo 1')
    expect(o.events).toEqual([
      { round: 2, text: 'Il trenino travolge tutti' },
      { round: 5, text: expect.any(String) },
    ])

    const j = await generateRound(f, ARENAS[0], true, o, START, [], [{ text: 'mossa di Giulia', from: OFFERS[0] }, { text: 'mossa di Marco' }], o.events[0], {
      apiKey: 'k',
      fetch: groqAnswer(roundAnswer()),
    })
    // Per l'AI Marco è lo 0: il suo "hits 2" e "winner 1" vanno girati.
    expect(j.hits).toEqual([0, 2])
    expect(j.winner).toBe(0)
    expect(j.moveNames).toEqual(['Nome1', 'Nome0'])
    expect(j.stamps).toEqual(['GENIALE', 'MAH'])
    expect(j.offers[0][0].text).toBe('colpo 1')
    const prompt = lastSent.messages[1].content
    expect(prompt).toMatch(/\(COMBATTENTE 0\): «mossa di Marco» \[scritta dal giocatore/)
    expect(prompt).toMatch(/\(COMBATTENTE 1\): «mossa di Giulia» \[suggerita, tipo aggressiva/)
    expect(prompt).toContain('Il trenino travolge tutti')
  })

  it('un pari resta pari anche con l’ordine invertito', async () => {
    const j = await generateRound(fighters(), ARENAS[0], true, { title: 'T' }, START, [], [{ text: 'a' }, { text: 'b' }], undefined, {
      apiKey: 'k',
      fetch: groqAnswer(roundAnswer({ winner: null, hits: [1, 1] })),
    })
    expect(j.winner).toBeNull()
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
    expect((await handleBattleRequest(JSON.stringify({ stage: 'round', token: 'abc.def', choices: [{ pick: 0 }, { pick: 0 }] }), { apiKey: 'k' })).status).toBe(400)
  })

  it('endpoint: lo stato firmato passa da un round all’altro, con memoria e mosse nuove', async () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 1, 3))
    const cfg = { apiKey: 'k', rand: () => 0.9, fetch: groqAnswer(openingAnswer) }
    const open = (await handleBattleRequest(JSON.stringify({ stage: 'opening', ...battleRequest(s) }), cfg)).body as { token: string }
    const roundCfg = { ...cfg, fetch: groqAnswer(roundAnswer({ offers: [offersOf('nuova0'), offersOf('nuova1')] })) }
    const round = async (token: string, choices: unknown[]) => {
      const r = await handleBattleRequest(JSON.stringify({ stage: 'round', token, choices }), roundCfg)
      return { status: r.status, body: r.body as { token: string; round: { hp: number[]; custom: boolean[] }; offers: Suggestion[][] } }
    }
    // Mossa che non esiste, o inventata ma vuota: rifiutate.
    expect((await round(open.token, [{ pick: 7 }, { pick: 0 }])).status).toBe(400)
    expect((await round(open.token, [{ custom: '  ' }, { pick: 0 }])).status).toBe(400)
    const r1 = await round(open.token, [{ pick: 1 }, { custom: 'Gli lancia una torta' }])
    expect(r1.status).toBe(200)
    expect(r1.body.round.custom).toEqual([false, true])
    expect(r1.body.round.hp.some((h) => h < 100)).toBe(true)
    expect(r1.body.offers[0][0].text).toBe('colpo nuova0')
    await round(r1.body.token, [{ pick: 0 }, { pick: 0 }])
    // L'AI ricorda il round precedente e vede le mosse nuove.
    expect(lastSent.messages[1].content).toContain('Primo round epico')
    expect(lastSent.messages[1].content).toContain('colpo nuova')
    // …e sa quali mosse ha già proposto, per non ripeterle.
    expect(lastSent.messages[1].content).toMatch(/MOSSE GIÀ SUGGERITE.*«finta 0».*«finta nuova0»/)
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

  it('il prompt descrive personaggio e arma nello stile fisso', () => {
    const p = portraitPrompt(rawSubject(DECKS.character[0], DECKS.weapon[0]))
    expect(p).toContain(DECKS.character[0].name)
    expect(p).toContain(DECKS.weapon[0].desc)
    expect(p).toContain('No text')
  })

  it('con la chiave Groq traduce le carte prima di disegnare', async () => {
    const prompts: string[] = []
    const fetch = (async (url: string, init: RequestInit) => {
      if (url.includes('groq')) {
        const content = JSON.stringify({ character: 'a furious koala with red eyes', weapon: "a grandma's slipper" })
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      }
      prompts.push(JSON.parse(init.body as string).prompt)
      return new Response(JSON.stringify({ result: { image: png } }), { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const r = await handlePortraitRequest(DECKS.character[0].id, DECKS.weapon[0].id, { ...cfg, groqKey: 'g', fetch }, memoryStore())
    expect(r.status).toBe(200)
    expect(prompts[0]).toContain("a grandma's slipper")
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
