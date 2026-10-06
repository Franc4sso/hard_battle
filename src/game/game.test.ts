import { describe, expect, it } from 'vitest'
import { ARENAS, DECKS, HEALING_POWER_IDS, SABOTAGE_DECKS, SLOTS, findCard } from '../../shared/cards'
import {
  MAX_ROUNDS,
  START,
  blockedReason,
  normalizeOpening,
  normalizeRoundTexts,
  offlineOpening,
  FORCE_BUDGET,
  fallbackMoves,
  forceBudget,
  normalizeMoves,
  offlineTexts,
  playRound,
  roundEffects,
  scheduleEvents,
  stampOf,
  type EventRule,
  type FightState,
  type Fighter,
  type Force,
  type Monster,
  type Move,
  type MoveType,
  type Opening,
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
  verdicts: ['', ''],
  summary: 's',
})
const mv = (type: MoveType, force: Force = 2): Move => ({ type, force: type === 'super' ? 3 : force, name: type, desc: '' })
/** Un set di mosse fisso per i test: una per tipo, forza normale. */
const KIT: Move[] = [mv('attacco'), mv('difesa'), mv('cura'), mv('super'), mv('disperata')]
const IDX: Record<MoveType, number> = { attacco: 0, difesa: 1, cura: 2, super: 3, disperata: 4 }
const testOpening = (): Opening => ({ ...offlineOpening(fighters(), ARENAS[0]), moves: [KIT, KIT] })

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
  s = reduce(s, { type: 'openingReady', opening: testOpening(), token: null })
  for (let guard = 0; !s.fight.end; guard++) {
    if (guard > MAX_ROUNDS) throw new Error('la rissa non finisce')
    for (let k = 0; k < 2; k++) {
      const who = nextChooser(s)!
      s = reduce(s, { type: 'choose', side: who, move: IDX[moves[who]] })
    }
    if (nextChooser(s) !== undefined) throw new Error('mossa rifiutata')
    const { round, next } = playRound(s.fight.fs, [IDX[moves[0]], IDX[moves[1]]], [mv(moves[0]), mv(moves[1])], texts(), NAMES, half)
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
    // I superpoteri curativi esistono davvero nel mazzo.
    for (const id of HEALING_POWER_IDS) expect(findCard(id)).toBeDefined()
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

  it('una carta trappola toglie forza alle mosse', () => {
    const clean = fighters()[0]
    const trapped: Fighter = { ...clean, monster: { ...clean.monster, personality: SABOTAGE_DECKS.personality[0] } }
    expect(forceBudget(clean)).toBe(FORCE_BUDGET)
    expect(forceBudget(trapped)).toBe(FORCE_BUDGET - 1)
    const sum = (ms: Move[]) => ms.slice(0, 3).reduce((s, m) => s + m.force, 0)
    expect(sum(fallbackMoves(trapped))).toBe(FORCE_BUDGET - 1)
    const fromAi = normalizeMoves(
      [
        { type: 'attacco', force: 2, name: 'x' },
        { type: 'difesa', force: 2, name: 'y' },
        { type: 'cura', force: 2, name: 'z' },
      ],
      trapped,
    )
    expect(sum(fromAi)).toBe(FORCE_BUDGET - 1)
  })

  it('un superpotere trappola funziona, ma male', () => {
    const clean = fighters()[0]
    const trapped: Fighter = { ...clean, monster: { ...clean.monster, power: SABOTAGE_DECKS.power[0] } }
    const weak = fallbackMoves(trapped)[3]
    expect(weak.weak).toBe(true)
    const hit = (m: Move) => roundEffects([m, mv('cura')], [1, 1], half).damage[1]
    expect(hit(weak)).toBeLessThan(hit(mv('super')))
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

describe('regole delle mosse', () => {
  const fx = (a: Move, b: Move, eff: [number, number] = [1, 1]) => roundEffects([a, b], eff, half)

  it('la difesa para quasi tutto e contrattacca', () => {
    const e = fx(mv('attacco'), mv('difesa'))
    expect(e.damage[1]).toBeLessThan(8)
    expect(e.damage[0]).toBeGreaterThan(0)
  })

  it('il superpotere sfonda la difesa più di un attacco', () => {
    expect(fx(mv('super'), mv('difesa')).damage[1]).toBeGreaterThan(fx(mv('attacco'), mv('difesa')).damage[1])
  })

  it('cura e danni restano separati: chi si cura sotto i colpi vede entrambe le cose', () => {
    const e = fx(mv('cura'), mv('attacco'))
    expect(e.heal[0]).toBeGreaterThan(0)
    expect(e.damage[0]).toBeGreaterThan(e.heal[0])
    const { round } = playRound(START, [2, 0], [mv('cura'), mv('attacco')], texts(), NAMES, half)
    expect(round.heal[0]).toBe(e.heal[0])
    expect(round.delta[0]).toBe(round.heal[0] - round.damage[0])
  })

  it('la forza conta: attacco forte > normale > debole, difesa forte para di più', () => {
    const hit = (f: Force) => fx(mv('attacco', f), mv('cura')).damage[1]
    expect(hit(3)).toBeGreaterThan(hit(2))
    expect(hit(2)).toBeGreaterThan(hit(1))
    expect(fx(mv('attacco'), mv('difesa', 3)).damage[1]).toBeLessThan(fx(mv('attacco'), mv('difesa', 1)).damage[1])
    expect(fx(mv('cura', 3), mv('difesa')).heal[0]).toBeGreaterThan(fx(mv('cura', 1), mv('difesa')).heal[0])
  })

  it('il superpotere curativo fa recuperare tanta vita e para, senza colpire', () => {
    const healer: Move = { ...mv('super'), effect: 'cura' }
    const e = fx(healer, mv('attacco'))
    expect(e.heal[0]).toBeGreaterThan(fx(mv('cura', 3), mv('difesa')).heal[0])
    expect(e.damage[0]).toBeLessThan(fx(mv('cura'), mv('attacco')).damage[0])
    expect(e.damage[1]).toBe(0)
    const { next } = playRound(START, [3, 0], [healer, mv('attacco')], texts(), NAMES, half)
    expect(blockedReason(next, 0, 'super')).toBeTruthy()
  })

  it('l’efficacia data dall’AI pesa sul risultato', () => {
    expect(fx(mv('attacco'), mv('attacco'), [1.5, 0.6]).damage[1]).toBeGreaterThan(fx(mv('attacco'), mv('attacco'), [0.6, 1.5]).damage[1])
  })

  it('superpotere una volta sola, cura non due round di fila', () => {
    const { next } = playRound(START, [3, 2], [mv('super'), mv('cura')], texts(), NAMES, half)
    expect(blockedReason(next, 0, 'super')).toBeTruthy()
    expect(blockedReason(next, 1, 'cura')).toBeTruthy()
    expect(blockedReason(next, 1, 'attacco')).toBeUndefined()
  })

  it('KO: il perdente va a zero e usa la sua frase finale', () => {
    const fs: FightState = { ...START, hp: [60, 10] }
    const { round } = playRound(fs, [0, 0], [mv('attacco'), mv('attacco')], texts(), NAMES, half)
    expect(round.end?.winner).toBe(0)
    expect(round.hp[1]).toBe(0)
    expect(round.end?.finale).toBe('B crolla')
  })

  it('i numeri mostrati sono quelli veri: niente danni oltre la vita rimasta, niente cure oltre il pieno', () => {
    const ko = playRound({ ...START, hp: [100, 9], round: 6 }, [3, 0], [mv('super'), mv('cura')], texts(), NAMES, half).round
    expect(ko.damage[1]).toBe(9 + ko.heal[1])
    expect(ko.hp[1]).toBe(0)
    const full = playRound({ ...START, hp: [95, 100] }, [2, 1], [mv('cura'), mv('difesa')], texts(), NAMES, half).round
    expect(full.heal[0]).toBe(5)
    expect(full.hp[0]).toBe(100)
    // A vita piena sotto i colpi la cura si vede comunque: compensa parte del danno.
    const hit = playRound(START, [2, 0], [mv('cura'), mv('attacco')], texts(), NAMES, half).round
    expect(hit.heal[0]).toBeGreaterThan(0)
    expect(hit.hp[0]).toBe(100 + hit.heal[0] - hit.damage[0])
  })

  it('se crollano entrambi vince chi è messo meno peggio', () => {
    const fs: FightState = { ...START, hp: [5, 12] }
    const { round } = playRound(fs, [3, 3], [mv('super'), mv('super')], texts(), NAMES, half)
    expect(round.end?.winner).toBe(1)
    expect(round.hp[0]).toBe(0)
    expect(round.hp[1]).toBeGreaterThan(0)
  })

  it('la rissa si scalda: più avanti i colpi fanno più male', () => {
    const early = playRound(START, [0, 0], [mv('attacco'), mv('attacco')], texts(), NAMES, half).round.damage[0]
    const late = playRound({ ...START, round: 6 }, [0, 0], [mv('attacco'), mv('attacco')], texts(), NAMES, half).round.damage[0]
    expect(late).toBeGreaterThan(early)
  })

  it('con mostri e mosse a caso quasi tutte le risse finiscono con un KO, in pochi round', () => {
    let seed = 12345
    const r = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    let ko = 0
    let rounds = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      // Mosse di riserva di mostri diversi: composizioni e forze diverse.
      const kits = [0, 1].map(() => fallbackMoves({ player: 'x', monster: monster(Math.floor(r() * 40)) }))
      let fs = START
      for (;;) {
        const pick = (side: 0 | 1) => {
          const ok = kits[side].map((m, k) => [m, k] as const).filter(([m]) => !blockedReason(fs, side, m.type))
          return ok[Math.floor(r() * ok.length)]
        }
        const [a, b] = [pick(0), pick(1)]
        const eff: [number, number] = [0.6 + r() * 0.9, 0.6 + r() * 0.9]
        const out = playRound(fs, [a[1], b[1]], [a[0], b[0]], texts(eff), NAMES, r)
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
    const { round } = playRound(fs, [1, 1], [mv('difesa'), mv('difesa')], texts(), NAMES, half)
    expect(round.end).toMatchObject({ winner: 0, byJury: true })
  })
})

describe('eventi dell’arena e timbri', () => {
  const fx = (a: Move, b: Move, rule?: EventRule) => roundEffects([a, b], [1, 1], half, 1, rule)

  it('due eventi a rissa, nei round giusti e con regole diverse', () => {
    for (let i = 0; i < 50; i++) {
      const [a, b] = scheduleEvents(Math.random)
      expect([2, 3]).toContain(a.round)
      expect([4, 5, 6]).toContain(b.round)
      expect(a.rule).not.toBe(b.rule)
    }
  })

  it('ogni evento cambia davvero le regole di quel round', () => {
    expect(fx(mv('attacco'), mv('difesa'), 'difese_fragili').damage[1]).toBeGreaterThan(fx(mv('attacco'), mv('difesa')).damage[1])
    expect(fx(mv('attacco'), mv('difesa'), 'difese_fragili').damage[0]).toBe(0)
    expect(fx(mv('cura'), mv('difesa'), 'cure_bloccate').heal[0]).toBe(0)
    expect(fx(mv('cura'), mv('difesa'), 'ristoro').heal[0]).toBe(2 * fx(mv('cura'), mv('difesa')).heal[0])
    expect(fx(mv('attacco'), mv('cura'), 'furia').damage[1]).toBeGreaterThan(fx(mv('attacco'), mv('cura')).damage[1])
    expect(fx(mv('attacco'), mv('cura'), 'boomerang').damage[0]).toBeGreaterThan(0)
    const used: FightState = { ...START, superUsed: [true, true] }
    expect(blockedReason(used, 0, 'super')).toBeTruthy()
    expect(blockedReason(used, 0, 'super', 'seconda_carica')).toBeUndefined()
  })

  it('il round ricorda l’evento, e il server lo applica', async () => {
    const { round } = playRound(START, [0, 0], [mv('attacco'), mv('attacco')], texts(), NAMES, half, 'furia')
    expect(round.event).toBe('furia')
  })

  it('timbri solo per le mosse fuori dal normale', () => {
    expect(stampOf(1.22)?.label).toBe('COLPO DA MAESTRO')
    expect(stampOf(1.12)).toMatchObject({ label: 'SUPER EFFICACE', good: true })
    expect(stampOf(1)).toBeNull()
    expect(stampOf(0.88)?.good).toBe(false)
    expect(stampOf(0.8)?.label).toBe('FIGURACCIA')
  })

  it('il narratore di riserva prepara anche gli eventi', () => {
    const o = offlineOpening(fighters(), ARENAS[4])
    expect(o.events).toHaveLength(2)
    expect(o.events.every((e) => e.text.length > 10)).toBe(true)
  })
})

describe('effetti secondari e rimonta', () => {
  const withFx = (type: MoveType, fx: Move['fx'], force: Force = 2): Move => ({ ...mv(type, force), fx })
  const play = (fs: FightState, a: Move, b: Move) => playRound(fs, [0, 0], [a, b], texts(), NAMES, half)

  it('brucia: se colpisce, l’avversario perde vita anche al round dopo', () => {
    const r1 = play(START, withFx('attacco', 'brucia'), mv('cura'))
    expect(r1.next.status[1].burn).toBeGreaterThan(0)
    const r2 = play(r1.next, mv('difesa'), mv('difesa'))
    expect(r2.round.damage[1]).toBe(r1.next.status[1].burn)
    expect(r2.round.notes[1].some((n) => n.startsWith('IN FIAMME'))).toBe(true)
  })

  it('stordisce: al round dopo l’avversario non può difendersi', () => {
    const { next } = play(START, withFx('attacco', 'stordisce'), mv('cura'))
    expect(blockedReason(next, 1, 'difesa')).toBeTruthy()
    // Anche una difesa che stordisce funziona, se l'altro attacca.
    const d = play(START, withFx('difesa', 'stordisce'), mv('attacco')).next
    expect(d.status[1].stunned).toBe(true)
  })

  it('carica: il colpo dopo fa il 50% in più, poi la carica si consuma', () => {
    const charged = play(START, withFx('cura', 'carica'), mv('difesa')).next
    expect(charged.status[0].charged).toBe(true)
    const base = play({ ...START, status: START.status }, mv('attacco'), mv('cura')).round.damage[1]
    const boosted = play({ ...charged, lastType: [null, null] }, mv('attacco'), mv('cura'))
    expect(boosted.round.damage[1]).toBeGreaterThan(base * 1.3)
    expect(boosted.next.status[0].charged).toBe(false)
  })

  it('ruba vita: chi colpisce recupera parte del danno', () => {
    const r = play({ ...START, hp: [50, 100] }, withFx('attacco', 'rubavita'), mv('cura')).round
    expect(r.heal[0]).toBeGreaterThan(0)
  })

  it('finta: sfonda la difesa senza contrattacco, ma contro un attacco fa poco', () => {
    const normale = play(START, mv('attacco'), mv('difesa')).round
    const finta = play(START, withFx('attacco', 'finta'), mv('difesa')).round
    expect(finta.damage[1]).toBeGreaterThan(normale.damage[1] * 3)
    expect(finta.damage[0]).toBe(0)
    expect(play(START, withFx('attacco', 'finta'), mv('attacco')).round.damage[1]).toBeLessThan(play(START, mv('attacco'), mv('attacco')).round.damage[1])
  })

  it('scudo: al round dopo si subisce meno', () => {
    const shielded = play(START, withFx('cura', 'scudo'), mv('difesa')).next
    const free = play({ ...START, lastType: [null, null] }, mv('cura'), mv('attacco')).round.damage[0]
    const prot = play({ ...shielded, lastType: [null, null] }, mv('cura'), mv('attacco')).round.damage[0]
    expect(prot).toBeLessThan(free)
  })

  it('difesa non due volte di fila, così dopo si resta scoperti', () => {
    const { next } = play(START, mv('difesa'), mv('cura'))
    expect(blockedReason(next, 0, 'difesa')).toBeTruthy()
  })

  it('mossa disperata: solo con la barra piena, solo se si è sotto, una volta, e sfonda la difesa', () => {
    expect(blockedReason(START, 0, 'disperata')).toMatch(/Rimonta/)
    const full: FightState = { ...START, hp: [30, 70], rage: [60, 10] }
    expect(blockedReason(full, 0, 'disperata')).toBeUndefined()
    expect(blockedReason({ ...full, hp: [80, 70] }, 0, 'disperata')).toBe('Solo se sei in svantaggio')
    const r = play(full, mv('disperata'), mv('difesa'))
    expect(r.round.damage[1]).toBeGreaterThan(25)
    expect(r.next.rage[0]).toBe(0)
    expect(blockedReason({ ...r.next, rage: [60, 0], hp: [10, 90] }, 0, 'disperata')).toBe('Già usata')
  })

  it('la barra della rimonta si riempie con i colpi presi', () => {
    const { next } = play(START, mv('attacco'), mv('attacco'))
    expect(next.rage[0]).toBeGreaterThan(0)
    expect(next.rage[0]).toBe(100 - next.hp[0])
  })
})

describe('mosse dinamiche', () => {
  it('le mosse di riserva cambiano da mostro a mostro ma rispettano le regole', () => {
    const kits = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const moves = fallbackMoves({ player: 'x', monster: monster(i) })
      kits.add(moves.map((m) => `${m.type}${m.force}`).join())
      expect(moves).toHaveLength(5)
      expect(moves[3].type).toBe('super')
      expect(moves[4].type).toBe('disperata')
      expect(moves.slice(0, 3).every((m) => m.fx)).toBe(true)
      expect(moves.some((m) => m.type === 'attacco')).toBe(true)
      expect(moves.slice(0, 3).reduce((s, m) => s + m.force, 0)).toBe(FORCE_BUDGET)
    }
    expect(kits.size).toBeGreaterThan(2)
  })

  it('accetta le scelte dell’AI: due attacchi e nessuna cura', () => {
    const moves = normalizeMoves(
      [
        { type: 'super', name: 'Potere', desc: 'p' },
        { type: 'attacco', force: 3, name: 'Botta', desc: 'b' },
        { type: 'attacco', force: 1, name: 'Buffetto', desc: 'f' },
        { type: 'difesa', force: 2, name: 'Muro', desc: 'm' },
      ],
      fighters()[0],
    )
    expect(moves.map((m) => `${m.type}${m.force}`)).toEqual(['attacco3', 'attacco1', 'difesa2', 'super3', 'disperata3'])
    expect(moves[3].name).toBe('Potere')
  })

  it('ripara le risposte sbagliate: niente attacchi, forze fuori budget, superpotere mancante', () => {
    const moves = normalizeMoves(
      [
        { type: 'cura', force: 3, name: 'A' },
        { type: 'difesa', force: 3, name: 'B' },
        { type: 'cura', force: 3, name: 'C' },
      ],
      fighters()[0],
    )
    expect(moves[0].type).toBe('attacco')
    expect(moves.slice(0, 3).every((m) => m.force === 2)).toBe(true)
    expect(moves[3]).toMatchObject({ type: 'super', name: fighters()[0].monster.power.name })
  })
})

describe('rissa e partita', () => {
  it('le mosse si scelgono a turno, chi apre si alterna a ogni round', () => {
    let s = draftRound(createMatch(['A', 'B'], 1, 9))
    s = reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: testOpening(), token: 't' })
    expect(nextChooser(s)).toBe(0)
    // Fuori turno non si può scegliere.
    expect(reduce(s, { type: 'choose', side: 1, move: 0 }).fight.choices).toEqual([null, null])
    s = reduce(s, { type: 'choose', side: 0, move: 0 })
    s = reduce(s, { type: 'choose', side: 1, move: 1 })
    expect(nextChooser(s)).toBeUndefined()
    const { round, next } = playRound(s.fight.fs, [0, 1], [mv('attacco'), mv('difesa')], texts(), NAMES, half)
    s = reduce(s, { type: 'roundReady', round, next, token: 't2' })
    expect(s.fight.token).toBe('t2')
    expect(s.fight.choices).toEqual([null, null])
    expect(nextChooser(s)).toBe(1)
  })

  it('non si sceglie una mossa bloccata', () => {
    let s = draftRound(createMatch(['A', 'B'], 1, 9))
    s = reduce(reduce(s, { type: 'fight' }), { type: 'openingReady', opening: testOpening(), token: null })
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
  it('il superpotere è sempre l’ultima mossa e non si perde se l’AI lo dimentica', () => {
    const o = normalizeOpening({ title: 'T', moves: [[{ name: 'Uno', type: 'attacco', force: 2 }], []] }, fighters(), 'ai')!
    expect(o.moves[0]).toHaveLength(5)
    expect(o.moves[0][0].name).toBe('Uno')
    expect(o.moves[1][3]).toMatchObject({ type: 'super', name: fighters()[1].monster.power.name })
  })

  it('l’efficacia dell’AI resta tra 0.8 e 1.25: le scelte contano più del voto', () => {
    const t = normalizeRoundTexts({ efficacy: [9, -3], actions: ['x', 'y'] })!
    expect(t.efficacy).toEqual([1.25, 0.8])
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
  const kit = (p: string) => [
    { type: 'attacco', force: 3, name: `a${p}` },
    { type: 'attacco', force: 1, name: `b${p}` },
    { type: 'difesa', force: 2, name: `d${p}` },
    { type: 'super', name: `s${p}` },
  ]
  const openingAnswer = { title: 'Titolo', nicknames: ['Primo', 'Secondo'], moves: [kit('0'), kit('1')] }

  it('rimette a posto tutte le coppie se ha invertito l’ordine', async () => {
    const f = fighters()
    const schedule = [
      { round: 2, rule: 'furia' as const },
      { round: 5, rule: 'ristoro' as const },
    ]
    const o = await generateOpening(f, ARENAS[0], true, schedule, {
      apiKey: 'k',
      fetch: groqAnswer({ ...openingAnswer, events: ['Il trenino travolge tutti'] }),
    })
    // L'AI vede Marco come combattente 0.
    expect(lastSent.messages[1].content.indexOf('Marco')).toBeLessThan(lastSent.messages[1].content.indexOf('Giulia'))
    expect(lastSent.messages[1].content).toContain('round 2: Furia')
    expect(o.nicknames).toEqual(['Secondo', 'Primo'])
    expect(o.moves[0][0].name).toBe('a1')
    // Eventi: calendario del server, scena dell'AI (o di riserva se manca).
    expect(o.events.map((e) => [e.round, e.rule])).toEqual([
      [2, 'furia'],
      [5, 'ristoro'],
    ])
    expect(o.events[0].text).toBe('Il trenino travolge tutti')
    expect(o.events[1].text).toBeTruthy()

    const t = await generateRound(f, ARENAS[0], true, o, START, [], [0, 3], o.events[0], {
      apiKey: 'k',
      fetch: groqAnswer({ efficacy: [1.2, 0.9], verdicts: ['per Marco', 'per Giulia'], actions: ['di Marco', 'di Giulia'], sfx: ['M', 'G'] }),
    })
    expect(t.efficacy).toEqual([0.9, 1.2])
    expect(t.verdicts).toEqual(['per Giulia', 'per Marco'])
    expect(t.actions).toEqual(['di Giulia', 'di Marco'])
    expect(lastSent.messages[1].content).toContain('EVENTO DELL\'ARENA IN QUESTO ROUND: Furia')
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
    const o = await generateOpening(fighters(), ARENAS[0], false, [], { apiKey: 'k', fetch: fakeFetch })
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
