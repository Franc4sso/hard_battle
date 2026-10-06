import { describe, expect, it } from 'vitest'
import { ARENAS, DECKS, SLOTS } from '../../shared/cards'
import {
  clashWinner,
  combine,
  hpAfter,
  normalizeEnding,
  normalizeOpening,
  offlineEnding,
  offlineOpening,
  OPENING_FLOOR,
  type Battle,
  type Fighter,
  type Monster,
} from '../../shared/battle'
import { generateEnding, generateOpening } from '../../server/groq'
import { handleBattleRequest, parseRequest } from '../../server/handler'
import { sign, verify } from '../../server/token'
import { withBattle } from './bestiary'
import { battleRequest, createMatch, currentSlot, draftSlots, reduce, type MatchState } from './match'

function monster(i = 0): Monster {
  return { character: DECKS.character[i], weapon: DECKS.weapon[i], personality: DECKS.personality[i], power: DECKS.power[i] }
}
function fighters(): [Fighter, Fighter] {
  return [
    { player: 'Giulia', monster: monster(0) },
    { player: 'Marco', monster: monster(1) },
  ]
}
function fakeBattle(winner: 0 | 1): Battle {
  const f = fighters()
  const opening = offlineOpening(f, ARENAS[0])
  const ending = { ...offlineEnding(f, ARENAS[0], opening, ['attacco', 'difesa']), winner }
  return combine(opening, ending, ['attacco', 'difesa'], f)
}

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

function fight(s: MatchState, winner: 0 | 1): MatchState {
  s = reduce(s, { type: 'fight' })
  s = reduce(s, { type: 'openingReady', opening: offlineOpening(fighters(), ARENAS[0]), token: null })
  s = reduce(s, { type: 'tactic', side: s.first, tactic: 'trucco' })
  s = reduce(s, { type: 'tactic', side: s.first === 0 ? 1 : 0, tactic: 'difesa' })
  s = reduce(s, { type: 'battleReady', battle: fakeBattle(winner) })
  return reduce(s, { type: 'verdict' })
}

describe('carte', () => {
  it('hanno id unici e mazzi abbastanza grandi', () => {
    const all = [...SLOTS.flatMap((s) => DECKS[s]), ...ARENAS]
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length)
    for (const s of SLOTS) expect(DECKS[s].length).toBeGreaterThanOrEqual(40)
  })
})

describe('sabotaggio e creazione', () => {
  it('A sabota B, B sabota A e crea, poi crea A', () => {
    let s = createMatch(['Giulia', 'Marco'], 3, 42)
    expect(s.phase).toBe('pass')
    expect(s.picker).toBe(0)
    s = reduce(s, { type: 'beginTurn' })
    expect(s.phase).toBe('sabotage')
    const giftForMarco = s.offer[2]
    expect(DECKS[s.gifts[1].slot]).toContain(giftForMarco)
    s = reduce(s, { type: 'sabotage', index: 2 })
    expect(s.gifts[1].card).toBe(giftForMarco)
    expect(s.phase).toBe('pass')
    expect(s.picker).toBe(1)

    s = reduce(s, { type: 'beginTurn' })
    expect(s.phase).toBe('sabotage')
    s = reduce(s, { type: 'sabotage', index: 0 })
    // Marco ha già il telefono: crea subito il suo mostro, con il regalo di Giulia già dentro.
    expect(s.phase).toBe('pick')
    expect(s.picker).toBe(1)
    expect(s.draft[s.gifts[1].slot]).toBe(giftForMarco)
    expect(draftSlots(s, 1)).toHaveLength(3)
    expect(draftSlots(s, 1)).not.toContain(s.gifts[1].slot)
    for (let i = 0; i < 3; i++) {
      expect(currentSlot(s)).not.toBe(s.gifts[1].slot)
      s = reduce(s, { type: 'pick', index: 0 })
    }
    expect(s.phase).toBe('ready')
    s = reduce(s, { type: 'confirm' })
    expect(s.monsters[1]?.[s.gifts[1].slot]).toBe(giftForMarco)
    expect(s.phase).toBe('pass')
    expect(s.picker).toBe(0)

    s = draftRound(s)
    expect(s.phase).toBe('versus')
    expect(s.monsters[0]?.[s.gifts[0].slot]).toBe(s.gifts[0].card)
  })

  it('il personaggio non si sabota mai', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createMatch(['A', 'B'], 1, seed)
      expect(s.gifts.map((g) => g.slot)).not.toContain('character')
    }
  })

  it('un campione dal bestiario si tiene comunque il regalo', () => {
    let s = createMatch(['A', 'B'], 1, 5)
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    const champ = monster(10)
    s = reduce(s, { type: 'useChampion', monster: champ })
    expect(s.phase).toBe('ready')
    expect(s.champion).toBe(true)
    expect(s.draft.character).toBe(champ.character)
    expect(s.draft[s.gifts[1].slot]).toBe(s.gifts[1].card)
  })

  it('un solo rimescolo per giocatore a round', () => {
    let s = createMatch(['A', 'B'], 1, 7)
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    s = reduce(reduce(s, { type: 'beginTurn' }), { type: 'sabotage', index: 0 })
    const before = s.offer
    s = reduce(s, { type: 'reroll' })
    expect(s.offer).not.toEqual(before)
    expect(s.rerolls[1]).toBe(0)
    const after = s.offer
    expect(reduce(s, { type: 'reroll' }).offer).toBe(after)
  })
})

describe('rissa e partita', () => {
  it('servono entrambe le tattiche prima del finale', () => {
    let s = draftRound(createMatch(['A', 'B'], 1, 9))
    s = reduce(s, { type: 'openingReady', opening: offlineOpening(fighters(), ARENAS[0]), token: 'x' })
    expect(s.fight.token).toBe('x')
    s = reduce(s, { type: 'fight' })
    s = reduce(s, { type: 'tactic', side: 0, tactic: 'attacco' })
    expect(reduce(s, { type: 'battleReady', battle: fakeBattle(0) }).fight.battle).toBeNull()
    expect(reduce(s, { type: 'tactic', side: 0, tactic: 'difesa' }).fight.tactics[0]).toBe('attacco')
  })

  it('conta le vittorie, alterna chi apre e finisce al meglio di 3', () => {
    let s = fight(draftRound(createMatch(['A', 'B'], 3, 9)), 1)
    s = reduce(s, { type: 'nextRound' })
    expect(s.phase).toBe('pass')
    expect(s.first).toBe(1)
    expect(s.picker).toBe(1)
    expect(s.fight.opening).toBeNull()
    s = reduce(fight(draftRound(s), 1), { type: 'nextRound' })
    expect(s.phase).toBe('final')
    expect(s.players[1].wins).toBe(2)
    expect(s.history[1].nicknames[1]).toBeTruthy()
  })

  it('manda al server solo id', () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 1, 1))
    expect(parseRequest(battleRequest(s))?.fighters[0].player).toBe('Giulia')
  })
})

describe('battaglia', () => {
  it('nella prima parte nessuno va sotto la soglia né usa il superpotere', () => {
    const o = normalizeOpening({ rounds: [{ attacker: 0, action: 'a', damage: 45, power: true }, { attacker: 0, action: 'b', damage: 45 }] }, 'ai')!
    expect(hpAfter(o)[1]).toBe(OPENING_FLOOR)
    expect(o.rounds.every((r) => !r.power)).toBe(true)
  })

  it('nella seconda parte il vincitore resta in piedi e il perdente va a zero', () => {
    const e = normalizeEnding(
      {
        winner: 1,
        rounds: [
          { attacker: 0, action: 'a', damage: 45 },
          { attacker: 1, action: 'b', damage: 10 },
          { attacker: 0, action: 'c', damage: 40 },
          { attacker: 1, action: 'd', damage: 10 },
        ],
      },
      [60, 50],
      'ai',
    )!
    const last = e.rounds.at(-1)!
    expect(last.hp[0]).toBe(0)
    expect(e.rounds.every((r) => r.hp[1] > 0)).toBe(true)
    expect(e.rounds[1].hp[0]).toBeGreaterThan(0)
  })

  it('scarta risposte senza vincitore', () => {
    expect(normalizeEnding({ rounds: [{ attacker: 0, action: 'x' }] }, [100, 100], 'ai')).toBeNull()
    expect(normalizeOpening({ rounds: [] }, 'ai')).toBeNull()
  })

  it('tattiche: attacco > trucco > difesa > attacco', () => {
    expect(clashWinner(['attacco', 'trucco'])).toBe(0)
    expect(clashWinner(['attacco', 'difesa'])).toBe(1)
    expect(clashWinner(['trucco', 'difesa'])).toBe(0)
    expect(clashWinner(['difesa', 'difesa'])).toBeUndefined()
  })

  it('il narratore di riserva fa una rissa completa e coerente', () => {
    const f = fighters()
    const o = offlineOpening(f, ARENAS[2])
    const b = combine(o, offlineEnding(f, ARENAS[2], o, ['trucco', 'attacco']), ['trucco', 'attacco'], f)
    expect(b.tacticAt).toBe(o.rounds.length)
    expect(b.rounds.some((r) => r.power)).toBe(true)
    expect(b.rounds.at(-1)!.hp[b.winner === 0 ? 1 : 0]).toBe(0)
    expect(b.nicknames.every(Boolean)).toBe(true)
  })
})

describe('server', () => {
  const groqAnswer = (answer: object) =>
    (async (_url: string, init: RequestInit) => {
      lastSent = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    }) as unknown as typeof fetch
  let lastSent: { messages: { content: string }[] } = { messages: [] }

  it('rimette a posto vincitore, attaccanti e soprannomi se ha invertito l’ordine', async () => {
    const f = fighters()
    const opening = await generateOpening(f, ARENAS[0], true, {
      apiKey: 'k',
      fetch: groqAnswer({ title: 'T', rounds: [{ attacker: 0, action: 'x', damage: 10 }, { attacker: 1, action: 'y', damage: 10 }] }),
    })
    // L'AI vede Marco come combattente 0.
    expect(lastSent.messages[1].content.indexOf('Marco')).toBeLessThan(lastSent.messages[1].content.indexOf('Giulia'))
    expect(opening.rounds.map((r) => r.attacker)).toEqual([1, 0])

    const ending = await generateEnding(f, ARENAS[0], true, opening, ['attacco', 'trucco'], {
      apiKey: 'k',
      fetch: groqAnswer({ winner: 0, rounds: [{ attacker: 0, action: 'z', damage: 40 }], nicknames: ['Il Corso', 'Il Pennuto'] }),
    })
    expect(ending.winner).toBe(1)
    expect(ending.nicknames).toEqual(['Il Pennuto', 'Il Corso'])
    // Le tattiche arrivano all'AI nello stesso ordine invertito: Marco (trucco) è il suo combattente 0.
    expect(lastSent.messages[1].content).toContain('(COMBATTENTE 0): Trucco sporco')
  })

  it('la firma protegge la prima parte', () => {
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
    const fake = { stage: 'ending', token: 'abc.def', tactics: ['attacco', 'difesa'] }
    expect((await handleBattleRequest(JSON.stringify(fake), { apiKey: 'k' })).status).toBe(400)
  })

  it('endpoint: la prima parte torna firmata e la seconda la riusa', async () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 1, 3))
    const cfg = {
      apiKey: 'k',
      rand: () => 0.9,
      fetch: groqAnswer({ title: 'Titolo', rounds: [{ attacker: 0, action: 'a', damage: 10 }, { attacker: 1, action: 'b', damage: 10 }] }),
    }
    const open = (await handleBattleRequest(JSON.stringify({ stage: 'opening', ...battleRequest(s) }), cfg)).body as { token: string }
    expect(open.token).toBeTruthy()
    const end = await handleBattleRequest(JSON.stringify({ stage: 'ending', token: open.token, tactics: ['difesa', 'trucco'] }), {
      ...cfg,
      fetch: groqAnswer({ winner: 1, clash: 'c', rounds: [{ attacker: 1, action: 'ko', damage: 40 }], nicknames: ['x', 'y'] }),
    })
    expect(end.status).toBe(200)
    expect(lastSent.messages[1].content).toContain('Titolo')
    expect(lastSent.messages[1].content).toContain('Difesa di ferro')
  })
})

describe('bestiario', () => {
  it('registra entrambi i mostri e accumula vittorie', () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 3, 11))
    let list = withBattle([], s, fakeBattle(0), 1)
    expect(list).toHaveLength(2)
    list = withBattle(list, s, fakeBattle(0), 2)
    const giulia = list.find((e) => e.owner === 'Giulia')!
    expect(giulia.wins).toBe(2)
    expect(list.find((e) => e.owner === 'Marco')!.losses).toBe(2)
    expect(list[0].owner).toBe('Giulia')
  })
})
