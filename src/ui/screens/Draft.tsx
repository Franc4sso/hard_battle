import { useState } from 'react'
import { SLOTS } from '../../../shared/cards'
import type { Monster } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { currentSlot, other, type Action, type MatchState } from '../../game/match'
import { Button, Footer, Icon, LETTER_COLORS, SLOT_INFO, anim } from '../components'

export interface ScreenProps {
  state: MatchState
  dispatch(a: Action): void
}

export function PassScreen({ state, dispatch }: ScreenProps) {
  const me = state.players[state.picker].name
  const them = state.players[other(state.picker)].name
  const secondTurn = state.monsters[other(state.picker)] !== null
  return (
    <div className="screen items-center justify-center text-center">
      <span className="label text-white">Passa il telefono a</span>
      <h1 className="title-comic a-slam text-[76px] break-all" style={anim(0, -3)}>
        {me.toUpperCase()}
      </h1>
      <div className="panel a-rise max-w-[320px] text-[15px] leading-snug font-medium" style={anim(0.2, 1.5)}>
        <b>{them}</b>, girati! {secondTurn ? `Il tuo mostro è già pronto e nascosto. ` : ''}I mostri restano segreti fino alla rissa.
      </div>
      <Footer>
        <Button
          onClick={() => {
            play('pass')
            dispatch({ type: 'beginPick' })
          }}
        >
          SONO {me.toUpperCase()}, VIA!
        </Button>
      </Footer>
    </div>
  )
}

const TILT = [-1.5, 1, -0.5]

export function PickScreen({ state, dispatch }: ScreenProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const slot = currentSlot(state)
  const rerolls = state.rerolls[state.picker]

  return (
    <div className="screen">
      <div className="flex items-center justify-between">
        <span className="pill">{state.players[state.picker].name.toUpperCase()} · CREA IL TUO MOSTRO</span>
        <span className="title-comic text-[28px] text-sun" style={{ textShadow: 'none' }}>
          {state.step + 1}/4
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {SLOTS.map((s, i) => (
          <div
            key={s}
            className="h-2.5 rounded-md border-[2.5px] border-ink"
            style={{ background: i < state.step ? '#FFE14D' : i === state.step ? '#fff' : 'rgb(255 255 255 / 0.35)' }}
          />
        ))}
      </div>
      <h1 className="title-comic a-slam mt-1 text-[52px]" style={anim(0, -2)}>
        SCEGLI
        <br />
        {SLOT_INFO[slot].title}!
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {SLOTS.map((s) => {
          const card = state.draft[s]
          return card ? (
            <span key={s} className="tag">
              {card.name}
            </span>
          ) : (
            <span key={s} className="tag-empty">
              ?
            </span>
          )
        })}
      </div>
      <div className="flex flex-col gap-3.5" key={state.offer.map((c) => c.id).join()}>
        {state.offer.map((card, i) => {
          const on = selected === i
          return (
            <div key={card.id} className="a-rise" style={anim(0.08 + i * 0.07)}>
              <button
                type="button"
                className="choice"
                aria-pressed={on}
                style={{ transform: `rotate(${TILT[i]}deg) scale(${on ? 1.03 : 1})` }}
                onClick={() => {
                  play('select')
                  vibrate(10)
                  setSelected(i)
                }}
              >
                <span className="letter" style={{ background: LETTER_COLORS[i] }}>
                  {'ABC'[i]}
                </span>
                <span className="flex flex-col gap-0.5">
                  <b className="text-lg leading-tight font-extrabold">{card.name}</b>
                  <span className="text-[13px] leading-snug font-medium">{card.desc}</span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <Footer>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="icon-btn relative h-[60px] w-[60px] rounded-[18px]"
            disabled={rerolls <= 0}
            style={{ opacity: rerolls > 0 ? 1 : 0.45 }}
            aria-label={`Rimescola le carte (${rerolls} rimasti)`}
            onClick={() => {
              play('reroll')
              setSelected(null)
              dispatch({ type: 'reroll' })
            }}
          >
            <Icon name="refresh" size={26} />
            <span className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full border-[2.5px] border-ink bg-sun text-xs font-extrabold">{rerolls}</span>
          </button>
          <Button
            className="flex-1"
            disabled={selected === null}
            onClick={() => {
              if (selected === null) return
              play('pick')
              vibrate(25)
              setSelected(null)
              dispatch({ type: 'pick', index: selected })
            }}
          >
            SCELGO QUESTA!
          </Button>
        </div>
      </Footer>
    </div>
  )
}

export function ReadyScreen({ state, dispatch }: ScreenProps) {
  const m = state.draft as Monster
  const next = other(state.picker)
  const last = state.monsters[next] !== null
  return (
    <div className="screen">
      <h1 className="title-comic a-slam mt-4 text-[54px]" style={anim(0, -2)}>
        ECCO IL TUO
        <br />
        MOSTRO!
      </h1>
      <div className="panel a-pop flex flex-col gap-3" style={anim(0.15, 1)}>
        {SLOTS.map((s, i) => (
          <div key={s} className="flex items-start gap-3">
            <span className="letter h-10 w-10 text-xl" style={{ background: [...LETTER_COLORS, '#FFE14D'][i] }}>
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="label text-mute">{SLOT_INFO[s].label}</span>
              <b className="text-[17px] leading-tight font-extrabold">{m[s].name}</b>
              <span className="text-[13px] leading-snug font-medium">{m[s].desc}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-center text-[15px] font-bold text-white">Memorizzalo: {state.players[next].name} lo scoprirà solo nella rissa.</p>
      <Footer>
        <Button
          onClick={() => {
            play('pass')
            dispatch({ type: 'confirm' })
          }}
        >
          {last ? 'TUTTO PRONTO: RISSA!' : `NASCONDI E PASSA A ${state.players[next].name.toUpperCase()}`}
        </Button>
      </Footer>
    </div>
  )
}
