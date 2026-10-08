import { useEffect, useRef, useState } from 'react'
import { GOOD_STAMPS, HIT_LABEL, MAX_HP, hpState, mvpOf, type Monster, type RoundResult, type Side, type Stamp } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { requestOpening, requestRound } from '../../game/api'
import { STAGE_LABEL, entryFor, entryStage, loadBestiary, winsToNextStage } from '../../game/bestiary'
import { matchWinner, other, type MatchState } from '../../game/match'
import { koUrl, portraitUrl, preload, preloadPortrait } from '../../game/portraits'
import { renderShareCard, shareCard } from '../../game/share'
import type { Rarity } from '../../../shared/rarity'
import { Button, Footer, HpBar, PLAYER_COLORS, PLAYER_TEXT, Portrait, RarityTag, anim } from '../components'
import type { ScreenProps } from './Draft'

/** Chiede presentazione e attacchi (una sola volta per round) e li mette nello stato. */
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

const characterOf = (state: MatchState, s: Side) => (state.monsters[s] as Monster).character.name

/** La scheda del VS: ritratto grande, nome, le tre carte sotto. */
function VersusCard({ state, side, className, delay }: { state: MatchState; side: Side; className: string; delay: number }) {
  const m = state.monsters[side] as Monster
  const rows: [string, { name: string; cursed?: true; rarity: Rarity }][] = [
    ['Arma', m.weapon],
    ['Carattere', m.personality],
    ['Potere', m.power],
  ]
  return (
    <div className={`panel flex min-w-0 flex-col gap-2 p-2 ${className}`} style={{ ...anim(delay), rotate: side ? '0.8deg' : '-0.8deg', boxShadow: `6px 6px 0 ${PLAYER_COLORS[side]}` }}>
      <div className="relative">
        <Portrait monster={m} size="lg" className={`rar-frame-${m.character.rarity}`} />
        <div className="portrait-caption">
          <span className="label" style={{ color: side ? '#9CC3FF' : '#FFB3AD' }}>
            {state.players[side].name}
          </span>
          <b className="comic text-[30px] leading-[0.9] text-white">{m.character.name}</b>
          <RarityTag rarity={m.character.rarity} className="mt-1 self-start" />
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[12px] leading-snug">
        {rows.map(([k, card]) => (
          <li key={k}>
            <span className="font-extrabold">{k}:</span> <span className="font-medium">{card.name}</span> <RarityTag rarity={card.rarity} />
            {card.cursed && (
              <span className="ml-1 rounded-md border-2 border-ink px-1 text-[9px] font-extrabold tracking-wide" style={{ background: '#FF7AC2' }}>
                TRAPPOLA
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VersusScreen(props: ScreenProps) {
  const { state, dispatch } = props
  // Presentazione e attacchi si preparano mentre i giocatori si guardano i mostri.
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
      <div className="relative flex flex-col gap-5">
        <VersusCard state={state} side={0} className="a-slide-l" delay={0.25} />
        <VersusCard state={state} side={1} className="a-slide-r" delay={0.45} />
        <div className="title-comic a-slam pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[72px] text-red" style={anim(0.7, -10)}>
          VS
        </div>
      </div>
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

function Waiting({ what = 'VS' }: { what?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 1700)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="screen items-center justify-center gap-8 text-center">
      <div className="title-comic a-wiggle text-[100px] text-red">{what}</div>
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
  state,
  side,
  hp,
  round,
  roundKey,
  hitKey,
}: {
  state: MatchState
  side: Side
  hp: number
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
  const nick = state.fight.opening?.nicknames[side] ?? ''
  return (
    <div ref={ref} className="panel relative flex min-w-0 flex-col gap-1.5 px-2.5 py-2" style={{ boxShadow: '3px 3px 0 #16141a' }}>
      <div className="flex items-center gap-2">
        <Portrait monster={state.monsters[side] as Monster} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="label truncate text-[10px]" style={{ color: PLAYER_TEXT[side] }}>
            {state.players[side].name}
          </span>
          <b className="truncate text-[13px] leading-tight font-extrabold">{nick}</b>
        </div>
      </div>
      <HpBar hp={hp} />
      <span className="comic text-[17px] leading-none" style={{ color: STATE_COLOR[st.level] }}>
        {st.label}
      </span>
      {round && <HitStamp key={roundKey} round={round} side={side} />}
    </div>
  )
}

function Scoreboard({ state, hp, round, hitKey }: { state: MatchState; hp: [number, number]; round?: RoundResult; hitKey: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {([0, 1] as Side[]).map((s) => (
        <div key={s} style={{ order: s === 0 ? 0 : 2 }}>
          <FighterHp state={state} side={s} hp={hp[s]} round={round} roundKey={hitKey} hitKey={round && round.hits[s] > 0 ? hitKey : null} />
        </div>
      ))}
      <div className="title-comic order-1 text-[36px] text-red" style={{ rotate: '-8deg', textShadow: '3px 3px 0 #16141a' }}>
        VS
      </div>
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

// ---------- la rissa va da sola ----------

const MIN_REVEAL_MS = 1400

/** Chiede il round al server; intanto il pubblico aspetta. */
function RoundLoader({ state, dispatch }: ScreenProps) {
  const [waited, setWaited] = useState(false)
  const roundNo = state.fight.rounds.length + 1
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="comic a-pop rounded-full bg-ink px-5 py-1 text-[22px] text-sun">ROUND {roundNo}</span>
      <div className="title-comic a-wiggle text-[72px] text-red">SBAM!</div>
      <p className="a-rise text-[15px] font-extrabold" style={anim(0.2)}>
        {waited ? 'Il giudice sta guardando il replay…' : 'Si menano…'}
      </p>
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
      {round.twist && (
        <div className="a-slam rounded-[14px] border-[3px] border-dashed border-ink px-3 py-2 text-[13.5px] leading-snug font-medium" style={{ ...anim(0.05, -1), background: '#FF7AC2' }}>
          <b className="comic text-[17px] tracking-wide">COLPO DI SCENA!</b> {round.twist}
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
  // -1 = presentazione; altrimenti il round che si sta guardando (null = si gioca il prossimo).
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
    // La foto del K.O. si sviluppa mentre si legge l'ultimo round.
    if (r.end) preload(koUrl(state.monsters[r.end.winner] as Monster, state.monsters[other(r.end.winner)] as Monster, state.arena))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  if (!opening) return <Waiting />

  const shownRound = viewing !== null && viewing >= 0 ? rounds[viewing] : undefined
  const hp: [number, number] = shownRound ? shownRound.hp : viewing === -1 ? [MAX_HP, MAX_HP] : state.fight.fs.hp

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
              <li>A ogni round il giudice inventa la mossa di ciascun mostro, dalle sue carte e contro il suo avversario.</li>
              <li>Le due mosse avvengono nello stesso istante: racconta la scena e decide chi ha la meglio.</li>
              <li>Voi passate solo al round dopo. Si combatte finché qualcuno crolla.</li>
            </ul>
            {opening.source === 'offline' && (
              <p className="a-rise text-center text-[13px] font-bold" style={anim(0.8)}>
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
            {end ? (
              <Button variant="red" onClick={() => dispatch({ type: 'verdict' })}>
                VERDETTO!
              </Button>
            ) : (
              <Button variant="red" onClick={() => setViewing(null)}>
                VAI ALL’ALTRO ROUND
              </Button>
            )}
          </Footer>
        </>
      )}

      {viewing === null && <RoundLoader key={`load-${count}`} {...props} />}
    </div>
  )
}

/** La foto del K.O.: una polaroid storta che arriva mentre si legge il verdetto. Se non arriva, non c'è. */
function KoPhoto({ url, caption }: { url: string; caption: string }) {
  const [st, setSt] = useState<'loading' | 'ready' | 'failed'>('loading')
  if (st === 'failed') return null
  return (
    <div className="polaroid a-pop" style={anim(0.3, -2)}>
      <div className="relative aspect-square w-full overflow-hidden border-2 border-ink bg-[repeating-linear-gradient(45deg,#f3f0f8_0_8px,#e6e2ef_8px_16px)]">
        <img src={url} alt="La foto del K.O." decoding="async" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${st === 'ready' ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setSt('ready')} onError={() => setSt('failed')} />
        {st === 'loading' && <span className="comic absolute inset-0 grid place-items-center text-center text-[18px] leading-tight text-mute">IL FOTOGRAFO<br />STA SVILUPPANDO…</span>}
      </div>
      <b className="comic text-center text-[24px] leading-none">LA FOTO DEL K.O.</b>
      <span className="text-center text-[12.5px] leading-snug font-medium">{caption}</span>
    </div>
  )
}

export function VerdictScreen({ state, dispatch }: ScreenProps) {
  const { opening, rounds, end } = state.fight
  const w = end!.winner
  const l = other(w)
  const over = matchWinner(state) !== undefined
  const mvp = mvpOf(rounds, w)
  const last = rounds[rounds.length - 1]
  const winner = state.monsters[w] as Monster
  const loser = state.monsters[l] as Monster
  // Il bestiario è già aggiornato: se il vincitore ha appena evoluto, lo si celebra qui.
  const entry = entryFor(loadBestiary(), state, w)
  const stageNow = entry ? entryStage(entry) : 0
  const evolved = !!last.evoNames[w] && stageNow > (winner.stage ?? 0)
  const evoMonster: Monster = { ...winner, stage: stageNow }
  const [sharing, setSharing] = useState<'idle' | 'busy' | 'shared' | 'downloaded' | 'failed'>('idle')
  const ko = koUrl(winner, loser, state.arena)
  useEffect(() => {
    play('win')
    vibrate([60, 40, 60, 40, 120])
    if (evolved) preloadPortrait(evoMonster)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const share = async () => {
    setSharing('busy')
    const blob = await renderShareCard({
      title: opening!.title,
      arena: state.arena.name,
      names: [characterOf(state, 0), characterOf(state, 1)],
      players: [state.players[0].name, state.players[1].name],
      winner: w,
      portraits: [portraitUrl(state.monsters[0] as Monster), portraitUrl(state.monsters[1] as Monster)],
      koPhoto: ko,
      mvp,
      rounds: rounds.length,
      byJury: end!.byJury,
    })
    setSharing(blob ? await shareCard(blob, opening!.title) : 'failed')
  }

  return (
    <div className="screen">
      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        <span className="pill a-pop">{(evolved ? last.evoNames[w] : opening!.nicknames[w])!.toUpperCase()}</span>
        <h1 className="title-comic a-slam text-[60px]" style={anim(0.15, -3)}>
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
      <KoPhoto url={ko} caption={end!.finale} />
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
      {evolved ? (
        <div className="a-slam flex flex-col gap-3 rounded-[18px] border-[3px] border-ink p-3.5" style={{ ...anim(0.7, 1), background: '#2F7BFF', boxShadow: '5px 5px 0 #FFB020' }}>
          <span className="title-comic text-center text-[34px]">{characterOf(state, w).toUpperCase()} EVOLVE!</span>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Portrait monster={{ ...winner, stage: winner.stage ?? 0 }} size="lg" />
            <span className="title-comic text-[40px] text-sun">→</span>
            <Portrait monster={evoMonster} size="lg" className="rar-frame-leggendaria" />
          </div>
          <div className="panel text-center">
            <span className="label" style={{ color: '#1F5FD6' }}>
              Forma {stageNow === 2 ? 'leggendaria' : 'evoluta'} · {STAGE_LABEL[stageNow]}
            </span>
            <b className="comic block text-[30px] leading-none">{last.evoNames[w]}</b>
            <span className="text-[13px] leading-snug font-medium">{entry?.wins} vittorie. Nuovo ritratto, nuovo soprannome, e da oggi le sue mosse picchiano un po’ più forte, di nascosto.</span>
          </div>
        </div>
      ) : (
        last.scars[w] && (
          <div className="a-rise flex items-center gap-3 rounded-[18px] border-[3px] border-ink p-3" style={{ ...anim(0.7), background: '#FF7AC2' }}>
            <Portrait monster={winner} size="sm" />
            <span className="text-[13px] leading-snug font-medium">
              <b>Nuova cicatrice:</b> «{last.scars[w]}»
              {entry && winsToNextStage(entry.wins) > 0 && ` · ${winsToNextStage(entry.wins)} vittorie all’evoluzione`}
            </span>
          </div>
        )
      )}
      <div className="a-rise flex items-center justify-center gap-3" style={anim(0.8)}>
        {([0, 1] as Side[]).map((s) => (
          <span key={s} className="pill text-base" style={{ background: s === w ? '#FFE14D' : '#fff' }}>
            {state.players[s].name} <span className="comic text-2xl">{state.players[s].wins}</span>
          </span>
        ))}
      </div>
      <Footer>
        <Button variant="white" disabled={sharing === 'busy'} onClick={share}>
          {sharing === 'busy' ? 'PREPARO LA CARD…' : sharing === 'downloaded' ? 'CARD SALVATA' : sharing === 'shared' ? 'CONDIVISA!' : 'CONDIVIDI LA CARD'}
        </Button>
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
          <li key={h.round} className="panel a-rise flex items-center gap-3 px-3.5 py-2.5" style={anim(0.5 + i * 0.08, i % 2 ? 0.8 : -0.8)}>
            <Portrait monster={h.monsters[h.winner]} size="sm" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="label text-mute">Round {h.round}</span>
              <b className="leading-tight font-extrabold">{h.title}</b>
              <span className="text-[13px] font-medium">
                Vince <b style={{ color: PLAYER_TEXT[h.winner] }}>{state.players[h.winner].name}</b> con {h.nicknames[h.winner] || h.monsters[h.winner].character.name}
                {h.mvp ? ` · ${h.mvp}` : ''}
              </span>
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
