import { useEffect, useRef, useState } from 'react'
import { MAX_HP, MAX_ROUNDS, MOVE_INFO, blockedReason, heatOf, mvpOf, type Monster, type MoveType, type Opening, type RoundResult, type Side } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { requestOpening, requestRound } from '../../game/api'
import { matchWinner, nextChooser, other, type MatchState } from '../../game/match'
import { Button, Footer, HpBar, MonsterCard, PLAYER_COLORS, PLAYER_TEXT, anim } from '../components'
import type { ScreenProps } from './Draft'

/** Chiede presentazione e mosse (una sola volta per round) e le mette nello stato. */
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
  // Le mosse si preparano mentre i giocatori si guardano i mostri.
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

// ---------- tabellone ----------

const SHAKE: Keyframe[] = [
  { transform: 'translate(0,0)' },
  { transform: 'translate(-7px,2px)' },
  { transform: 'translate(6px,-3px)' },
  { transform: 'translate(-4px,3px)' },
  { transform: 'translate(3px,-1px)' },
  { transform: 'translate(0,0)' },
]

function FighterHp({ name, nickname, hp, side, hitKey }: { name: string; nickname: string; hp: number; side: Side; hitKey: number | null }) {
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
      <b className="text-sm leading-tight font-extrabold">{nickname}</b>
      <HpBar hp={hp} />
      <span className="text-[11px] font-bold tabular-nums">
        {hp} / {MAX_HP}
      </span>
    </div>
  )
}

function Scoreboard({ state, hp, hit }: { state: MatchState; hp: [number, number]; hit: { key: number; sides: Side[] } }) {
  const nick = state.fight.opening?.nicknames ?? ['', '']
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {([0, 1] as Side[]).map((s) => (
        <div key={s} style={{ order: s === 0 ? 0 : 2 }}>
          <FighterHp name={state.players[s].name} nickname={nick[s]} hp={hp[s]} side={s} hitKey={hit.sides.includes(s) ? hit.key : null} />
        </div>
      ))}
      <div className="title-comic order-1 text-[36px] text-red" style={{ rotate: '-8deg', textShadow: '3px 3px 0 #16141a' }}>
        VS
      </div>
    </div>
  )
}

// ---------- mosse ----------

export const MOVE_STYLE: Record<MoveType, { bg: string; fg: string }> = {
  attacco: { bg: '#FF4B3E', fg: '#fff' },
  difesa: { bg: '#7CE0FF', fg: '#16141a' },
  cura: { bg: '#8CF0A8', fg: '#16141a' },
  super: { bg: '#16141a', fg: '#FFE14D' },
}

function TypeTag({ type }: { type: MoveType }) {
  return (
    <span className="inline-block rounded-md border-2 border-ink px-1.5 text-[11px] font-extrabold tracking-wide uppercase" style={{ background: MOVE_STYLE[type].bg, color: MOVE_STYLE[type].fg }}>
      {MOVE_INFO[type].label}
    </span>
  )
}

/** Dal round 4 i colpi fanno più male: lo si vede subito. */
function HeatBadge({ roundNo }: { roundNo: number }) {
  const heat = heatOf(roundNo)
  if (heat === 1) return null
  return (
    <span className="pill a-pop" style={{ background: heat > 1.5 ? '#FF4B3E' : '#FFB020', color: heat > 1.5 ? '#fff' : '#16141a' }}>
      LA RISSA SI SCALDA · COLPI ×{String(heat).replace('.', ',')}
    </span>
  )
}

function RulesStrip() {
  return (
    <ul className="panel flex flex-col gap-1 px-3 py-2.5 text-[12px] leading-snug font-medium">
      {(Object.keys(MOVE_INFO) as MoveType[]).map((t) => (
        <li key={t} className="flex items-start gap-2">
          <TypeTag type={t} />
          <span>{MOVE_INFO[t].rule}</span>
        </li>
      ))}
    </ul>
  )
}

/** Ognuno sceglie la mossa di nascosto, passandosi il telefono. */
function MovePicker({ state, dispatch }: ScreenProps) {
  const who = nextChooser(state)
  const [covered, setCovered] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  if (who === undefined) return null
  const opening = state.fight.opening as Opening
  const fs = state.fight.fs
  const me = state.players[who].name
  const them = state.players[other(who)].name
  const foeLast = state.fight.rounds.at(-1)
  const roundNo = state.fight.rounds.length + 1

  if (covered)
    return (
      <div key={`cover-${who}-${roundNo}`} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="comic a-pop rounded-full bg-ink px-5 py-1 text-[22px] text-sun">ROUND {roundNo}</span>
        <HeatBadge roundNo={roundNo} />
        <span className="label">Passa il telefono a</span>
        <h2 className="title-comic a-slam text-[64px] break-all" style={{ ...anim(0.1, -3), color: PLAYER_COLORS[who] }}>
          {me.toUpperCase()}
        </h2>
        <p className="panel a-rise max-w-[320px] text-[15px] leading-snug font-medium" style={anim(0.25, 1)}>
          Scegli la tua mossa di nascosto. <b>{them}</b>, non guardare!
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
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="title-comic a-slam text-[40px]" style={anim(0, -2)}>
        LA TUA MOSSA,
        <br />
        <span style={{ color: PLAYER_COLORS[who] }}>{me.toUpperCase()}</span>
      </h2>
      {foeLast && (
        <p className="text-[13px] font-bold">
          Nel round precedente {them} ha usato: {opening.moves[other(who)][foeLast.choices[other(who)]].name}
        </p>
      )}
      {opening.moves[who].map((m, i) => {
        const blocked = blockedReason(fs, who, m.type)
        const on = selected === i
        return (
          <div key={m.type} className="a-rise" style={anim(0.06 + i * 0.06)}>
            <button
              type="button"
              className="choice items-start"
              aria-pressed={on}
              disabled={!!blocked}
              style={{ transform: `rotate(${[-1, 0.7, -0.5, 0.9][i]}deg) scale(${on ? 1.03 : 1})`, opacity: blocked ? 0.5 : 1 }}
              onClick={() => {
                play('select')
                vibrate(10)
                setSelected(i)
              }}
            >
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <TypeTag type={m.type} />
                  {blocked && <span className="text-[11px] font-extrabold">{blocked}</span>}
                </span>
                <b className="text-[17px] leading-tight font-extrabold">{m.name}</b>
                <span className="text-[13px] leading-snug font-medium">{m.desc}</span>
              </span>
            </button>
          </div>
        )
      })}
      <div className="mt-auto pt-1">
        <Button
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return
            play('pick')
            vibrate(25)
            dispatch({ type: 'choose', side: who, move: selected })
            setSelected(null)
            setCovered(true)
          }}
        >
          FATTO. NASCONDI!
        </Button>
      </div>
    </div>
  )
}

const MIN_REVEAL_MS = 1600

/** Svela le due mosse; intanto il server giudica il round. */
function Clash({ state, dispatch }: ScreenProps) {
  const opening = state.fight.opening as Opening
  const choices = state.fight.choices as [number, number]
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    play('versus')
    vibrate([40, 60, 40])
    // Il round si mostra quando sono passati almeno MIN_REVEAL_MS E il server ha risposto.
    let alive = true
    let timeUp = false
    let result: Awaited<ReturnType<typeof requestRound>> | null = null
    const finish = () => {
      if (alive && timeUp && result) dispatch({ type: 'roundReady', ...result })
    }
    const t = setTimeout(() => {
      timeUp = true
      setWaited(true)
      finish()
    }, MIN_REVEAL_MS)
    void requestRound(state).then((r) => {
      result = r
      finish()
    })
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4">
      <span className="comic self-center rounded-full bg-ink px-5 py-1 text-[22px] text-sun">MOSSE SVELATE</span>
      {([0, 1] as Side[]).map((s) => {
        const m = opening.moves[s][choices[s]]
        return (
          <div key={s} className={`panel a-slam flex flex-col gap-1 ${s === 0 ? 'mr-6' : 'ml-6'}`} style={anim(0.15 + s * 0.35, s ? 2 : -2)}>
            <span className="flex items-center gap-2">
              <span className="label" style={{ color: PLAYER_TEXT[s] }}>
                {state.players[s].name}
              </span>
              <TypeTag type={m.type} />
            </span>
            <b className="comic text-[26px] leading-none">{m.name}</b>
          </div>
        )
      })}
      <p className="a-wiggle mt-2 self-center text-center text-[15px] font-extrabold">{waited ? 'Il giudice sta decidendo…' : 'SCONTRO!'}</p>
    </div>
  )
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="ml-2 text-[24px]">±0</span>
  return <span className={`ml-2 text-[28px] ${value > 0 ? 'text-lime' : ''}`}>{value > 0 ? `+${value}` : `−${-value}`}</span>
}

function RoundView({ state, round, index }: { state: MatchState; round: RoundResult; index: number }) {
  const opening = state.fight.opening as Opening
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="comic rounded-full bg-ink px-5 py-1 text-[22px] text-sun">ROUND {index + 1}</span>
        <HeatBadge roundNo={index + 1} />
      </div>
      {([0, 1] as Side[]).map((s) => {
        const m = opening.moves[s][round.choices[s]]
        const big = m.type === 'super'
        return (
          <div key={s} className="flex flex-col gap-2">
            <div
              className={`a-rise flex flex-col gap-1.5 ${big ? 'rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white' : `bubble ${s === 0 ? 'bubble-l' : 'bubble-r'}`}`}
              style={{ ...anim(s * 0.7, big ? (s ? 1 : -1) : undefined), ...(big ? { boxShadow: '5px 5px 0 #FF4B3E' } : {}) }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <TypeTag type={m.type} />
                <b className={`text-[13px] font-extrabold ${big ? 'text-sun' : ''}`}>{m.name}</b>
              </span>
              <span className="text-[15px] leading-snug font-medium">{round.actions[s]}</span>
            </div>
            <div className={`sfx a-slam ${s === 0 ? 'ml-4 self-start' : 'mr-4 self-end'}`} style={anim(0.35 + s * 0.7, s ? 6 : -6)}>
              {round.sfx[s]}
            </div>
          </div>
        )
      })}
      <div className="a-pop flex justify-center gap-3" style={anim(1.4)}>
        {([0, 1] as Side[]).map((s) => (
          <span key={s} className="pill comic text-xl" style={{ background: round.delta[s] > 0 ? '#8CF0A8' : round.delta[s] < 0 ? '#fff' : '#eee' }}>
            <span style={{ color: PLAYER_TEXT[s] }}>{state.players[s].name}</span>
            <Delta value={round.delta[s]} />
          </span>
        ))}
      </div>
      {round.end && (
        <div className="title-comic a-slam mt-1 text-center text-[64px] text-red" style={anim(1.7, -6)}>
          {round.end.byJury ? 'GIURIA!' : 'K.O.!'}
        </div>
      )}
    </div>
  )
}

export function BattleScreen(props: ScreenProps) {
  const { state, dispatch } = props
  const { opening, rounds, end } = state.fight
  // -1 = presentazione; altrimenti il round che si sta guardando (null = si scelgono le mosse).
  const [viewing, setViewing] = useState<number | null>(rounds.length ? rounds.length - 1 : -1)
  useOpening(props)

  // Appena arriva un round nuovo si mostra.
  const count = rounds.length
  useEffect(() => {
    if (count === 0) return
    setViewing(count - 1)
    const r = rounds[count - 1]
    const strongest = r.types.includes('super') ? 'power' : r.end ? 'ko' : r.delta.some((d) => d < 0) ? 'hit' : 'twist'
    play(strongest)
    vibrate(r.end ? [80, 50, 160] : 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  if (!opening) return <Waiting />

  const shownRound = viewing !== null && viewing >= 0 ? rounds[viewing] : undefined
  const hp: [number, number] = shownRound ? shownRound.hp : viewing === -1 ? [MAX_HP, MAX_HP] : state.fight.fs.hp
  const hit = { key: viewing ?? -2, sides: shownRound ? ([0, 1] as Side[]).filter((s) => shownRound.delta[s] < 0) : [] }
  const choosing = viewing === null && nextChooser(state) !== undefined

  return (
    <div className="screen">
      <Scoreboard state={state} hp={hp} hit={hit} />

      {viewing === -1 && (
        <>
          <div className="flex flex-1 flex-col gap-3">
            <h1 className="title-comic a-slam text-center text-[40px]" style={anim(0, -2)}>
              {opening.title.toUpperCase()}
            </h1>
            {opening.intro && (
              <div className="bubble a-rise rounded-[18px]" style={anim(0.3)}>
                {opening.intro}
              </div>
            )}
            <div className="a-rise" style={anim(0.5)}>
              <RulesStrip />
            </div>
            <p className="a-rise text-center text-[13px] font-bold" style={anim(0.6)}>
              Si combatte finché qualcuno crolla. Dal round 4 la rissa si scalda e i colpi fanno più male; dopo {MAX_ROUNDS} round decide la giuria.
            </p>
            {opening.source === 'offline' && (
              <p className="a-rise text-center text-[13px] font-bold" style={anim(0.7)}>
                AI non raggiungibile: stasera racconta il narratore di riserva.
              </p>
            )}
          </div>
          <Footer>
            <Button
              variant="red"
              onClick={() => {
                play('bell')
                setViewing(null)
              }}
            >
              DING DING! SI COMINCIA
            </Button>
          </Footer>
        </>
      )}

      {shownRound && (
        <>
          <div key={viewing} className="flex flex-1 flex-col">
            <RoundView state={state} round={shownRound} index={viewing as number} />
          </div>
          <Footer>
            <Button variant="red" onClick={() => (end ? dispatch({ type: 'verdict' }) : setViewing(null))}>
              {end ? 'VERDETTO!' : 'PROSSIMO ROUND'}
            </Button>
          </Footer>
        </>
      )}

      {viewing === null && (choosing ? <MovePicker {...props} /> : <Clash key={`clash-${count}`} {...props} />)}
    </div>
  )
}

export function VerdictScreen({ state, dispatch }: ScreenProps) {
  const { opening, rounds, end } = state.fight
  const w = end!.winner
  const over = matchWinner(state) !== undefined
  const mvp = mvpOf(rounds, w, opening!)
  useEffect(() => {
    play('win')
    vibrate([60, 40, 60, 40, 120])
  }, [])
  return (
    <div className="screen">
      <div className="mt-2 flex flex-col items-center gap-1 text-center">
        <span className="pill a-pop">{opening!.nicknames[w].toUpperCase()}</span>
        <h1 className="title-comic a-slam text-[68px]" style={anim(0.15, -3)}>
          VINCE
          <br />
          {state.players[w].name.toUpperCase()}!
        </h1>
        {end!.byJury && <span className="pill a-pop" style={anim(0.3)}>AI PUNTI, PER DECISIONE DELLA GIURIA</span>}
      </div>
      <div className="bubble a-rise rounded-[18px]" style={anim(0.4, 1)}>
        {end!.finale}
      </div>
      {mvp && (
        <div className="a-rise flex flex-col gap-1 rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white" style={{ ...anim(0.55, -1), boxShadow: '5px 5px 0 #FF4B3E' }}>
          <span className="comic text-xl text-sun">
            MOSSA MVP: <span className="text-white">{mvp}</span>
          </span>
          <span className="text-[13px] font-medium">
            {rounds.length} round · {opening!.title}
          </span>
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
