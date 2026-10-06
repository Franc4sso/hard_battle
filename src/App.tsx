import { useEffect, useState } from 'react'
import { setMuted } from './audio/sfx'
import { createMatch, reduce, type Action, type MatchState } from './game/match'
import { randomSeed } from './game/rng'
import { loadMatch, loadPrefs, saveMatch, savePrefs, type Prefs } from './game/storage'
import { Button, Icon, Sheet } from './ui/components'
import { PassScreen, PickScreen, ReadyScreen } from './ui/screens/Draft'
import { BattleScreen, FinalScreen, VersusScreen, VerdictScreen } from './ui/screens/Fight'
import { HomeScreen, SetupScreen } from './ui/screens/Menu'

type View = 'home' | 'setup' | 'game'

function themeOf(view: View, match: MatchState | undefined): string {
  if (view !== 'game' || !match) return 'red'
  if (match.phase === 'pass' || match.phase === 'pick' || match.phase === 'ready') return match.picker === 0 ? 'red' : 'blue'
  return 'yellow'
}

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [match, setMatch] = useState<MatchState | undefined>(loadMatch)
  const [view, setView] = useState<View>('home')
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    setMuted(prefs.muted)
    savePrefs(prefs)
  }, [prefs])

  useEffect(() => {
    saveMatch(match)
  }, [match])

  useEffect(() => {
    document.documentElement.dataset.theme = themeOf(view, match)
  }, [view, match])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view, match?.phase, match?.picker, match?.step])

  const dispatch = (a: Action) => setMatch((m) => (m ? reduce(m, a) : m))

  const start = (names: [string, string], bestOf: number) => {
    setPrefs((p) => ({ ...p, names, bestOf }))
    setMatch(createMatch(names, bestOf, randomSeed()))
    setView('game')
  }

  if (view === 'setup')
    return (
      <main className="app">
        <SetupScreen initialNames={prefs.names} initialBestOf={prefs.bestOf} onStart={start} onBack={() => setView('home')} />
      </main>
    )
  if (view === 'home' || !match)
    return (
      <main className="app">
        <HomeScreen canResume={!!match && match.phase !== 'final'} onNew={() => setView('setup')} onResume={() => setView('game')} />
      </main>
    )

  const props = { state: match, dispatch }
  const screen = {
    pass: <PassScreen {...props} />,
    pick: <PickScreen {...props} />,
    ready: <ReadyScreen {...props} />,
    versus: <VersusScreen {...props} />,
    battle: <BattleScreen {...props} />,
    verdict: <VerdictScreen {...props} />,
    final: (
      <FinalScreen
        {...props}
        onRematch={() => start([match.players[0].name, match.players[1].name], match.bestOf)}
        onNewPlayers={() => setView('setup')}
        onExit={() => setView('home')}
      />
    ),
  }[match.phase]

  return (
    <main className="app">
      <header className="flex items-center gap-2">
        {match.phase !== 'final' && (
          <span className="pill">
            ROUND {match.round} · {match.players[0].wins}–{match.players[1].wins}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="icon-btn"
          aria-label={prefs.muted ? 'Attiva i suoni' : 'Disattiva i suoni'}
          onClick={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
        >
          <Icon name={prefs.muted ? 'mute' : 'sound'} />
        </button>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
          <Icon name="menu" />
        </button>
      </header>
      <div key={`${match.phase}-${match.round}-${match.picker}-${match.step}`} className="screen">
        {screen}
      </div>
      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <Button
            variant="white"
            onClick={() => {
              setMenu(false)
              setView('home')
            }}
          >
            HOME (LA RISSA RESTA SALVATA)
          </Button>
          <Button
            variant="red"
            onClick={() => {
              setMenu(false)
              setMatch(undefined)
              setView('home')
            }}
          >
            ABBANDONA LA RISSA
          </Button>
          <Button onClick={() => setMenu(false)}>CONTINUA</Button>
        </Sheet>
      )}
    </main>
  )
}
