import { describe, expect, it } from 'vitest'
import { ARENAS, CHARACTERS, DECKS, SLOTS } from '../../shared/cards'
import { normalizeBattle, offlineBattle, type Battle, type Fighter, type Monster } from '../../shared/battle'
import { generateBattle } from '../../server/groq'
import { handleBattleRequest, parseRequest } from '../../server/handler'
import { battleRequest, createMatch, reduce, type MatchState } from './match'

const fakeBattle = (winner = 0): Battle => offlineBattle(fighters(), ARENAS[0], () => (winner === 0 ? 0.1 : 0.9))

function monster(i = 0): Monster {
  return { character: DECKS.character[i], weapon: DECKS.weapon[i], personality: DECKS.personality[i], power: DECKS.power[i] }
}
function fighters(): [Fighter, Fighter] {
  return [
    { player: 'Giulia', monster: monster(0) },
    { player: 'Marco', monster: monster(1) },
  ]
}

function draftBoth(s: MatchState): MatchState {
  for (let p = 0; p < 2; p++) {
    s = reduce(s, { type: 'beginPick' })
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'pick', index: i % 3 })
    s = reduce(s, { type: 'confirm' })
  }
  return s
}

describe('carte', () => {
  it('hanno id unici e mazzi abbastanza grandi', () => {
    const all = [...SLOTS.flatMap((s) => DECKS[s]), ...ARENAS]
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length)
    for (const s of SLOTS) expect(DECKS[s].length).toBeGreaterThanOrEqual(40)
  })
})

describe('partita', () => {
  it('fa scegliere 4 carte a testa e poi va alla rissa', () => {
    let s = createMatch(['Giulia', 'Marco'], 3, 42)
    expect(s.phase).toBe('pass')
    expect(s.offer).toHaveLength(3)
    expect(s.offer.every((c) => CHARACTERS.includes(c))).toBe(true)
    s = reduce(s, { type: 'beginPick' })
    s = reduce(s, { type: 'pick', index: 1 })
    expect(s.step).toBe(1)
    expect(s.offer.every((c) => DECKS.weapon.includes(c))).toBe(true)
    for (let i = 0; i < 3; i++) s = reduce(s, { type: 'pick', index: 0 })
    expect(s.phase).toBe('ready')
    s = reduce(s, { type: 'confirm' })
    expect(s.phase).toBe('pass')
    expect(s.picker).toBe(1)
    expect(s.monsters[0]?.character).toBeDefined()
    s = reduce(s, { type: 'beginPick' })
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'pick', index: 2 })
    s = reduce(s, { type: 'confirm' })
    expect(s.phase).toBe('versus')
  })

  it('un solo rimescolo per giocatore a round', () => {
    let s = reduce(createMatch(['A', 'B'], 1, 7), { type: 'beginPick' })
    const before = s.offer
    s = reduce(s, { type: 'reroll' })
    expect(s.offer).not.toEqual(before)
    expect(s.rerolls[0]).toBe(0)
    const after = s.offer
    s = reduce(s, { type: 'reroll' })
    expect(s.offer).toBe(after)
  })

  it('non ripropone carte già uscite nella partita', () => {
    let s = createMatch(['A', 'B'], 1, 3)
    const seen = new Set(s.offer.map((c) => c.id))
    s = reduce(s, { type: 'beginPick' })
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'reroll' })
      if (i === 0) for (const c of s.offer) expect(seen.has(c.id)).toBe(false)
    }
  })

  it('conta le vittorie e finisce al meglio di 3', () => {
    let s = draftBoth(createMatch(['A', 'B'], 3, 9))
    for (let round = 0; round < 2; round++) {
      s = reduce(s, { type: 'fight' })
      expect(s.phase).toBe('battle')
      s = reduce(s, { type: 'battleReady', battle: fakeBattle(1) })
      s = reduce(s, { type: 'verdict' })
      expect(s.phase).toBe('verdict')
      s = reduce(s, { type: 'nextRound' })
      if (round === 0) {
        expect(s.phase).toBe('pass')
        expect(s.first).toBe(1)
        expect(s.picker).toBe(1)
        s = draftBoth(s)
      }
    }
    expect(s.phase).toBe('final')
    expect(s.players[1].wins).toBe(2)
    expect(s.history).toHaveLength(2)
  })

  it('manda al server solo id', () => {
    const s = draftBoth(createMatch(['Giulia', 'Marco'], 1, 1))
    const req = battleRequest(s)
    expect(parseRequest(JSON.stringify(req))?.fighters[0].player).toBe('Giulia')
  })
})

describe('battaglia', () => {
  it('ricalcola i punti vita: il vincitore resta in piedi, il perdente va a zero', () => {
    const b = normalizeBattle(
      {
        winner: 1,
        rounds: [
          { attacker: 0, action: 'a', damage: 90 },
          { attacker: 1, action: 'b', damage: 10 },
          { attacker: 0, action: 'c', damage: 40 },
          { attacker: 1, action: 'd', damage: 5 },
        ],
      },
      'ai',
    )!
    const last = b.rounds.at(-1)!
    expect(last.hp[0]).toBe(0)
    expect(last.hp[1]).toBeGreaterThan(0)
    expect(b.rounds.every((r) => r.hp[1] > 0)).toBe(true)
    expect(b.rounds[1].hp[0]).toBeGreaterThan(0)
  })

  it('scarta risposte senza vincitore o con troppi pochi round', () => {
    expect(normalizeBattle({ rounds: [] }, 'ai')).toBeNull()
    expect(normalizeBattle({ winner: 0, rounds: [{ attacker: 0, action: 'x' }] }, 'ai')).toBeNull()
  })

  it('il narratore di riserva produce una rissa valida', () => {
    const b = offlineBattle(fighters(), ARENAS[3])
    expect(b.rounds.length).toBeGreaterThanOrEqual(4)
    expect(b.rounds.some((r) => r.power)).toBe(true)
    expect(b.rounds.at(-1)!.hp[b.winner === 0 ? 1 : 0]).toBe(0)
  })

  it('rimette a posto vincitore e attaccanti se ha invertito l’ordine per Groq', async () => {
    const aiAnswer = {
      title: 'T',
      winner: 0,
      rounds: [0, 1, 0, 0].map((attacker, i) => ({ attacker, action: `mossa ${i}`, damage: 20 })),
    }
    let sent = ''
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(aiAnswer) } }] }))
    }) as unknown as typeof fetch
    // rand < 0.5 → ordine invertito: lo 0 dell'AI è il nostro 1
    const b = await generateBattle(fighters(), ARENAS[0], { apiKey: 'k', fetch: fakeFetch, rand: () => 0.1 })
    expect(b.winner).toBe(1)
    expect(b.rounds.map((r) => r.attacker)).toEqual([1, 0, 1, 1])
    expect(JSON.parse(sent).messages[1].content.indexOf('Marco')).toBeLessThan(JSON.parse(sent).messages[1].content.indexOf('Giulia'))
  })
})

describe('endpoint', () => {
  it('senza chiave risponde 503, con carte inventate 400', async () => {
    expect((await handleBattleRequest('{}', {})).status).toBe(503)
    const bad = { arena: ARENAS[0].id, fighters: [{ character: 'c-inventato' }, {}] }
    expect((await handleBattleRequest(JSON.stringify(bad), { apiKey: 'k' })).status).toBe(400)
  })

  it('rifiuta una carta del mazzo sbagliato', () => {
    const f = { player: 'x', character: DECKS.weapon[0].id, weapon: DECKS.weapon[0].id, personality: DECKS.personality[0].id, power: DECKS.power[0].id }
    expect(parseRequest(JSON.stringify({ arena: ARENAS[0].id, fighters: [f, f] }))).toBeUndefined()
  })
})
