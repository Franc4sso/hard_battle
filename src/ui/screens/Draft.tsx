import { useState } from 'react'
import { SLOTS, type Card } from '../../../shared/cards'
import type { Monster } from '../../../shared/battle'
import { play, vibrate } from '../../audio/sfx'
import { championsOf, loadBestiary } from '../../game/bestiary'
import { currentSlot, currentTurn, draftSlots, other, type Action, type MatchState } from '../../game/match'
import { Button, Footer, Icon, LETTER_COLORS, SLOT_INFO, Sheet, anim } from '../components'

export interface ScreenProps {
  state: MatchState
  dispatch(a: Action): void
}

const GIFT_PINK = '#FF7AC2'

export function PassScreen({ state, dispatch }: ScreenProps) {
  const me = state.players[state.picker].name
  const them = state.players[other(state.picker)].name
  const task = currentTurn(state).task
  return (
    <div className="screen items-center justify-center text-center">
      <span className="label text-white">Passa il telefono a</span>
      <h1 className="title-comic a-slam text-[76px] break-all" style={anim(0, -3)}>
        {me.toUpperCase()}
      </h1>
      <div className="panel a-rise max-w-[320px] text-[15px] leading-snug font-medium" style={anim(0.2, 1.5)}>
        <b>{them}</b>, girati!{' '}
        {task === 'sabotage'
          ? `${me} sta per scegliere una carta per il tuo mostro. E non sarà un regalo gentile.`
          : 'I mostri restano segreti fino alla rissa.'}
      </div>
      <Footer>
        <Button
          onClick={() => {
            play('pass')
            dispatch({ type: 'beginTurn' })
          }}
        >
          SONO {me.toUpperCase()}, VIA!
        </Button>
      </Footer>
    </div>
  )
}

const TILT = [-1.5, 1, -0.5]

function CardChoices({ cards, selected, onSelect }: { cards: Card[]; selected: number | null; onSelect(i: number): void }) {
  return (
    <div className="flex flex-col gap-3.5" key={cards.map((c) => c.id).join()}>
      {cards.map((card, i) => {
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
                onSelect(i)
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
  )
}

export function SabotageScreen({ state, dispatch }: ScreenProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const target = state.players[other(state.picker)].name
  const slot = currentSlot(state)
  return (
    <div className="screen">
      <span className="pill self-start">{state.players[state.picker].name.toUpperCase()} · SABOTAGGIO</span>
      <h1 className="title-comic a-slam mt-1 text-[52px]" style={anim(0, -2)}>
        SABOTA
        <br />
        {target.toUpperCase()}!
      </h1>
      <p className="a-rise text-[15px] leading-snug font-bold text-white" style={anim(0.1)}>
        Sono tutte carte trappola: scegli la disgrazia peggiore per il mostro di {target}. Sarà {SLOT_INFO[slot].title.toLowerCase()} che dovrà tenersi, e gli toglierà forza in battaglia.
      </p>
      <CardChoices cards={state.offer} selected={selected} onSelect={setSelected} />
      <Footer>
        <Button
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return
            play('twist')
            vibrate([20, 30, 40])
            dispatch({ type: 'sabotage', index: selected })
          }}
        >
          REGALO AVVELENATO!
        </Button>
      </Footer>
    </div>
  )
}

function ChampionSheet({ state, dispatch, onClose }: ScreenProps & { onClose(): void }) {
  const champs = championsOf(loadBestiary(), state.players[state.picker].name).slice(0, 12)
  const gift = state.gifts[state.picker]
  return (
    <Sheet onClose={onClose}>
      <div className="panel flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
        <b className="comic text-[26px]">I TUOI CAMPIONI</b>
        <p className="text-[13px] leading-snug font-medium">
          Il regalo di {state.players[other(state.picker)].name} resta: {gift.card?.name} prende il posto della sua carta {SLOT_INFO[gift.slot].label.toLowerCase()}.
        </p>
        {champs.map((e) => (
          <button
            key={e.key}
            type="button"
            className="choice flex-col items-start gap-1 p-3"
            onClick={() => {
              play('pick')
              dispatch({ type: 'useChampion', monster: e.monster })
            }}
          >
            <b className="comic text-[22px] leading-none">{e.nickname}</b>
            <span className="text-[13px] font-medium">
              {e.monster.character.name} · {e.monster.weapon.name} · {e.monster.power.name}
            </span>
            <span className="text-xs font-extrabold">
              {e.wins} V · {e.losses} S
            </span>
          </button>
        ))}
      </div>
      <Button variant="white" onClick={onClose}>
        CHIUDI
      </Button>
    </Sheet>
  )
}

export function PickScreen(props: ScreenProps) {
  const { state, dispatch } = props
  const [selected, setSelected] = useState<number | null>(null)
  const [champions, setChampions] = useState(false)
  const slot = currentSlot(state)
  const slots = draftSlots(state, state.picker)
  const gift = state.gifts[state.picker]
  const rerolls = state.rerolls[state.picker]
  const hasChampions = state.step === 0 && championsOf(loadBestiary(), state.players[state.picker].name).length > 0

  return (
    <div className="screen">
      <div className="flex items-center justify-between">
        <span className="pill">{state.players[state.picker].name.toUpperCase()} · CREA IL TUO MOSTRO</span>
        <span className="title-comic text-[28px] text-sun" style={{ textShadow: 'none' }}>
          {state.step + 1}/{slots.length}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {SLOTS.map((s) => {
          const i = slots.indexOf(s)
          const bg = s === gift.slot ? GIFT_PINK : i < state.step ? '#FFE14D' : i === state.step ? '#fff' : 'rgb(255 255 255 / 0.35)'
          return <div key={s} className="h-2.5 rounded-md border-[2.5px] border-ink" style={{ background: bg }} />
        })}
      </div>
      <h1 className="title-comic a-slam mt-1 text-[52px]" style={anim(0, -2)}>
        SCEGLI
        <br />
        {SLOT_INFO[slot].title}!
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {SLOTS.map((s) => {
          const card = state.draft[s]
          if (s === gift.slot && card)
            return (
              <span key={s} className="tag" style={{ background: GIFT_PINK, color: '#16141a' }}>
                Regalo di {state.players[other(state.picker)].name}: {card.name}
              </span>
            )
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
      <CardChoices cards={state.offer} selected={selected} onSelect={setSelected} />
      <Footer>
        {hasChampions && (
          <Button variant="white" className="min-h-[52px] text-[22px]" onClick={() => setChampions(true)}>
            USA UN CAMPIONE DAL BESTIARIO
          </Button>
        )}
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
      {champions && <ChampionSheet {...props} onClose={() => setChampions(false)} />}
    </div>
  )
}

export function ReadyScreen({ state, dispatch }: ScreenProps) {
  const m = state.draft as Monster
  const last = state.turn === 3
  const next = other(state.picker)
  const gift = state.gifts[state.picker]
  return (
    <div className="screen">
      <h1 className="title-comic a-slam mt-4 text-[54px]" style={anim(0, -2)}>
        {state.champion ? (
          <>
            IL CAMPIONE
            <br />
            TORNA!
          </>
        ) : (
          <>
            ECCO IL TUO
            <br />
            MOSTRO!
          </>
        )}
      </h1>
      <div className="panel a-pop flex flex-col gap-3" style={anim(0.15, 1)}>
        {SLOTS.map((s, i) => {
          const isGift = s === gift.slot
          return (
            <div key={s} className="flex items-start gap-3">
              <span className="letter h-10 w-10 text-xl" style={{ background: isGift ? GIFT_PINK : [...LETTER_COLORS, '#FFE14D'][i] }}>
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="label text-mute">
                  {SLOT_INFO[s].label}
                  {isGift ? ` · regalo di ${state.players[other(state.picker)].name}` : ''}
                </span>
                <b className="text-[17px] leading-tight font-extrabold">{m[s].name}</b>
                <span className="text-[13px] leading-snug font-medium">{m[s].desc}</span>
              </span>
            </div>
          )
        })}
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
