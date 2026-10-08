import { useEffect, useRef, useState } from 'react'
import type { DeckMode } from '../shared/cards'
import { setMuted } from './audio/sfx'
import { recordBattle } from './game/bestiary'
import { createMatch, reduce, type Action, type MatchState } from './game/match'
import { randomSeed } from './game/rng'
import { loadMatch, loadPrefs, saveMatch, savePrefs, type Prefs } from './game/storage'
import { Button, Icon, Sheet } from './ui/components'
import { PassScreen, PickScreen, ReadyScreen, SabotageScreen } from './ui/screens/Draft'
import { BattleScreen, FinalScreen, VersusScreen, VerdictScreen } from './ui/screens/Fight'
import { BestiaryScreen, HomeScreen, SetupScreen } from './ui/screens/Menu'

type View = 'home' | 'setup' | 'bestiary' | 'game'

const DRAFT_PHASES = new Set(['pass', 'sabotage', 'pick', 'ready'])

function themeOf(view: View, match: MatchState | undefined): string {
  if (view !== 'game' || !match) return 'red'
  if (DRAFT_PHASES.has(match.phase)) return match.picker === 0 ? 'red' : 'blue'
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

  const matchRef = useRef(match)
  matchRef.current = match
  const dispatch = (a: Action) => {
    // Il bestiario si aggiorna una volta sola, quando la rissa ha un vincitore.
    const m = matchRef.current
    const o = m?.fight.opening
    if (a.type === 'roundReady' && a.round.end && m && o && m.phase === 'battle' && !m.fight.end)
      recordBattle(m, { winner: a.round.end.winner, nicknames: o.nicknames, title: o.title })
    setMatch((cur) => (cur ? reduce(cur, a) : cur))
  }

  const start = (names: [string, string], bestOf: number, mode: DeckMode) => {
    setPrefs((p) => ({ ...p, names, bestOf, mode }))
    setMatch(createMatch(names, bestOf, randomSeed(), mode))
    setView('game')
  }

  if (view === 'setup')
    return (
      <main className="app">
        <SetupScreen initialNames={prefs.names} initialBestOf={prefs.bestOf} initialMode={prefs.mode} onStart={start} onBack={() => setView('home')} />
      </main>
    )
  if (view === 'bestiary')
    return (
      <main className="app">
        <BestiaryScreen onBack={() => setView('home')} />
      </main>
    )
  if (view === 'home' || !match)
    return (
      <main className="app">
        <HomeScreen
          canResume={!!match && match.phase !== 'final'}
          onNew={() => setView('setup')}
          onResume={() => setView('game')}
          onBestiary={() => setView('bestiary')}
        />
      </main>
    )

  const props = { state: match, dispatch }
  const screen = {
    pass: <PassScreen {...props} />,
    sabotage: <SabotageScreen {...props} />,
    pick: <PickScreen {...props} />,
    ready: <ReadyScreen {...props} />,
    versus: <VersusScreen {...props} />,
    battle: <BattleScreen {...props} />,
    verdict: <VerdictScreen {...props} />,
    final: (
      <FinalScreen
        {...props}
        onRematch={() => start([match.players[0].name, match.players[1].name], match.bestOf, match.mode ?? 'classico')}
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
      <div key={`${match.phase}-${match.round}-${match.turn}-${match.step}`} className="screen">
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
