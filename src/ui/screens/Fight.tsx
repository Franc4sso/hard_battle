import { useEffect, useRef, useState } from 'react'
import {
  CUSTOM_MAX,
  GOOD_STAMPS,
  HIT_LABEL,
  MAX_HP,
  choiceText,
  cleanCustom,
  hpState,
  mvpOf,
  type Choice,
  type Monster,
  type RoundResult,
  type Side,
  type Stamp,
} from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { requestOpening, requestRound } from '../../game/api'
import { currentEvent, matchWinner, nextChooser, other, type MatchState } from '../../game/match'
import { Button, Footer, HpBar, MonsterCard, PLAYER_COLORS, PLAYER_TEXT, anim } from '../components'
import type { ScreenProps } from './Draft'

/** Chiede presentazione e prime mosse (una sola volta per round) e le mette nello stato. */
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
  // Presentazione e prime mosse si preparano mentre i giocatori si guardano i mostri.
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

const characterOf = (state: MatchState, s: Side) => (state.monsters[s] as Monster).character.name

// ---------- tabellone ----------

const SHAKE: Keyframe[] = [
  { transform: 'translate(0,0)' },
  { transform: 'translate(-7px,2px)' },
  { transform: 'translate(6px,-3px)' },
  { transform: 'translate(-4px,3px)' },
  { transform: 'translate(3px,-1px)' },
  { transform: 'translate(0,0)' },
]

const STATE_COLOR = ['#0B8F4A', '#0B8F4A', '#B86E00', '#D42A1E', '#16141a']

/** Il timbro su chi è stato colpito in questo round. */
function HitStamp({ round, side }: { round: RoundResult; side: Side }) {
  const hit = round.hits[side]
  const healed = round.heal[side] > 0 && hit === 0
  const label = healed ? 'SI RIPRENDE' : HIT_LABEL[hit]
  const style = healed ? { background: '#C9F7D9', color: '#0B6B3C' } : hit ? { background: '#FF4B3E', color: '#fff' } : { background: '#fff', color: '#16141a' }
  return (
    <span
      className="comic a-pop absolute -top-3 -right-2 rounded-lg border-[2.5px] border-ink px-1.5 text-[16px] leading-tight whitespace-nowrap"
      style={{ ...anim(0.4, side ? -6 : 6), ...style }}
    >
      {label}
    </span>
  )
}

function FighterHp({
  name,
  nickname,
  hp,
  side,
  round,
  roundKey,
  hitKey,
}: {
  name: string
  nickname: string
  hp: number
  side: Side
  round?: RoundResult
  roundKey: number
  hitKey: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Shake con Web Animations: niente remount, così la barra della vita scorre.
    if (hitKey !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.animate(SHAKE, { duration: 380, delay: 320, iterations: 2 })
  }, [hitKey])
  const st = hpState(hp)
  return (
    <div ref={ref} className="panel relative flex min-w-0 flex-col gap-1.5 px-2.5 py-2" style={{ boxShadow: '3px 3px 0 #16141a' }}>
      <span className="label truncate text-[11px]" style={{ color: PLAYER_TEXT[side] }}>
        {name}
      </span>
      <b className="text-sm leading-tight font-extrabold">{nickname}</b>
      <HpBar hp={hp} />
      <span className="comic text-[17px] leading-none" style={{ color: STATE_COLOR[st.level] }}>
        {st.label}
      </span>
      {round && <HitStamp key={roundKey} round={round} side={side} />}
    </div>
  )
}

function Scoreboard({ state, hp, round, hitKey }: { state: MatchState; hp: [number, number]; round?: RoundResult; hitKey: number }) {
  const nick = state.fight.opening?.nicknames ?? ['', '']
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {([0, 1] as Side[]).map((s) => (
        <div key={s} style={{ order: s === 0 ? 0 : 2 }}>
          <FighterHp
            name={state.players[s].name}
            nickname={nick[s]}
            hp={hp[s]}
            side={s}
            round={round}
            roundKey={hitKey}
            hitKey={round && round.hits[s] > 0 ? hitKey : null}
          />
        </div>
      ))}
      <div className="title-comic order-1 text-[36px] text-red" style={{ rotate: '-8deg', textShadow: '3px 3px 0 #16141a' }}>
        VS
      </div>
    </div>
  )
}

/** L'arena interviene: si vede prima di scegliere, così ci si può adattare. */
function EventBanner({ text, compact = false }: { text: string; compact?: boolean }) {
  useEffect(() => {
    if (!compact) {
      play('twist')
      vibrate([30, 30, 30])
    }
  }, [compact])
  return (
    <div
      className={`a-slam flex w-full flex-col gap-1 rounded-[18px] border-[3px] border-ink bg-ink text-left text-white ${compact ? 'p-2.5' : 'p-3.5'}`}
      style={{ ...anim(compact ? 0 : 0.15, compact ? 0 : -1.5), boxShadow: '5px 5px 0 #FFB020' }}
    >
      <span className={`comic text-sun ${compact ? 'text-[17px]' : 'text-[22px]'}`}>L’ARENA INTERVIENE!</span>
      <span className={`${compact ? 'text-[13px]' : 'text-[15px]'} leading-snug font-medium`}>{text}</span>
    </div>
  )
}

function StampBadge({ stamp, side, delay }: { stamp: Stamp; side: Side; delay: number }) {
  const color = GOOD_STAMPS.has(stamp) ? '#6B1FD1' : stamp === 'DISASTRO' ? '#D42A1E' : '#5D5866'
  return (
    <span
      className="comic a-slam shrink-0 rounded-lg border-[3px] bg-white px-2 text-[18px] leading-tight"
      style={{ ...anim(delay, side ? -7 : 7), color, borderColor: color }}
    >
      {stamp}
    </span>
  )
}

// ---------- scelta della mossa ----------

/** Ognuno sceglie la mossa di nascosto, passandosi il telefono: 3 suggerite o una inventata. */
function MovePicker({ state, dispatch }: ScreenProps) {
  const who = nextChooser(state)
  const [covered, setCovered] = useState(true)
  const [selected, setSelected] = useState<number | 'custom' | null>(null)
  const [draft, setDraft] = useState('')
  if (who === undefined) return null
  const f = state.fight
  const me = state.players[who].name
  const them = state.players[other(who)].name
  const foe = other(who)
  const last = f.rounds.at(-1)
  const roundNo = f.rounds.length + 1
  const event = currentEvent(state)
  const custom = cleanCustom(draft)
  const ready = selected === 'custom' ? custom.length > 0 : selected !== null

  if (covered)
    return (
      <div key={`cover-${who}-${roundNo}`} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="comic a-pop rounded-full bg-ink px-5 py-1 text-[22px] text-sun">ROUND {roundNo}</span>
        {event && <EventBanner text={event.text} />}
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

  const submit = () => {
    if (!ready || selected === null) return
    const choice: Choice = selected === 'custom' ? { custom } : { pick: selected }
    play('pick')
    vibrate(25)
    dispatch({ type: 'choose', side: who, choice })
    setSelected(null)
    setDraft('')
    setCovered(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="title-comic a-slam text-[38px]" style={anim(0, -2)}>
        COSA FA <span style={{ color: PLAYER_COLORS[who] }}>{characterOf(state, who).toUpperCase()}</span>?
      </h2>
      {event && <EventBanner text={event.text} compact />}
      <div className="panel a-rise flex flex-col gap-1 px-3 py-2.5" style={anim(0.05)}>
        <span className="label text-[11px]">
          Contro {characterOf(state, foe)} · {hpState(f.fs.hp[foe]).label.toLowerCase()}
        </span>
        <span className="text-[14px] leading-snug font-semibold">
          {last ? (
            <>
              L’ultima volta: <i>«{last.actions[foe]}»</i>
            </>
          ) : (
            'Primo round: nessuno sa ancora cosa farà.'
          )}
        </span>
      </div>
      {f.offers[who].map((o, i) => {
        const on = selected === i
        return (
          <div key={`${roundNo}-${i}`} className="a-rise" style={anim(0.1 + i * 0.07)}>
            <button
              type="button"
              className="choice flex-col items-start gap-1.5"
              aria-pressed={on}
              style={{
                borderRadius: i % 2 ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                transform: `rotate(${[-0.8, 0.6, -0.4][i] ?? 0}deg) scale(${on ? 1.02 : 1})`,
                ...(o.finisher && !on ? { background: '#E9D8FF', boxShadow: '6px 6px 0 #8B2CF5' } : {}),
              }}
              onClick={() => {
                play('select')
                vibrate(10)
                setSelected(i)
              }}
            >
              {o.finisher && <span className="comic rounded-md bg-ink px-2 text-[15px] text-sun">COLPO FINALE</span>}
              <span className="text-[17px] leading-snug font-bold">{o.text}</span>
            </button>
          </div>
        )
      })}
      <div className="a-rise" style={anim(0.35)}>
        {selected === 'custom' ? (
          <div className="panel flex flex-col gap-2" style={{ background: '#FFE14D' }}>
            <label htmlFor="custom-move" className="label">
              La tua mossa
            </label>
            <textarea
              id="custom-move"
              className="field resize-none text-[16px] leading-snug"
              style={{ fontWeight: 600 }}
              rows={3}
              maxLength={CUSTOM_MAX}
              autoFocus
              placeholder={`Es. "Gli ruba il ${(state.monsters[foe] as Monster).weapon.name.toLowerCase()} e lo usa contro di lui"`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <span className="text-[12px] leading-snug font-bold text-mute">
              {draft.length}/{CUSTOM_MAX} · Il giudice premia le idee furbe e fischia chi bara.
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              play('select')
              setSelected('custom')
            }}
          >
            ✍️ Inventa la tua mossa
          </button>
        )}
      </div>
      <div className="mt-auto pt-1">
        <Button disabled={!ready} onClick={submit}>
          FATTO. NASCONDI!
        </Button>
      </div>
    </div>
  )
}

// ---------- scontro e racconto ----------

const MIN_REVEAL_MS = 1600

/** Svela le due mosse; intanto il server giudica il round. */
function Clash({ state, dispatch }: ScreenProps) {
  const f = state.fight
  const choices = f.choices as [Choice, Choice]
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
      {([0, 1] as Side[]).map((s) => (
        <div key={s} className={`bubble a-slam flex flex-col gap-1 ${s === 0 ? 'bubble-l' : 'bubble-r'}`} style={anim(0.15 + s * 0.35, s ? 2 : -2)}>
          <span className="label" style={{ color: PLAYER_TEXT[s] }}>
            {characterOf(state, s)}
          </span>
          <span className="text-[16px] leading-snug font-bold">{choiceText(f.offers[s], choices[s])}</span>
        </div>
      ))}
      <p className="a-wiggle mt-2 self-center text-center text-[15px] font-extrabold">{waited ? 'Il giudice sta guardando il replay…' : 'SCONTRO!'}</p>
    </div>
  )
}

function RoundView({ state, round, index }: { state: MatchState; round: RoundResult; index: number }) {
  const w = round.winner
  return (
    <div className="flex flex-col gap-3">
      <span className="comic self-center rounded-full bg-ink px-5 py-1 text-[22px] text-sun">ROUND {index + 1}</span>
      {round.event && (
        <div className="a-rise rounded-[14px] border-[3px] border-ink bg-ink px-3 py-2 text-[13px] leading-snug font-medium text-white" style={anim(0)}>
          <b className="text-sun">L’arena:</b> {round.event}
        </div>
      )}
      {([0, 1] as Side[]).map((s) => (
        <div
          key={s}
          className={`panel a-rise flex flex-col gap-1.5 ${s === 0 ? 'mr-4' : 'ml-4'}`}
          style={{ ...anim(0.1 + s * 0.45, s ? 0.8 : -0.8), boxShadow: `5px 5px 0 ${PLAYER_COLORS[s]}` }}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="label text-[11px]" style={{ color: PLAYER_TEXT[s] }}>
                {characterOf(state, s)}
                {round.custom[s] ? ' · mossa inventata' : ''}
              </span>
              <b className="comic text-[26px] leading-none">{round.moveNames[s]}</b>
            </span>
            <StampBadge stamp={round.stamps[s]} side={s} delay={0.35 + s * 0.45} />
          </span>
          <span className="text-[14px] leading-snug font-medium italic">«{round.actions[s]}»</span>
        </div>
      ))}
      <div className="sfx a-slam self-center text-center text-[40px]" style={anim(1, -5)}>
        {round.sfx}
      </div>
      <p className="bubble a-rise rounded-[18px] text-[15.5px]" style={anim(1.2)}>
        {round.scene}
      </p>
      <div className="a-rise flex flex-col gap-1 rounded-[18px] border-[3px] border-ink bg-ink p-3.5 text-white" style={{ ...anim(1.6, -0.6), boxShadow: '5px 5px 0 #FFB020' }}>
        <span className="label text-[11px] text-sun">Il giudice</span>
        <span className="comic text-[26px] leading-none text-sun">{w === null ? 'ROUND PARI' : `ROUND A ${characterOf(state, w).toUpperCase()}`}</span>
        {round.why && <span className="text-[14.5px] leading-snug font-medium">{round.why}</span>}
      </div>
      {round.end && (
        <div className="title-comic a-slam mt-1 text-center text-[64px] text-red" style={anim(2, -6)}>
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
    play(r.end ? 'ko' : r.hits.some((h) => h === 3) ? 'power' : r.hits.some((h) => h > 0) ? 'hit' : 'twist')
    vibrate(r.end ? [80, 50, 160] : 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  if (!opening) return <Waiting />

  const shownRound = viewing !== null && viewing >= 0 ? rounds[viewing] : undefined
  const hp: [number, number] = shownRound ? shownRound.hp : viewing === -1 ? [MAX_HP, MAX_HP] : state.fight.fs.hp
  const choosing = viewing === null && nextChooser(state) !== undefined

  return (
    <div className="screen">
      <Scoreboard state={state} hp={hp} round={shownRound} hitKey={viewing ?? -2} />

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
            <ul className="panel a-rise flex flex-col gap-1.5 px-3.5 py-3 text-[14px] leading-snug font-medium" style={anim(0.5)}>
              <li>Ogni round scegli di nascosto una delle 3 mosse suggerite, oppure inventane una tu.</li>
              <li>Le due mosse avvengono nello stesso istante: il giudice racconta la scena e decide chi ha la meglio.</li>
              <li>Le mosse cambiano round dopo round, a seconda di come va la rissa.</li>
              <li>Si combatte finché qualcuno crolla.</li>
            </ul>
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
  const mvp = mvpOf(rounds, w)
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
        {end!.byJury && (
          <span className="pill a-pop" style={anim(0.3)}>
            PER DECISIONE DELLA GIURIA
          </span>
        )}
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
