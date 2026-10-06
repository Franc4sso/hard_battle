import { useState } from 'react'
import { loadBestiary, removeEntry } from '../../game/bestiary'
import { Button, Footer, anim } from '../components'

const STEPS: [string, string][] = [
  ['Sabota e crea', 'Scegli una carta-trappola per l’avversario, poi costruisci il tuo mostro tra carte a caso.'],
  ['Tattica segreta', 'A metà rissa ognuno sceglie di nascosto: attacco, difesa o trucco sporco.'],
  ['L’AI decide', 'La rissa viene simulata round per round. I mostri finiscono nel bestiario.'],
]

export function HomeScreen({ canResume, onNew, onResume, onBestiary }: { canResume: boolean; onNew(): void; onResume(): void; onBestiary(): void }) {
  return (
    <div className="screen">
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <span className="pill a-pop">1 CONTRO 1 · UN TELEFONO</span>
        <h1 className="title-comic a-slam text-[84px]" style={anim(0.1, -4)}>
          RISSA
          <br />
          ASSURDA
        </h1>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="panel a-rise flex items-start gap-3" style={anim(0.25 + i * 0.08, i % 2 ? 1 : -1)}>
            <span className="letter h-11 w-11 text-2xl" style={{ background: ['#7CE0FF', '#FF7AC2', '#8CF0A8'][i] }}>
              {i + 1}
            </span>
            <span className="flex flex-col">
              <b className="text-[17px] font-extrabold">{title}</b>
              <span className="text-sm leading-snug font-medium">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Footer>
        {canResume && (
          <Button variant="white" onClick={onResume}>
            CONTINUA LA RISSA
          </Button>
        )}
        <Button onClick={onNew}>NUOVA RISSA!</Button>
        <Button variant="ghost" className="text-white" onClick={onBestiary}>
          Apri il bestiario
        </Button>
      </Footer>
    </div>
  )
}

export function BestiaryScreen({ onBack }: { onBack(): void }) {
  const [list, setList] = useState(loadBestiary)
  const [owner, setOwner] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const owners = [...new Set(list.map((e) => e.owner))]
  const shown = owner ? list.filter((e) => e.owner === owner) : list

  return (
    <div className="screen">
      <h1 className="title-comic a-slam mt-2 text-[56px]" style={anim(0, -2)}>
        BESTIARIO
      </h1>
      {list.length === 0 ? (
        <p className="panel text-[15px] leading-snug font-medium">
          Ancora vuoto. Ogni mostro che combatte finisce qui, con il suo soprannome e le sue vittorie. Poi potrai rimetterlo in campo.
        </p>
      ) : (
        <>
          {owners.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="seg flex-none px-4 text-lg" aria-pressed={owner === null} onClick={() => setOwner(null)}>
                TUTTI
              </button>
              {owners.map((o) => (
                <button key={o} type="button" className="seg flex-none px-4 text-lg" aria-pressed={owner === o} onClick={() => setOwner(o)}>
                  {o.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {shown.map((e, i) => (
              <li key={e.key} className="panel a-rise flex flex-col gap-1" style={anim(Math.min(i, 8) * 0.05, i % 2 ? 0.6 : -0.6)}>
                <div className="flex items-start justify-between gap-2">
                  <b className="comic text-[26px] leading-none">{e.nickname}</b>
                  <span className="pill shrink-0 text-xs" style={{ background: e.wins > e.losses ? '#FFE14D' : '#fff' }}>
                    {e.wins} V · {e.losses} S
                  </span>
                </div>
                <span className="label text-mute">di {e.owner}</span>
                <span className="text-[13px] leading-snug font-medium">
                  <b>{e.monster.character.name}</b> · {e.monster.weapon.name} · {e.monster.personality.name} · {e.monster.power.name}
                </span>
                {e.lastTitle && <span className="text-xs font-bold italic">Ultima rissa: {e.lastTitle}</span>}
                {confirm === e.key ? (
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="seg text-lg"
                      onClick={() => {
                        removeEntry(e.key)
                        setList(loadBestiary())
                        setConfirm(null)
                      }}
                    >
                      SÌ, LIBERALO
                    </button>
                    <button type="button" className="seg text-lg" onClick={() => setConfirm(null)}>
                      NO
                    </button>
                  </div>
                ) : (
                  <button type="button" className="self-end text-xs font-bold underline" onClick={() => setConfirm(e.key)}>
                    Libera
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <Footer>
        <Button variant="white" onClick={onBack}>
          INDIETRO
        </Button>
      </Footer>
    </div>
  )
}

const BEST_OF: [number, string][] = [
  [1, 'SECCA'],
  [3, 'MEGLIO DI 3'],
  [5, 'MEGLIO DI 5'],
]

export function SetupScreen({
  initialNames,
  initialBestOf,
  onStart,
  onBack,
}: {
  initialNames: [string, string]
  initialBestOf: number
  onStart(names: [string, string], bestOf: number): void
  onBack(): void
}) {
  const [names, setNames] = useState<[string, string]>(initialNames)
  const [bestOf, setBestOf] = useState(initialBestOf)
  const clean = names.map((n) => n.trim()) as [string, string]
  const ok = clean[0] && clean[1] && clean[0].toLowerCase() !== clean[1].toLowerCase()

  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onStart(clean, bestOf)
      }}
    >
      <h1 className="title-comic a-slam mt-4 text-[56px]" style={anim(0, -2)}>
        CHI SI
        <br />
        SFIDA?
      </h1>
      <div className="panel flex flex-col gap-3">
        {[0, 1].map((i) => (
          <label key={i} className="flex items-center gap-3">
            <span className="letter h-12 w-12 text-2xl text-white" style={{ background: i === 0 ? '#FF4B3E' : '#2F7BFF' }}>
              {i + 1}
            </span>
            <span className="sr-only">Nome giocatore {i + 1}</span>
            <input
              className="field"
              value={names[i]}
              maxLength={16}
              placeholder={`Giocatore ${i + 1}`}
              autoComplete="off"
              onChange={(e) => {
                const next: [string, string] = [...names]
                next[i] = e.target.value
                setNames(next)
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="label text-white">Durata</span>
        <div className="flex gap-2">
          {BEST_OF.map(([n, label]) => (
            <button key={n} type="button" className="seg" aria-pressed={bestOf === n} onClick={() => setBestOf(n)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Footer>
        <Button type="submit" disabled={!ok}>
          VIA ALLA RISSA!
        </Button>
        <Button variant="ghost" onClick={onBack} className="text-white">
          Indietro
        </Button>
      </Footer>
    </form>
  )
}
