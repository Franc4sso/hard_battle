import { useState } from 'react'
import { Button, Footer, anim } from '../components'

const STEPS: [string, string][] = [
  ['Crea il mostro', 'Quattro scelte tra tre carte a caso: personaggio, arma, personalità, superpotere.'],
  ['Passa il telefono', 'L’altro fa lo stesso, senza sbirciare il tuo mostro.'],
  ['Rissa!', 'L’AI simula la battaglia round per round e decide chi vince.'],
]

export function HomeScreen({ canResume, onNew, onResume }: { canResume: boolean; onNew(): void; onResume(): void }) {
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
