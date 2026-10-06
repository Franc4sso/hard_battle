import { useEffect, useRef, useState } from 'react'
import { MAX_HP, type Battle, type Monster, type Side } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { requestBattle } from '../../game/api'
import { matchWinner, other } from '../../game/match'
import { Button, Footer, HpBar, MonsterCard, PLAYER_TEXT, anim } from '../components'
import type { ScreenProps } from './Draft'

export function VersusScreen({ state, dispatch }: ScreenProps) {
  const [m0, m1] = state.monsters as [Monster, Monster]
  useEffect(() => {
    play('versus')
    vibrate([30, 40, 60])
  }, [])
  return (
    <div className="screen">
      <div className="panel a-pop flex flex-col gap-1 bg-ink text-white" style={{ ...anim(0, -1), background: '#16141a', boxShadow: '5px 5px 0 #FF4B3E' }}>
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

function Waiting({ state, dispatch }: ScreenProps) {
  const [i, setI] = useState(0)
  useEffect(() => {
    let alive = true
    void requestBattle(state).then((battle) => {
      if (alive) dispatch({ type: 'battleReady', battle })
    })
    const t = setInterval(() => setI((x) => x + 1), 1700)
    return () => {
      alive = false
      clearInterval(t)
    }
    // Una sola richiesta per round: dipende solo dall'identità del round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seed, state.round])
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

function RoundView({ battle, index, monsters }: { battle: Battle; index: number; monsters: [Monster, Monster] }) {
  const r = battle.rounds[index]
  const last = index === battle.rounds.length - 1
  const atk = r.attacker
  const side = (s: Side) => (s === 0 ? 'bubble-l' : 'bubble-r')
  return (
    <div className="flex flex-col gap-3">
      {r.power || r.twist ? (
        <div className="a-rise flex flex-col gap-1.5 rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white" style={{ ...anim(0, atk ? 1 : -1), boxShadow: '5px 5px 0 #FF4B3E' }}>
          <span className="comic text-[22px] text-sun">
            {r.power ? `SUPERPOTERE · ${monsters[atk].power.name.toUpperCase()}` : 'COLPO DI SCENA!'}
          </span>
          <span className="text-[15px] leading-snug font-medium">{r.action}</span>
        </div>
      ) : (
        <div className={`bubble a-rise ${side(atk)}`} style={anim(0)}>
          {r.action}
        </div>
      )}
      <div className={`sfx a-slam ${atk === 0 ? 'self-start ml-4' : 'self-end mr-4'}`} style={anim(0.35, atk ? 6 : -6)}>
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

export function BattleScreen(props: ScreenProps) {
  const { state, dispatch } = props
  const battle = state.battle
  const [shown, setShown] = useState(-1)

  useEffect(() => {
    if (!battle || shown < 0) return
    const r = battle.rounds[shown]
    const last = shown === battle.rounds.length - 1
    play(last ? 'ko' : r.power ? 'power' : r.twist ? 'twist' : 'hit')
    vibrate(last ? [80, 50, 160] : r.power ? [40, 30, 90] : 50)
  }, [battle, shown])

  if (!battle) return <Waiting {...props} />

  const monsters = state.monsters as [Monster, Monster]
  const hp = shown < 0 ? [MAX_HP, MAX_HP] : battle.rounds[shown].hp
  const target = shown < 0 ? -1 : other(battle.rounds[shown].attacker)
  const last = shown === battle.rounds.length - 1

  return (
    <div className="screen">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {([0, 1] as Side[]).map((s) => (
          <div key={s} style={{ order: s === 0 ? 0 : 2 }}>
            <FighterHp name={state.players[s].name} monster={monsters[s]} hp={hp[s]} side={s} hitKey={target === s ? shown : null} />
          </div>
        ))}
        <div className="title-comic order-1 text-[36px] text-red" style={{ rotate: '-8deg', textShadow: '3px 3px 0 #16141a' }}>
          VS
        </div>
      </div>

      <div className="comic self-center rounded-full bg-ink px-5 py-1 text-[22px] text-sun">
        {shown < 0 ? 'PRESENTAZIONE' : `ROUND ${shown + 1} DI ${battle.rounds.length}`}
      </div>

      <div key={shown} className="flex flex-1 flex-col gap-3">
        {shown < 0 ? (
          <>
            <h1 className="title-comic a-slam text-center text-[42px]" style={anim(0, -2)}>
              {battle.title.toUpperCase()}
            </h1>
            {battle.intro && (
              <div className="bubble a-rise rounded-[18px]" style={anim(0.3)}>
                {battle.intro}
              </div>
            )}
            {battle.source === 'offline' && (
              <p className="a-rise text-center text-[13px] font-bold" style={anim(0.5)}>
                AI non raggiungibile: stasera racconta il narratore di riserva.
              </p>
            )}
          </>
        ) : (
          <RoundView battle={battle} index={shown} monsters={monsters} />
        )}
      </div>

      <Footer>
        <Button
          variant="red"
          onClick={() => {
            if (last) dispatch({ type: 'verdict' })
            else {
              if (shown < 0) play('bell')
              setShown(shown + 1)
            }
          }}
        >
          {shown < 0 ? 'DING DING! SI COMINCIA' : last ? 'VERDETTO!' : 'PROSSIMO ROUND'}
        </Button>
      </Footer>
    </div>
  )
}

export function VerdictScreen({ state, dispatch }: ScreenProps) {
  const battle = state.battle as Battle
  const w = battle.winner
  const monsters = state.monsters as [Monster, Monster]
  const over = matchWinner(state) !== undefined
  useEffect(() => {
    play('win')
    vibrate([60, 40, 60, 40, 120])
  }, [])
  return (
    <div className="screen">
      <div className="mt-2 flex flex-col items-center gap-1 text-center">
        <span className="pill a-pop">{monsters[w].character.name.toUpperCase()}</span>
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
              Vince <b style={{ color: PLAYER_TEXT[h.winner] }}>{state.players[h.winner].name}</b> con {h.monsters[h.winner].character.name}
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
