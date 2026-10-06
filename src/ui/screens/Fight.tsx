import { useEffect, useRef, useState } from 'react'
import { MAX_HP, TACTICS, clashWinner, hpAfter, tacticOf, type Monster, type Side, type TacticId } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { requestBattle, requestOpening } from '../../game/api'
import { matchWinner, nextTactician, other, type MatchState } from '../../game/match'
import { Button, Footer, HpBar, MonsterCard, PLAYER_COLORS, PLAYER_TEXT, anim } from '../components'
import type { ScreenProps } from './Draft'

/** Chiede la prima parte della rissa (una sola volta per round) e la mette nello stato. */
function useOpening({ state, dispatch }: ScreenProps) {
  const ready = state.fight.opening !== null
  useEffect(() => {
    if (ready) return
    let alive = true
    void requestOpening(state).then(({ opening, token }) => {
      if (alive) dispatch({ type: 'openingReady', opening, token })
    })
    return () => {
      alive = false
    }
    // Dipende solo dall'identità del round: la richiesta è deduplicata in api.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seed, state.round, ready])
}

export function VersusScreen(props: ScreenProps) {
  const { state, dispatch } = props
  const [m0, m1] = state.monsters as [Monster, Monster]
  // La rissa si prepara mentre i giocatori si guardano i mostri.
  useOpening(props)
  useEffect(() => {
    play('versus')
    vibrate([30, 40, 60])
  }, [])
  return (
    <div className="screen">
      <div className="panel a-pop flex flex-col gap-1 text-white" style={{ ...anim(0, -1), background: '#16141a', boxShadow: '5px 5px 0 #FF4B3E' }}>
        <span className="comic text-xl text-sun">L’ARENA</span>
        <b className="text-xl leading-tight font-extrabold">{state.arena.name}</b>
        <span className="text-sm leading-snug font-medium">{state.arena.desc}</span>
      </div>
      <MonsterCard monster={m0} player={state.players[0].name} side={0} className="a-slide-l" style={{ ...anim(0.25), rotate: '-1.5deg' }} />
      <div className="title-comic a-slam -my-3 text-center text-[64px] text-red" style={anim(0.7, -8)}>
        VS
      </div>
      <MonsterCard monster={m1} player={state.players[1].name} side={1} className="a-slide-r" style={{ ...anim(0.45), rotate: '1.5deg' }} />
      <Footer>
        <Button
          variant="red"
          onClick={() => {
            play('bell')
            dispatch({ type: 'fight' })
          }}
        >
          COMBATTETE!
        </Button>
      </Footer>
    </div>
  )
}

const WAITING = [
  'L’arbitro si allaccia le scarpe…',
  'Il pubblico prende posto…',
  'Qualcuno ha portato i popcorn…',
  'Si consulta il regolamento (non esiste)…',
  'Riscaldamento muscolare in corso…',
  'Il telecronista si schiarisce la voce…',
]

function Waiting() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 1700)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="screen items-center justify-center gap-8 text-center">
      <div className="title-comic a-wiggle text-[120px] text-red">VS</div>
      <p key={i} className="panel a-pop text-lg font-extrabold" style={anim(0, i % 2 ? 1.5 : -1.5)}>
        {WAITING[i % WAITING.length]}
      </p>
    </div>
  )
}

const SHAKE: Keyframe[] = [
  { transform: 'translate(0,0)' },
  { transform: 'translate(-7px,2px)' },
  { transform: 'translate(6px,-3px)' },
  { transform: 'translate(-4px,3px)' },
  { transform: 'translate(3px,-1px)' },
  { transform: 'translate(0,0)' },
]

function FighterHp({ name, monster, hp, side, hitKey }: { name: string; monster: Monster; hp: number; side: Side; hitKey: number | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Shake con Web Animations: niente remount, così la barra della vita scorre.
    if (hitKey !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      ref.current?.animate(SHAKE, { duration: 380, delay: 320, iterations: 2 })
  }, [hitKey])
  return (
    <div ref={ref} className="panel flex min-w-0 flex-col gap-1.5 px-2.5 py-2" style={{ boxShadow: '3px 3px 0 #16141a' }}>
      <span className="label truncate text-[11px]" style={{ color: PLAYER_TEXT[side] }}>
        {name}
      </span>
      <b className="text-sm leading-tight font-extrabold">{monster.character.name}</b>
      <HpBar hp={hp} />
      <span className="text-[11px] font-bold tabular-nums">
        {hp} / {MAX_HP}
      </span>
    </div>
  )
}

function Scoreboard({ state, hp, hitKey, target }: { state: MatchState; hp: [number, number]; hitKey: number; target: number }) {
  const monsters = state.monsters as [Monster, Monster]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {([0, 1] as Side[]).map((s) => (
        <div key={s} style={{ order: s === 0 ? 0 : 2 }}>
          <FighterHp name={state.players[s].name} monster={monsters[s]} hp={hp[s]} side={s} hitKey={target === s ? hitKey : null} />
        </div>
      ))}
      <div className="title-comic order-1 text-[36px] text-red" style={{ rotate: '-8deg', textShadow: '3px 3px 0 #16141a' }}>
        VS
      </div>
    </div>
  )
}

function RoundView({ state, index }: { state: MatchState; index: number }) {
  const rounds = state.fight.battle?.rounds ?? state.fight.opening!.rounds
  const monsters = state.monsters as [Monster, Monster]
  const r = rounds[index]
  const last = !!state.fight.battle && index === rounds.length - 1
  const atk = r.attacker
  const side = (s: Side) => (s === 0 ? 'bubble-l' : 'bubble-r')
  return (
    <div className="flex flex-col gap-3">
      {r.power || r.twist ? (
        <div className="a-rise flex flex-col gap-1.5 rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white" style={{ ...anim(0, atk ? 1 : -1), boxShadow: '5px 5px 0 #FF4B3E' }}>
          <span className="comic text-[22px] text-sun">{r.power ? `SUPERPOTERE · ${monsters[atk].power.name.toUpperCase()}` : 'COLPO DI SCENA!'}</span>
          <span className="text-[15px] leading-snug font-medium">{r.action}</span>
        </div>
      ) : (
        <div className={`bubble a-rise ${side(atk)}`} style={anim(0)}>
          {r.action}
        </div>
      )}
      <div className={`sfx a-slam ${atk === 0 ? 'ml-4 self-start' : 'mr-4 self-end'}`} style={anim(0.35, atk ? 6 : -6)}>
        {last ? 'K.O.!' : r.sfx}
        {r.damage > 0 && <span className="ml-2 text-[28px]">−{r.damage}</span>}
      </div>
      {r.reaction && (
        <div className={`bubble a-rise ${side(other(atk))}`} style={anim(0.65)}>
          {r.reaction}
        </div>
      )}
    </div>
  )
}

const TACTIC_STYLE: Record<TacticId, { letter: string; bg: string }> = {
  attacco: { letter: 'A', bg: '#FF4B3E' },
  difesa: { letter: 'D', bg: '#7CE0FF' },
  trucco: { letter: 'T', bg: '#FF7AC2' },
}

/** Ognuno sceglie la tattica di nascosto, passandosi il telefono. */
function TacticPicker({ state, dispatch }: ScreenProps) {
  const who = nextTactician(state)
  const [covered, setCovered] = useState(true)
  const [selected, setSelected] = useState<TacticId | null>(null)
  if (who === undefined) return null
  const me = state.players[who].name
  const them = state.players[other(who)].name

  if (covered)
    return (
      <div key={`cover-${who}`} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="comic a-pop rounded-full bg-ink px-5 py-1 text-[22px] text-sun">MOMENTO DECISIVO</span>
        <span className="label">Passa il telefono a</span>
        <h2 className="title-comic a-slam text-[64px] break-all" style={{ ...anim(0.1, -3), color: PLAYER_COLORS[who] }}>
          {me.toUpperCase()}
        </h2>
        <p className="panel a-rise max-w-[320px] text-[15px] leading-snug font-medium" style={anim(0.25, 1)}>
          Scegli di nascosto la tattica per il resto della rissa. <b>{them}</b>, non guardare!
        </p>
        <div className="mt-auto w-full">
          <Button
            onClick={() => {
              play('pass')
              setCovered(false)
            }}
          >
            SONO {me.toUpperCase()}
          </Button>
        </div>
      </div>
    )

  return (
    <div className="flex flex-1 flex-col gap-3.5">
      <h2 className="title-comic a-slam text-[44px]" style={anim(0, -2)}>
        LA TUA TATTICA,
        <br />
        <span style={{ color: PLAYER_COLORS[who] }}>{me.toUpperCase()}</span>
      </h2>
      <p className="text-[13px] leading-snug font-bold">Attacco batte Trucco · Trucco batte Difesa · Difesa batte Attacco</p>
      {TACTICS.map((t, i) => (
        <div key={t.id} className="a-rise" style={anim(0.08 + i * 0.07)}>
          <button
            type="button"
            className="choice"
            aria-pressed={selected === t.id}
            style={{ transform: `rotate(${[-1.2, 0.8, -0.4][i]}deg) scale(${selected === t.id ? 1.03 : 1})` }}
            onClick={() => {
              play('select')
              vibrate(10)
              setSelected(t.id)
            }}
          >
            <span className="letter" style={{ background: TACTIC_STYLE[t.id].bg }}>
              {TACTIC_STYLE[t.id].letter}
            </span>
            <span className="flex flex-col gap-0.5">
              <b className="text-lg leading-tight font-extrabold">{t.name}</b>
              <span className="text-[13px] leading-snug font-medium">
                {t.desc} Batte {tacticOf(t.beats).name.toLowerCase()}.
              </span>
            </span>
          </button>
        </div>
      ))}
      <div className="mt-auto">
        <Button
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            play('pick')
            vibrate(25)
            dispatch({ type: 'tactic', side: who, tactic: selected })
            setSelected(null)
            setCovered(true)
          }}
        >
          DECISO. NASCONDI!
        </Button>
      </div>
    </div>
  )
}

const MIN_REVEAL_MS = 2600

/** Svela le tattiche; intanto il server scrive il finale. */
function ClashReveal({ state, dispatch, onGo }: ScreenProps & { onGo(): void }) {
  const tactics = state.fight.tactics as [TacticId, TacticId]
  const battle = state.fight.battle
  const [waited, setWaited] = useState(false)
  const tw = clashWinner(tactics)

  useEffect(() => {
    play('versus')
    vibrate([40, 60, 40])
    const t = setTimeout(() => setWaited(true), MIN_REVEAL_MS)
    if (state.fight.battle) return () => clearTimeout(t)
    let alive = true
    void requestBattle(state, tactics).then((b) => {
      if (alive) dispatch({ type: 'battleReady', battle: b })
    })
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ready = waited && battle
  return (
    <div className="flex flex-1 flex-col gap-3">
      <span className="comic self-center rounded-full bg-ink px-5 py-1 text-[22px] text-sun">TATTICHE SVELATE</span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {([0, 1] as Side[]).map((s) => {
          const t = tacticOf(tactics[s])
          const win = tw === s
          return (
            <div
              key={s}
              className={`panel a-slam flex flex-col items-center gap-1 text-center ${s === 0 ? '' : 'order-2'}`}
              style={{ ...anim(0.2 + s * 0.35, s ? 3 : -3), background: win ? '#FFE14D' : '#fff' }}
            >
              <span className="label" style={{ color: PLAYER_TEXT[s] }}>
                {state.players[s].name}
              </span>
              <span className="letter h-12 w-12 text-2xl" style={{ background: TACTIC_STYLE[t.id].bg }}>
                {TACTIC_STYLE[t.id].letter}
              </span>
              <b className="text-[15px] leading-tight font-extrabold">{t.name}</b>
            </div>
          )
        })}
        <div className="title-comic order-1 text-[30px] text-red">VS</div>
      </div>
      <div className="title-comic a-pop text-center text-[40px]" style={anim(0.9, -2)}>
        {tw === undefined ? 'SCONTRO ALLA PARI!' : `${tacticOf(tactics[tw]).name.toUpperCase()} VINCE!`}
      </div>
      {ready && battle.clash ? (
        <div className="bubble a-rise rounded-[18px]" style={anim(0)}>
          {battle.clash}
        </div>
      ) : (
        <p className="a-wiggle self-center text-center text-[15px] font-extrabold">Il telecronista prende appunti…</p>
      )}
      <div className="mt-auto">
        <Button variant="red" disabled={!ready} onClick={onGo}>
          {ready ? 'SI RIPRENDE!' : '…'}
        </Button>
      </div>
    </div>
  )
}

export function BattleScreen(props: ScreenProps) {
  const { state, dispatch } = props
  const { opening, battle } = state.fight
  const [shown, setShown] = useState(-1)
  const [chosenMode, setMode] = useState<'play' | 'tactics' | 'clash'>('play')
  // Appena l'ultima tattica è scelta si passa allo svelamento nello stesso render:
  // il TacticPicker non deve mai vedersi senza nessuno a cui chiedere.
  const mode = chosenMode === 'tactics' && nextTactician(state) === undefined ? 'clash' : chosenMode
  useOpening(props)

  const rounds = battle?.rounds ?? opening?.rounds ?? []
  useEffect(() => {
    if (mode !== 'play' || shown < 0 || !rounds[shown]) return
    const r = rounds[shown]
    const last = !!battle && shown === rounds.length - 1
    play(last ? 'ko' : r.power ? 'power' : r.twist ? 'twist' : 'hit')
    vibrate(last ? [80, 50, 160] : r.power ? [40, 30, 90] : 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mode])

  if (!opening) return <Waiting />

  const tacticAt = opening.rounds.length
  const hp: [number, number] = mode !== 'play' ? hpAfter(opening) : shown < 0 ? [MAX_HP, MAX_HP] : rounds[shown].hp
  const target = mode === 'play' && shown >= 0 ? other(rounds[shown].attacker) : -1
  const last = !!battle && shown === rounds.length - 1

  const next = () => {
    if (last) dispatch({ type: 'verdict' })
    else if (shown === tacticAt - 1) setMode(nextTactician(state) === undefined ? 'clash' : 'tactics')
    else {
      if (shown < 0) play('bell')
      setShown(shown + 1)
    }
  }

  return (
    <div className="screen">
      <Scoreboard state={state} hp={hp} hitKey={shown} target={target} />
      {mode === 'tactics' && <TacticPicker {...props} />}
      {mode === 'clash' && (
        <ClashReveal
          {...props}
          onGo={() => {
            play('bell')
            setMode('play')
            setShown(tacticAt)
          }}
        />
      )}
      {mode === 'play' && (
        <>
          <div className="comic self-center rounded-full bg-ink px-5 py-1 text-[22px] text-sun">
            {/* Mai "DI N": quanti round restano non si sa, il KO arriva a sorpresa. */}
            {shown < 0 ? 'PRESENTAZIONE' : `ROUND ${shown + 1}`}
          </div>
          <div key={shown} className="flex flex-1 flex-col gap-3">
            {shown < 0 ? (
              <>
                <h1 className="title-comic a-slam text-center text-[42px]" style={anim(0, -2)}>
                  {opening.title.toUpperCase()}
                </h1>
                {opening.intro && (
                  <div className="bubble a-rise rounded-[18px]" style={anim(0.3)}>
                    {opening.intro}
                  </div>
                )}
                {opening.source === 'offline' && (
                  <p className="a-rise text-center text-[13px] font-bold" style={anim(0.5)}>
                    AI non raggiungibile: stasera racconta il narratore di riserva.
                  </p>
                )}
              </>
            ) : (
              <RoundView state={state} index={shown} />
            )}
          </div>
          <Footer>
            <Button variant="red" onClick={next}>
              {shown < 0 ? 'DING DING! SI COMINCIA' : last ? 'VERDETTO!' : shown === tacticAt - 1 ? 'MOMENTO DECISIVO!' : 'PROSSIMO ROUND'}
            </Button>
          </Footer>
        </>
      )}
    </div>
  )
}

export function VerdictScreen({ state, dispatch }: ScreenProps) {
  const battle = state.fight.battle!
  const w = battle.winner
  const over = matchWinner(state) !== undefined
  useEffect(() => {
    play('win')
    vibrate([60, 40, 60, 40, 120])
  }, [])
  return (
    <div className="screen">
      <div className="mt-2 flex flex-col items-center gap-1 text-center">
        <span className="pill a-pop">{battle.nicknames[w].toUpperCase()}</span>
        <h1 className="title-comic a-slam text-[68px]" style={anim(0.15, -3)}>
          VINCE
          <br />
          {state.players[w].name.toUpperCase()}!
        </h1>
      </div>
      {battle.finale && (
        <div className="bubble a-rise rounded-[18px]" style={anim(0.4, 1)}>
          {battle.finale}
        </div>
      )}
      {(battle.reason || battle.mvp) && (
        <div className="a-rise flex flex-col gap-2 rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white" style={{ ...anim(0.55, -1), boxShadow: '5px 5px 0 #FF4B3E' }}>
          {battle.reason && <span className="text-[15px] leading-snug font-medium">{battle.reason}</span>}
          {battle.mvp && (
            <span className="comic text-xl text-sun">
              MOSSA MVP: <span className="text-white">{battle.mvp}</span>
            </span>
          )}
        </div>
      )}
      <div className="a-rise flex items-center justify-center gap-3" style={anim(0.7)}>
        {([0, 1] as Side[]).map((s) => (
          <span key={s} className="pill text-base" style={{ background: s === w ? '#FFE14D' : '#fff' }}>
            {state.players[s].name} <span className="comic text-2xl">{state.players[s].wins}</span>
          </span>
        ))}
      </div>
      <p className="a-rise text-center text-[13px] font-bold" style={anim(0.8)}>
        Entrambi i mostri sono finiti nel bestiario.
      </p>
      <Footer>
        <Button onClick={() => dispatch({ type: 'nextRound' })}>{over ? 'CHI HA VINTO LA SFIDA?' : 'PROSSIMO ROUND'}</Button>
      </Footer>
    </div>
  )
}

export function FinalScreen({ state, onRematch, onNewPlayers, onExit }: ScreenProps & { onRematch(): void; onNewPlayers(): void; onExit(): void }) {
  const champ = matchWinner(state) ?? 0
  useEffect(() => {
    play('win')
  }, [])
  return (
    <div className="screen">
      <div className="mt-2 flex flex-col items-center gap-1 text-center">
        <span className="pill a-pop">CAMPIONE ASSOLUTO DELLA RISSA</span>
        <h1 className="title-comic a-slam text-[76px] break-all" style={anim(0.15, -3)}>
          {state.players[champ].name.toUpperCase()}
        </h1>
        <span className="title-comic a-pop text-[44px] text-sun" style={anim(0.4)}>
          {state.players[champ].wins} – {state.players[other(champ)].wins}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {state.history.map((h, i) => (
          <li key={h.round} className="panel a-rise flex flex-col gap-0.5 px-3.5 py-2.5" style={anim(0.5 + i * 0.08, i % 2 ? 0.8 : -0.8)}>
            <span className="label text-mute">Round {h.round}</span>
            <b className="leading-tight font-extrabold">{h.title}</b>
            <span className="text-[13px] font-medium">
              Vince <b style={{ color: PLAYER_TEXT[h.winner] }}>{state.players[h.winner].name}</b> con {h.nicknames[h.winner] || h.monsters[h.winner].character.name}
              {h.mvp ? ` · ${h.mvp}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <Footer>
        <Button onClick={onRematch}>RIVINCITA!</Button>
        <Button variant="white" onClick={onNewPlayers}>
          NUOVI SFIDANTI
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Torna alla home
        </Button>
      </Footer>
    </div>
  )
}
