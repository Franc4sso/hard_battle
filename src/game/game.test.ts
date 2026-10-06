import { describe, expect, it } from 'vitest'
import { ARENAS, DECKS, SLOTS } from '../../shared/cards'
import {
  MAX_ROUNDS,
  START,
  blockedReason,
  normalizeOpening,
  normalizeRoundTexts,
  offlineOpening,
  offlineTexts,
  playRound,
  roundDelta,
  type FightState,
  type Fighter,
  type Monster,
  type MoveType,
  type RoundTexts,
} from '../../shared/battle'
import { generateOpening, generateRound } from '../../server/groq'
import { handleBattleRequest, parseRequest } from '../../server/handler'
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
const texts = (efficacy: [number, number] = [1, 1]): RoundTexts => ({
  efficacy,
  actions: ['a', 'b'],
  sfx: ['X', 'Y'],
  ko: ['A crolla', 'B crolla'],
  summary: 's',
})
/** Indice della mossa di un tipo (le mosse sono sempre in ordine attacco, difesa, cura, super). */
const IDX: Record<MoveType, number> = { attacco: 0, difesa: 1, cura: 2, super: 3 }

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

/** Rissa offline giocata fino alla fine con mosse fisse. */
function fightToEnd(s: MatchState, moves: [MoveType, MoveType]): MatchState {
  s = reduce(s, { type: 'fight' })
  s = reduce(s, { type: 'openingReady', opening: offlineOpening(fighters(), ARENAS[0]), token: null })
  for (let guard = 0; !s.fight.end; guard++) {
    if (guard > MAX_ROUNDS) throw new Error('la rissa non finisce')
    for (let k = 0; k < 2; k++) {
      const who = nextChooser(s)!
      s = reduce(s, { type: 'choose', side: who, move: IDX[moves[who]] })
    }
    if (nextChooser(s) !== undefined) throw new Error('mossa rifiutata')
    const types: [MoveType, MoveType] = [moves[0], moves[1]]
    const { round, next } = playRound(s.fight.fs, [IDX[moves[0]], IDX[moves[1]]], types, texts(), NAMES, half)
    s = reduce(s, { type: 'roundReady', round, next, token: null })
  }
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
    s = reduce(s, { type: 'beginTurn' })
    expect(s.phase).toBe('sabotage')
    const giftForMarco = s.offer[2]
    expect(DECKS[s.gifts[1].slot]).toContain(giftForMarco)
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

describe('regole delle mosse', () => {
  it('la difesa para quasi tutto e contrattacca', () => {
    const d = roundDelta(['attacco', 'difesa'], [1, 1], half)
    expect(d[1]).toBeGreaterThan(-8)
    expect(d[0]).toBeLessThan(0)
  })

  it('il superpotere sfonda la difesa più di un attacco', () => {
    expect(roundDelta(['super', 'difesa'], [1, 1], half)[1]).toBeLessThan(roundDelta(['attacco', 'difesa'], [1, 1], half)[1])
  })

  it('la cura recupera vita, ma non protegge dai colpi', () => {
    expect(roundDelta(['cura', 'difesa'], [1, 1], half)[0]).toBeGreaterThan(0)
    expect(roundDelta(['cura', 'attacco'], [1, 1], half)[0]).toBeLessThan(0)
  })

  it('l’efficacia data dall’AI pesa sul risultato', () => {
    expect(roundDelta(['attacco', 'attacco'], [1.5, 0.6], half)[1]).toBeLessThan(roundDelta(['attacco', 'attacco'], [0.6, 1.5], half)[1])
  })

  it('superpotere una volta sola, cura non due round di fila', () => {
    const { next } = playRound(START, [3, 2], ['super', 'cura'], texts(), NAMES, half)
    expect(blockedReason(next, 0, 'super')).toBeTruthy()
    expect(blockedReason(next, 1, 'cura')).toBeTruthy()
    expect(blockedReason(next, 1, 'attacco')).toBeUndefined()
  })

  it('KO: il perdente va a zero e usa la sua frase finale', () => {
    const fs: FightState = { ...START, hp: [60, 10] }
    const { round } = playRound(fs, [0, 0], ['attacco', 'attacco'], texts(), NAMES, half)
    expect(round.end?.winner).toBe(0)
    expect(round.hp[1]).toBe(0)
    expect(round.end?.finale).toBe('B crolla')
  })

  it('se crollano entrambi vince chi è messo meno peggio', () => {
    const fs: FightState = { ...START, hp: [5, 12] }
    const { round } = playRound(fs, [3, 3], ['super', 'super'], texts(), NAMES, half)
    expect(round.end?.winner).toBe(1)
    expect(round.hp).toEqual([0, expect.any(Number)])
    expect(round.hp[1]).toBeGreaterThan(0)
  })

  it('la rissa si scalda: più avanti i colpi fanno più male', () => {
    const early = playRound(START, [0, 0], ['attacco', 'attacco'], texts(), NAMES, half).round.delta[0]
    const late = playRound({ ...START, round: 6 }, [0, 0], ['attacco', 'attacco'], texts(), NAMES, half).round.delta[0]
    expect(late).toBeLessThan(early)
  })

  it('con mosse a caso quasi tutte le risse finiscono con un KO, in pochi round', () => {
    let rand = 12345
    const r = () => ((rand = (rand * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    let ko = 0
    let rounds = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      let fs = START
      for (;;) {
        const pick = (side: 0 | 1) => {
          const ok = (['attacco', 'difesa', 'cura', 'super'] as MoveType[]).filter((t) => !blockedReason(fs, side, t))
          return ok[Math.floor(r() * ok.length)]
        }
        const types: [MoveType, MoveType] = [pick(0), pick(1)]
        const eff: [number, number] = [0.6 + r() * 0.9, 0.6 + r() * 0.9]
        const out = playRound(fs, [IDX[types[0]], IDX[types[1]]], types, texts(eff), NAMES, r)
        fs = out.next
        if (out.round.end) {
          if (!out.round.end.byJury) ko++
          rounds += fs.round
          break
        }
      }
    }
    // Giocando a caso (molte cure e difese) almeno 3 risse su 4 si chiudono col KO.
    expect(ko / N).toBeGreaterThan(0.75)
    expect(rounds / N).toBeLessThan(7)
  })

  it('dopo l’ultimo round decide la giuria ai punti', () => {
    const fs: FightState = { ...START, hp: [70, 40], round: MAX_ROUNDS - 1 }
    const { round } = playRound(fs, [1, 1], ['difesa', 'difesa'], texts(), NAMES, half)
    expect(round.end).toMatchObject({ winner: 0, byJury: true })
  })
})

describe('rissa e partita', () => {
  it('le mosse si scelgono a turno, chi apre si alterna a ogni round', () => {
    let s = draftRound(createMatch(['A', 'B'], 1, 9))
    s = reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: offlineOpening(fighters(), ARENAS[0]), token: 't' })
    expect(nextChooser(s)).toBe(0)
    // Fuori turno non si può scegliere.
    expect(reduce(s, { type: 'choose', side: 1, move: 0 }).fight.choices).toEqual([null, null])
    s = reduce(s, { type: 'choose', side: 0, move: 0 })
    s = reduce(s, { type: 'choose', side: 1, move: 1 })
    expect(nextChooser(s)).toBeUndefined()
    const { round, next } = playRound(s.fight.fs, [0, 1], ['attacco', 'difesa'], texts(), NAMES, half)
    s = reduce(s, { type: 'roundReady', round, next, token: 't2' })
    expect(s.fight.token).toBe('t2')
    expect(s.fight.choices).toEqual([null, null])
    expect(nextChooser(s)).toBe(1)
  })

  it('non si sceglie una mossa bloccata', () => {
    let s = draftRound(createMatch(['A', 'B'], 1, 9))
    s = reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: offlineOpening(fighters(), ARENAS[0]), token: null })
    s = { ...s, fight: { ...s.fight, fs: { ...s.fight.fs, superUsed: [true, false] } } }
    expect(reduce(s, { type: 'choose', side: 0, move: IDX.super }).fight.choices[0]).toBeNull()
  })

  it('a suon di attacchi qualcuno crolla, la vittoria si conta e la partita va avanti', () => {
    let s = fightToEnd(draftRound(createMatch(['A', 'B'], 3, 9)), ['attacco', 'attacco'])
    expect(s.phase).toBe('verdict')
    expect(s.history).toHaveLength(1)
    expect(s.history[0].mvp).toBeTruthy()
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
  it('le mosse hanno sempre un tipo ciascuno, anche se l’AI sbaglia', () => {
    const o = normalizeOpening({ title: 'T', moves: [[{ name: 'Uno', type: 'cura' }], []] }, fighters(), 'ai')!
    expect(o.moves[0].map((m) => m.type)).toEqual(['attacco', 'difesa', 'cura', 'super'])
    expect(o.moves[0][0].name).toBe('Uno')
    expect(o.moves[1][3].name).toBe(fighters()[1].monster.power.name)
  })

  it('l’efficacia resta tra 0.6 e 1.5', () => {
    const t = normalizeRoundTexts({ efficacy: [9, -3], actions: ['x', 'y'] })!
    expect(t.efficacy).toEqual([1.5, 0.6])
    expect(normalizeRoundTexts({ actions: ['solo uno'] })).toBeNull()
  })

  it('il narratore di riserva racconta ogni combinazione', () => {
    const o = offlineOpening(fighters(), ARENAS[1])
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) expect(offlineTexts(fighters(), o, [a, b]).actions.every(Boolean)).toBe(true)
  })
})

describe('server', () => {
  let lastSent: { model: string; messages: { content: string }[] } = { model: '', messages: [] }
  const groqAnswer = (answer: object) =>
    (async (_url: string, init: RequestInit) => {
      lastSent = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
    }) as unknown as typeof fetch
  const openingAnswer = {
    title: 'Titolo',
    nicknames: ['Primo', 'Secondo'],
    moves: [
      ['a0', 'd0', 'c0', 's0'].map((name) => ({ name })),
      ['a1', 'd1', 'c1', 's1'].map((name) => ({ name })),
    ],
  }

  it('rimette a posto tutte le coppie se ha invertito l’ordine', async () => {
    const f = fighters()
    const o = await generateOpening(f, ARENAS[0], true, { apiKey: 'k', fetch: groqAnswer(openingAnswer) })
    // L'AI vede Marco come combattente 0.
    expect(lastSent.messages[1].content.indexOf('Marco')).toBeLessThan(lastSent.messages[1].content.indexOf('Giulia'))
    expect(o.nicknames).toEqual(['Secondo', 'Primo'])
    expect(o.moves[0][0].name).toBe('a1')

    const t = await generateRound(f, ARENAS[0], true, o, START, [], [0, 3], {
      apiKey: 'k',
      fetch: groqAnswer({ efficacy: [1.4, 0.7], actions: ['di Marco', 'di Giulia'], sfx: ['M', 'G'] }),
    })
    expect(t.efficacy).toEqual([0.7, 1.4])
    expect(t.actions).toEqual(['di Giulia', 'di Marco'])
    // Per l'AI la mossa di Marco (super) è quella del combattente 0.
    expect(lastSent.messages[1].content).toMatch(/\(COMBATTENTE 0\): "s0"/)
  })

  it('se il modello grande ha finito i token al minuto ripiega su quello piccolo', async () => {
    const models: string[] = []
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string }
      models.push(body.model)
      if (body.model === 'openai/gpt-oss-120b') return new Response('rate limit', { status: 429 })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(openingAnswer) } }] }))
    }) as unknown as typeof fetch
    const o = await generateOpening(fighters(), ARENAS[0], false, { apiKey: 'k', fetch: fakeFetch })
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
    expect((await handleBattleRequest(JSON.stringify({ stage: 'round', token: 'abc.def', choices: [0, 0] }), { apiKey: 'k' })).status).toBe(400)
  })

  it('endpoint: lo stato firmato passa da un round all’altro e blocca le mosse vietate', async () => {
    const s = draftRound(createMatch(['Giulia', 'Marco'], 1, 3))
    const cfg = { apiKey: 'k', rand: () => 0.9, fetch: groqAnswer(openingAnswer) }
    const open = (await handleBattleRequest(JSON.stringify({ stage: 'opening', ...battleRequest(s) }), cfg)).body as { token: string }
    const roundCfg = { ...cfg, fetch: groqAnswer({ efficacy: [1, 1], actions: ['x', 'y'], sfx: ['A', 'B'], summary: 'Primo round epico' }) }
    const r1 = await handleBattleRequest(JSON.stringify({ stage: 'round', token: open.token, choices: [3, 0] }), roundCfg)
    expect(r1.status).toBe(200)
    const body = r1.body as { token: string; round: { hp: number[] } }
    expect(body.round.hp[1]).toBeLessThan(100)
    // Il superpotere è già stato usato: il server rifiuta.
    expect((await handleBattleRequest(JSON.stringify({ stage: 'round', token: body.token, choices: [3, 0] }), roundCfg)).status).toBe(400)
    const r2 = await handleBattleRequest(JSON.stringify({ stage: 'round', token: body.token, choices: [0, 1] }), roundCfg)
    expect(r2.status).toBe(200)
    // L'AI ricorda il round precedente.
    expect(lastSent.messages[1].content).toContain('Primo round epico')
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
